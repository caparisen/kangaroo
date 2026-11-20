'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { ShakeDetector } = require('../src/main/shake');

const CONFIG = { turns: 3, windowMs: 600, minSpeed: 900, idleMs: 500 };

function run(detector, samples) {
  const events = [];
  for (const sample of samples) {
    const result = detector.push(sample.t, sample.x, sample.y);
    if (result.activated) events.push({ type: 'activate', t: sample.t });
    if (result.deactivated) events.push({ type: 'deactivate', t: sample.t });
  }
  return events;
}

function sineSamples(options) {
  const amplitude = options.amplitude;
  const frequency = options.frequency;
  const duration = options.duration || 1200;
  const sampleMs = options.sampleMs || 16;
  const centerX = options.centerX || 600;
  const centerY = options.centerY || 400;
  const samples = [];
  for (let t = 0; t <= duration; t += sampleMs) {
    samples.push({
      t: 1000 + t,
      x: centerX + amplitude * Math.sin(2 * Math.PI * frequency * (t / 1000)),
      y: centerY + (options.wobbleY || 0) * Math.sin(2 * Math.PI * frequency * 0.5 * (t / 1000))
    });
  }
  return samples;
}

function circleSamples(options) {
  const radius = options.radius;
  const revolutionsPerSecond = options.revolutionsPerSecond;
  const duration = options.duration || 1200;
  const sampleMs = options.sampleMs || 16;
  const centerX = options.centerX || 600;
  const centerY = options.centerY || 400;
  const samples = [];
  for (let t = 0; t <= duration; t += sampleMs) {
    const angle = 2 * Math.PI * revolutionsPerSecond * (t / 1000);
    samples.push({
      t: 1000 + t,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    });
  }
  return samples;
}

test('a real shake activates the overlay', () => {
  const detector = new ShakeDetector(CONFIG);
  const events = run(detector, sineSamples({ amplitude: 100, frequency: 4 }));
  const activation = events.find((event) => event.type === 'activate');
  assert.ok(activation, 'expected activation');
  assert.ok(activation.t - 1000 < 900, `activation too slow: ${activation.t - 1000}ms`);
});

test('the overlay shrinks back after the shaking stops', () => {
  const detector = new ShakeDetector(CONFIG);
  const samples = sineSamples({ amplitude: 100, frequency: 4, duration: 900 });
  assert.ok(run(detector, samples).some((event) => event.type === 'activate'));

  const last = samples[samples.length - 1];
  let deactivated = false;
  for (let t = last.t + 16; t < last.t + 2000; t += 16) {
    if (detector.push(t, last.x, last.y).deactivated) {
      deactivated = true;
      break;
    }
  }
  assert.ok(deactivated, 'expected the overlay to shrink once the pointer rests');
});

test('small trembling does not activate', () => {
  const detector = new ShakeDetector(CONFIG);
  const samples = sineSamples({ amplitude: 8, frequency: 12, duration: 1500 });
  assert.strictEqual(run(detector, samples).filter((e) => e.type === 'activate').length, 0);
});

test('a short small wobble does not activate', () => {
  const detector = new ShakeDetector(CONFIG);
  const samples = sineSamples({ amplitude: 20, frequency: 9, duration: 1200 });
  assert.strictEqual(run(detector, samples).filter((e) => e.type === 'activate').length, 0);
});

test('fast circular movement activates', () => {
  const detector = new ShakeDetector(CONFIG);
  const events = run(detector, circleSamples({ radius: 90, revolutionsPerSecond: 2 }));
  assert.ok(events.some((event) => event.type === 'activate'), 'expected activation');
});

test('slow movement does not activate', () => {
  const detector = new ShakeDetector(CONFIG);
  const samples = [];
  for (let t = 0; t < 2000; t += 16) {
    samples.push({ t: 1000 + t, x: 300 + (t / 1000) * 300, y: 300 });
  }
  assert.strictEqual(run(detector, samples).filter((e) => e.type === 'activate').length, 0);
});

test('a single fast swing does not activate', () => {
  const detector = new ShakeDetector(CONFIG);
  const samples = [];
  for (let t = 0; t < 400; t += 16) {
    samples.push({ t: 1000 + t, x: 200 + t * 3, y: 200 });
  }
  for (let t = 400; t < 1400; t += 16) {
    samples.push({ t: 1000 + t, x: 1400, y: 200 });
  }
  assert.strictEqual(run(detector, samples).filter((e) => e.type === 'activate').length, 0);
});

test('shaking again re-activates after shrinking', () => {
  const detector = new ShakeDetector(CONFIG);
  const first = sineSamples({ amplitude: 100, frequency: 4, duration: 800 });
  run(detector, first);

  const last = first[first.length - 1];
  let t = last.t + 16;
  for (; t < last.t + 1500; t += 16) {
    detector.push(t, last.x, last.y);
    if (!detector.active) break;
  }

  const second = sineSamples({ amplitude: 100, frequency: 4, duration: 800 }).map((sample) => ({
    ...sample,
    t: sample.t + t - 1000
  }));
  assert.ok(run(detector, second).some((event) => event.type === 'activate'));
});

test('one slow oscillation inside the window does not activate', () => {
  const detector = new ShakeDetector(CONFIG);
  const samples = sineSamples({ amplitude: 120, frequency: 1.5, duration: 1600 });
  assert.strictEqual(run(detector, samples).filter((e) => e.type === 'activate').length, 0);
});
