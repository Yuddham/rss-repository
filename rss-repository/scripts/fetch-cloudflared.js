const path = require('path');
const { ensureCloudflared } = require('../src/cloudflaredDownloader');

const destPath = path.join(__dirname, '..', 'electron', 'bin', 'cloudflared.exe');

ensureCloudflared(destPath)
  .then(() => console.log(`cloudflared.exe ready at ${destPath}`))
  .catch((err) => {
    console.error(`Failed to fetch cloudflared.exe: ${err.message}`);
    process.exit(1);
  });
