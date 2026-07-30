const express = require('express');
const store = require('../store');
const { refreshFeed, refreshGroup, refreshAll } = require('../feedFetcher');
const { buildExportText } = require('../exportText');
const tunnel = require('../tunnel');

const router = express.Router();

function feedUrlFor(req, slug) {
  return `${req.protocol}://${req.get('host')}/feed/${slug}.xml`;
}

// ---------- Groups ----------

router.get('/groups', (req, res) => {
  const { publicUrl } = tunnel.status();
  const groups = store.listGroups().map((g) => ({
    ...g,
    feedUrl: feedUrlFor(req, g.slug),
    publicFeedUrl: publicUrl ? `${publicUrl}/feed/${g.slug}.xml` : null,
  }));
  res.json(groups);
});

router.post('/groups', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const group = store.createGroup(name);
  res.status(201).json({ ...group, feedUrl: feedUrlFor(req, group.slug) });
});

router.delete('/groups/:id', (req, res) => {
  const ok = store.deleteGroup(req.params.id);
  if (!ok) return res.status(404).json({ error: 'group not found' });
  res.status(204).end();
});

// ---------- Feeds ----------

router.get('/feeds', (req, res) => {
  res.json(store.listFeeds(req.query.groupId));
});

router.post('/groups/:id/feeds', async (req, res) => {
  const group = store.getGroup(req.params.id);
  if (!group) return res.status(404).json({ error: 'group not found' });
  const url = (req.body.url || '').trim();
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    // eslint-disable-next-line no-new
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'url is not a valid URL' });
  }

  const feed = store.addFeed(group.id, url);
  const result = await refreshFeed(feed);
  const updated = store.getFeed(feed.id);
  if (!result.ok) {
    return res.status(201).json({ ...updated, warning: `Added, but first fetch failed: ${result.error}` });
  }
  res.status(201).json(updated);
});

router.post('/groups/:id/feeds/bulk', async (req, res) => {
  const group = store.getGroup(req.params.id);
  if (!group) return res.status(404).json({ error: 'group not found' });

  const rawUrls = Array.isArray(req.body.urls) ? req.body.urls : [];
  const urls = [...new Set(rawUrls.map((u) => String(u).trim()).filter(Boolean))];
  if (urls.length === 0) return res.status(400).json({ error: 'no urls provided' });

  const existing = new Set(store.listFeeds(group.id).map((f) => f.url));
  const results = [];
  for (const url of urls) {
    if (existing.has(url)) {
      results.push({ url, ok: false, error: 'already in this group' });
      continue;
    }
    try {
      // eslint-disable-next-line no-new
      new URL(url);
    } catch {
      results.push({ url, ok: false, error: 'not a valid URL' });
      continue;
    }
    const feed = store.addFeed(group.id, url);
    const result = await refreshFeed(feed);
    results.push({ url, ok: result.ok, error: result.ok ? null : result.error, feed: store.getFeed(feed.id) });
    existing.add(url);
  }

  const added = results.filter((r) => r.ok).length;
  res.status(201).json({ requested: urls.length, added, results });
});

router.delete('/feeds/:id', (req, res) => {
  const ok = store.deleteFeed(req.params.id);
  if (!ok) return res.status(404).json({ error: 'feed not found' });
  res.status(204).end();
});

// ---------- Articles ----------

router.get('/articles', (req, res) => {
  const { groupId, limit, offset } = req.query;
  res.json(store.listArticles({ groupId, limit, offset }));
});

router.post('/articles/:id/read', (req, res) => {
  const read = req.body.read !== false;
  const article = store.setArticleRead(req.params.id, read);
  if (!article) return res.status(404).json({ error: 'article not found' });
  res.json(article);
});

router.post('/groups/:id/mark-all-read', (req, res) => {
  const group = store.getGroup(req.params.id);
  if (!group) return res.status(404).json({ error: 'group not found' });
  const count = store.markAllRead({ groupId: group.id });
  res.json({ marked: count });
});

// ---------- Export ----------

router.get('/groups/:id/export.txt', (req, res) => {
  const group = store.getGroup(req.params.id);
  if (!group) return res.status(404).json({ error: 'group not found' });

  const { scope = 'all', from, to, markRead } = req.query;
  const filter = { groupId: group.id };
  if (scope === 'unread') filter.unreadOnly = true;
  if (scope === 'range') {
    if (from) filter.from = from;
    if (to) filter.to = to;
  }

  const articles = store.listArticles(filter);
  const text = buildExportText(group, articles, { scope, from, to });

  if (markRead === 'true') {
    for (const article of articles) store.setArticleRead(article.id, true);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${group.slug}-export-${timestamp}.txt"`);
  res.send(text);
});

// ---------- Internet exposure (Cloudflare Tunnel) ----------

router.get('/tunnel/status', (req, res) => {
  res.json(tunnel.status());
});

router.post('/tunnel/start', async (req, res) => {
  try {
    const result = await tunnel.startTunnel(req.socket.localPort);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tunnel/stop', (req, res) => {
  res.json(tunnel.stopTunnel());
});

// ---------- Refresh ----------

router.post('/refresh', async (req, res) => {
  const { groupId } = req.body || {};
  const results = groupId ? await refreshGroup(groupId) : await refreshAll();
  const added = results.reduce((sum, r) => sum + (r.added || 0), 0);
  res.json({ feedsRefreshed: results.length, articlesAdded: added, results });
});

module.exports = router;
