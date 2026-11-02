# AGENTS.md — working rules for AI coding agents (and humans)

These rules keep the live site scribo.ir safe. They are not suggestions.
If a task seems to require breaking one of them, stop and explain instead.

## Golden rules

1. **All changes go through this repository.** The repo on GitHub (`main`
   branch) is the single source of truth for Scribo's code.
2. **Never deploy from a local machine.** Do not run `wrangler deploy`,
   `opennextjs-cloudflare deploy`, or `npm run deploy`. Deploys happen only
   through GitHub Actions when commits land on `main`.
3. **Never edit code in the Cloudflare dashboard.** Dashboard edits are
   invisible to the repo and will be silently overwritten by the next deploy.
4. **The live site is production.** Real readers use it. Test locally first
   (`npm run dev` or `npx wrangler dev` — these use a local database and
   can never touch production data).
5. **Never commit secrets.** No tokens, passwords, API keys, or `.env`
   files. `.gitignore` already blocks the dangerous filenames; do not
   bypass it with `git add -f`.

## Before you commit

Run both, and fix what they report:

```bash
npx tsc --noEmit        # type-check
npm run lint            # eslint
npm run build           # production build must succeed
```

## Database rules

- Database changes are **new migration files only**: `migrations/0002_*.sql`,
  `0003_*.sql`, … Never edit an existing migration file — it may already
  have run on production.
- Make migrations idempotent where possible (`IF NOT EXISTS` /
  `IF EXISTS`) so re-running them is safe.
- Migrations are applied to production automatically during the GitHub
  Actions deploy. Never run `wrangler d1 migrations apply ... --remote`
   from a local machine.
- `db/schema.ts` is the readable description of the database. When you add
  a migration by hand, also update `db/schema.ts` (or generate the
  migration with `npm run db:generate`, which keeps both in sync).
- To try migrations locally: `npx wrangler d1 migrations apply feather --local`.

## Naming traps (do not "fix" these)

- The Cloudflare Worker is named `feather` — the scribo.ir custom domain is
  attached to that name. Renaming it detaches the live site.
- The D1 database is named `feather` (binding `DB` in wrangler.toml).
  Same story: the id `0d3b7b33-2daf-43ed-bbc7-139073788a0f` is what matters.
- The `assets/`, `complemtnary assets/`, `feather assets/`, `jmh_typewriter/`,
  `splendid-66/` folders are design source material, not app code. The last
  three are gitignored on purpose. Do not "clean them up".

## Secrets this project uses (NAMES only)

- Local/CI credentials (in `.env` locally, GitHub Secrets in CI):
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- Worker secrets (set with `npx wrangler secret put <NAME>`): currently
  **none set**. If Google login is ever enabled, add `GOOGLE_CLIENT_SECRET`.
- The legacy `scripts/cloudflare.mjs` wrapper reads
  `.cloudflare-secrets.json` (gitignored) if present; prefer plain
  environment variables instead.

## Commits and pull requests

- Small commits, clear messages (`feat: …`, `fix: …`, `chore: …`, `docs: …`).
- One logical change per commit. Explain *why* in the body when it is not
  obvious.
- For anything risky (schema changes, auth, middleware), open a pull
  request so the `check` workflow runs install + type-check + build first.
- The deploy workflow guards itself: only one deploy runs at a time, and a
  failed build changes nothing on the live site.

## If the deploy breaks the site

1. `npx wrangler rollback` (with Cloudflare credentials in `.env`) puts the
   previous version back immediately.
2. Then fix the cause in the repo and push again — the fix deploys itself.
3. Note the incident in `CHANGELOG.md`.

## Pointers

- `README.md` — plain-language project guide (start there).
- `SYNC_REPORT.md` — how this repo was matched to the live site on
  2026-11-02, including the backup location.
- `CHANGELOG.md` — the project's own history.
