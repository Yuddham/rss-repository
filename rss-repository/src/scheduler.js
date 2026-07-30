const cron = require('node-cron');
const { refreshAll } = require('./feedFetcher');

const INTERVAL_CRON = '*/30 * * * *'; // every 30 minutes

function start() {
  refreshAll()
    .then((results) => logResults('startup', results))
    .catch((err) => console.error('Startup refresh failed:', err.message));

  cron.schedule(INTERVAL_CRON, () => {
    refreshAll()
      .then((results) => logResults('scheduled', results))
      .catch((err) => console.error('Scheduled refresh failed:', err.message));
  });

  console.log(`Background refresh scheduled: ${INTERVAL_CRON}`);
}

function logResults(label, results) {
  const added = results.reduce((sum, r) => sum + (r.added || 0), 0);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`[refresh:${label}] ${results.length} feed(s), ${added} new article(s), ${failed} failed`);
}

module.exports = { start };
