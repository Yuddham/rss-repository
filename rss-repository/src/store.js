const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.RSS_DATA_DIR
  ? path.join(process.env.RSS_DATA_DIR, 'db.json')
  : path.join(__dirname, '..', 'data', 'db.json');

const EMPTY_DB = { groups: [], feeds: [], articles: [] };

let db = load();
let saveTimer = null;

function load() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      groups: parsed.groups || [],
      feeds: parsed.feeds || [],
      articles: parsed.articles || [],
    };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Failed to read data/db.json, starting fresh:', err.message);
    }
    return { ...EMPTY_DB };
  }
}

function saveNow() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      saveNow();
    } catch (err) {
      console.error('Failed to save data/db.json:', err.message);
    }
  }, 250);
}

function slugify(name) {
  const base = String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'group';
  let slug = base;
  let i = 2;
  const taken = new Set(db.groups.map((g) => g.slug));
  while (taken.has(slug)) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

// ---------- Groups ----------

function listGroups() {
  return db.groups.map((g) => ({
    ...g,
    feedCount: db.feeds.filter((f) => f.groupId === g.id).length,
    articleCount: db.articles.filter((a) => a.groupId === g.id).length,
  }));
}

function getGroup(id) {
  return db.groups.find((g) => g.id === id) || null;
}

function createGroup(name) {
  const group = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    slug: slugify(name),
    createdAt: new Date().toISOString(),
  };
  db.groups.push(group);
  scheduleSave();
  return group;
}

function deleteGroup(id) {
  const feedIds = new Set(db.feeds.filter((f) => f.groupId === id).map((f) => f.id));
  db.feeds = db.feeds.filter((f) => f.groupId !== id);
  db.articles = db.articles.filter((a) => !feedIds.has(a.feedId));
  const before = db.groups.length;
  db.groups = db.groups.filter((g) => g.id !== id);
  scheduleSave();
  return db.groups.length !== before;
}

// ---------- Feeds ----------

function listFeeds(groupId) {
  return groupId ? db.feeds.filter((f) => f.groupId === groupId) : db.feeds;
}

function getFeed(id) {
  return db.feeds.find((f) => f.id === id) || null;
}

function addFeed(groupId, url) {
  const feed = {
    id: crypto.randomUUID(),
    groupId,
    url: String(url).trim(),
    title: null,
    siteUrl: null,
    lastFetchedAt: null,
    lastError: null,
  };
  db.feeds.push(feed);
  scheduleSave();
  return feed;
}

function updateFeed(id, patch) {
  const feed = getFeed(id);
  if (!feed) return null;
  Object.assign(feed, patch);
  scheduleSave();
  return feed;
}

function deleteFeed(id) {
  db.articles = db.articles.filter((a) => a.feedId !== id);
  const before = db.feeds.length;
  db.feeds = db.feeds.filter((f) => f.id !== id);
  scheduleSave();
  return db.feeds.length !== before;
}

// ---------- Articles ----------

function listArticles({ groupId, limit, offset, unreadOnly, from, to } = {}) {
  let items = db.articles;
  if (groupId) items = items.filter((a) => a.groupId === groupId);
  if (unreadOnly) items = items.filter((a) => !a.read);
  if (from) {
    const fromTime = new Date(from).getTime();
    items = items.filter((a) => new Date(a.pubDate).getTime() >= fromTime);
  }
  if (to) {
    const toTime = new Date(to).getTime();
    items = items.filter((a) => new Date(a.pubDate).getTime() <= toTime);
  }
  items = [...items].sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  const start = offset ? Number(offset) : 0;
  const end = limit ? start + Number(limit) : undefined;
  return items.slice(start, end);
}

function setArticleRead(id, read) {
  const article = db.articles.find((a) => a.id === id);
  if (!article) return null;
  article.read = Boolean(read);
  scheduleSave();
  return article;
}

function markAllRead({ groupId } = {}) {
  let items = db.articles;
  if (groupId) items = items.filter((a) => a.groupId === groupId);
  let count = 0;
  for (const article of items) {
    if (!article.read) {
      article.read = true;
      count++;
    }
  }
  if (count > 0) scheduleSave();
  return count;
}

function mergeArticles(feedId, groupId, parsedItems) {
  const existingKeys = new Set(
    db.articles.filter((a) => a.feedId === feedId).map((a) => a.guid)
  );
  let added = 0;
  for (const item of parsedItems) {
    const guid = item.guid || item.link;
    if (!guid || existingKeys.has(guid)) continue;
    existingKeys.add(guid);
    db.articles.push({
      id: crypto.randomUUID(),
      feedId,
      groupId,
      title: item.title || '(untitled)',
      link: item.link || null,
      author: item.creator || item.author || null,
      contentSnippet: item.contentSnippet || null,
      content: item.content || item.contentSnippet || '',
      imageUrl: item.imageUrl || null,
      pubDate: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      guid,
      fetchedAt: new Date().toISOString(),
      read: false,
    });
    added++;
  }
  if (added > 0) scheduleSave();
  return added;
}

module.exports = {
  slugify,
  listGroups,
  getGroup,
  createGroup,
  deleteGroup,
  listFeeds,
  getFeed,
  addFeed,
  updateFeed,
  deleteFeed,
  listArticles,
  setArticleRead,
  markAllRead,
  mergeArticles,
  saveNow,
};
