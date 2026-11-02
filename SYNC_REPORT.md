# SYNC_REPORT — how this repo was matched to the live site

**Date:** 2026-11-02 · **Site:** https://scribo.ir · **Worker:** `feather`
**Principle used throughout:** the version deployed on Cloudflare is the
truth. The repo was made to match it — never the other way around.

---

## 1. What was in the zip (Step 2)

`Scribo Github.zip` (17 MB) contained the full project, zipped at the root
(no wrapping folder):

| Thing found | Value |
| --- | --- |
| Framework | Next.js 16.3.0 (App Router), TypeScript |
| Deploy adapter | `@opennextjs/cloudflare` 1.20.2 (OpenNext) |
| Package manager | npm (`package-lock.json` present) |
| Build | `next build` + `opennextjs-cloudflare build` |
| Wrangler config | `wrangler.toml` — worker name `feather`, main `.open-next/worker.js` |
| D1 binding | `DB` → database id `0d3b7b33-2daf-43ed-bbc7-139073788a0f` |
| R2 / KV | none (R2 commented out in the toml) |
| Cron / routes | none |
| Vars | `APP_URL`, `GOOGLE_CLIENT_ID` (empty), `GOOGLE_ALLOWED_EMAILS`, `GOOGLE_REDIRECT_URI` |
| Migrations | `migrations/0000_baseline.sql` (+ drizzle meta snapshot) |
| Extras | `.wrangler/` local state, `tsconfig.tsbuildinfo`, design asset folders |

The zip was NOT a clean export: it contained local Cloudflare credentials
(see secret scan below) and local build state.

## 2. Secret scan result (names and line numbers only)

| File : line | Content type | Status |
| --- | --- | --- |
| `.cloudflare-secrets.json : 2` (`apiToken`) | real Cloudflare API token (53 chars) | **LEAKED — the zip is in the public GitHub repo, so this token is exposed. Must be rotated by the owner.** |
| `.cloudflare-secrets.json : 3` (`accountId`) | account id (not secret, but identifying) | included in the leak |
| `.cloudflare-secrets.example.json : 2` | placeholder text ("PASTE_…") | safe, kept as template |

No other real secrets were found: no `.env`/`.dev.vars` files in the zip,
no keys hardcoded in `app/`, `lib/`, `components/`, `db/`, `scripts/`, and
none in `wrangler.toml` (`GOOGLE_CLIENT_ID` is an empty string — Google
login is parked). The GitHub repository is **public** (verified with
`gh repo view`), which is why the leaked token matters.

What was done: `.cloudflare-secrets.json` was **not** imported into the
repo (it is also blocked by `.gitignore`). Only the `.example.json`
template was committed. The token value appears nowhere in this repo.

## 3. Backup of the live state (Step 3)

Everything below is read-only output saved to
`scribo-backup-20261102-1222/` (kept next to the repo, never inside it,
never committed; it is gitignored by the `scribo-backup-*` rule):

| File | Contents |
| --- | --- |
| `workers-list.txt` | all 4 workers in the account |
| `workers-domains.txt` | custom domains (scribo.ir → `feather`) |
| `feather-settings.json` | live bindings, compatibility date/flags, vars |
| `feather-cron.json` | cron schedules (empty) |
| `zone-routes.json` | scribo.ir zone routes (none — custom domain serving) |
| `feather-script-v2.bin` | the full 11.6 MB deployed worker bundle |
| `feather-deployments.json` | deployment metadata (164 deployments historically) |
| `d1-databases.json` | all D1 databases in the account |
| `feather-full.sql` | **full data export** of the live database (133 KB, all rows) |
| `feather-schema.sql` | schema-only export (10.7 KB) |
| `kv-namespaces.json` | KV namespaces (only the *other* project has any) |
| `r2-buckets.json` | R2 not enabled on the account (API error 10042) |
| `before-snapshots/` | status + headers + body sha256 of 11 live URLs, taken before any deploy |
| `BACKUP_INDEX.txt` | what each file is and how to restore it |

All files verified present and non-empty (the single 0-byte body is the
expected empty 405 response of `GET /api/r/session`).

**Restore:** see `BACKUP_INDEX.txt`. Short version — recreate DB with
`npx wrangler d1 create feather`, import `feather-full.sql` with
`npx wrangler d1 execute feather --remote --file=feather-full.sql`, push
to `main` to redeploy, re-attach the scribo.ir custom domain.

## 4. Comparison: zip vs live (Step 6)

### a) Configuration

| Item | Live | Zip | Classification → action |
| --- | --- | --- | --- |
| Worker name | `feather` | `feather` | IDENTICAL |
| compatibility date | 2026-08-01 | 2026-08-01 | IDENTICAL |
| flags | `nodejs_compat` | same | IDENTICAL |
| Assets binding | `ASSETS` | same | IDENTICAL |
| D1 binding + id | `DB` / `0d3b7b33…` | same id | IDENTICAL |
| D1 database **name** | `feather` | `scribo` (wrong) | **DIFFERENT-LIVE-IS-NEWER → fixed in repo** |
| Vars (all 4) | same values | same values | IDENTICAL |
| Worker secrets | none | none | IDENTICAL |
| Cron, routes | none | none | IDENTICAL |
| Custom domain | scribo.ir on `feather` | (outside toml) | IDENTICAL |
| workers.dev | disabled (verified 404) | `workers_dev = false` | IDENTICAL |

### b) Code

All **264 route-like strings** found in the 11.6 MB deployed bundle are
present in a fresh build from the zip source. The 26 extra strings in the
fresh build are Node-polyfill file paths (e.g. `/api/abort-signal.js`),
not app routes. No live-only logic was found — nothing needed
reconstruction from the bundle.

### c) Static assets

`public/logo/scribo-light-mode.png` fetched from live: **sha256-identical**
to the repo file. Of the 10 font files referenced by the live landing
page, 9 have byte-identical hashed filenames and 1 matches on its
content-hash prefix (identical content, build-suffix differs). favicon /
icon / robots are app routes, present in source.

### d) Behavior (local `wrangler dev` with fresh local DB vs live)

| URL | Live | Local | Verdict |
| --- | --- | --- | --- |
| `/` | 200, 35083 B | 200, 35083 B | byte-identical apart from build id + chunk hashes |
| `/about` | 200, 19339 B | 200, 19339 B | same |
| `/contact` | 200, 19487 B | 200, 19487 B | same |
| `/auth/login` | 200, 15371 B | 200, 15371 B | same |
| `/admin/login` | 307 → `/auth/login` | 307 → `/auth/login` | same redirect |
| `/robots.txt` | 200 | 200 | app part identical; live adds a Cloudflare-injected "Content Signals" preamble (edge feature, not code) |
| `/api/health` | 200 `{"status":"ok",…}` | 200 same | only the `time` field differs (expected) |
| `/api/auth/session` | 200 | 200 | identical |
| `/api/r/session` | 405 | 405 | identical |
| `/api/fonts` | 200 | 200 | identical |
| random 404 | 404, 13612 B | 404, 13612 B | identical |

Security headers (CSP, X-Frame-Options, etc.) identical — only HTTP
header *letter case* differs (miniflare capitalizes; Cloudflare
lowercases), which is cosmetic.

### e) Database

All 20 tables and every column match. The live database records
`0000_baseline.sql` as already applied (row 15 in `d1_migrations`), so the
zip's baseline will never re-run against production. Differences found:

- **12 indexes exist live but were not created by the baseline** → fixed
  by adding `migrations/0001_live_index_baseline.sql` (all
  `CREATE … IF NOT EXISTS` → verified no-op on live) and the matching
  definitions in `db/schema.ts`.
- **1 index in the baseline (`share_links_token_unique`) does not exist
  live** — live instead has the equivalent `idx_share_links_token`
  (UNIQUE). The new migration drops the stray one only where it exists
  (fresh local DBs) via `DROP INDEX IF EXISTS`; on live this is a no-op.
- 6 cosmetic column-definition differences (inline `REFERENCES` vs
  table-level foreign keys; `DEFAULT 0` vs `DEFAULT false`) — equivalent
  in SQLite, no action.

A fresh local database built from `0000 + 0001` now has **exactly the same
46 indexes** as live.

## 5. Every fix made to the repo (Step 7)

1. `wrangler.toml`: `database_name` `scribo` → `feather` (matches the live
   database; the id was already correct).
2. `package.json` scripts `db:migrate:local` / `db:migrate:remote`:
   updated to the real database name `feather`.
3. `scripts/create-admin.mjs` and `scripts/seed-admin.mjs`: `d1 execute
   scribo` → `d1 execute feather`.
4. `scripts/cloudflare.mjs`: doc-comment example updated to `feather`.
5. Added `migrations/0001_live_index_baseline.sql` + journal/snapshot and
   the 12 index definitions in `db/schema.ts` (see §4e).
6. `.gitignore` extended: `dist`, `.dev.vars`, `scribo-backup-*`,
   `*.log`, and an explicit `!.env.example` exception.
7. `.env.example` created (names only, empty values).
8. Line endings of edited files normalized to LF (zip files had CRLF).
9. `.cloudflare-secrets.json` NOT imported (leaked token — see §2).

Nothing from the zip was deleted except local build state (`.wrangler/`,
`tsconfig.tsbuildinfo`) which is regenerated by any build.

## 6. Decisions taken (and why)

| Decision | Reason |
| --- | --- |
| Keep worker/db name `feather` | The scribo.ir domain is attached to it; renaming would take the site down. Documented in toml comments. |
| Do not create `share_links_token_unique` on live | It does not exist live; creating it would *change* live. Live uses `idx_share_links_token` instead. |
| Commit `assets/` and `complemtnary assets/` | The project's own `.gitignore` deliberately tracked them (design source material); the three other design folders stay untracked as the author intended. |
| `robots.txt` difference accepted | The extra text on live is injected by Cloudflare's Content-Signals edge feature, not app code. Nothing to fix in the repo. |
| Migration named `0001_live_index_baseline` (renamed from drizzle's random `0001_absurd_triathlon`) | Clearer history; journal updated to match. |

## 7. Items on the `unreleased-from-zip` branch

**None.** Every file changed after the last deploy (2026-08-19 19:43 UTC)
was documentation only (`.gitignore`, `README.md`, `CHANGELOG.md`); no
application code in the zip was newer than the deployment, and the
behavior comparison (§4d) confirmed the zip source reproduces the live
site byte-for-byte. Therefore no branch was created — there is nothing
unreleased to preserve.

## 8. Items needing owner decision

1. **Rotate the leaked Cloudflare token** (see §2). The old token is in
   the zip inside the *public* GitHub repo history.
   How: dash.cloudflare.com → My Profile → API Tokens → find the old
   token → delete it. (A newer token was provided for this sync; rotating
   means deleting the old one and, ideally, replacing the current one
   too, then updating the GitHub secret `CLOUDFLARE_API_TOKEN` — see
   README "How to see if a deploy worked" for where secrets live.)
2. **Decide whether to purge the zip from GitHub history.** `git rm`
   removed it from the current tree, but it remains in old commits and
   anyone can download it. Options: leave it (token rotation makes it
   harmless) or ask GitHub Support / use `git filter-repo` to purge.
3. **R2 is not enabled on the account** (API error 10042). The code keeps
   media as data-URLs in D1 meanwhile. If you want file uploads on R2
   later, enable R2 in the dashboard and uncomment the `[[r2_buckets]]`
   block in `wrangler.toml`.
4. Optional: the legacy `.cloudflare-secrets.json` mechanism still works
   via `scripts/cloudflare.mjs`, but plain environment variables (`.env`)
   are now the recommended path.

## 9. Other workers/databases found in the account (not touched)

- Workers `hibana` and `hibana-prod` (domain hibana.ir), D1 `pm-app-prod`
  and `pm-app-dev`, KV `HIBANA_SHOTS` / `prod-HIBANA_SHOTS`
- Worker `telegram-reminder-bot`, D1 `reminder_bot_db`

Nothing belonging to them was read beyond listing, and nothing was
modified.

---

## 10. First automatic deploy — outcome (Step 11)

Pushed the workflow commit; GitHub Actions run history:

1. **Run 1 failed** (by design, safely): the workflow used Node 20, but the
   pinned wrangler 4.118 requires Node >= 22. Nothing was deployed — the
   failing step (migrations) comes before the deploy step, and a failed run
   never touches the live worker.
2. **Run 2 succeeded** after a one-line fix (`node-version: 22`): install →
   type-check → next build → opennext build → D1 migrations applied
   (`0001_live_index_baseline.sql`, 14 idempotent commands — verified no-op
   on live) → deploy. New worker version id `46cb702b-c23b-4a31-acd3-25517e180a38`.

**Verification that nothing changed for visitors** (same 11 URLs as §4d,
before vs after, saved in `after-snapshots/`):

- Every status code identical (200/200/200/200/307/200/200/200/405/200/404).
- Every body size identical.
- Body bytes identical after removing per-build values (Next.js build id,
  content-hashed chunk filenames, the /api/health timestamp) — verified
  page by page.
- Live worker settings unchanged: same D1 binding id, same vars, same
  compatibility date/flags, observability still off.
- Custom domain scribo.ir → worker `feather` still attached;
  `*.workers.dev` subdomain still disabled (404).

Rollback was not needed.
