/*
 * Animation primitives shared by the overlay renderer and the settings preview.
 * Plain script: exposes `window.Curves`, and also works under CommonJS for tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Curves = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

  const PRESETS = [
    { id: 'linear', label: '线性', bezier: [0, 0, 1, 1] },
    { id: 'ease-out-cubic', label: '缓出', bezier: [0.33, 1, 0.68, 1] },
    { id: 'ease-out-quint', label: '快速缓出', bezier: [0.22, 1, 0.36, 1] },
    { id: 'ease-out-expo', label: '急停', bezier: [0.16, 1, 0.3, 1] },
    { id: 'ease-out-back', label: '回弹', bezier: [0.34, 1.56, 0.64, 1] },
    { id: 'ease-in-out', label: '平滑进出', bezier: [0.65, 0, 0.35, 1] },
    { id: 'ease-out-slow', label: '快起慢收', bezier: [0.4, 0, 0.2, 1] }
  ];

  /**
   * Returns an easing function mapping progress in [0,1] to a value.
   * Control points follow CSS cubic-bezier semantics: P0=(0,0), P3=(1,1),
   * x coordinates are clamped to [0,1], y may overshoot.
   */
  function cubicBezier(x1, y1, x2, y2) {
    const cx = 3 * clamp(x1, 0, 1);
    const bx = 3 * (clamp(x2, 0, 1) - clamp(x1, 0, 1)) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;

    const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
    const sampleY = (t) => ((ay * t + by) * t + cy) * t;
    const derivativeX = (t) => (3 * ax * t + 2 * bx) * t + cx;

    function solveT(x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;

      let t = x;
      for (let i = 0; i < 8; i += 1) {
        const error = sampleX(t) - x;
        if (Math.abs(error) < 1e-7) return t;
        const slope = derivativeX(t);
        if (Math.abs(slope) < 1e-7) break;
        t -= error / slope;
        if (t < 0 || t > 1) break;
      }

      let low = 0;
      let high = 1;
      t = clamp(t, 0, 1);
      for (let i = 0; i < 32; i += 1) {
        const value = sampleX(t);
        if (Math.abs(value - x) < 1e-7) break;
        if (value < x) low = t;
        else high = t;
        t = (low + high) / 2;
      }
      return t;
    }

    return function ease(progress) {
      return sampleY(solveT(clamp(progress, 0, 1)));
    };
  }

  /**
   * Semi-implicit Euler integration of a damped spring.
   * Units: x is a ratio, time in milliseconds.
   */
  function springStep(state, target, dtMs, spring) {
    const stiffness = clamp(spring.stiffness, 1, 3000);
    const damping = clamp(spring.damping, 0, 120);
    const mass = clamp(spring.mass, 0.05, 20);
    const duration = clamp(dtMs, 0, 64) / 1000;
    const steps = Math.max(1, Math.ceil(duration / 0.004));
    const h = duration / steps;

    let { x, v } = state;
    for (let i = 0; i < steps; i += 1) {
      const acceleration = (-stiffness * (x - target) - damping * v) / mass;
      v += acceleration * h;
      x += v * h;
    }
    return { x, v };
  }

  function springSettled(state, target) {
    return Math.abs(state.x - target) < 0.0015 && Math.abs(state.v) < 0.03;
  }

  /** Samples a spring's step response for drawing a preview curve. */
  function sampleSpring(spring, target, durationMs, stepMs) {
    const samples = [];
    const total = durationMs || 1200;
    const step = stepMs || 8;
    let state = { x: 0, v: 0 };
    for (let time = 0; time <= total; time += step) {
      samples.push({ time, value: state.x });
      state = springStep(state, target, step, spring);
    }
    return samples;
  }

  function findPreset(bezier) {
    if (!Array.isArray(bezier) || bezier.length !== 4) return null;
    return (
      PRESETS.find((preset) =>
        preset.bezier.every((value, index) => Math.abs(value - bezier[index]) < 0.005)
      ) || null
    );
  }

  return {
    PRESETS,
    clamp,
    cubicBezier,
    springStep,
    springSettled,
    sampleSpring,
    findPreset
  };
});
