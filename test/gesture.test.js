'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { calibrateFrom, GestureSession } = require('../src/main/gesture');
const { sanitize } = require('../src/main/config');

test('calibration ignores a gesture that is too small', () => {
  assert.strictEqual(calibrateFrom({ turns: 1, path: 120, peak: 600, arc: 50 }), null);
  assert.strictEqual(calibrateFrom({ turns: 3, path: 200, peak: 1200, arc: 80 }), null);
});

test('calibration derives thresholds below the observed shake', () => {
  const result = calibrateFrom({ turns: 4, path: 900, peak: 2400, arc: 160 });
  assert.ok(result);
  assert.strictEqual(result.turns, 3);
  assert.strictEqual(result.minPath, 450);
  assert.strictEqual(result.minSpeed, 1200);
  assert.strictEqual(result.minArc, 80);
});

test('config keeps the new trigger keys and language', () => {
  const config = sanitize({
    language: 'zh',
    trigger: { turns: 5, minArc: 120, minPath: 700, reversals: 9 }
  });
  assert.strictEqual(config.language, 'zh');
  assert.strictEqual(config.trigger.turns, 5);
  assert.strictEqual(config.trigger.minArc, 120);
  assert.strictEqual(config.trigger.minPath, 700);
  assert.strictEqual(config.trigger.reversals, undefined);
});

test('config defaults to English and standard thresholds', () => {
  const config = sanitize({});
  assert.strictEqual(config.language, 'en');
  assert.strictEqual(config.trigger.turns, 3);
  assert.strictEqual(config.trigger.minPath, 550);
  assert.strictEqual(config.version, 2);
});

test('old trigger configs migrate to the new defaults', () => {
  const config = sanitize({
    trigger: { reversals: 5, minSpeed: 750, windowMs: 600, idleMs: 500 }
  });
  assert.strictEqual(config.trigger.turns, 3);
  assert.strictEqual(config.trigger.minSpeed, 900);
  assert.strictEqual(config.trigger.minArc, 90);
  assert.strictEqual(config.trigger.minPath, 550);
});

test('a gesture session records a real shake and calibrates', () => {
  let result = null;
  const session = new GestureSession({
    webContents: { isDestroyed: () => false, send: () => {} },
    trigger: { turns: 2, windowMs: 600, minSpeed: 750, minArc: 70, minPath: 400, idleMs: 500 },
    durationMs: 60000,
    calibrate: true,
    onFinish: (value) => {
      result = value;
    }
  });

  for (let t = 0; t <= 1200; t += 16) {
    session.push(1000 + t, {
      x: 600 + 100 * Math.sin((2 * Math.PI * 4 * t) / 1000),
      y: 400
    });
  }
  session.finish();

  assert.ok(result);
  assert.strictEqual(result.triggered, true);
  assert.ok(result.calibration);
  assert.ok(result.calibration.minPath > 0);
  assert.ok(result.trace.points.length > 0);
});
