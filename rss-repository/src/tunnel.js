const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { ensureCloudflared } = require('./cloudflaredDownloader');

const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

let child = null;
let publicUrl = null;
let starting = null;

function resolveBinaryPath() {
  if (process.resourcesPath) {
    const packaged = path.join(process.resourcesPath, 'bin', 'cloudflared.exe');
    if (fs.existsSync(packaged)) return packaged;
  }
  return path.join(__dirname, '..', 'electron', 'bin', 'cloudflared.exe');
}

function status() {
  return { active: Boolean(child), publicUrl };
}

async function startTunnel(port) {
  if (child) return status();
  if (starting) return starting;

  starting = (async () => {
    const binaryPath = resolveBinaryPath();
    await ensureCloudflared(binaryPath);

    return new Promise((resolve, reject) => {
      const proc = spawn(binaryPath, ['tunnel', '--url', `http://localhost:${port}`]);
      let resolved = false;

      const onData = (data) => {
        const text = data.toString();
        const match = URL_PATTERN.exec(text);
        if (match && !resolved) {
          resolved = true;
          child = proc;
          publicUrl = match[0];
          resolve(status());
        }
      };

      proc.stdout.on('data', onData);
      proc.stderr.on('data', onData);

      proc.on('exit', () => {
        child = null;
        publicUrl = null;
      });

      proc.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill();
          reject(new Error('Timed out waiting for cloudflared to report a public URL'));
        }
      }, 30000);
    });
  })();

  try {
    return await starting;
  } finally {
    starting = null;
  }
}

function stopTunnel() {
  if (child) {
    child.kill();
    child = null;
    publicUrl = null;
  }
  return status();
}

module.exports = { startTunnel, stopTunnel, status };
