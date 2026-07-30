# RSS Repository

A local RSS repository, magazine-style reader, and consolidated feed generator.

- Organize RSS/Atom sources into **groups** (e.g. "Tech News", "AI Research", "Markets").
- Each group gets a stable **consolidated RSS feed URL** (`/feed/<group>.xml`) that merges all of that group's sources, sorted newest-first — paste this into a Claude Project as a knowledge source for a daily news stream.
- Browse everything in a minimalist **magazine view**, newest articles on top, filterable by group.
- Runs entirely on your machine. A background job polls all feeds every 30 minutes while the server is running; there's also a manual "Refresh now" button.

## 1. Install Node.js (one-time)

Node.js isn't installed on this machine yet. Install the LTS version from https://nodejs.org (or `winget install OpenJS.NodeJS.LTS` in PowerShell), then open a **new** terminal so `node`/`npm` are on PATH.

Verify:
```
node --version
npm --version
```

## 2. Install dependencies

From this folder:
```
npm install
```

This pulls in `express`, `rss-parser`, `feed`, and `node-cron` — all pure JavaScript, no native build tools required.

## 3. Run it

```
npm start
```

Then open **http://localhost:3838** in your browser.

Leave the terminal window open — that's what keeps the background refresh running. Stop it any time with `Ctrl+C`.

## 4. Using it

**Manage tab** — create a group, then add one or more RSS/Atom feed URLs to it. Each group card shows its consolidated feed URL with a Copy button, e.g.:

```
http://localhost:3838/feed/tech-news.xml
```

**Magazine tab** — all articles across your groups, newest first, with chips to filter down to one group. "Refresh now" fetches every feed immediately instead of waiting for the 30-minute background cycle.

**Consolidated feed** — `GET /feed/<slug>.xml` returns valid RSS 2.0 for that one group. `GET /feed/all.xml` returns everything across every group.

## 5. Feeding it into a Claude Project

Copy a group's consolidated feed URL from the Manage tab and add it as a linked source in your Claude Project. Since the server keeps polling feeds in the background, that one URL always reflects the latest articles for that group — a steady, curated stream of whatever topic the group covers.

Note: the server must be running (`npm start`) and reachable at the URL you give Claude for it to fetch fresh content — `localhost` URLs only work from tools that run on this same machine.

## Data storage

Everything is stored in `data/db.json` (created automatically on first run). Delete this file to reset the app to empty. It's excluded from git via `.gitignore`.

## Project layout

```
server.js                      Express app entrypoint
src/store.js                   JSON-file persistence (groups, feeds, articles)
src/feedFetcher.js             Fetches + parses source feeds, merges new articles
src/scheduler.js               Background polling (every 30 min) via node-cron
src/routes/api.js              REST API used by the frontend
src/routes/consolidatedFeed.js /feed/:slug.xml and /feed/all.xml generation
public/                        Frontend: index.html, style.css, app.js (vanilla JS)
data/db.json                   Local data store (created at runtime)
```
