# RSS Repository

A local RSS repository, magazine-style reader, and consolidated feed generator — packaged as a normal installable Windows app.

- Organize RSS/Atom sources into **groups** (e.g. "Tech News", "AI Research", "Markets").
- Each group gets a stable **consolidated RSS feed URL** (`/feed/<group>.xml`) that merges all of that group's sources, sorted newest-first — paste this into a Claude Project, Zapier, or Inoreader as a source.
- Browse everything in a minimalist **magazine view**, newest articles on top, filterable by group, with read/unread tracking.
- Generate a per-group **.txt export** (unread / all / date range) formatted for feeding into an LLM (Claude, Gemini, etc.) to summarize.
- Optionally expose a group's feed to the internet via a free **Cloudflare Tunnel**, so cloud services that can't reach `localhost` (Zapier, Inoreader) can fetch it directly.
- Runs entirely on your machine. A background job polls all feeds every 30 minutes while the app is running; there's also a manual "Refresh now" button.

## Option A — Install the Windows app (recommended for everyday use)

Download `RSS Repository Setup <version>.exe` and run it. It's a **fully self-contained installer** — Node.js, the app's dependencies, and the Cloudflare Tunnel tool are all bundled in; nothing else needs to already be on the machine, and no internet connection is required during install.

Since the installer isn't code-signed, Windows SmartScreen will show an "Unrecognized app" warning the first time — click **More info** → **Run anyway**. This is normal for indie/unsigned installers.

After installing, launch **RSS Repository** from the Start Menu. It opens in its own window and adds a tray icon (right-click it for **Open**, **Refresh now**, **Quit**). Closing the window hides it to the tray rather than quitting, so background refresh keeps running — use **Quit** from the tray menu to fully exit. App data lives in `%APPDATA%\rss-repository`.

## Option B — Run from source (for development)

1. Install Node.js LTS from https://nodejs.org (or `winget install OpenJS.NodeJS.LTS`), then open a **new** terminal.
2. `npm install` — pulls in `express`, `rss-parser`, `feed`, `node-cron` (all pure JavaScript, no native build tools required), plus `electron`/`electron-builder` as dev tools.
3. `npm start` — runs the plain Express server at **http://localhost:3838**, storing data in `data/db.json`. Leave the terminal open; stop with `Ctrl+C`.
   - `npm run electron` — runs the same app inside an Electron window/tray instead, storing data in `%APPDATA%\rss-repository` (matches the installed app's behavior).
   - `npm run dist` — builds the Windows installer into `dist/`. Requires `electron/bin/cloudflared.exe` to exist first — run `npm run fetch-cloudflared` once to download it (this happens automatically via `predist`).

## Using it

**Manage tab** — create a group, then add feed URLs to it one at a time, or paste several RSS/Atom links at once (from any mix of sites) into **Bulk add feeds** and club them all into one group in a single action. Each group card shows its consolidated feed URL with a Copy button, e.g. `http://localhost:3838/feed/tech-news.xml`.

**Magazine tab** — all articles newest-first, with chips to filter by group. Unread articles have a blue left border and a filled dot; click the dot to toggle read/unread manually, or open an article (which marks it read automatically). "Mark all as read" bulk-marks the current filter's articles. "Refresh now" fetches every feed immediately instead of waiting for the 30-minute background cycle.

**Export…** (per group, in Manage) — generates a `.txt` document of that group's articles for feeding into an LLM:
- **Unread only**, **All articles**, or a **date range** (leave "To" blank for "everything since date X")
- Optionally marks the exported articles as read afterward
- Each article follows a fixed template with a blank `Summary:` field for the LLM to fill in:
  ```
  ----- BEGIN ARTICLE -----
  Headline: ...
  Source URL: ...
  Date: ...

  ----- FULL CONTENT -----
  ...

  Summary:

  ----- END ARTICLE -----
  ```
  Note: "FULL CONTENT" is only as complete as the source RSS feed provides — many feeds publish just a snippet, not the full article text; this doesn't scrape the source page.

**Public access** (Manage tab) — click **Start** to spin up a free Cloudflare quick tunnel, giving every group a second, internet-reachable feed URL (shown on each group card) alongside its `localhost` one. Two things to know:
- The public address is random and **changes every time you restart the tunnel** — re-point any Zapier/Inoreader subscription after a restart. Cloudflare's own logs note it "may take some time to be reachable" after starting — give it a minute if it doesn't resolve immediately.
- It's **unauthenticated** — anyone with the link can read that group's feed. Fine for personal RSS content, but treat the link as effectively public once you share or configure it anywhere.

A stable (non-random) public URL requires a free Cloudflare account plus a domain you control (a "named" tunnel) — not set up here, but a reasonable next step if you need one.

**Consolidated feed** — `GET /feed/<slug>.xml` returns valid RSS 2.0 for that one group. `GET /feed/all.xml` returns everything across every group.

## Feeding it into a Claude Project

Copy a group's consolidated feed URL (localhost or public) and add it as a linked source in your Claude Project. Since the app keeps polling feeds in the background, that one URL always reflects the latest articles for that group.

Note: a `localhost` URL only works from tools running on this same machine — use the Public access tunnel URL for hosted services (Claude Projects, Zapier, Inoreader) that fetch from the internet.

## Data storage

- Installed app / `npm run electron`: `%APPDATA%\rss-repository\db.json`
- `npm start` (plain dev mode): `data/db.json` in this folder

Delete the relevant file to reset the app to empty.

## Project layout

```
server.js                       Express app; exports startServer() (Electron) or self-starts (npm start)
electron/main.js                Electron main process: window, tray, single-instance lock
electron/icon.js                Generates the tray/window icon as a raw pixel buffer (no image asset needed)
electron/bin/cloudflared.exe    Bundled Cloudflare Tunnel binary (gitignored; fetched via scripts/fetch-cloudflared.js)
scripts/fetch-cloudflared.js    Downloads cloudflared.exe for bundling/dev use
src/store.js                    JSON-file persistence (groups, feeds, articles); path via RSS_DATA_DIR env var
src/feedFetcher.js              Fetches + parses source feeds, merges new articles
src/scheduler.js                Background polling (every 30 min) via node-cron
src/exportText.js               Builds the per-group LLM-export .txt document
src/tunnel.js                   Starts/stops the Cloudflare quick tunnel, tracks its public URL
src/cloudflaredDownloader.js    Shared on-demand downloader for cloudflared.exe
src/routes/api.js               REST API: groups/feeds/articles CRUD, refresh, export, tunnel control
src/routes/consolidatedFeed.js  /feed/:slug.xml and /feed/all.xml generation
public/                         Frontend: index.html, style.css, app.js (vanilla JS)
```
