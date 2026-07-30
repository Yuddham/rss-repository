const express = require('express');
const { Feed } = require('feed');
const store = require('../store');

const router = express.Router();

const MAX_ITEMS = 200;

function buildFeed({ title, description, link, articles }) {
  const feed = new Feed({
    title,
    description,
    id: link,
    link,
    language: 'en',
    updated: articles.length ? new Date(articles[0].pubDate) : new Date(),
    generator: 'Local RSS Repository',
  });

  for (const article of articles.slice(0, MAX_ITEMS)) {
    feed.addItem({
      title: article.title,
      id: article.guid || article.link,
      link: article.link || link,
      description: article.contentSnippet || '',
      content: article.content || article.contentSnippet || '',
      author: article.author ? [{ name: article.author }] : undefined,
      date: new Date(article.pubDate),
      image: article.imageUrl || undefined,
    });
  }

  return feed.rss2();
}

router.get('/all.xml', (req, res) => {
  const articles = store.listArticles({});
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const xml = buildFeed({
    title: 'All Feeds',
    description: 'Consolidated feed across every group',
    link: baseUrl,
    articles,
  });
  res.type('application/rss+xml').send(xml);
});

router.get('/:slug.xml', (req, res) => {
  const group = store
    .listGroups()
    .find((g) => g.slug === req.params.slug);
  if (!group) return res.status(404).type('text/plain').send('Group not found');

  const articles = store.listArticles({ groupId: group.id });
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const xml = buildFeed({
    title: group.name,
    description: `Consolidated feed for the "${group.name}" group`,
    link: baseUrl,
    articles,
  });
  res.type('application/rss+xml').send(xml);
});

module.exports = router;
