'use strict';

const api = window.kangaroo;

const CURVE_PAD = { left: 26, right: 18, top: 16, bottom: 20 };
const CURVE_Y_MIN = -0.5;
const CURVE_Y_MAX = 1.6;
const PREVIEW_HEIGHT = 232;

let state = null;
let cards = [];
let saveTimer = 0;
let previewTimer = 0;
let previewAnimator = null;
let previewRaf = 0;
let previewHoldAt = 0;
let previewLoopTimer = 0;
let lastPreviewRatio = 0;

const previewCanvas = document.getElementById('preview');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits) => {
  const factor = 10 ** (digits === undefined ? 3 : digits);
  return Math.round(value * factor) / factor;
};

/* ------------------------------------------------------------------ canvas */

function prepareCanvas(canvas, cssHeight) {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(240, canvas.clientWidth || 520);
  const targetWidth = Math.round(width * dpr);
  const targetHeight = Math.round(cssHeight * dpr);
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  canvas.style.height = `${cssHeight}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, cssHeight);
  return { ctx, width, height: cssHeight };
}

function plotRect(width, height) {
  return {
    x: CURVE_PAD.left,
    y: CURVE_PAD.top,
    w: Math.max(20, width - CURVE_PAD.left - CURVE_PAD.right),
    h: Math.max(20, height - CURVE_PAD.top - CURVE_PAD.bottom)
  };
}

function curveY(value, plot, min, max) {
  return plot.y + ((max - value) / (max - min)) * plot.h;
}

function clipAlpha(hex, alpha) {
  const value = String(hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) return `rgba(77, 163, 255, ${alpha})`;
  const int = parseInt(value, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

function strokeLine(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawCurve(canvas, bezier) {
  const { ctx, width, height } = prepareCanvas(canvas, 200);
  const plot = plotRect(width, height);
  const accent = (state && state.visual && state.visual.accent) || '#4da3ff';
  const toX = (p) => plot.x + p * plot.w;
  const toY = (v) => curveY(v, plot, CURVE_Y_MIN, CURVE_Y_MAX);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.055)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    strokeLine(ctx, toX(i / 4), plot.y, toX(i / 4), plot.y + plot.h);
  }
  for (let i = 0; i <= 4; i += 1) {
    const y = toY(1 - i / 4);
    strokeLine(ctx, plot.x, y, plot.x + plot.w, y);
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
  ctx.font = '10px "Segoe UI", sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('0', plot.x - 8, toY(0));
  ctx.fillText('1', plot.x - 8, toY(1));

  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  strokeLine(ctx, toX(0), toY(0), toX(1), toY(1));
  ctx.setLineDash([]);

  const ease = Curves.cubicBezier(bezier[0], bezier[1], bezier[2], bezier[3]);
  ctx.beginPath();
  const steps = 180;
  for (let i = 0; i <= steps; i += 1) {
    const p = i / steps;
    const x = toX(p);
    const y = toY(ease(p));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  const handles = controlPixels(bezier, plot);
  ctx.strokeStyle = clipAlpha(accent, 0.4);
  ctx.lineWidth = 1.5;
  strokeLine(ctx, toX(0), toY(0), handles[0].x, handles[0].y);
  strokeLine(ctx, toX(1), toY(1), handles[1].x, handles[1].y);

  for (const handle of handles) {
    ctx.beginPath();
    ctx.arc(handle.x, handle.y, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0d1014';
    ctx.stroke();
  }
}

function controlPixels(bezier, plot) {
  return [
    { x: plot.x + bezier[0] * plot.w, y: curveY(bezier[1], plot, CURVE_Y_MIN, CURVE_Y_MAX) },
    { x: plot.x + bezier[2] * plot.w, y: curveY(bezier[3], plot, CURVE_Y_MIN, CURVE_Y_MAX) }
  ];
}

function drawSpring(canvas, spring) {
  const { ctx, width, height } = prepareCanvas(canvas, 152);
  const plot = plotRect(width, height);
  const accent = (state && state.visual && state.visual.accent) || '#4da3ff';
  const samples = Curves.sampleSpring(spring, 1, 900, 6);
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, sample.value, 0);
  const yMax = Math.max(1.15, peak * 1.12);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.055)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    strokeLine(ctx, plot.x + (i / 4) * plot.w, plot.y, plot.x + (i / 4) * plot.w, plot.y + plot.h);
  }
  for (let i = 0; i <= 2; i += 1) {
    const y = plot.y + (i / 2) * plot.h;
    strokeLine(ctx, plot.x, y, plot.x + plot.w, y);
  }

  const toX = (time) => plot.x + (time / 900) * plot.w;
  const toY = (value) => plot.y + (1 - value / yMax) * plot.h;

  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  strokeLine(ctx, plot.x, toY(1), plot.x + plot.w, toY(1));
  ctx.setLineDash([]);

  ctx.beginPath();
  samples.forEach((sample, index) => {
    const x = toX(sample.time);
    const y = toY(sample.value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(toX(900), toY(0));
  ctx.lineTo(toX(0), toY(0));
  ctx.closePath();
  ctx.fillStyle = clipAlpha(accent, 0.1);
  ctx.fill();

  ctx.beginPath();
  samples.forEach((sample, index) => {
    const x = toX(sample.time);
    const y = toY(sample.value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/* ------------------------------------------------------------------- cards */

function formatSpring(name, value) {
  if (name === 'mass') return value.toFixed(1);
  return String(Math.round(value));
}

function buildAnimCard(host, key) {
  const template = document.getElementById('anim-template');
  const node = template.content.firstElementChild.cloneNode(true);
  host.appendChild(node);

  const elements = {
    modes: Array.from(node.querySelectorAll('[data-mode]')),
    preset: node.querySelector('.preset'),
    bezierPanel: node.querySelector('.bezier-panel'),
    springPanel: node.querySelector('.spring-panel'),
    curve: node.querySelector('.curve-canvas'),
    springCanvas: node.querySelector('.spring-canvas'),
    value: node.querySelector('.curve-value'),
    ms: node.querySelector('.ms-range'),
    msOut: node.querySelector('.ms-out')
  };

  for (const preset of Curves.PRESETS) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.label;
    elements.preset.appendChild(option);
  }
  const custom = document.createElement('option');
  custom.value = 'custom';
  custom.textContent = '自定义';
  custom.disabled = true;
  elements.preset.appendChild(custom);

  const springInputs = {};
  const springOutputs = {};
  for (const name of ['stiffness', 'damping', 'mass']) {
    springInputs[name] = node.querySelector(`[data-input="${name}"]`);
    springOutputs[name] = node.querySelector(`[data-out="${name}"]`);
  }

  const settings = () => state.animation[key];

  function render() {
    const anim = settings();
    const bezierMode = anim.mode === 'bezier';

    for (const mode of elements.modes) {
      mode.setAttribute('aria-pressed', String(mode.dataset.mode === anim.mode));
    }
    elements.bezierPanel.hidden = !bezierMode;
    elements.springPanel.hidden = bezierMode;
    elements.preset.disabled = !bezierMode;

    elements.ms.value = String(anim.ms);
    elements.msOut.textContent = `${Math.round(anim.ms)} ms`;

    const preset = Curves.findPreset(anim.bezier);
    elements.preset.value = preset ? preset.id : 'custom';
    elements.value.textContent = `cubic-bezier(${anim.bezier
      .map((value) => value.toFixed(2))
      .join(', ')})`;

    if (bezierMode) drawCurve(elements.curve, anim.bezier);
    else drawSpring(elements.springCanvas, anim.spring);

    for (const name of Object.keys(springInputs)) {
      springInputs[name].value = String(anim.spring[name]);
      springOutputs[name].textContent = formatSpring(name, anim.spring[name]);
    }
  }

  for (const mode of elements.modes) {
    mode.addEventListener('click', () => {
      settings().mode = mode.dataset.mode;
      render();
      touch();
    });
  }

  elements.preset.addEventListener('change', () => {
    const preset = Curves.PRESETS.find((item) => item.id === elements.preset.value);
    if (!preset) return;
    settings().mode = 'bezier';
    settings().bezier = preset.bezier.slice();
    render();
    touch();
  });

  elements.ms.addEventListener('input', () => {
    settings().ms = Math.round(Number(elements.ms.value));
    elements.msOut.textContent = `${elements.ms.value} ms`;
    touch();
  });

  for (const name of Object.keys(springInputs)) {
    springInputs[name].addEventListener('input', () => {
      settings().spring[name] = Number(springInputs[name].value);
      springOutputs[name].textContent = formatSpring(name, settings().spring[name]);
      drawSpring(elements.springCanvas, settings().spring);
      touch();
    });
  }

  let dragIndex = -1;
  let dragPointer = -1;

  elements.curve.addEventListener('pointerdown', (event) => {
    const anim = settings();
    if (anim.mode !== 'bezier') return;

    const rect = elements.curve.getBoundingClientRect();
    const plot = plotRect(rect.width, rect.height);
    const handles = controlPixels(anim.bezier, plot);
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const first = Math.hypot(x - handles[0].x, y - handles[0].y);
    const second = Math.hypot(x - handles[1].x, y - handles[1].y);
    const index = first <= second ? 0 : 1;
    if (Math.min(first, second) > 26) return;

    dragIndex = index;
    dragPointer = event.pointerId;
    elements.curve.setPointerCapture(event.pointerId);
    elements.curve.style.cursor = 'grabbing';
    event.preventDefault();
  });

  elements.curve.addEventListener('pointermove', (event) => {
    if (dragIndex < 0 || event.pointerId !== dragPointer) return;
    const anim = settings();
    const rect = elements.curve.getBoundingClientRect();
    const plot = plotRect(rect.width, rect.height);
    const p = (event.clientX - rect.left - plot.x) / plot.w;
    const v =
      CURVE_Y_MAX -
      ((event.clientY - rect.top - plot.y) / plot.h) * (CURVE_Y_MAX - CURVE_Y_MIN);
    anim.bezier[dragIndex * 2] = round(clamp(p, 0, 1));
    anim.bezier[dragIndex * 2 + 1] = round(clamp(v, CURVE_Y_MIN, CURVE_Y_MAX));
    render();
    touch();
  });

  function endDrag(event) {
    if (dragIndex < 0) return;
    if (event && event.pointerId !== dragPointer) return;
    dragIndex = -1;
    dragPointer = -1;
    elements.curve.style.cursor = 'crosshair';
    flushSave();
  }

  elements.curve.addEventListener('pointerup', endDrag);
  elements.curve.addEventListener('pointercancel', endDrag);

  return { render };
}

/* ----------------------------------------------------------------- preview */

function drawPreviewBackground(ctx, width, height) {
  const gradient = ctx.createRadialGradient(
    width * 0.5,
    height * 0.46,
    10,
    width * 0.5,
    height * 0.46,
    Math.max(width, height) * 0.8
  );
  gradient.addColorStop(0, '#171c25');
  gradient.addColorStop(1, '#0b0d11');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
  const gap = 26;
  for (let y = gap; y < height; y += gap) {
    for (let x = gap; x < width; x += gap) {
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }
}

function drawPreview(ratio) {
  const { ctx, width, height } = prepareCanvas(previewCanvas, PREVIEW_HEIGHT);
  drawPreviewBackground(ctx, width, height);
  if (!state || ratio <= 0.001) return;

  const visual = state.visual;
  CursorSprite.draw(ctx, width * 0.5, height * 0.52, visual.scale * ratio, {
    accent: visual.accent,
    glow: visual.glow,
    opacity: visual.opacity,
    fill: '#ffffff',
    stroke: '#15171c'
  });
}

function playPreview() {
  if (!state) return;
  if (previewRaf) cancelAnimationFrame(previewRaf);
  if (previewLoopTimer) {
    clearTimeout(previewLoopTimer);
    previewLoopTimer = 0;
  }
  previewRaf = 0;
  previewAnimator = new CursorAnimator(state);
  previewAnimator.grow(performance.now());
  previewHoldAt = 0;
  previewRaf = requestAnimationFrame(previewTick);
}

function previewTick(now) {
  previewRaf = 0;
  if (!previewAnimator) return;

  const result = previewAnimator.tick(now);
  lastPreviewRatio = result.ratio;

  if (result.phase === 'hold') {
    if (!previewHoldAt) previewHoldAt = now + 620;
    if (now >= previewHoldAt) previewAnimator.shrink(now);
  }

  drawPreview(result.ratio);

  if (previewAnimator.phase === 'idle' && result.ratio <= 0.001) {
    previewLoopTimer = setTimeout(() => {
      previewLoopTimer = 0;
      playPreview();
    }, 900);
    return;
  }
  previewRaf = requestAnimationFrame(previewTick);
}

/* ------------------------------------------------------------------ bindings */

const RANGE_BINDINGS = [
  [
    'turns',
    'turns-out',
    () => state.trigger.turns,
    (value) => {
      state.trigger.turns = Math.round(value);
    },
    (value) => `${Math.round(value)} 次`
  ],
  [
    'window',
    'window-out',
    () => state.trigger.windowMs,
    (value) => {
      state.trigger.windowMs = Math.round(value);
    },
    (value) => `${Math.round(value)} ms`
  ],
  [
    'speed',
    'speed-out',
    () => state.trigger.minSpeed,
    (value) => {
      state.trigger.minSpeed = Math.round(value);
    },
    (value) => `${Math.round(value)} px/s`
  ],
  [
    'idle',
    'idle-out',
    () => state.trigger.idleMs,
    (value) => {
      state.trigger.idleMs = Math.round(value);
    },
    (value) => `${Math.round(value)} ms`
  ],
  [
    'scale',
    'scale-out',
    () => state.visual.scale,
    (value) => {
      state.visual.scale = round(value, 2);
    },
    (value) => `${value.toFixed(1)}×`
  ],
  [
    'glow',
    'glow-out',
    () => state.visual.glow,
    (value) => {
      state.visual.glow = round(value, 2);
    },
    (value) => `${Math.round(value * 100)}%`
  ],
  [
    'opacity',
    'opacity-out',
    () => state.visual.opacity,
    (value) => {
      state.visual.opacity = round(value, 2);
    },
    (value) => `${Math.round(value * 100)}%`
  ]
];

function bindStaticControls() {
  for (const [inputId, outputId, , set, format] of RANGE_BINDINGS) {
    const input = document.getElementById(inputId);
    const output = document.getElementById(outputId);
    input.addEventListener('input', () => {
      const value = Number(input.value);
      set(value);
      output.textContent = format(value);
      touch();
    });
  }

  const accent = document.getElementById('accent');
  accent.addEventListener('input', () => {
    state.visual.accent = accent.value;
    for (const card of cards) card.render();
    touch();
  });

  document.getElementById('enabled').addEventListener('change', (event) => {
    state.enabled = event.target.checked;
    touch();
  });

  document.getElementById('autoStart').addEventListener('change', (event) => {
    state.autoStart = event.target.checked;
    touch();
  });

  document.getElementById('reset').addEventListener('click', async () => {
    state = await api.resetConfig();
    syncControls();
    schedulePreview();
  });

  document.getElementById('play').addEventListener('click', () => playPreview());
}

function syncControls() {
  document.getElementById('enabled').checked = Boolean(state.enabled);
  document.getElementById('autoStart').checked = Boolean(state.autoStart);

  for (const [inputId, outputId, get, , format] of RANGE_BINDINGS) {
    const input = document.getElementById(inputId);
    const output = document.getElementById(outputId);
    const value = get();
    input.value = String(value);
    output.textContent = format(value);
  }

  document.getElementById('accent').value = state.visual.accent;

  for (const card of cards) card.render();
}

/* ------------------------------------------------------------------ plumbing */

function touch() {
  schedulePreview();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = 0;
    api.updateConfig(state);
  }, 120);
}

function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = 0;
  }
  api.updateConfig(state);
}

function schedulePreview() {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewTimer = 0;
    playPreview();
  }, 220);
}

function handleResize() {
  for (const card of cards) card.render();
  drawPreview(lastPreviewRatio);
}

async function init() {
  state = await api.getConfig();

  cards = [
    buildAnimCard(document.getElementById('grow-card'), 'grow'),
    buildAnimCard(document.getElementById('shrink-card'), 'shrink')
  ];

  bindStaticControls();
  syncControls();

  api.onConfigChanged((config) => {
    if (!state || JSON.stringify(config) === JSON.stringify(state)) return;
    state = config;
    syncControls();
    schedulePreview();
  });

  window.addEventListener('resize', handleResize);
  requestAnimationFrame(() => playPreview());
}

init();
