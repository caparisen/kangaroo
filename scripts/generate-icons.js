'use strict';

/*
 * Generates the Kangaroo logo (tray + application icon) without third-party
 * dependencies. The mark is built from simple shapes sampled with 4x4
 * supersampling and written as PNG.
 *
 * Usage: node scripts/generate-icons.js
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SAMPLES = 4;
const DEG = Math.PI / 180;

// Kangaroo silhouette in a 256 x 256 design box, facing right.
const SHAPES = {
  ellipses: [
    { cx: 152, cy: 120, rx: 38, ry: 46, rot: -6 * DEG }, // torso
    { cx: 144, cy: 150, rx: 36, ry: 34, rot: 0 }, // haunch
    { cx: 172, cy: 90, rx: 22, ry: 28, rot: -25 * DEG }, // neck
    { cx: 191, cy: 62, rx: 21, ry: 16, rot: 20 * DEG }, // head
    { cx: 212, cy: 71, rx: 16, ry: 10, rot: 22 * DEG }, // snout
    { cx: 176, cy: 196, rx: 32, ry: 11, rot: -6 * DEG }, // foot
    { cx: 158, cy: 181, rx: 13, ry: 24, rot: 8 * DEG } // shin
  ],
  polygons: [
    // ear
    [
      [179, 52],
      [181, 27],
      [188, 17],
      [196, 30],
      [198, 49]
    ],
    // tail
    [
      [132, 134],
      [112, 144],
      [90, 158],
      [70, 172],
      [52, 185],
      [36, 197],
      [26, 205],
      [22, 214],
      [32, 218],
      [46, 215],
      [64, 207],
      [84, 196],
      [104, 182],
      [122, 168],
      [140, 156]
    ]
  ]
};

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuffer, data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), out.length - 4);
  return out;
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function insideEllipse(x, y, shape, grow) {
  const cos = Math.cos(-shape.rot);
  const sin = Math.sin(-shape.rot);
  const dx = x - shape.cx;
  const dy = y - shape.cy;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  const rx = shape.rx + grow;
  const ry = shape.ry + grow;
  return (localX * localX) / (rx * rx) + (localY * localY) / (ry * ry) <= 1;
}

function insidePolygon(x, y, polygon, grow) {
  let cx = 0;
  let cy = 0;
  for (const [px, py] of polygon) {
    cx += px;
    cy += py;
  }
  cx /= polygon.length;
  cy /= polygon.length;

  const points = polygon.map(([px, py]) => {
    const dx = px - cx;
    const dy = py - cy;
    const length = Math.hypot(dx, dy) || 1;
    return [px + (dx / length) * grow, py + (dy / length) * grow];
  });

  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function insideKangaroo(x, y, grow) {
  for (const shape of SHAPES.ellipses) {
    if (insideEllipse(x, y, shape, grow)) return true;
  }
  for (const polygon of SHAPES.polygons) {
    if (insidePolygon(x, y, polygon, grow)) return true;
  }
  return false;
}

function insideRoundedRect(x, y, size, radius, inset) {
  const left = inset;
  const top = inset;
  const right = size - inset;
  const bottom = size - inset;
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = Math.max(left + radius, Math.min(right - radius, x));
  const cy = Math.max(top + radius, Math.min(bottom - radius, y));
  return Math.hypot(x - cx, y - cy) <= radius;
}

/**
 * Renders a 256-unit kangaroo mark.
 * @param {object} options
 * @param {number} options.size output size in pixels
 * @param {number} options.markScale fraction of the box used by the mark
 * @param {string|null} options.background rounded square colour
 * @param {string} options.fill
 * @param {string|null} options.outline
 * @param {number} options.outlineWidth in output pixels
 */
function render(options) {
  const { size, markScale, background, fill, shadow } = options;
  const scale = (size / 256) * markScale;
  const markSize = 256 * scale;
  const offsetX = (size - markSize) / 2;
  const offsetY = (size - markSize) / 2;

  const bg = background ? parseColor(background) : null;
  const fillColor = parseColor(fill);
  const shadowColor = shadow ? parseColor(shadow.color) : null;
  const shadowDx = shadow ? shadow.dx : 0;
  const shadowDy = shadow ? shadow.dy : 0;
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let bgCoverage = 0;
      let fillCoverage = 0;
      let shadowCoverage = 0;

      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const px = x + (sx + 0.5) / SAMPLES;
          const py = y + (sy + 0.5) / SAMPLES;

          if (bg && insideRoundedRect(px, py, size, size * 0.22, size * 0.03)) {
            bgCoverage += 1;
          }

          const mx = (px - offsetX) / scale;
          const my = (py - offsetY) / scale;
          if (insideKangaroo(mx, my, 0)) fillCoverage += 1;

          if (shadowColor) {
            const sx2 = (px - shadowDx - offsetX) / scale;
            const sy2 = (py - shadowDy - offsetY) / scale;
            if (insideKangaroo(sx2, sy2, 0)) shadowCoverage += 1;
          }
        }
      }

      const total = SAMPLES * SAMPLES;
      bgCoverage /= total;
      fillCoverage /= total;
      shadowCoverage /= total;

      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      const over = (color, coverage) => {
        if (coverage <= 0) return;
        red = color[0] * coverage + red * (1 - coverage);
        green = color[1] * coverage + green * (1 - coverage);
        blue = color[2] * coverage + blue * (1 - coverage);
        alpha = coverage + alpha * (1 - coverage);
      };

      if (bg) over(bg, bgCoverage);
      if (shadowColor) over(shadowColor, shadowCoverage);
      over(fillColor, fillCoverage);

      const offset = (y * size + x) * 4;
      if (alpha <= 0) {
        rgba[offset + 3] = 0;
        continue;
      }
      rgba[offset] = Math.min(255, Math.round(red / alpha));
      rgba[offset + 1] = Math.min(255, Math.round(green / alpha));
      rgba[offset + 2] = Math.min(255, Math.round(blue / alpha));
      rgba[offset + 3] = Math.round(alpha * 255);
    }
  }

  return encodePng(size, size, rgba);
}

function parseColor(color) {
  const value = color.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ];
}

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(
  path.join(outDir, 'tray.png'),
  render({
    size: 32,
    markScale: 0.96,
    background: null,
    fill: '#ffffff',
    shadow: { color: '#0b0f16', dx: 0.9, dy: 0.9 }
  })
);

fs.writeFileSync(
  path.join(outDir, 'icon.png'),
  render({
    size: 256,
    markScale: 0.84,
    background: '#161c26',
    fill: '#ffffff',
    shadow: null
  })
);

console.log('icons written to', outDir);
