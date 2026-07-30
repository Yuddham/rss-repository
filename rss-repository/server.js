const path = require('path');
const express = require('express');

const apiRoutes = require('./src/routes/api');
const consolidatedFeedRoutes = require('./src/routes/consolidatedFeed');
const scheduler = require('./src/scheduler');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRoutes);
app.use('/feed', consolidatedFeedRoutes);

function startServer(port) {
  return app.listen(port, () => {
    console.log(`RSS repository running at http://localhost:${port}`);
    scheduler.start();
  });
}

if (require.main === module) {
  startServer(process.env.PORT || 3838);
}

module.exports = { app, startServer };
