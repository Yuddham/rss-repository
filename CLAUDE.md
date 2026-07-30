# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This directory contains a single project: `rss-repository/` — a locally-hosted RSS aggregator. It lets a user group arbitrary RSS/Atom feeds together, generates one consolidated RSS 2.0 feed URL per group (merged, newest-first), and serves a minimalist magazine-style reader over the same data. The consolidated feed URLs are meant to be pasted into a Claude Project as a recurring news source, so the app must keep running locally and keep polling on its own.

## Version control

Commit and push to GitHub regularly as work progresses — after each meaningful, working chunk of change, not just at the end of a session — so in-progress work is never sitting only on disk. Use clean, descriptive commit messages (what changed and why, not "wip" or "updates"). Don't let uncommitted changes pile up across multiple features/fixes in one commit.

## Commands

All commands run from `rss-repository/`:

```
npm install   # pure-JS deps only: express, rss-parser, feed, node-cron
npm start     # node server.js — serves http://localhost:3838
```

There are no lint, test, or build scripts/tooling in this project.

The dev machine this was built on has no native build tools (no Python/VS Build Tools), so dependencies were deliberately chosen to be pure JavaScript with no native (node-gyp) addons — e.g. storage is a hand-rolled JSON file rather than `better-sqlite3`. Keep that constraint in mind before adding a new dependency.

**Restart required for backend changes**: `server.js` and everything under `src/` is loaded once at process start, so changes there need `npm start` restarted to take effect. Everything under `public/` (`index.html`, `style.css`, `app.js`) is served via `express.static` and reflects on a plain browser refresh — no restart needed.

## Architecture

### Data layer (`src/store.js`)
A single in-memory object (`{ groups, feeds, articles }`) is loaded from `data/db.json` on boot and persisted back via a 250ms-debounced `fs.writeFile` after every mutation. There is no database — all CRUD helpers (`createGroup`, `addFeed`, `mergeArticles`, etc.) live in this one module and mutate the in-memory object directly.

- Each **group** gets a URL-safe `slug` (derived from its name, de-duplicated against existing slugs) — this slug is what the consolidated feed route (`/feed/:slug.xml`) matches on.
- **Articles** are deduplicated per-feed by `guid` (falling back to `link`) in `mergeArticles` — re-fetching a feed only inserts genuinely new items.
- Deleting a group or feed cascades: `deleteGroup` removes its feeds and their articles; `deleteFeed` removes its articles.

### Fetch pipeline (`src/feedFetcher.js` + `src/scheduler.js`)
`feedFetcher.js` wraps `rss-parser` (with custom fields for `media:content`/`media:thumbnail` since those aren't parsed by default) and extracts a best-effort article image (enclosure → media:content → media:thumbnail → first `<img>` in content). `refreshFeed(feed)` fetches one feed and merges results into the store via `store.mergeArticles`; `refreshAll`/`refreshGroup` fan this out sequentially (intentionally not parallel, to be polite to source servers).

`scheduler.js` runs `refreshAll()` once on startup and then on a `node-cron` schedule (every 30 minutes, constant `INTERVAL_CRON`). The same `refreshFeed`/`refreshGroup`/`refreshAll` functions back the manual "Refresh now" button and the bulk-add flow, so there is one fetch path used everywhere.

### Routes (`src/routes/`)
- `api.js` — REST API for groups/feeds/articles CRUD, manual refresh, and bulk feed import (`POST /groups/:id/feeds/bulk` — accepts a `urls[]` array, dedupes/validates/fetches each independently and reports per-URL success/failure rather than failing the whole batch).
- `consolidatedFeed.js` — `GET /feed/:slug.xml` and `GET /feed/all.xml` build actual RSS 2.0 XML on every request (via the `feed` package) from the current in-memory articles for that group (or all groups), newest-first, capped at `MAX_ITEMS`. This is the URL users paste into Claude Projects.

### Frontend (`public/`)
A single `index.html` with two tab-switched views (no framework, no build step, plain `app.js`):
- **Magazine** — article cards newest-first, filterable by group chips, manual refresh button.
- **Manage** — create a group, bulk-paste multiple feed URLs into one group at once (new group or existing, via a `<select>`), and per-group panels for adding/removing individual feeds, with a copy button for that group's consolidated feed URL.

The frontend talks to the backend purely through the `/api/*` JSON endpoints in `api.js`; there is no server-side templating.
