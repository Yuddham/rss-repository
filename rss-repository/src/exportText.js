const ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  apos: "'",
  nbsp: ' ',
};

function htmlToText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, name) => ENTITY_MAP[name])
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

function formatDate(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

function scopeLabel(scope, from, to) {
  if (scope === 'unread') return 'Unread articles';
  if (scope === 'range') {
    if (from && to) return `Published ${from} to ${to}`;
    if (from) return `Published after ${from}`;
    if (to) return `Published before ${to}`;
    return 'Date range';
  }
  return 'All articles';
}

function buildExportText(group, articles, { scope, from, to } = {}) {
  const header = [
    `RSS Export -- ${group.name}`,
    `Scope: ${scopeLabel(scope, from, to)}`,
    `Generated: ${formatDate(new Date())}`,
    `Articles: ${articles.length}`,
    '',
    '',
  ].join('\n');

  const body = articles
    .map((article) =>
      [
        '----- BEGIN ARTICLE -----',
        `Headline: ${article.title || ''}`,
        `Source URL: ${article.link || ''}`,
        `Date: ${formatDate(article.pubDate)}`,
        '',
        '----- FULL CONTENT -----',
        htmlToText(article.content || article.contentSnippet || ''),
        '',
        'Summary:',
        '',
        '----- END ARTICLE -----',
      ].join('\n')
    )
    .join('\n\n');

  return header + body + '\n';
}

module.exports = { htmlToText, buildExportText };
