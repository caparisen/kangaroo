'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const DEFAULTS = {
  version: 1,
  enabled: true,
  autoStart: false,
  trigger: {
    reversals: 3,
    windowMs: 600,
    minSpeed: 750,
    idleMs: 500
  },
  visual: {
    scale: 2.8,
    glow: 0.6,
    opacity: 0.95,
    accent: '#4da3ff'
  },
  animation: {
    grow: {
      mode: 'bezier',
      ms: 280,
      bezier: [0.16, 1, 0.3, 1],
      spring: { stiffness: 380, damping: 22, mass: 1 }
    },
    shrink: {
      mode: 'bezier',
      ms: 220,
      bezier: [0.4, 0, 0.2, 1],
      spring: { stiffness: 420, damping: 30, mass: 1 }
    }
  }
};

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => JSON.parse(JSON.stringify(value));

function merge(base, patch) {
  if (Array.isArray(base)) {
    return Array.isArray(patch) ? patch.slice() : base.slice();
  }
  if (isObject(base)) {
    const out = { ...base };
    if (!isObject(patch)) return out;
    for (const key of Object.keys(base)) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        out[key] = merge(base[key], patch[key]);
      }
    }
    return out;
  }
  return patch === undefined ? base : patch;
}

function num(value, fallback, min, max) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeColor(value, fallback) {
  const raw = String(value || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw.split('').map((c) => c + c).join('')}`.toLowerCase();
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`.toLowerCase();
  return fallback;
}

function normalizeBezier(value, fallback) {
  if (!Array.isArray(value) || value.length !== 4) return fallback.slice();
  return [
    num(value[0], fallback[0], 0, 1),
    num(value[1], fallback[1], -1, 2.5),
    num(value[2], fallback[2], 0, 1),
    num(value[3], fallback[3], -1, 2.5)
  ];
}

function normalizeAnimationNode(node, defaults) {
  const source = isObject(node) ? node : {};
  const spring = isObject(source.spring) ? source.spring : {};
  return {
    mode: source.mode === 'spring' ? 'spring' : 'bezier',
    ms: Math.round(num(source.ms, defaults.ms, 60, 2000)),
    bezier: normalizeBezier(source.bezier, defaults.bezier),
    spring: {
      stiffness: num(spring.stiffness, defaults.spring.stiffness, 20, 2000),
      damping: num(spring.damping, defaults.spring.damping, 1, 120),
      mass: num(spring.mass, defaults.spring.mass, 0.2, 5)
    }
  };
}

function sanitize(candidate) {
  const merged = merge(clone(DEFAULTS), isObject(candidate) ? candidate : {});
  return {
    version: DEFAULTS.version,
    enabled: merged.enabled !== false,
    autoStart: merged.autoStart === true,
    trigger: {
      reversals: Math.round(num(merged.trigger.reversals, DEFAULTS.trigger.reversals, 2, 8)),
      windowMs: Math.round(num(merged.trigger.windowMs, DEFAULTS.trigger.windowMs, 150, 2000)),
      minSpeed: Math.round(num(merged.trigger.minSpeed, DEFAULTS.trigger.minSpeed, 100, 5000)),
      idleMs: Math.round(num(merged.trigger.idleMs, DEFAULTS.trigger.idleMs, 100, 3000))
    },
    visual: {
      scale: num(merged.visual.scale, DEFAULTS.visual.scale, 1.2, 6),
      glow: num(merged.visual.glow, DEFAULTS.visual.glow, 0, 1),
      opacity: num(merged.visual.opacity, DEFAULTS.visual.opacity, 0.2, 1),
      accent: normalizeColor(merged.visual.accent, DEFAULTS.visual.accent)
    },
    animation: {
      grow: normalizeAnimationNode(merged.animation.grow, DEFAULTS.animation.grow),
      shrink: normalizeAnimationNode(merged.animation.shrink, DEFAULTS.animation.shrink)
    }
  };
}

class ConfigStore extends EventEmitter {
  constructor(file) {
    super();
    this.file = file;
    this.existed = fs.existsSync(file);
    this.data = this.load();
    this.saveTimer = null;
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return sanitize(parsed);
    } catch {
      return sanitize({});
    }
  }

  get() {
    return clone(this.data);
  }

  update(patch) {
    const next = sanitize(merge(this.data, isObject(patch) ? patch : {}));
    if (JSON.stringify(next) === JSON.stringify(this.data)) return this.get();
    this.data = next;
    this.scheduleSave();
    this.emit('change', this.get());
    return this.get();
  }

  replace(next) {
    const sanitized = sanitize(next);
    this.data = sanitized;
    this.scheduleSave();
    this.emit('change', this.get());
    return this.get();
  }

  reset() {
    return this.replace(DEFAULTS);
  }

  scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, 250);
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(temp, this.file);
      this.existed = true;
    } catch (error) {
      console.error('[kangaroo] failed to save config:', error);
    }
  }
}

module.exports = { ConfigStore, DEFAULTS, sanitize };
