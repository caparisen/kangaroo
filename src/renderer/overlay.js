'use strict';

const bridge = window.overlayBridge;

// The pointer is rendered as DOM images instead of a canvas/SVG node: Chromium
// does not composite canvas/SVG layers reliably inside a transparent,
// always-on-top window on Windows. Elements are also rebuilt on every
// activation, because content painted while the window was hidden can stay
// invisible after the window is shown.
const ARROW_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-32 -32 80 88">',
  '<path d="M0 0 L0 17.2 L4.3 13.2 L7 19.6 L10.1 18.3 L7.4 12 L13 12 Z"',
  ' fill="#ffffff" stroke="#15171c" stroke-width="1.6" vector-effect="non-scaling-stroke"',
  ' stroke-linejoin="round" stroke-linecap="round"/>',
  '</svg>'
].join('');

const ARROW_URL = `data:image/svg+xml,${encodeURIComponent(ARROW_SVG)}`;

// Decode the pointer once so the first activation has no blank frame.
const arrowPreload = new Image();
arrowPreload.src = ARROW_URL;

let glow = null;
let arrow = null;

let config = null;
let point = { x: 0, y: 0 };
let strength = 0;
let animator = null;
let rafId = 0;
let shrinking = false;

function rgba(hex, alpha) {
  let value = String(hex || '').replace('#', '');
  if (value.length === 3) value = value.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(value)) value = '4da3ff';
  const int = parseInt(value, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

function applyConfig() {
  if (!glow) return;
  const visual = config.visual;
  glow.style.background = `radial-gradient(circle, ${rgba(visual.accent, 0.42 * visual.glow)} 0%, ${rgba(
    visual.accent,
    0.14 * visual.glow
  )} 45%, ${rgba(visual.accent, 0)} 72%)`;
}

function buildElements() {
  if (glow) glow.remove();
  if (arrow) arrow.remove();
  glow = document.createElement('div');
  glow.id = 'glow';
  arrow = document.createElement('img');
  arrow.id = 'arrow';
  arrow.alt = '';
  arrow.draggable = false;
  arrow.src = ARROW_URL;
  document.body.append(glow, arrow);
}

function place(element, x, y, width, height) {
  element.style.left = `${x.toFixed(2)}px`;
  element.style.top = `${y.toFixed(2)}px`;
  element.style.width = `${width.toFixed(2)}px`;
  element.style.height = `${height.toFixed(2)}px`;
}

function render(ratio) {
  // ratio is the appear/shrink envelope; strength comes from the cursor speed.
  const effective = ratio * strength;
  if (!glow || !arrow || !config || effective <= 0.002) {
    if (glow) glow.style.opacity = '0';
    if (arrow) arrow.style.opacity = '0';
    return;
  }
  const visual = config.visual;
  const scale = 1 + (visual.scale - 1) * effective;
  const fade = Math.min(1, effective * 4);
  const opacity = String(visual.opacity * fade);

  place(arrow, point.x - 32 * scale, point.y - 32 * scale, 80 * scale, 88 * scale);
  place(glow, point.x + (5.2 - 27) * scale, point.y + (9.2 - 27) * scale, 54 * scale, 54 * scale);

  arrow.style.opacity = opacity;
  glow.style.opacity = opacity;
}

function frame(now) {
  rafId = 0;
  const state = animator.tick(now);
  render(state.ratio);

  if (shrinking && state.phase === 'idle') {
    shrinking = false;
    if (glow) glow.style.opacity = '0';
    if (arrow) arrow.style.opacity = '0';
    bridge.finished();
    return;
  }

  rafId = requestAnimationFrame(frame);
}

function startLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(frame);
}

function ensureAnimator() {
  if (animator) {
    animator.setConfig(config);
  } else {
    animator = new CursorAnimator(config);
  }
  return animator;
}

bridge.onShow((payload) => {
  config = payload.config;
  point = { x: payload.x, y: payload.y };
  strength = Number(payload.strength) || 0;
  shrinking = false;
  buildElements();
  applyConfig();
  ensureAnimator().grow(performance.now());
  startLoop();
});

bridge.onMove((payload) => {
  point = { x: payload.x, y: payload.y };
  strength = Number(payload.strength) || 0;
});

bridge.onHide(() => {
  if (!animator || !config) {
    bridge.finished();
    return;
  }
  shrinking = true;
  animator.shrink(performance.now());
  startLoop();
});

bridge.onConfig((next) => {
  config = next;
  applyConfig();
  if (animator) animator.setConfig(config);
});
