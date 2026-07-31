# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projects

This directory contains two independent projects, each in its own top-level folder with its own dependencies, `.gitignore`, and run instructions. There is no shared code between them.

- `rss-repository/` — an RSS aggregator packaged as an installable Windows desktop app (Electron), also runnable as a plain local web app. It lets a user group arbitrary RSS/Atom feeds together, generates one consolidated RSS 2.0 feed URL per group (merged, newest-first), serves a minimalist magazine-style reader with read/unread tracking, generates per-group `.txt` exports formatted for LLM summarization, and can expose a group's feed to the internet via a Cloudflare quick tunnel (for cloud services like Zapier/Inoreader that can't reach `localhost`). The consolidated feed URLs are meant to be pasted into a Claude Project as a recurring news source, so the app must keep running (locally or as the installed tray app) and keep polling on its own.
- `job-search-navigator/` — a local job-search assistant for the Indian market (Python/FastAPI, plain HTML/CSS/JS frontend). Ranks live Adzuna India job listings (plus manually-pasted listings) against a profile parsed from a LinkedIn data export, runs a deterministic ATS-compliance check on an uploaded CV and a keyword-gap "tailoring" tool (mechanical reordering only — never LLM-generated text), estimates CTC/in-hand pay from Adzuna's aggregate salary data, and provides a manual contact/lead tracker for outreach. Deliberately avoids any automated scraping of LinkedIn or other job sites — see `job-search-navigator/USER_MANUAL.md` for the full feature walkthrough and the reasoning behind that constraint. Windows `.exe` packaging (PyInstaller + pywebview) is a planned later phase, not yet built.

## Version control

Commit and push to GitHub regularly as work progresses — after each meaningful, working chunk of change, not just at the end of a session — so in-progress work is never sitting only on disk. Use clean, descriptive commit messages (what changed and why, not "wip" or "updates"). Don't let uncommitted changes pile up across multiple features/fixes in one commit.

## rss-repository

### Commands

All commands run from `rss-repository/`:

```
npm install            # runtime deps (pure-JS: express, rss-parser, feed, node-cron) + electron/electron-builder devDeps
npm start               # node server.js — plain dev server at http://localhost:3838, data in data/db.json
npm run electron        # runs the same app inside an Electron window/tray, data in %APPDATA%\rss-repository
npm run fetch-cloudflared  # downloads electron/bin/cloudflared.exe (gitignored; needed before packaging)
npm run dist            # electron-builder --win nsis — builds the Windows installer into dist/ (runs fetch-cloudflared first via predist)
```

There are no lint or test scripts/tooling in this project.

No native build tools exist on the dev machine this was built on (no Python/VS Build Tools/Rust), so runtime dependencies were deliberately chosen to be pure JavaScript with no native (node-gyp) addons — e.g. storage is a hand-rolled JSON file rather than `better-sqlite3`. Electron itself ships prebuilt binaries (no compilation needed), which is why it was chosen over alternatives like Tauri for desktop packaging. Keep the no-native-deps constraint in mind before adding a new runtime dependency.

**Restart required for backend changes**: `server.js` and everything under `src/` is loaded once at process start, so changes there need the process restarted (`npm start` or `npm run electron`) to take effect. Everything under `public/` (`index.html`, `style.css`, `app.js`) is served via `express.static` and reflects on a plain browser refresh — no restart needed.

**Data path**: `src/store.js`'s `DB_PATH` honors an `RSS_DATA_DIR` env var (falls back to `data/db.json` if unset). `electron/main.js` sets this to `app.getPath('userData')` before requiring `server.js`, so the installed app's data lives in `%APPDATA%\rss-repository` rather than next to the (often read-only, Program-Files-installed) executable. `server.js` exports `{ app, startServer }` and only self-starts when run directly (`require.main === module`), so Electron's main process can `require('./server').startServer(port)` in-process instead of spawning a second Node process.

### Architecture

#### Data layer (`src/store.js`)
A single in-memory object (`{ groups, feeds, articles }`) is loaded from `data/db.json` on boot and persisted back via a 250ms-debounced `fs.writeFile` after every mutation. There is no database — all CRUD helpers (`createGroup`, `addFeed`, `mergeArticles`, etc.) live in this one module and mutate the in-memory object directly.

- Each **group** gets a URL-safe `slug` (derived from its name, de-duplicated against existing slugs) — this slug is what the consolidated feed route (`/feed/:slug.xml`) matches on.
- **Articles** are deduplicated per-feed by `guid` (falling back to `link`) in `mergeArticles` — re-fetching a feed only inserts genuinely new items. Each article also has a `read` boolean (default `false`); `setArticleRead`/`markAllRead` mutate it, and `listArticles` accepts `unreadOnly`/`from`/`to` filters used by both the magazine view and the export route.
- Deleting a group or feed cascades: `deleteGroup` removes its feeds and their articles; `deleteFeed` removes its articles.

#### Fetch pipeline (`src/feedFetcher.js` + `src/scheduler.js`)
`feedFetcher.js` wraps `rss-parser` (with custom fields for `media:content`/`media:thumbnail` since those aren't parsed by default) and extracts a best-effort article image (enclosure → media:content → media:thumbnail → first `<img>` in content). `refreshFeed(feed)` fetches one feed and merges results into the store via `store.mergeArticles`; `refreshAll`/`refreshGroup` fan this out sequentially (intentionally not parallel, to be polite to source servers).

`scheduler.js` runs `refreshAll()` once on startup and then on a `node-cron` schedule (every 30 minutes, constant `INTERVAL_CRON`). The same `refreshFeed`/`refreshGroup`/`refreshAll` functions back the manual "Refresh now" button and the bulk-add flow, so there is one fetch path used everywhere.

#### Routes (`src/routes/`)
- `api.js` — REST API for groups/feeds/articles CRUD, manual refresh, and bulk feed import (`POST /groups/:id/feeds/bulk` — accepts a `urls[]` array, dedupes/validates/fetches each independently and reports per-URL success/failure rather than failing the whole batch).
- `consolidatedFeed.js` — `GET /feed/:slug.xml` and `GET /feed/all.xml` build actual RSS 2.0 XML on every request (via the `feed` package) from the current in-memory articles for that group (or all groups), newest-first, capped at `MAX_ITEMS`. This is the URL users paste into Claude Projects.

#### Frontend (`public/`)
A single `index.html` with two tab-switched views (no framework, no build step, plain `app.js`):
- **Magazine** — article cards newest-first, filterable by group chips, manual refresh button.
- **Manage** — create a group, bulk-paste multiple feed URLs into one group at once (new group or existing, via a `<select>`), and per-group panels for adding/removing individual feeds, with a copy button for that group's consolidated feed URL.

The frontend talks to the backend purely through the `/api/*` JSON endpoints in `api.js`; there is no server-side templating.

## job-search-navigator

### Commands

All commands run from `job-search-navigator/`:

```
py -m venv .venv                          # create a virtual environment (Windows: `py`, not `python`)
.venv\Scripts\activate
pip install -r requirements.txt           # fastapi, uvicorn, pydantic, requests, pdfplumber, pypdf, python-docx, beautifulsoup4, lxml
copy .env.example .env                    # then fill in ADZUNA_APP_ID / ADZUNA_APP_KEY
uvicorn app.main:app --reload --port 8000  # dev server at http://localhost:8000, data in data/job_search.db
```

There are no lint or test scripts/tooling in this project.

All dependencies are pure-Python wheels with no external binaries or compiled extensions (`pdfplumber`+`pypdf` for PDF, `python-docx` for DOCX, `beautifulsoup4`+`lxml` for HTML parsing) — kept intentionally PyInstaller-freezable for the planned `.exe` packaging phase, even though that phase hasn't been built yet.

**Restart required for backend changes**: everything under `app/` is loaded once at process start (same restart caveat as `rss-repository`'s `src/`). Everything under `public/` (`index.html`, `style.css`, `app.js`) is served via FastAPI's `StaticFiles` and reflects on a plain browser refresh — no restart needed.

**Data path**: `app/config.py` resolves `DB_PATH`/`CV_UPLOAD_DIR`/`TAILORED_OUTPUT_DIR` from `.env` (relative paths resolve against the project root, not `cwd`) — this is deliberate so a future frozen-exe entry point can resolve the same paths identically to `uvicorn` dev mode.

### Architecture

#### Data layer (`app/db.py`)
Single local SQLite file (`data/job_search.db`), no ORM — plain `sqlite3` with `CREATE TABLE IF NOT EXISTS` run idempotently at startup. Tables: `profile_*` (parsed LinkedIn export), `search_criteria`, `manual_listings`, `contacts` / `job_leads` (manual outreach tracking), `cv_documents` / `cv_ats_reports`, `target_jobs` / `cv_tailoring_reports`, `salary_estimates`.

#### Profile ingestion (`app/linkedin_export.py`)
Defensively parses the ZIP from LinkedIn's "Download your data" export — case-insensitive filename/column matching, per-row `raw_json` catch-all for unmapped columns, missing files degrade to a warning rather than a crash. Re-upload does a full delete-and-replace of the profile tables (current-snapshot semantics, not a merge).

#### Job search (`app/adzuna_client.py`, `app/matching.py`, `app/sources/`)
`adzuna_client.py` wraps Adzuna's India job-search and salary-histogram/history endpoints behind one auth-checked, TTL-cached client. `sources/adzuna_source.py` and `sources/manual_source.py` share a `fetch(conn, criteria)` contract so `routes/jobs.py` can merge both and let either fail independently. `matching.py` is pure, explainable additive scoring (skill/keyword/title-role/location/cert hits against weighted constants at the top of the file) — no I/O, easy to tweak directly.

#### CV / ATS (`app/cv_parser.py`, `app/ats_checker.py`)
`cv_parser.py` extracts text/sections/layout metadata from PDF (`pdfplumber` + `pypdf` fallback) and DOCX (`python-docx`, plus a raw-XML scan for text boxes since python-docx doesn't expose them). `ats_checker.py` runs a fixed, deterministic rule checklist (layout, sections, contact info, length, fonts, filename, glyphs) into a weighted 0–100 score — no ML/LLM involved in the check.

#### Tailoring (`app/job_fetch.py`, `app/keyword_gap.py`)
`job_fetch.py` makes exactly one GET per user-pasted job URL (own timeout/UA, no retries, no site-specific scraping) preferring JSON-LD `JobPosting` structured data with a heuristic text-extraction fallback; blocked/short results degrade to "please paste the description manually." `keyword_gap.py` compares JD keywords against the CV's own tokens and produces a **mechanically** tailored copy (bullet reordering + a "Key Skills Match" line built only from words already in the CV) — deliberately no LLM rewriting anywhere in this path; every word in the output must already exist in the source CV.

#### Salary estimation (`app/salary_estimator.py`)
Pure calculation over Adzuna's aggregate histogram/history data (interquartile-range CTC estimate, configurable deduction-percentage in-hand heuristic, fixed disclaimer) — deliberately does not scrape individual salary-discussion posts from Glassdoor/AmbitionBox/Reddit or similar.

#### Routes (`app/routes/`)
One module per domain (`profile.py`, `criteria.py`, `jobs.py`, `contacts.py`, `cv.py`, `tailoring.py`, `salary.py`, `help.py`), all registered in `main.py`. Request/response bodies are typed via `app/models.py` Pydantic schemas, which also gives free interactive docs at `/docs`.

#### Frontend (`public/`)
A single `index.html` with nine tab-switched views (no framework, no build step, plain `app.js`), mirroring `rss-repository`'s `data-tab`/`.view`/`<template>` pattern: Profile, Search Criteria, Job Search, Manual Listings, Contacts & Leads, CV & ATS, Tailor CV, Salary Insights, Help. Talks to the backend purely through `/api/*` JSON endpoints. Visual design is intentionally minimal for now — a dedicated styling pass happens later via Higgsfield once functionality is settled.

#### A note on scope (why there's no LinkedIn scraping anywhere here)
An earlier version of this project's requirements asked for automated LinkedIn scraping (first for recruiter contact emails, then for job postings/recruiter names). Both were declined because automating a logged-in LinkedIn session violates LinkedIn's User Agreement and risks the account it runs under, regardless of which fields are being extracted. Every external network call in this codebase is either a single explicit user-triggered fetch of a URL the user pasted themselves, or a documented, keyed public API (Adzuna) — never bulk or authenticated scraping. Keep this constraint in mind before adding new data sources.
