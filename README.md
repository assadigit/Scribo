# Scribo

Scribo is a private reading room for writers. You write chapters in a clean
editor, keep a full version history, and share special links with family and
friends. Readers get a calm, book-like reading page (Farsi-first, fully
bilingual EN/FA) and can leave comments at the end of chapters.

- **Live site:** https://scribo.ir
- **Runs on:** Cloudflare Workers (a fast, serverless hosting platform)
- **Database:** Cloudflare D1 (SQLite at the edge), database name `feather`
- **Automatic deploys:** every push to the `main` branch on GitHub is built
  and deployed to Cloudflare automatically by GitHub Actions

> Formerly called **Feather** — that is why the Cloudflare Worker and the
> D1 database are still *named* `feather`. Do not rename them: the scribo.ir
> domain is attached to that worker name.

---

## The short version (how to work on Scribo)

1. Edit files in this repository (yourself or with an AI coding agent).
2. Test on your own computer first: `npm install`, then `npm run dev`
   (or `npx wrangler dev`). Never test on the live site.
3. Push (or merge a pull request) to `main`.
4. GitHub builds and deploys it automatically — usually 3–5 minutes.
5. If something breaks, roll back (see "How to undo a deploy" below).

---

## What is in each folder (plain words)

| Folder / file | What it is |
| --- | --- |
| `app/` | The website pages and the API (the "brains" of Scribo). `app/r/[token]/` is the reader page people see when they open your share links. `app/admin/` is your writing dashboard. `app/api/` are the behind-the-scenes endpoints. |
| `components/` | Reusable building blocks of the user interface (editor toolbar, reader header, landing page sections…). |
| `lib/` | Shared logic: logins, database helpers, translation dictionaries, the Markdown converter. |
| `db/` | `schema.ts` describes every database table in one readable file. |
| `migrations/` | Step-by-step instructions that create/update the database. Applied automatically on each deploy. **Never edit an old file here — always add a new one.** |
| `public/` | Static files served as-is: images, fonts, sounds, logo. |
| `scripts/` | Helper commands (create admin, smoke tests, deploy helper). |
| `assets/`, `complemtnary assets/` | Design source material (hero images, Farsi fonts) kept for reference. Not used by the running site. |
| `wrangler.toml` | The Cloudflare settings file: worker name, database binding, site address. |
| `.github/workflows/` | The automatic deploy recipes used by GitHub Actions. |

## How to run Scribo on your own computer

You need [Node.js 20+](https://nodejs.org) installed, and a copy of this repo.

1. Copy `.env.example` to a new file named `.env` and fill in your Cloudflare
   token and account id (only needed for commands that talk to Cloudflare).
   Never share or commit the real `.env`.
2. Install the pieces: `npm install`
3. Create a local database from the migrations:
   `npx wrangler d1 migrations apply feather --local`
4. Start the site: `npm run dev` → open http://localhost:3000
   (or `npx wrangler dev` → http://localhost:8787, closest to the real thing)

This local copy uses a database on your own computer. It can never touch
the real scribo.ir database by accident.

## How to deploy (publish changes to scribo.ir)

**You don't run a deploy command.** Just push your changes to the `main`
branch on GitHub (or merge a pull request). A robot on GitHub then:

1. installs everything (`npm ci`),
2. checks the code compiles (`npx tsc --noEmit`),
3. builds the site (`npm run build`, `opennextjs-cloudflare build`),
4. applies any new database migrations in `migrations/` to the live
   database (safely — nothing runs twice),
5. publishes the new version to Cloudflare.

## How to see if a deploy worked

Go to the repo on GitHub → **Actions** tab. You will see one row per deploy
(named "Deploy to Cloudflare"). Green check = live. Red X = failed; click it
to read why. If it failed, **scribo.ir keeps serving the previous good
version** — a failed deploy changes nothing.

## How to undo a deploy (roll back)

Two ways:

- **Quick:** on a computer with your Cloudflare token in `.env`, run
  `npx wrangler rollback` and confirm. The previous version goes live
  immediately.
- **Clean:** on GitHub, open the bad commit, click **Revert** (this creates
  the opposite change), then merge it. The revert is deployed automatically.

## The database, in one paragraph

All content (texts, chapters, versions, share links, comments, admins,
sessions) lives in one D1 SQLite database. Its Cloudflare name is `feather`
(the app's old name). The tables are described in `db/schema.ts`, and
`migrations/` holds the numbered SQL steps that build it. New migration
files are applied automatically at deploy time; old ones are never edited.

## Google login (currently parked, off)

The code for "Sign in with Google" is finished but switched off. To enable
it later: create an OAuth client in Google Cloud Console, put the client id
into `GOOGLE_CLIENT_ID` in `wrangler.toml`, set the secret with
`npx wrangler secret put GOOGLE_CLIENT_SECRET`, and un-hide the button.
Until then those routes answer "not available".

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Run the site locally (localhost:3000) |
| `npx wrangler dev` | Run the built worker locally (closest to production) |
| `npm run lint` / `npx tsc --noEmit` | Check code quality / types |
| `npm run build` | Build the production site |
| `npx wrangler d1 migrations apply feather --local` | Update your local database |
| `npm run admin:create` | Create your first admin login (local DB by default) |

---

*Synced from the live deployment on 2026-11-02 — see `SYNC_REPORT.md` for
the full story of how this repo was matched to the live site, and
`AGENTS.md` for the working rules for AI coding agents.*
