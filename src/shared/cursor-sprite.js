/*
 * Draws the enlarged pointer used by the settings previews.
 * The outline keeps a constant width so enlarging the pointer does not make
 * the stroke thicker. Coordinates are CSS pixels; (x, y) is the arrow tip.
 */
(function (root) {
  'use strict';

  const ARROW = [
    [0, 0],
    [0, 17.2],
    [4.3, 13.2],
    [7.0, 19.6],
    [10.1, 18.3],
    [7.4, 12.0],
    [13.0, 12.0]
  ];

  function hexToRgb(hex) {
    let value = String(hex || '').trim().replace('#', '');
    if (value.length === 3) value = value.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(value)) value = '4da3ff';
    const int = parseInt(value, 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  }

  function rgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
  }

  function draw(ctx, x, y, scale, options) {
    const opts = options || {};
    const fill = opts.fill || '#ffffff';
    const stroke = opts.stroke || '#14161a';
    const accent = opts.accent || '#4da3ff';
    const glow = opts.glow === undefined ? 0.6 : opts.glow;
    const opacity = opts.opacity === undefined ? 1 : opts.opacity;
    const strokeWidth = opts.strokeWidth === undefined ? 1.6 : opts.strokeWidth;
    const s = Math.max(0.01, scale);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(x, y);

    if (glow > 0.001) {
      const centerX = 5.2 * s;
      const centerY = 9.2 * s;
      const radius = 27 * s;
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
      gradient.addColorStop(0, rgba(accent, 0.42 * glow));
      gradient.addColorStop(0.45, rgba(accent, 0.16 * glow));
      gradient.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.moveTo(ARROW[0][0] * s, ARROW[0][1] * s);
    for (let i = 1; i < ARROW.length; i += 1) {
      ctx.lineTo(ARROW[i][0] * s, ARROW[i][1] * s);
    }
    ctx.closePath();

    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1.6;
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();

    ctx.restore();
  }

  root.CursorSprite = { draw, ARROW };
})(typeof window !== 'undefined' ? window : globalThis);
