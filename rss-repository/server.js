const path = require('path');
const express = require('express');

const apiRoutes = require('./src/routes/api');
const consolidatedFeedRoutes = require('./src/routes/consolidatedFeed');
const scheduler = require('./src/scheduler');

const PORT = process.env.PORT || 3838;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRoutes);
app.use('/feed', consolidatedFeedRoutes);

app.listen(PORT, () => {
  console.log(`RSS repository running at http://localhost:${PORT}`);
  scheduler.start();
});
