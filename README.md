# Scribo

> A private reading room for sharing your writings with a few good readers.
> *(formerly **Feather** — rebranded 2026-08-19.)*

Scribo is a personal, Cloudflare-native platform for writers. You write chapters
in a clean editor, keep a full version history, and share token-based links with
family and friends — each link can carry a name, a greeting, and an optional
password. Readers get an elegant, book-like reading experience (RTL-first for
Farsi, fully bilingual EN/FA) and can leave end-of-chapter comments.

## Live state (the source of truth)

| Thing | Value |
| --- | --- |
| Production URL | **https://scribo.ir** (only — the `*.workers.dev` subdomain is disabled) |
| Deployed worker | `feather` script (name intentionally kept — see *Constraints*) |
| Database | Cloudflare D1 `scribo` (backing binding `DB` in wrangler.toml) |
| Migrations | **Baselined** — `migrations/0000_baseline.sql` = full schema; remote D1 already records it applied |
| Auth | Custom PBKDF2 + `scribo_session` cookie; admin TOTP MFA; invite codes; **Google OAuth parked** (not enabled) |
| Status | All lint/type checks clean; production healthy |

## Stack

- **Next.js 16** (App Router) — landing, reader routes, admin panel in one app
- **Cloudflare Workers** via `@opennextjs/cloudflare`
- **D1** — SQLite at the edge (texts, chapters, versions, drafts, share links, comments, likes, read sessions, audit log)
- **Drizzle ORM** + `drizzle-kit` — typed access + migration generation
- **TipTap 3** — the editor (Markdown shortcuts + H1–H6 enabled)
- **Tailwind CSS v4** — monochrome editorial design system ("Analog Dispatch")
- **Mammoth.js** — Word → clean HTML import
- **R2 is NOT active** (binding commented out). Media/avatars/fonts are stored as data URLs in D1 until R2 is enabled.

## Project structure

```
app/
  page.tsx               Landing page (bilingual, editorial motif)
  layout.tsx             Root layout: fonts + theme/locale providers + metadataBase
  globals.css            Design tokens (B&W editorial palette, dark mode, motion)
  admin/                 Admin panel (login + session-guarded (panel) shell)
  r/[token]/             Reader route — share links resolve here
  api/                   Route handlers (auth, texts, chapters, draft, versions, google…)
components/
  providers.tsx          Theme + locale + calendar context (cookie-persisted)
  landing.tsx            Landing page UI
  icons/scribo.tsx       The hand-drawn brand mark (SVG)
  admin/  editor/  reader/   Panel / TipTap / reading surfaces
db/
  schema.ts              Drizzle schema (20 tables)
migrations/              Baselined: 0000_baseline.sql + meta snapshot/journal
lib/
  i18n.ts                EN/FA dictionaries
  auth.ts                PBKDF2 hashing + `scribo_session` cookie lifecycle
  db.ts                  Drizzle handle bound to D1
  google-oauth.ts        Google OAuth 2.0 + PKCE (used by the parked routes)
  reader.ts  access.ts  rate-limit.ts  audit.ts  mfa.ts  totp.ts  …  shared business logic
scripts/
  create-admin.mjs / seed-admin.mjs   Admin creation (local/remote D1 `scribo`)
  smoke.mjs  e2e-composer.mjs  e2e-share.mjs  verify-deploy.mjs   E2E checks
  cloudflare.mjs          Runs wrangler with creds from .cloudflare-secrets.json
wrangler.toml             Worker config: name, D1 `scribo`, APP_URL, Google vars
```

## Getting started

```bash
npm install

# Credentials for wrangler live in .cloudflare-secrets.json (gitignored):
#   { "apiToken": "…", "accountId": "…" }   → run via: node scripts/cloudflare.mjs npx wrangler …

# Database (local, no account needed)
npm run db:generate                     # generate migrations from db/schema.ts
npm run db:migrate:local                # apply to the LOCAL D1 (database "scribo")

# Create the super admin (asks for username + password)
npm run admin:create                    # add --remote for the production database

# Regenerate worker env types after editing wrangler.toml
npm run cf:types

# Dev server, then open http://localhost:3000/admin/login
npm run dev
```

## Deploy

`npm run deploy` builds + deploys, but on Windows the full chain can exceed
shell timeouts at the upload stage. The reliable sequence:

```bash
npx opennextjs-cloudflare build                     # next build + bundle → .open-next/worker.js
node scripts/cloudflare.mjs npx opennextjs-cloudflare deploy   # upload (retry once if a transient "fetch failed" appears)
```

- The app is served **only on https://scribo.ir** (`workers_dev = false`).
- Worker **secrets** (never commit): `npx wrangler secret put NAME` — e.g.
  `TELEGRAM_BOT_TOKEN`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`.

## Database migrations

Baselined. `0000_baseline.sql` reproduces the whole schema; the production D1 has
it recorded as applied, so `npm run db:migrate:remote` is a safe no-op. To evolve
the schema:

1. Edit `db/schema.ts`
2. `npm run db:generate` → produces the next migration
3. `npm run db:migrate:remote`

## Scripts

| Script | Purpose |
| --- | --- |
| `dev` / `build` / `start` | Next.js dev / prod build / start |
| `lint` | ESLint (zero warnings enforced) |
| `db:generate` | Drizzle migration from schema |
| `db:migrate:local` / `db:migrate:remote` | Apply migrations (D1 `scribo`) |
| `admin:create` / `admin:seed` | Create an admin (interactive / from args) |
| `smoke` | E2E API smoke test (login → publish) against `npm run dev` |
| `cf` / `cf:types` | Cloudflare helper + regenerate worker types |
| `build:worker` / `deploy` | OpenNext build / full deploy |
| `scripts/e2e-*.mjs`, `verify-deploy.mjs` | Live-site E2E against https://scribo.ir |

## Operations notes

- **Secrets**: `wrangler secret put` for non-public secrets; `GOOGLE_CLIENT_ID`
  and `GOOGLE_ALLOWED_EMAILS` are plain vars in `wrangler.toml`.
- **`scribo_session` cookie was renamed from `feather_session`** during the
  rebrand — existing sessions were invalidated once (everyone re-logs in).
- **Known build warnings (non-blocking):**
  - Next 16 deprecates `middleware.ts` → `proxy.ts`, but OpenNext 1.20 can't
    deploy Next 16's Node-runtime proxy, so we keep `middleware.ts` (documented
    inside the file). Revisit when OpenNext supports Node proxy.
  - OpenNext notes it isn't fully supported on Windows (works; WSL recommended).
  - `scripts/cloudflare.mjs` spawns child processes (a Node `DEP0190` deprecation
    warning comes from the toolchain, not this repo).

## Security notes

- Passwords: PBKDF2-HMAC-SHA256, 100k iterations, per-user salt
- Sessions: 256-bit random tokens stored as SHA-256 hashes in D1, delivered in an
  HttpOnly SameSite=Lax `scribo_session` cookie (30-day expiry)
- Share tokens: 256-bit random, stored hashed; one-time links + content protection
- CSRF: same-site Origin allowlist in `middleware.ts` (keep in sync with `APP_URL`)
- Rate limiting: D1-backed windowed limiter with escalating lockout (login,
  register, unlock, comments, likes, invites, MFA)
- `noindex` headers + robots.txt on all reader routes; strict CSP via `next.config.ts`

## Design system

Monochrome editorial: charcoal `#18181B` / cream paper (`--paper` #f2ead8),
hairline borders, radius ≤ 12px, near-zero shadows. Faces: MashinTahrir (Farsi
typewriter), Special Elite (Latin typewriter), Vazirmatn (UI + Farsi body). Dark
mode keeps a soft umber paper. Semantic pastels reserved for status tags only.

## Next sprint — start here

**Product (priority order)**

1. **Hibana — Telegram bot** (token exists — `@Hibana_PM_bot`, provided 2026-08-19;
   **no code yet**). Decide scope (notify-only vs inline approve/reject), the
   receiver chat id, then:
   - `npx wrangler secret put TELEGRAM_BOT_TOKEN`
   - Add `POST /api/telegram/webhook`; register it via `setWebhook` →
     `https://scribo.ir/api/telegram/webhook`
   - Send notifications on new comments; allow-list the owner chat id.
2. **Enable Google login** — backend + `google_sub` columns already exist; the
   button is hidden and routes return 503 until configured:
   - Create a Google OAuth client (Web application) with authorized redirect URIs:
     `https://scribo.ir/api/auth/google/callback` and
     `http://localhost:3000/api/auth/google/callback`
   - Set `GOOGLE_CLIENT_ID` (wrangler.toml var) + `GOOGLE_CLIENT_SECRET`
     (`wrangler secret put`)
   - Restore the "Continue with Google" button in `app/auth/login/page.tsx`
     (small revert — see git history for the parked implementation)
   - Confirm `GOOGLE_ALLOWED_EMAILS` (default `aliassadi@live.com`) and whether
     the admin keeps TOTP MFA on Google login (default in code: yes)
3. **Optional polish:** attach `www.scribo.ir`; rename the worker script
   `feather` → `scribo` (needs a dashboard re-attach of the custom domain);
   apply the provided texture patterns (`ptn-laid/dots/cross/stripes/washi`) to
   reader/hero/folder surfaces; leftover roadmap (tagging UI, Markdown import,
   OG previews, security hardening).

**Ops hygiene**

4. Rotate the Cloudflare API tokens that were pasted in chat; keep only the one
   stored in `.cloudflare-secrets.json`.

## Troubleshooting

- **Dev-only Turbopack panic**: if `npm run dev` crashes referencing
  `.sqlite-shm` (a dev watcher race with Wrangler's local D1), just restart
  `npm run dev` — production is unaffected.
- **Deploy "fetch failed"**: transient egress flakiness; retry the deploy step.
- **Login after rebrand**: the cookie was renamed to `scribo_session`, so any
  pre-rebrand session needs a fresh sign-in.
