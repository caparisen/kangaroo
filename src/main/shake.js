'use strict';

const DEFAULTS = {
  turns: 3,
  windowMs: 600,
  minSpeed: 900,
  minArc: 90,
  minPath: 550,
  idleMs: 500
};

const SMOOTHING_MS = 24;
const SPEED_GATE = 320; // px/s; slower movement never counts
const TURN_ANGLE = 60; // degrees away from the current heading

/**
 * Turns a stream of cursor positions into activation / deactivation events.
 *
 * A shake is recognised as sustained fast travel with repeated large heading
 * changes: three 60-degree turns and at least 550 px of movement inside the
 * window. Small tremors fail the arc/path thresholds, single flicks fail the
 * turn count, and vigorous circles produce turns as well, matching the
 * "shake until the pointer is obvious" intent.
 */
class ShakeDetector {
  constructor(trigger) {
    this.setConfig(trigger);
    this.reset();
  }

  setConfig(trigger) {
    this.trigger = { ...DEFAULTS, ...(trigger || {}) };
  }

  reset() {
    this.last = null;
    this.vx = 0;
    this.vy = 0;
    this.heading = null;
    this.arc = 0;
    this.turnPoints = [];
    this.paths = [];
    this.speeds = [];
    this.active = false;
    this.lastShakeAt = 0;
    this.metrics = { turns: 0, path: 0, peak: 0, arc: 0 };
  }

  push(now, x, y) {
    const result = { activated: false, deactivated: false, active: this.active };

    if (!this.last) {
      this.last = { t: now, x, y };
      return result;
    }

    const dt = now - this.last.t;
    if (dt <= 0) {
      this.last = { t: now, x, y };
      return result;
    }

    if (dt > 200) {
      this.last = { t: now, x, y };
      this.vx = 0;
      this.vy = 0;
      this.heading = null;
      this.arc = 0;
      return result;
    }

    const distance = Math.hypot(x - this.last.x, y - this.last.y);
    const rawVx = ((x - this.last.x) / dt) * 1000;
    const rawVy = ((y - this.last.y) / dt) * 1000;
    const k = 1 - Math.exp(-dt / SMOOTHING_MS);
    this.vx += (rawVx - this.vx) * k;
    this.vy += (rawVy - this.vy) * k;
    const speed = Math.hypot(this.vx, this.vy);

    this.last = { t: now, x, y };

    if (speed >= SPEED_GATE) {
      const ux = this.vx / speed;
      const uy = this.vy / speed;

      if (!this.heading) {
        this.heading = { x: ux, y: uy };
      } else {
        const dot = Math.max(-1, Math.min(1, ux * this.heading.x + uy * this.heading.y));
        const angle = (Math.acos(dot) * 180) / Math.PI;
        if (angle >= TURN_ANGLE && this.arc >= this.trigger.minArc) {
          this.turnPoints.push({ t: now, x, y });
          this.heading = { x: ux, y: uy };
          this.arc = 0;
          if (this.active) this.lastShakeAt = now;
        }
      }

      this.arc += distance;
      this.paths.push({ t: now, d: distance });
    }

    this.speeds.push({ t: now, v: speed });

    const cutoff = now - this.trigger.windowMs;
    while (this.turnPoints.length && this.turnPoints[0].t < cutoff) this.turnPoints.shift();
    while (this.paths.length && this.paths[0].t < cutoff) this.paths.shift();
    while (this.speeds.length && this.speeds[0].t < cutoff) this.speeds.shift();

    let path = 0;
    for (const segment of this.paths) path += segment.d;
    let peak = 0;
    for (const sample of this.speeds) peak = Math.max(peak, sample.v);
    this.metrics = { turns: this.turnPoints.length, path, peak, arc: this.arc };

    if (
      !this.active &&
      this.turnPoints.length >= this.trigger.turns &&
      path >= this.trigger.minPath &&
      peak >= this.trigger.minSpeed
    ) {
      this.active = true;
      this.lastShakeAt = now;
      this.turnPoints.length = 0;
      this.arc = 0;
      result.activated = true;
    } else if (this.active && now - this.lastShakeAt > this.trigger.idleMs) {
      this.active = false;
      this.turnPoints.length = 0;
      this.paths.length = 0;
      this.arc = 0;
      this.heading = null;
      result.deactivated = true;
    }

    result.active = this.active;
    return result;
  }
}

module.exports = { ShakeDetector, DEFAULTS };
