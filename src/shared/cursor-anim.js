/*
 * Scale animation for the enlarged pointer.
 * ratio: 0 = hidden, 1 = full configured size. Both bezier and spring modes.
 */
(function (root) {
  'use strict';

  const Curves = root.Curves;

  class CursorAnimator {
    constructor(config) {
      this.config = config;
      this.ratio = 0;
      this.phase = 'idle'; // idle | grow | hold | shrink
      this.from = 0;
      this.target = 0;
      this.startedAt = 0;
      this.lastTick = 0;
      this.duration = 1;
      this.ease = null;
      this.mode = 'bezier';
      this.spring = { stiffness: 380, damping: 24, mass: 1 };
      this.velocity = 0;
    }

    setConfig(config) {
      this.config = config;
    }

    grow(now) {
      this._begin('grow', 1, this.config.animation.grow, now);
    }

    shrink(now) {
      this._begin('shrink', 0, this.config.animation.shrink, now);
    }

    _begin(phase, target, options, now) {
      this.phase = phase;
      this.target = target;
      this.from = this.ratio;
      this.startedAt = now;
      this.lastTick = now;
      this.mode = options.mode === 'spring' ? 'spring' : 'bezier';
      this.duration = Math.max(16, Number(options.ms) || 240);
      this.spring = options.spring || this.spring;
      this.velocity = 0;
      if (this.mode === 'bezier') {
        const b = Array.isArray(options.bezier) ? options.bezier : [0.16, 1, 0.3, 1];
        this.ease = Curves.cubicBezier(b[0], b[1], b[2], b[3]);
      }
    }

    /** Advances the animation to `now` and returns the current state. */
    tick(now) {
      if (this.phase === 'idle') return { ratio: this.ratio, phase: 'idle', done: true };

      const target = this.target;
      let done = false;

      if (this.mode === 'bezier') {
        const progress = Math.min(1, Math.max(0, (now - this.startedAt) / this.duration));
        const eased = this.ease(progress);
        this.ratio = this.from + (target - this.from) * eased;
        done = progress >= 1;
      } else {
        const dt = Math.min(64, Math.max(0, now - this.lastTick));
        const state = Curves.springStep(
          { x: this.ratio, v: this.velocity },
          target,
          dt,
          this.spring
        );
        this.ratio = state.x;
        this.velocity = state.v;
        done =
          Curves.springSettled(state, target) || (target === 0 && state.x <= 0.0005);
      }

      this.lastTick = now;

      if (done) {
        this.ratio = target;
        this.phase = target === 1 ? 'hold' : 'idle';
      } else {
        this.ratio = Math.max(0, Math.min(1.25, this.ratio));
      }

      return { ratio: this.ratio, phase: this.phase, done: done && target === 0 };
    }

    get visible() {
      return this.ratio > 0.001;
    }
  }

  root.CursorAnimator = CursorAnimator;
})(typeof window !== 'undefined' ? window : globalThis);
