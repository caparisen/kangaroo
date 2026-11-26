'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { SpeedTracker } = require('../src/main/speed');

const CONFIG = {
  min: 500,
  max: 2000,
  curve: [0, 0, 1, 1],
  smoothingMs: 20,
  holdMs: 300
};

function makeTracker(overrides) {
  return new SpeedTracker({ ...CONFIG, ...(overrides || {}) });
}

/** Constant-speed samples; `speed` is px/s. */
function straight({ speed, duration, sampleMs = 16, t0 = 1000, x0 = 400, y0 = 300 }) {
  const samples = [];
  for (let t = 0; t <= duration; t += sampleMs) {
    samples.push({
      t: t0 + t,
      x: x0 + (speed * t) / 1000,
      y: y0
    });
  }
  return samples;
}

function feed(tracker, samples) {
  return samples.map((sample) => tracker.push(sample.t, sample.x, sample.y));
}

test('speed maps linearly to strength between min and max', () => {
  const tracker = makeTracker();
  assert.strictEqual(tracker.strengthFor(400), 0);
  assert.strictEqual(tracker.strengthFor(500), 0);
  assert.ok(Math.abs(tracker.strengthFor(1250) - 0.5) < 1e-9);
  assert.strictEqual(tracker.strengthFor(2000), 1);
  assert.strictEqual(tracker.strengthFor(9000), 1);
});

test('the curve shapes the speed mapping', () => {
  const linear = makeTracker();
  const curved = makeTracker({ curve: [0.25, 0.3, 0.6, 1] });
  assert.ok(curved.strengthFor(1250) > linear.strengthFor(1250) + 0.05);
  assert.ok(curved.strengthFor(2000) === 1);
});

test('slow movement never magnifies', () => {
  const tracker = makeTracker();
  const results = feed(tracker, straight({ speed: 350, duration: 2000 }));
  assert.ok(results.every((result) => !result.activated && !result.active));
});

test('jitter around a resting cursor never magnifies', () => {
  const tracker = makeTracker();
  const samples = [];
  for (let i = 0; i < 120; i += 1) {
    samples.push({ t: 1000 + i * 16, x: 400 + (i % 2), y: 300 });
  }
  const results = feed(tracker, samples);
  assert.ok(results.every((result) => !result.activated && !result.active));
});

test('fast movement activates and follows the speed', () => {
  const tracker = makeTracker();
  const results = feed(tracker, straight({ speed: 1500, duration: 800 }));
  const last = results[results.length - 1];

  assert.ok(results.some((result) => result.activated));
  assert.strictEqual(last.active, true);
  assert.ok(Math.abs(last.strength - 2 / 3) < 0.02, `strength=${last.strength}`);
});

test('faster movement produces a larger pointer', () => {
  const slow = makeTracker();
  const fast = makeTracker();
  const slowResults = feed(slow, straight({ speed: 900, duration: 600 }));
  const fastResults = feed(fast, straight({ speed: 1600, duration: 600 }));

  const slowStrength = slowResults[slowResults.length - 1].strength;
  const fastStrength = fastResults[fastResults.length - 1].strength;
  assert.ok(slowStrength > 0);
  assert.ok(fastStrength > slowStrength, `${slowStrength} vs ${fastStrength}`);
});

test('path shape does not change the strength', () => {
  const straightTracker = makeTracker();
  const zigzagTracker = makeTracker();
  const straightSamples = straight({ speed: 1500, duration: 800 });

  const zigzagSamples = straightSamples.map((sample, index) => ({
    t: sample.t,
    x: 400 + (index % 2 === 0 ? 0 : 24),
    y: 300
  }));

  const straightResults = feed(straightTracker, straightSamples);
  const zigzagResults = feed(zigzagTracker, zigzagSamples);
  const straightLast = straightResults[straightResults.length - 1];
  const zigzagLast = zigzagResults[zigzagResults.length - 1];

  assert.ok(Math.abs(straightLast.speed - zigzagLast.speed) < 1e-6);
  assert.ok(Math.abs(straightLast.strength - zigzagLast.strength) < 1e-6);
});

test('reversing direction keeps the pointer enlarged', () => {
  const tracker = makeTracker();
  let results = feed(tracker, straight({ speed: 1500, duration: 400 }));
  assert.ok(results[results.length - 1].active);

  const backward = [];
  for (let i = 1; i <= 25; i += 1) {
    backward.push({ t: 1400 + i * 16, x: 1000 - 24 * i, y: 300 });
  }
  results = feed(tracker, backward);
  const final = results[results.length - 1];
  assert.strictEqual(final.active, true);
  assert.ok(Math.abs(final.strength - 2 / 3) < 0.02);
});

test('the peak size holds briefly and then shrinks back', () => {
  const tracker = makeTracker();
  const samples = straight({ speed: 1500, duration: 500 });
  const results = feed(tracker, samples);
  const peak = results[results.length - 1].strength;
  const last = samples[samples.length - 1];

  assert.ok(peak > 0.6);

  let deactivatedAt = 0;
  let time = last.t;
  for (let i = 0; i < 100; i += 1) {
    time += 16;
    const result = tracker.push(time, last.x, last.y);
    if (result.deactivated) {
      deactivatedAt = time;
      break;
    }
    if (result.active) {
      assert.ok(
        Math.abs(result.strength - peak) < 0.02,
        `hold changed the size: ${result.strength} vs ${peak}`
      );
    }
  }

  assert.ok(deactivatedAt, 'expected deactivation');
  const holdMs = deactivatedAt - last.t;
  assert.ok(holdMs >= 250, `hold too short: ${holdMs}ms`);
  assert.ok(holdMs <= 700, `hold too long: ${holdMs}ms`);
});

test('a second fast movement re-activates after the hold', () => {
  const tracker = makeTracker();
  const first = straight({ speed: 1500, duration: 400 });
  feed(tracker, first);
  const last = first[first.length - 1];

  let time = last.t;
  for (let i = 0; i < 100; i += 1) {
    time += 16;
    if (tracker.push(time, last.x, last.y).deactivated) break;
  }
  assert.strictEqual(tracker.active, false);

  const second = [];
  for (let i = 1; i <= 40; i += 1) {
    second.push({ t: time + i * 16, x: last.x + 24 * i, y: last.y });
  }
  const results = feed(tracker, second);
  assert.ok(results.some((result) => result.activated));
  assert.ok(results[results.length - 1].active);
});

test('a long sampling gap does not keep the pointer enlarged', () => {
  const tracker = makeTracker();
  feed(tracker, straight({ speed: 1500, duration: 300 }));
  assert.strictEqual(tracker.active, true);

  const result = tracker.push(5000, 900, 300);
  assert.strictEqual(result.speed, 0);
  assert.strictEqual(result.active, false);
  assert.strictEqual(result.deactivated, true);
});
