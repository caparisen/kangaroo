'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Curves = require('../src/shared/curves');

test('cubic bezier hits both endpoints', () => {
  const ease = Curves.cubicBezier(0.16, 1, 0.3, 1);
  assert.ok(Math.abs(ease(0)) < 1e-6);
  assert.ok(Math.abs(ease(1) - 1) < 1e-6);
});

test('cubic bezier is monotonic for a standard ease-out curve', () => {
  const ease = Curves.cubicBezier(0.16, 1, 0.3, 1);
  let previous = -1;
  for (let i = 0; i <= 100; i += 1) {
    const value = ease(i / 100);
    assert.ok(value >= previous - 1e-6);
    previous = value;
  }
});

test('overshooting curves produce values above 1', () => {
  const ease = Curves.cubicBezier(0.34, 1.56, 0.64, 1);
  let peak = 0;
  for (let i = 0; i <= 100; i += 1) peak = Math.max(peak, ease(i / 100));
  assert.ok(peak > 1.02, `expected overshoot, got ${peak}`);
});

test('presets are discoverable by their control points', () => {
  const preset = Curves.PRESETS[2];
  assert.strictEqual(Curves.findPreset(preset.bezier).id, preset.id);
  assert.strictEqual(Curves.findPreset([0.1, 0.2, 0.3, 0.4]), null);
});

test('spring converges to its target', () => {
  const spring = { stiffness: 380, damping: 22, mass: 1 };
  let state = { x: 0, v: 0 };
  for (let i = 0; i < 200; i += 1) {
    state = Curves.springStep(state, 1, 8, spring);
  }
  assert.ok(Math.abs(state.x - 1) < 0.001, `x=${state.x}`);
  assert.ok(Math.abs(state.v) < 0.05, `v=${state.v}`);
});

test('underdamped springs overshoot', () => {
  const spring = { stiffness: 500, damping: 8, mass: 1 };
  let state = { x: 0, v: 0 };
  let peak = 0;
  for (let i = 0; i < 100; i += 1) {
    state = Curves.springStep(state, 1, 8, spring);
    peak = Math.max(peak, state.x);
  }
  assert.ok(peak > 1.01, `expected overshoot, got ${peak}`);
});

test('sampleSpring returns a usable curve', () => {
  const samples = Curves.sampleSpring({ stiffness: 380, damping: 22, mass: 1 }, 1, 600, 8);
  assert.ok(samples.length > 10);
  assert.strictEqual(samples[0].time, 0);
  assert.ok(samples[samples.length - 1].time <= 600);
  assert.ok(samples[samples.length - 1].value > 0.9);
});
