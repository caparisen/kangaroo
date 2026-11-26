'use strict';

const path = require('node:path');
const { BrowserWindow, screen } = require('electron');

const PRELOAD = path.join(__dirname, '..', 'preload', 'overlay.js');
const PAGE = path.join(__dirname, '..', 'renderer', 'overlay.html');

// Give the compositor a moment after the window becomes visible before the
// animation starts; otherwise the first frames can be dropped on Windows.
// Magnification follows the cursor speed, so the wait stays short.
const SHOW_DELAY_MS = 40;

/**
 * One transparent, click-through, always-on-top window per display.
 * Windows are created once and only shown while the pointer is enlarged.
 */
class OverlayManager {
  constructor(config) {
    this.config = config;
    this.windows = new Map();
    this.ready = new Set();
    this.pending = new Set();
    this.hideTimers = new Map();
    this.showTimers = new Map();
    this.active = null;

    screen.on('display-added', () => this.syncDisplays());
    screen.on('display-removed', () => this.syncDisplays());
    screen.on('display-metrics-changed', () => this.syncDisplays());
    this.syncDisplays();
  }

  createWindow(display) {
    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      show: false,
      alwaysOnTop: true,
      webPreferences: {
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false
      }
    });

    win.setAlwaysOnTop(true, 'screen-saver');
    win.setIgnoreMouseEvents(true);
    win.setMenuBarVisibility(false);
    win.loadFile(PAGE);

    win.webContents.on('did-finish-load', () => {
      this.ready.add(win.id);
      if (this.pending.has(win.id)) {
        this.pending.delete(win.id);
        this.sendShow(win);
      }
    });

    win.on('closed', () => {
      this.ready.delete(win.id);
      this.pending.delete(win.id);
      const hideTimer = this.hideTimers.get(win.id);
      if (hideTimer) clearTimeout(hideTimer);
      this.hideTimers.delete(win.id);
      const showTimer = this.showTimers.get(win.id);
      if (showTimer) clearTimeout(showTimer);
      this.showTimers.delete(win.id);
      if (this.active && this.active.win === win) this.active = null;
    });

    return win;
  }

  syncDisplays() {
    const displays = screen.getAllDisplays();
    const liveIds = new Set(displays.map((display) => display.id));

    for (const [id, win] of this.windows) {
      if (!liveIds.has(id) || win.isDestroyed()) {
        this.windows.delete(id);
        if (!win.isDestroyed()) win.destroy();
      }
    }

    for (const display of displays) {
      const existing = this.windows.get(display.id);
      if (!existing || existing.isDestroyed()) {
        this.windows.set(display.id, this.createWindow(display));
      } else if (!existing.isVisible()) {
        existing.setBounds(display.bounds);
      }
    }

    if (this.active && !this.windows.has(this.active.displayId)) {
      this.active = null;
    }
  }

  setConfig(config) {
    this.config = config;
    for (const [id, win] of this.windows) {
      if (!win.isDestroyed() && this.ready.has(id)) {
        win.webContents.send('overlay:config', this.config);
      }
    }
  }

  show(point, strength) {
    const display = screen.getDisplayNearestPoint({
      x: Math.round(point.x),
      y: Math.round(point.y)
    });
    const win = this.windows.get(display.id);
    if (!win || win.isDestroyed()) return;
    if (!win.isVisible()) win.setBounds(display.bounds);

    if (this.active && this.active.win !== win) {
      this.hideWindow(this.active.win, true);
    }
    this.active = {
      win,
      displayId: display.id,
      payload: {
        x: point.x - display.bounds.x,
        y: point.y - display.bounds.y,
        strength: strength || 0
      }
    };

    const timer = this.hideTimers.get(win.id);
    if (timer) {
      clearTimeout(timer);
      this.hideTimers.delete(win.id);
    }

    win.showInactive();
    win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
    this.sendShow(win);
  }

  sendShow(win) {
    if (win.isDestroyed()) return;
    if (!this.ready.has(win.id)) {
      this.pending.add(win.id);
      return;
    }
    const existing = this.showTimers.get(win.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.showTimers.delete(win.id);
      if (win.isDestroyed()) return;
      if (!this.active || this.active.win !== win) return;
      win.webContents.send('overlay:show', {
        ...this.active.payload,
        config: this.config
      });
    }, SHOW_DELAY_MS);
    this.showTimers.set(win.id, timer);
  }

  cancelShow(win) {
    if (!win) return;
    const timer = this.showTimers.get(win.id);
    if (timer) {
      clearTimeout(timer);
      this.showTimers.delete(win.id);
    }
  }

  move(point, strength) {
    if (!this.active) return;
    const display = screen.getDisplayNearestPoint({
      x: Math.round(point.x),
      y: Math.round(point.y)
    });
    if (display.id !== this.active.displayId) {
      this.show(point, strength);
      return;
    }

    // Keep the queued show payload current: activation can start before the
    // overlay is visible and the strength changes within SHOW_DELAY_MS.
    const payload = this.active.payload;
    payload.x = point.x - display.bounds.x;
    payload.y = point.y - display.bounds.y;
    payload.strength = strength || 0;

    const win = this.active.win;
    if (win.isDestroyed() || !this.ready.has(win.id)) return;
    win.webContents.send('overlay:move', {
      x: payload.x,
      y: payload.y,
      strength: payload.strength
    });
  }

  hide(immediate) {
    if (!this.active) return;
    const win = this.active.win;
    this.active = null;
    this.cancelShow(win);
    this.hideWindow(win, immediate);
  }

  hideWindow(win, immediate) {
    if (!win || win.isDestroyed()) return;
    this.cancelShow(win);
    if (immediate) {
      win.hide();
      return;
    }
    if (this.ready.has(win.id)) {
      win.webContents.send('overlay:hide');
    } else {
      win.hide();
      return;
    }
    const timer = setTimeout(() => {
      this.hideTimers.delete(win.id);
      if (!win.isDestroyed()) win.hide();
    }, this.config.animation.shrink.ms + 700);
    this.hideTimers.set(win.id, timer);
  }

  /** Called when the renderer finished its shrink animation. */
  finished(webContents) {
    const win = BrowserWindow.fromWebContents(webContents);
    if (!win) return;
    // A new activation may have started while the previous shrink was ending.
    if (this.active && this.active.win === win) return;
    const timer = this.hideTimers.get(win.id);
    if (timer) {
      clearTimeout(timer);
      this.hideTimers.delete(win.id);
    }
    if (!win.isDestroyed()) win.hide();
  }

  destroy() {
    for (const [, timer] of this.hideTimers) clearTimeout(timer);
    for (const [, timer] of this.showTimers) clearTimeout(timer);
    this.hideTimers.clear();
    this.showTimers.clear();
    for (const [, win] of this.windows) {
      if (!win.isDestroyed()) win.destroy();
    }
    this.windows.clear();
    this.ready.clear();
    this.pending.clear();
    this.active = null;
  }
}

module.exports = { OverlayManager };
