'use strict';

const Curves = require('../shared/curves');

const DEFAULTS = {
  min: 800,
  max: 2800,
  kick: 8000,
  curve: [0.25, 0.3, 0.6, 1],
  smoothingMs: 40,
  accelSmoothingMs: 20,
  holdMs: 400
};

const RESET_GAP_MS = 200;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Turns cursor positions into a magnification strength.
 *
 * The pointer size follows the speed of the current movement: `curve` maps the
 * normalized speed (0 at min, 1 at max) to a strength in 0..1, which the
 * overlay turns into a size between 1x and the configured maximum. The peak
 * strength of the movement is kept until the cursor has stayed below `min` for
 * `holdMs`, so the enlarged pointer is still visible right after stopping.
 *
 * A sudden change of speed (|acceleration| above `kick`) starts the overlay
 * immediately, before the smoothed speed has crossed `min`. The size still
 * comes from the speed curve, so the pre-trigger only removes the reaction
 * delay; it does not add magnification of its own.
 * Path shape and direction changes play no part.
 */
class SpeedTracker {
  constructor(config) {
    this.setConfig(config);
    this.reset();
  }

  setConfig(config) {
    this.config = { ...DEFAULTS, ...(config || {}) };
    this.config.min = Math.max(1, Number(this.config.min) || DEFAULTS.min);
    this.config.max = Math.max(this.config.min + 1, Number(this.config.max) || DEFAULTS.max);
    this.config.kick = Math.max(0, Number(this.config.kick) || 0);
    const curve = Array.isArray(this.config.curve) ? this.config.curve : DEFAULTS.curve;
    this.ease = Curves.cubicBezier(curve[0], curve[1], curve[2], curve[3]);
  }

  reset() {
    this.last = null;
    this.speed = 0;
    this.prevSpeed = 0;
    this.accel = 0;
    this.strength = 0;
    this.peak = 0;
    this.active = false;
    this.lastFastAt = 0;
  }

  /** 0 below `min`, 1 at or above `max`, shaped by `curve` in between. */
  strengthFor(speed) {
    const { min, max } = this.config;
    if (speed <= min) return 0;
    if (speed >= max) return 1;
    return clamp(this.ease((speed - min) / (max - min)), 0, 1);
  }

  push(now, x, y) {
    const result = {
      activated: false,
      deactivated: false,
      active: this.active,
      speed: 0,
      accel: 0,
      strength: 0
    };

    if (!this.last) {
      this.last = { t: now, x, y };
      return result;
    }

    const dt = now - this.last.t;
    if (dt > 0 && dt <= RESET_GAP_MS) {
      // Only the distance matters, so a straight line and a zigzag at the same
      // speed produce the same strength.
      const rawSpeed = (Math.hypot(x - this.last.x, y - this.last.y) / dt) * 1000;
      const k = 1 - Math.exp(-dt / this.config.smoothingMs);
      this.speed += (rawSpeed - this.speed) * k;

      const rawAccel = (this.speed - this.prevSpeed) / (dt / 1000);
      const accelK = 1 - Math.exp(-dt / this.config.accelSmoothingMs);
      this.accel += (rawAccel - this.accel) * accelK;
      this.prevSpeed = this.speed;
    } else if (dt > RESET_GAP_MS) {
      this.speed = 0;
      this.prevSpeed = 0;
      this.accel = 0;
    }
    this.last = { t: now, x, y };

    const target = this.strengthFor(this.speed);
    const kick = this.config.kick > 0 && Math.abs(this.accel) >= this.config.kick;

    if (target > 0) {
      this.lastFastAt = now;
      if (!this.active) {
        this.active = true;
        this.peak = target;
        result.activated = true;
      } else if (target > this.peak) {
        this.peak = target;
      }
    } else if (kick) {
      this.lastFastAt = now;
      if (!this.active) {
        // Show the overlay now; the size stays 0 until the speed curve says so.
        this.active = true;
        this.peak = 0;
        result.activated = true;
      }
    }

    if (this.active && now - this.lastFastAt > this.config.holdMs) {
      this.active = false;
      this.peak = 0;
      result.deactivated = true;
    }

    this.strength = this.active ? this.peak : 0;
    result.active = this.active;
    result.speed = this.speed;
    result.accel = this.accel;
    result.strength = this.strength;
    return result;
  }
}

module.exports = { SpeedTracker, DEFAULTS };
