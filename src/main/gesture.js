'use strict';

const { ShakeDetector } = require('./shake');

const STREAM_MS = 40;
const BUFFER_MS = 1400;
const TRACE_MS = 1200;

/**
 * Captures a real shake anywhere on the desktop and streams the trajectory to
 * the settings window. Used by both the "Test" button and calibration.
 */
class GestureSession {
  constructor(options) {
    this.webContents = options.webContents;
    this.durationMs = options.durationMs;
    this.calibrate = Boolean(options.calibrate);
    this.detector = new ShakeDetector(options.trigger);
    this.onFinish = options.onFinish;
    this.points = [];
    this.max = { turns: 0, path: 0, peak: 0, arc: 0 };
    this.best = null;
    this.triggered = false;
    this.startedAt = Date.now();
    this.finished = false;
    this.earlyTimer = null;

    this.streamTimer = setInterval(() => this.stream(), STREAM_MS);
    this.finishTimer = setTimeout(() => this.finish(), this.durationMs);
  }

  push(now, point) {
    if (this.finished) return;
    const result = this.detector.push(now, point.x, point.y);
    if (result.activated) {
      this.triggered = true;
      if (!this.earlyTimer) {
        // Stop shortly after the first trigger so the captured trace stays relevant.
        this.earlyTimer = setTimeout(() => this.finish(), 900);
      }
    }

    const metrics = this.detector.metrics;
    this.max.turns = Math.max(this.max.turns, metrics.turns);
    this.max.path = Math.max(this.max.path, metrics.path);
    this.max.peak = Math.max(this.max.peak, metrics.peak);
    this.max.arc = Math.max(this.max.arc, metrics.arc);

    this.points.push({ t: now, x: point.x, y: point.y });
    const cutoff = now - BUFFER_MS;
    while (this.points.length && this.points[0].t < cutoff) this.points.shift();

    if (!this.best || metrics.path > this.best.path) {
      this.best = {
        path: metrics.path,
        points: this.points.filter((entry) => entry.t >= now - TRACE_MS).map((entry) => ({
          x: entry.x,
          y: entry.y
        })),
        turns: this.detector.turnPoints.map((entry) => ({ x: entry.x, y: entry.y }))
      };
    }
  }

  snapshot() {
    const cutoff = Date.now() - TRACE_MS;
    return {
      points: this.points.filter((point) => point.t >= cutoff),
      turns: this.detector.turnPoints.map((point) => ({ x: point.x, y: point.y })),
      metrics: this.detector.metrics,
      thresholds: this.detector.trigger,
      triggered: this.triggered,
      elapsed: Date.now() - this.startedAt,
      duration: this.durationMs
    };
  }

  stream() {
    if (this.finished) return;
    if (!this.webContents || this.webContents.isDestroyed()) return;
    this.webContents.send('gesture:sample', this.snapshot());
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    clearInterval(this.streamTimer);
    clearTimeout(this.finishTimer);
    if (this.earlyTimer) clearTimeout(this.earlyTimer);

    const calibration = this.calibrate ? calibrateFrom(this.max) : null;
    const trace = this.best
      ? { points: this.best.points, turns: this.best.turns }
      : { points: [], turns: [] };
    if (this.onFinish) {
      this.onFinish({
        triggered: this.triggered,
        metrics: this.max,
        calibration,
        trace
      });
    }
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Derives trigger thresholds a bit below the strongest shake observed. */
function calibrateFrom(max) {
  if (max.turns < 2 || max.path < 250) return null;
  return {
    turns: clamp(max.turns - 1, 2, 7),
    minSpeed: clamp(Math.round(max.peak * 0.5), 400, 6000),
    minArc: clamp(Math.round(max.arc * 0.5), 40, 300),
    minPath: clamp(Math.round(max.path * 0.5), 250, 4000)
  };
}

module.exports = { GestureSession, calibrateFrom };
