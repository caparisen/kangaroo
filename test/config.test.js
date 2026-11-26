'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { sanitize, DEFAULTS } = require('../src/main/config');

test('defaults use the speed trigger and the new config version', () => {
  const config = sanitize({});
  assert.strictEqual(config.version, 3);
  assert.strictEqual(config.speed.min, 800);
  assert.strictEqual(config.speed.max, 2800);
  assert.strictEqual(config.speed.kick, 8000);
  assert.deepStrictEqual(config.speed.curve, [0.25, 0.3, 0.6, 1]);
  assert.strictEqual(config.trigger, undefined);
  assert.strictEqual(config.language, 'en');
});

test('configs written for the shake trigger keep their visual settings', () => {
  const config = sanitize({
    version: 2,
    trigger: { turns: 4, minSpeed: 900, minPath: 700, idleMs: 500 },
    visual: { scale: 3.4, accent: '#FF6B6B' },
    animation: { grow: { ms: 400 } }
  });
  assert.strictEqual(config.version, 3);
  assert.strictEqual(config.trigger, undefined);
  assert.strictEqual(config.speed.min, DEFAULTS.speed.min);
  assert.strictEqual(config.speed.max, DEFAULTS.speed.max);
  assert.strictEqual(config.visual.scale, 3.4);
  assert.strictEqual(config.visual.accent, '#ff6b6b');
  assert.strictEqual(config.animation.grow.ms, 400);
});

test('speed values are clamped and max stays above min', () => {
  assert.strictEqual(sanitize({ speed: { min: 10 } }).speed.min, 100);
  assert.strictEqual(sanitize({ speed: { max: 99999 } }).speed.max, 12000);

  const config = sanitize({ speed: { min: 3000, max: 1200 } });
  assert.strictEqual(config.speed.min, 3000);
  assert.strictEqual(config.speed.max, 3100);
});

test('speed curve control points are clamped to 0..1', () => {
  const config = sanitize({ speed: { curve: [-1, 2, 0.5, 3] } });
  assert.deepStrictEqual(config.speed.curve, [0, 1, 0.5, 1]);
  assert.deepStrictEqual(sanitize({ speed: { curve: [1, 0] } }).speed.curve, DEFAULTS.speed.curve);
});

test('the acceleration trigger can be disabled or clamped', () => {
  assert.strictEqual(sanitize({ speed: { kick: 0 } }).speed.kick, 0);
  assert.strictEqual(sanitize({ speed: { kick: -500 } }).speed.kick, 0);
  assert.strictEqual(sanitize({ speed: { kick: 999999 } }).speed.kick, 200000);
  assert.strictEqual(sanitize({}).speed.kick, 8000);
});

test('language and switches survive sanitizing', () => {
  const config = sanitize({ language: 'zh', enabled: false, autoStart: true });
  assert.strictEqual(config.language, 'zh');
  assert.strictEqual(config.enabled, false);
  assert.strictEqual(config.autoStart, true);
});
