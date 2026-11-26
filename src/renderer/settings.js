'use strict';

const api = window.kangaroo;
const t = (key, vars) => I18n.t(state ? state.language : 'en', key, vars);

const SPEED_PRESETS = [
  { id: 'linear', bezier: [0, 0, 1, 1] },
  { id: 'smooth', bezier: [0.25, 0.3, 0.6, 1] },
  { id: 'fast', bezier: [0.12, 0.55, 0.45, 1] },
  { id: 'late', bezier: [0.55, 0.05, 0.75, 1] }
];

const PALETTE = ['#4da3ff', '#ffffff', '#ffd166', '#ff6b6b', '#7bd88f', '#c792ea', '#ff9f43'];

const PREVIEW_HEIGHT = 232;
const POINTER_HEIGHT = 300;

const ARROW_W = 13;
const ARROW_H = 19.6;
const ARROW_DIAG = Math.hypot(ARROW_W, ARROW_H);
const GLOW_CENTER = { x: 5.2, y: 9.2 };

let state = null;
let cards = [];
let saveTimer = 0;
let previewTimer = 0;
let previewAnimator = null;
let previewRaf = 0;
let previewHoldAt = 0;
let lastPreviewRatio = 0;

let lastSpeedSample = null;

let pointerGeometry = null;
let pointerDrag = null;

const previewCanvas = document.getElementById('preview');
const pointerCanvas = document.getElementById('pointer');
const speedCanvas = document.getElementById('speed-curve');
const speedLive = document.getElementById('speed-live');
const minSpeedInput = document.getElementById('min-speed');
const maxSpeedInput = document.getElementById('max-speed');
const minSpeedOutput = document.getElementById('min-speed-out');
const maxSpeedOutput = document.getElementById('max-speed-out');
const speedPresetSelect = document.getElementById('speed-preset');
const speedCurveValue = document.getElementById('speed-curve-value');
const pointerMeta = document.getElementById('pointer-meta');
const swatchBar = document.getElementById('swatches');
const opacityInput = document.getElementById('opacity');
const opacityOutput = document.getElementById('opacity-out');

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
  const pad = { left: 26, right: 18, top: 16, bottom: 20 };
  return {
    x: pad.left,
    y: pad.top,
    w: Math.max(20, width - pad.left - pad.right),
    h: Math.max(20, height - pad.top - pad.bottom)
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

/* ------------------------------------------------------------- curve editor */

function drawCurve(canvas, bezier) {
  const { ctx, width, height } = prepareCanvas(canvas, 200);
  const plot = plotRect(width, height);
  const accent = state.visual.accent;
  const yMin = -0.5;
  const yMax = 1.6;
  const toX = (p) => plot.x + p * plot.w;
  const toY = (v) => curveY(v, plot, yMin, yMax);

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
  for (let i = 0; i <= 180; i += 1) {
    const p = i / 180;
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
    { x: plot.x + bezier[0] * plot.w, y: curveY(bezier[1], plot, -0.5, 1.6) },
    { x: plot.x + bezier[2] * plot.w, y: curveY(bezier[3], plot, -0.5, 1.6) }
  ];
}

function drawSpring(canvas, spring) {
  const { ctx, width, height } = prepareCanvas(canvas, 152);
  const plot = plotRect(width, height);
  const accent = state.visual.accent;
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

/* --------------------------------------------------------------- animation */

function formatSpring(name, value) {
  if (name === 'mass') return value.toFixed(1);
  return String(Math.round(value));
}

function presetLabel(id) {
  return t(`preset_${String(id).replace(/-/g, '')}`);
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
    option.dataset.preset = preset.id;
    option.textContent = presetLabel(preset.id);
    elements.preset.appendChild(option);
  }
  const custom = document.createElement('option');
  custom.value = 'custom';
  custom.textContent = t('custom');
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

  function localize() {
    custom.textContent = t('custom');
    for (const option of elements.preset.querySelectorAll('option[data-preset]')) {
      option.textContent = presetLabel(option.dataset.preset);
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
    const v = 1.6 - ((event.clientY - rect.top - plot.y) / plot.h) * 2.1;
    anim.bezier[dragIndex * 2] = round(clamp(p, 0, 1));
    anim.bezier[dragIndex * 2 + 1] = round(clamp(v, -0.5, 1.6));
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

  return { render, localize };
}

/* ---------------------------------------------------------------- pointer */

function glowRingRadius(scale, glow) {
  return (14 + 18 * glow) * scale;
}

function drawHandle(ctx, x, y, label, accent) {
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#0d1014';
  ctx.stroke();

  ctx.font = '11px "Segoe UI", "Microsoft YaHei UI", sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 12, y);
}

function drawPointer() {
  const { ctx, width, height } = prepareCanvas(pointerCanvas, POINTER_HEIGHT);
  if (!state) return;

  const scale = state.visual.scale;
  const accent = state.visual.accent;
  const hx = width * 0.34;
  const hy = height * 0.22;
  const glowCenter = { x: hx + GLOW_CENTER.x * scale, y: hy + GLOW_CENTER.y * scale };
  const ring = glowRingRadius(scale, state.visual.glow);
  pointerGeometry = { hx, hy, scale, glowCenter, ring };

  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  strokeLine(ctx, hx, hy, hx + ARROW_W * scale, hy);
  strokeLine(ctx, hx + ARROW_W * scale, hy, hx + ARROW_W * scale, hy + ARROW_H * scale);
  strokeLine(ctx, hx + ARROW_W * scale, hy + ARROW_H * scale, hx, hy + ARROW_H * scale);
  strokeLine(ctx, hx, hy + ARROW_H * scale, hx, hy);
  ctx.setLineDash([]);

  CursorSprite.draw(ctx, hx, hy, scale, {
    accent,
    glow: state.visual.glow,
    opacity: state.visual.opacity,
    fill: '#ffffff',
    stroke: '#15171c'
  });

  ctx.beginPath();
  ctx.arc(glowCenter.x, glowCenter.y, ring, 0, Math.PI * 2);
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = clipAlpha(accent, 0.35);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);

  drawHandle(ctx, hx + ARROW_W * scale, hy + ARROW_H * scale, t('pointerSize'), accent);
  drawHandle(ctx, glowCenter.x + ring, glowCenter.y, t('pointerGlow'), accent);
}

function syncPointerMeta() {
  if (!state) return;
  pointerMeta.textContent = t('pointerMeta', {
    size: state.visual.scale.toFixed(1),
    glow: Math.round(state.visual.glow * 100)
  });
  updateSpeedLive();
}

function syncOpacity() {
  if (!state) return;
  opacityInput.value = String(state.visual.opacity);
  opacityOutput.textContent = `${Math.round(state.visual.opacity * 100)}%`;
}

function localPoint(event) {
  const rect = pointerCanvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function handlePositions() {
  if (!pointerGeometry) return null;
  const { hx, hy, scale, glowCenter, ring } = pointerGeometry;
  return {
    size: { x: hx + ARROW_W * scale, y: hy + ARROW_H * scale },
    glow: { x: glowCenter.x + ring, y: glowCenter.y }
  };
}

function bindPointer() {
  pointerCanvas.addEventListener('pointerdown', (event) => {
    const positions = handlePositions();
    if (!positions) return;
    const point = localPoint(event);
    const sizeDistance = Math.hypot(point.x - positions.size.x, point.y - positions.size.y);
    const glowDistance = Math.hypot(point.x - positions.glow.x, point.y - positions.glow.y);

    if (Math.min(sizeDistance, glowDistance) > 22) return;
    pointerDrag = {
      mode: sizeDistance <= glowDistance ? 'size' : 'glow',
      pointerId: event.pointerId
    };
    pointerCanvas.setPointerCapture(event.pointerId);
    pointerCanvas.style.cursor = 'grabbing';
    event.preventDefault();
  });

  pointerCanvas.addEventListener('pointermove', (event) => {
    const point = localPoint(event);

    if (!pointerDrag) {
      const positions = handlePositions();
      if (!positions) return;
      const sizeDistance = Math.hypot(point.x - positions.size.x, point.y - positions.size.y);
      const glowDistance = Math.hypot(point.x - positions.glow.x, point.y - positions.glow.y);
      pointerCanvas.style.cursor = Math.min(sizeDistance, glowDistance) <= 22 ? 'grab' : 'default';
      return;
    }

    if (event.pointerId !== pointerDrag.pointerId || !pointerGeometry) return;
    const { hx, hy, scale, glowCenter } = pointerGeometry;

    if (pointerDrag.mode === 'size') {
      const distance = Math.hypot(point.x - hx, point.y - hy);
      state.visual.scale = round(clamp(distance / ARROW_DIAG, 1.2, 6), 2);
    } else {
      const distance = Math.hypot(point.x - glowCenter.x, point.y - glowCenter.y);
      state.visual.glow = round(clamp((distance / scale - 14) / 18, 0, 1), 2);
    }

    syncPointerMeta();
    drawPointer();
    drawSpeedCurve();
    drawPreview(lastPreviewRatio);
    touch();
  });

  function endDrag(event) {
    if (!pointerDrag) return;
    if (event && event.pointerId !== pointerDrag.pointerId) return;
    pointerDrag = null;
    pointerCanvas.style.cursor = 'default';
    flushSave();
  }

  pointerCanvas.addEventListener('pointerup', endDrag);
  pointerCanvas.addEventListener('pointercancel', endDrag);
}

/* ------------------------------------------------------------------ speed */

function speedControlPixels(bezier, plot) {
  return [
    { x: plot.x + bezier[0] * plot.w, y: curveY(bezier[1], plot, 0, 1) },
    { x: plot.x + bezier[2] * plot.w, y: curveY(bezier[3], plot, 0, 1) }
  ];
}

function drawSpeedCurve() {
  if (!state) return;
  const { ctx, width, height } = prepareCanvas(speedCanvas, 200);
  const plot = plotRect(width, height);
  const { min, max, curve } = state.speed;
  const accent = state.visual.accent;
  const toX = (value) => plot.x + value * plot.w;
  const toY = (value) => curveY(value, plot, 0, 1);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.055)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    strokeLine(ctx, toX(i / 4), plot.y, toX(i / 4), plot.y + plot.h);
    strokeLine(ctx, plot.x, toY(i / 4), plot.x + plot.w, toY(i / 4));
  }

  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  strokeLine(ctx, toX(0), toY(0), toX(1), toY(1));
  ctx.setLineDash([]);

  const ease = Curves.cubicBezier(curve[0], curve[1], curve[2], curve[3]);
  ctx.beginPath();
  for (let i = 0; i <= 180; i += 1) {
    const p = i / 180;
    const x = toX(p);
    const y = toY(ease(p));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  const handles = speedControlPixels(curve, plot);
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

  ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
  ctx.font = '10px "Segoe UI", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillText('1×', plot.x - 8, toY(0));
  ctx.fillText(`${state.visual.scale.toFixed(1)}×`, plot.x - 8, toY(1));
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(`${min} px/s`, plot.x, plot.y + plot.h + 6);
  ctx.textAlign = 'right';
  ctx.fillText(`${max} px/s`, plot.x + plot.w, plot.y + plot.h + 6);
}

function findSpeedPreset(bezier) {
  return (
    SPEED_PRESETS.find((preset) =>
      preset.bezier.every((value, index) => Math.abs(value - bezier[index]) < 0.005)
    ) || null
  );
}

function buildSpeedPresets() {
  for (const preset of SPEED_PRESETS) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.dataset.preset = preset.id;
    option.textContent = t(`speedPreset_${preset.id}`);
    speedPresetSelect.appendChild(option);
  }
  const custom = document.createElement('option');
  custom.value = 'custom';
  custom.textContent = t('custom');
  custom.disabled = true;
  speedPresetSelect.appendChild(custom);
}

function syncSpeedPreset() {
  const preset = findSpeedPreset(state.speed.curve);
  speedPresetSelect.value = preset ? preset.id : 'custom';
}

function updateSpeedLive() {
  if (!state) return;
  const sample = lastSpeedSample;
  const speed = sample ? Math.round(sample.speed) : 0;
  const strength = sample ? clamp(sample.strength, 0, 1) : 0;
  const zoom = 1 + (state.visual.scale - 1) * strength;
  speedLive.textContent = t('speedLive', { speed, scale: zoom.toFixed(2) });
}

function syncSpeed() {
  minSpeedInput.value = String(state.speed.min);
  maxSpeedInput.value = String(state.speed.max);
  minSpeedOutput.textContent = `${state.speed.min} px/s`;
  maxSpeedOutput.textContent = `${state.speed.max} px/s`;
  speedCurveValue.textContent = `cubic-bezier(${state.speed.curve
    .map((value) => value.toFixed(2))
    .join(', ')})`;
  syncSpeedPreset();
  drawSpeedCurve();
  updateSpeedLive();
}

function bindSpeed() {
  buildSpeedPresets();

  minSpeedInput.addEventListener('input', () => {
    const value = Number(minSpeedInput.value);
    state.speed.min = value;
    if (state.speed.max < value + 100) state.speed.max = Math.min(12000, value + 100);
    syncSpeed();
    touch();
  });

  maxSpeedInput.addEventListener('input', () => {
    state.speed.max = Math.max(state.speed.min + 100, Number(maxSpeedInput.value));
    syncSpeed();
    touch();
  });

  speedPresetSelect.addEventListener('change', () => {
    const preset = SPEED_PRESETS.find((item) => item.id === speedPresetSelect.value);
    if (!preset) return;
    state.speed.curve = preset.bezier.slice();
    syncSpeed();
    touch();
  });

  let dragIndex = -1;
  let dragPointer = -1;

  speedCanvas.addEventListener('pointerdown', (event) => {
    const rect = speedCanvas.getBoundingClientRect();
    const plot = plotRect(rect.width, rect.height);
    const handles = speedControlPixels(state.speed.curve, plot);
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const first = Math.hypot(x - handles[0].x, y - handles[0].y);
    const second = Math.hypot(x - handles[1].x, y - handles[1].y);
    const index = first <= second ? 0 : 1;
    if (Math.min(first, second) > 26) return;

    dragIndex = index;
    dragPointer = event.pointerId;
    speedCanvas.setPointerCapture(event.pointerId);
    speedCanvas.style.cursor = 'grabbing';
    event.preventDefault();
  });

  speedCanvas.addEventListener('pointermove', (event) => {
    if (dragIndex < 0 || event.pointerId !== dragPointer) return;
    const rect = speedCanvas.getBoundingClientRect();
    const plot = plotRect(rect.width, rect.height);
    const p = (event.clientX - rect.left - plot.x) / plot.w;
    const v = 1 - (event.clientY - rect.top - plot.y) / plot.h;
    state.speed.curve[dragIndex * 2] = round(clamp(p, 0, 1));
    state.speed.curve[dragIndex * 2 + 1] = round(clamp(v, 0, 1));
    syncSpeed();
    touch();
  });

  function endDrag(event) {
    if (dragIndex < 0) return;
    if (event && event.pointerId !== dragPointer) return;
    dragIndex = -1;
    dragPointer = -1;
    speedCanvas.style.cursor = 'crosshair';
    flushSave();
  }

  speedCanvas.addEventListener('pointerup', endDrag);
  speedCanvas.addEventListener('pointercancel', endDrag);
}

api.onSpeedSample((sample) => {
  lastSpeedSample = sample;
  updateSpeedLive();
});

/* ---------------------------------------------------------------- preview */

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
  if (!state) return;

  const visual = state.visual;
  const scale = 1 + (visual.scale - 1) * clamp(ratio, 0, 1.25);
  CursorSprite.draw(ctx, width * 0.5, height * 0.52, scale, {
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
    playPreview();
    return;
  }
  previewRaf = requestAnimationFrame(previewTick);
}

/* --------------------------------------------------------------- language */

function updateLanguageButtons() {
  for (const button of document.querySelectorAll('[data-lang]')) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === state.language));
  }
}

function applyLanguage() {
  document.documentElement.lang = state.language === 'zh' ? 'zh-CN' : 'en';
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const card of cards) card.localize();
  localizeSpeed();
  updateLanguageButtons();
  syncPointerMeta();
  drawPointer();
  drawSpeedCurve();
  drawPreview(lastPreviewRatio);
}

function localizeSpeed() {
  for (const option of speedPresetSelect.querySelectorAll('option[data-preset]')) {
    option.textContent = t(`speedPreset_${option.dataset.preset}`);
  }
  const custom = speedPresetSelect.querySelector('option[value="custom"]');
  if (custom) custom.textContent = t('custom');
  updateSpeedLive();
}

/* ---------------------------------------------------------------- swatches */

function buildSwatches() {
  swatchBar.textContent = '';
  for (const color of PALETTE) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.dataset.color = color;
    button.style.background = color;
    button.title = color;
    button.addEventListener('click', () => setAccent(color));
    swatchBar.appendChild(button);
  }

  const input = document.createElement('input');
  input.type = 'color';
  input.className = 'swatch-input';
  input.addEventListener('input', () => setAccent(input.value));
  swatchBar.appendChild(input);
}

function syncSwatches() {
  for (const button of swatchBar.querySelectorAll('.swatch')) {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.color.toLowerCase() === state.visual.accent.toLowerCase())
    );
  }
  const input = swatchBar.querySelector('.swatch-input');
  if (input) input.value = state.visual.accent;
}

function setAccent(color) {
  state.visual.accent = color.toLowerCase();
  syncSwatches();
  drawPointer();
  drawSpeedCurve();
  drawPreview(lastPreviewRatio);
  touch();
}

/* --------------------------------------------------------------- bindings */

function bindStaticControls() {
  for (const button of document.querySelectorAll('[data-lang]')) {
    button.addEventListener('click', () => {
      if (state.language === button.dataset.lang) return;
      state.language = button.dataset.lang;
      applyLanguage();
      touch();
    });
  }

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
    applyLanguage();
    schedulePreview();
  });

  document.getElementById('play').addEventListener('click', () => playPreview());

  opacityInput.addEventListener('input', () => {
    state.visual.opacity = round(Number(opacityInput.value), 2);
    opacityOutput.textContent = `${Math.round(state.visual.opacity * 100)}%`;
    drawPointer();
    drawPreview(lastPreviewRatio);
    touch();
  });

  buildSwatches();
  bindPointer();
  bindSpeed();
}

function syncControls() {
  document.getElementById('enabled').checked = Boolean(state.enabled);
  document.getElementById('autoStart').checked = Boolean(state.autoStart);
  syncSpeed();
  syncSwatches();
  syncOpacity();
  for (const card of cards) card.render();
  syncPointerMeta();
  drawPointer();
  drawPreview(lastPreviewRatio);
}

/* --------------------------------------------------------------- plumbing */

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
  drawPointer();
  drawSpeedCurve();
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
  applyLanguage();

  api.onConfigChanged((config) => {
    if (!state || JSON.stringify(config) === JSON.stringify(state)) return;
    const languageChanged = config.language !== state.language;
    state = config;
    syncControls();
    if (languageChanged) applyLanguage();
  });

  window.addEventListener('resize', handleResize);
  requestAnimationFrame(() => playPreview());
}

init();
