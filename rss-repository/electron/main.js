const { app, BrowserWindow, Tray, Menu, dialog, nativeImage } = require('electron');
const { buildIconBuffer } = require('./icon');

const PORT = 3838;

process.env.RSS_DATA_DIR = app.getPath('userData');

const { startServer } = require('../server');

let mainWindow = null;
let tray = null;
let isQuitting = false;

function appIcon(size) {
  return nativeImage.createFromBuffer(buildIconBuffer(size), { width: size, height: size });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'RSS Repository',
    icon: appIcon(256),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  tray = new Tray(appIcon(32));
  tray.setToolTip('RSS Repository');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open RSS Repository',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: 'Refresh now',
        click: () => {
          fetch(`http://localhost:${PORT}/api/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    const server = startServer(PORT);
    server.on('error', (err) => {
      dialog.showErrorBox(
        'RSS Repository failed to start',
        `Could not start the local server on port ${PORT}.\n\n${err.message}`
      );
      app.quit();
    });
    createWindow();
    createTray();
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('window-all-closed', () => {
    // Keep running in the tray instead of quitting when the window closes.
  });
}
