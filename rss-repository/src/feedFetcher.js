const Parser = require('rss-parser');
const store = require('./store');

const parser = new Parser({
  timeout: 15000,
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
    ],
  },
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; LocalRSSRepository/1.0)',
  },
});

function extractImage(item) {
  if (item.enclosure && item.enclosure.url && /^image\//.test(item.enclosure.type || '')) {
    return item.enclosure.url;
  }
  if (Array.isArray(item.mediaContent) && item.mediaContent.length > 0) {
    const withUrl = item.mediaContent.find((m) => m && m.$ && m.$.url);
    if (withUrl) return withUrl.$.url;
  }
  if (item.mediaThumbnail && item.mediaThumbnail.$ && item.mediaThumbnail.$.url) {
    return item.mediaThumbnail.$.url;
  }
  const html = item.content || item['content:encoded'] || '';
  const match = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return match ? match[1] : null;
}

async function refreshFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    const items = (parsed.items || []).map((item) => ({
      ...item,
      imageUrl: extractImage(item),
    }));
    const added = store.mergeArticles(feed.id, feed.groupId, items);
    store.updateFeed(feed.id, {
      title: feed.title || parsed.title || feed.url,
      siteUrl: parsed.link || feed.siteUrl || null,
      lastFetchedAt: new Date().toISOString(),
      lastError: null,
    });
    return { ok: true, added };
  } catch (err) {
    store.updateFeed(feed.id, {
      lastFetchedAt: new Date().toISOString(),
      lastError: err.message,
    });
    return { ok: false, error: err.message };
  }
}

async function refreshMany(feeds) {
  const results = [];
  for (const feed of feeds) {
    // sequential to be polite to source servers and avoid bursts
    results.push({ feedId: feed.id, ...(await refreshFeed(feed)) });
  }
  return results;
}

async function refreshAll() {
  return refreshMany(store.listFeeds());
}

async function refreshGroup(groupId) {
  return refreshMany(store.listFeeds(groupId));
}

module.exports = { refreshFeed, refreshAll, refreshGroup };
