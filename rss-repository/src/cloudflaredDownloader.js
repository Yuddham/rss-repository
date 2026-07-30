const fs = require('fs');
const path = require('path');
const https = require('https');

const DOWNLOAD_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

function download(url, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) return reject(new Error('Too many redirects downloading cloudflared'));
          res.resume();
          return resolve(download(res.headers.location, destPath, redirectsLeft - 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`cloudflared download failed: HTTP ${res.statusCode}`));
        }
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        const tmpPath = `${destPath}.download`;
        const file = fs.createWriteStream(tmpPath);
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            fs.renameSync(tmpPath, destPath);
            resolve(destPath);
          });
        });
        file.on('error', reject);
      })
      .on('error', reject);
  });
}

async function ensureCloudflared(destPath) {
  if (fs.existsSync(destPath)) return destPath;
  await download(DOWNLOAD_URL, destPath);
  return destPath;
}

module.exports = { ensureCloudflared, DOWNLOAD_URL };
