'use strict';

const path = require('node:path');
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  screen
} = require('electron');

const { ConfigStore } = require('./config');
const { SpeedTracker } = require('./speed');
const { OverlayManager } = require('./overlays');
const { t } = require('../shared/i18n');

const POLL_MS = 12;
const ROOT = path.join(__dirname, '..', '..');
const TRAY_ICON = path.join(ROOT, 'assets', 'tray.png');
const APP_ICON = path.join(ROOT, 'assets', 'icon.png');
const SETTINGS_PAGE = path.join(__dirname, '..', 'renderer', 'settings.html');
const SETTINGS_PRELOAD = path.join(__dirname, '..', 'preload', 'settings.js');

// Transparent always-on-top windows can be flagged as occluded and then stop
// painting; the overlay must keep rendering while it is shown.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

let store = null;
let tracker = null;
let overlays = null;
let tray = null;
let settingsWindow = null;
let pollTimer = null;
let autoStartApplied = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (store) openSettings();
  });
  app.whenReady().then(boot);
  app.on('window-all-closed', () => {});
  app.on('will-quit', shutdown);
}

function boot() {
  Menu.setApplicationMenu(null);
  app.setAppUserModelId('com.kangaroo.pointer');

  store = new ConfigStore(path.join(app.getPath('userData'), 'config.json'));
  overlays = new OverlayManager(store.get());
  tracker = new SpeedTracker(store.get().speed);

  registerIpc();
  createTray();
  store.on('change', applyConfig);
  applyAutoStart(store.get().autoStart);

  pollTimer = setInterval(poll, POLL_MS);

  const wantsSettings =
    process.argv.includes('--settings') || process.argv.includes('--show-settings');
  if (wantsSettings || !store.existed) openSettings();
}

function poll() {
  if (!store) return;
  const point = screen.getCursorScreenPoint();
  const now = Date.now();
  const config = store.get();
  if (!config.enabled) return;

  const result = tracker.push(now, point.x, point.y);

  if (result.activated) {
    overlays.show(point, result.strength);
  }
  if (result.deactivated) {
    overlays.hide(false);
  } else if (result.active) {
    overlays.move(point, result.strength);
  }

  if (settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible()) {
    settingsWindow.webContents.send('speed:sample', {
      speed: result.speed,
      accel: result.accel,
      strength: result.strength,
      active: result.active
    });
  }
}

function sendIdleSample() {
  if (!settingsWindow || settingsWindow.isDestroyed() || !settingsWindow.isVisible()) return;
  settingsWindow.webContents.send('speed:sample', { speed: 0, accel: 0, strength: 0, active: false });
}

function applyConfig(config) {
  tracker.setConfig(config.speed);
  overlays.setConfig(config);
  updateTrayMenu();
  applyAutoStart(config.autoStart);

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('config:changed', config);
  }

  if (!config.enabled) {
    tracker.reset();
    overlays.hide(true);
    sendIdleSample();
  }
}

function applyAutoStart(enabled) {
  if (autoStartApplied === enabled) return;
  autoStartApplied = enabled;
  const options = { openAtLogin: enabled };
  if (!app.isPackaged) {
    // Running from source: register electron.exe together with the app path.
    options.path = process.execPath;
    options.args = [app.getAppPath()];
  }
  try {
    app.setLoginItemSettings(options);
  } catch (error) {
    console.error('[kangaroo] could not update login item:', error);
  }
}

function setEnabled(enabled) {
  store.update({ enabled: Boolean(enabled) });
}

function createTray() {
  const image = nativeImage.createFromPath(TRAY_ICON);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip(t(store.get().language, 'tooltip'));
  updateTrayMenu();
  tray.on('double-click', () => openSettings());
}

function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const config = store.get();
  const language = config.language;
  tray.setToolTip(t(language, 'tooltip'));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: t(language, 'trayEnable'),
        type: 'checkbox',
        checked: config.enabled,
        click: (item) => setEnabled(item.checked)
      },
      { label: t(language, 'traySettings'), click: () => openSettings() },
      { label: t(language, 'trayRestart'), click: () => restartApp() },
      { type: 'separator' },
      { label: t(language, 'trayQuit'), click: () => app.quit() }
    ])
  );
}

function restartApp() {
  app.relaunch();
  app.quit();
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 800,
    height: 940,
    minWidth: 640,
    minHeight: 560,
    title: 'Kangaroo',
    backgroundColor: '#111317',
    icon: APP_ICON,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: SETTINGS_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  settingsWindow.loadFile(SETTINGS_PAGE);
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function registerIpc() {
  ipcMain.handle('config:get', () => store.get());
  ipcMain.handle('config:update', (_event, patch) => store.update(patch));
  ipcMain.handle('config:reset', () => store.reset());
  ipcMain.on('overlay:done', (event) => overlays.finished(event.sender));
}

function shutdown() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  if (overlays) overlays.destroy();
  if (store) store.save();
  if (tray && !tray.isDestroyed()) tray.destroy();
}
