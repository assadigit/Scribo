# Changelog

All notable changes to **Scribo** (formerly **Feather**). Grouped by milestone.

---

## 2026-08-19 — Rebrand, domain, and hardening milestone

The big session: the app is now **Scribo**, reachable only at **https://scribo.ir**,
with a healthy, clean, fully-documented codebase.

### Added
- **Custom domain `scribo.ir`** — zone added to Cloudflare (nameservers moved),
  custom domain attached to the worker, `metadataBase` + OG/social fixed.
- **`scribo.ir`-only serving** — `workers_dev = false`; the account
  `*.workers.dev` subdomain now returns 404.
- **Markdown shortcuts in the editor** (Obsidian-style: `#heading`, `[ ]` task
  lists, `1)` ordered lists) + heading levels extended to **H1–H6** across
  editor, reader renderer, and Markdown export (`lib/markdown.ts` clamp fix).
- **Google OAuth login** — full PKCE + JWKS-verified implementation (routes,
  `lib/google-oauth.ts`, `google_sub` columns + migration). **Parked by choice:**
  button hidden, routes return 503 until an OAuth client is configured. Docs +
  enable steps in `README.md`.
- **Scribo header logo** — new dark/light PNG wordmarks in `public/logo/`
  (151×57), old feather logos removed.
- **Dashboard hero redesign** — profile hero + text-only reading report
  (replaces the bento cards).
- `CHANGELOG.md` — this file.

### Changed
- **Rebrand everywhere**: EN/FA UI strings, metadata/OG, share-mail subjects,
  footer taglines, `package.json`/lockfile name (`scribo`), D1 database name
  (`scribo`), session cookie (`scribo_session`), localStorage keys
  (`scribo:…`), TOTP issuer, reset-email sender, brand-mark component
  (`components/icons/scribo.tsx`), decorative Phosphor feather icon → `PenNib`.
  Remaining literal "feather" = the Cloudflare worker **script name** only
  (custom-domain binding constraint; documented in `wrangler.toml`).
- **Migrations baselined** — the old chain was unreplayable (metadata snapshots
  jumped 0001 → 0013; 0013 re-created existing tables). Replaced with a single
  generated baseline (`migrations/0000_baseline.sql`); `db:migrate:remote` is
  now a clean no-op and `drizzle-kit generate` is idempotent.
- **Lint debt → zero** — ESLint now ignores generated build output (`.open-next`,
  `.wrangler`, `worker-configuration.d.ts`) and standalone CJS utilities; fixed
  all 9 errors + 5 warnings (React Compiler set-state-in-effect, `Date.now`
  render purity, dead imports/props, `<img>` → `next/image`).
- **Middleware decision documented** — kept `middleware.ts` (Next 16's `proxy.ts`
  is Node-only, which OpenNext 1.20 cannot deploy); reason recorded in the file.
- **Deploy process** — documented reliable Windows flow (build, then deploy step;
  retry on transient network failure).

### Fixed
- **Production save/auth failure** — deployed code referenced `google_sub`
  columns that were missing from the live D1 (migration held off). Added the
  columns + unique indexes directly to D1; saves and login verified healthy.
- Markdown export flattening H4–H6 → H3 (`lib/markdown.ts` clamp 3 → 6).
- Heading-dropdown label not recognizing H5/H6 in the toolbar.
- Dead header variable, unused route props, stale `Date.now` in renders.

### Removed
- Tracked design scratch (`ideas/`, `feather assets/`, `jmh_typewriter/`,
  `splendid-66/`) — kept on disk, gitignored.
- Photoshop sources (`*.psd`) from version control.
- Old feather logos + old migration chain (recoverable via git history).

### Docs
- `README.md` fully rewritten as the repository's source of truth, including a
  **"Next sprint — start here"** checklist (Hibana bot, Google login enablement,
  optional polish, token rotation).

---

## Pre-2026-08-19 — Feather foundation (highlights, in repo git history)

- Scaffold: Next.js 16 + OpenNext/Cloudflare worker, D1 + Drizzle, Tailwind v4
  monochrome editorial system ("Analog Dispatch"), EN/FA i18n, landing page.
- Custom auth (PBKDF2 + HttpOnly sessions), invite-code registration, admin TOTP
  MFA, D1-backed rate limiting, audit log.
- TipTap editor (Word import, version history, draft autosave, focus mode),
  reader route with token share links, one-time links, content protection,
  likes, end-of-chapter comments + moderation.
- Reader-session analytics, folder workspace, tags, author profiles,
  custom fonts (data-URL based).
- UI refinements (folder-box styling, locale-aware calendar, dashboard profile
  circle, notebook ruled-line alignment, list-marker restoration).

*(Full commit-level history is in `git log`.)*
