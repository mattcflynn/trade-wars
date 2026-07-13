// Trade Wars — art.js
// FTL-ish cockpit look: hull greys, dark display panels, terminal green,
// caution amber, scanner cyan, alert red. Everything drawn in code.
// (Structure shared with betrayers/js/art.js; loads AFTER tw-core.js.)
(function () {
  'use strict';
  var TW = window.TW;
  var P = {
    ink:      '#0a0e12',
    panel:    '#101820',
    panelLo:  '#182430',
    hullDark: '#232a33',
    hull:     '#3a4450',
    hullHi:   '#5c6b7a',
    grey:     '#9aa5b0',
    white:    '#e8ecf0',
    green:    '#5df08c',
    greenDim: '#2a7a4a',
    amber:    '#ffb347',
    amberDim: '#8a5a1e',
    cyan:     '#63d6e0',
    cyanDim:  '#2a5f66',
    red:      '#e84545',
    redDim:   '#6e1f1f',
    gold:     '#ffd75e'
  };
  TW.PALETTE = P;

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  TW.makeCanvas = makeCanvas;

  TW.fromGrid = function (rows, pal) {
    var h = rows.length, w = 0, i;
    for (i = 0; i < h; i++) w = Math.max(w, rows[i].length);
    var c = makeCanvas(w, h), ctx = c.getContext('2d');
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < rows[y].length; x++) {
        var col = pal[rows[y][x]];
        if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
      }
    }
    return c;
  };

  TW.fromPixels = function (data) {
    var px = data.px || data;
    var h = px.length, w = 0, x, y;
    for (y = 0; y < h; y++) w = Math.max(w, px[y].length);
    var c = makeCanvas(w, h), ctx = c.getContext('2d');
    for (y = 0; y < h; y++) {
      for (x = 0; x < px[y].length; x++) {
        if (px[y][x]) { ctx.fillStyle = px[y][x]; ctx.fillRect(x, y, 1, 1); }
      }
    }
    return c;
  };

  // ---------- display panel: dark screen w/ bevel edge + optional title tab ----
  TW.panel = function (ctx, x, y, w, h, opts) {
    opts = opts || {};
    ctx.fillStyle = opts.fill || P.panel;
    ctx.fillRect(x, y, w, h);
    // bevel: light top/left, dark bottom/right (inset screen look)
    ctx.fillStyle = opts.border || P.hull;
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
    ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
    ctx.fillStyle = P.ink;
    ctx.fillRect(x + 1, y + h - 2, w - 2, 1); ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
    if (opts.title) {
      ctx.fillStyle = opts.border || P.hull;
      ctx.fillRect(x, y, Math.min(w, opts.title.length * 8 + 10), 11);
      TW.text(ctx, opts.title, x + 5, y + 9, 8, opts.titleColor || P.ink);
    }
  };

  // dithered checker fill (classic 1-bit texture)
  TW.dither = function (ctx, x, y, w, h, color, step) {
    step = step || 2;
    ctx.fillStyle = color;
    for (var yy = 0; yy < h; yy += step) {
      for (var xx = (yy / step) % 2 === 0 ? 0 : step; xx < w; xx += step * 2) {
        ctx.fillRect(x + xx, y + yy, 1, 1);
      }
    }
  };

  // ---------- segmented gauge bar (FTL-style blocks) ----------
  TW.gauge = function (ctx, x, y, w, h, frac, color, trough) {
    ctx.fillStyle = trough || P.panelLo;
    ctx.fillRect(x, y, w, h);
    frac = Math.max(0, Math.min(1, frac));
    var seg = 5, gap = 1, n = Math.floor(w / seg);
    var lit = Math.round(frac * n);
    ctx.fillStyle = color;
    for (var i = 0; i < lit; i++) ctx.fillRect(x + i * seg, y, seg - gap, h);
  };

  // ---------- starfield: deterministic per seed, slow parallax drift ----------
  TW.starfield = function (ctx, x, y, w, h, seed, t) {
    var layers = [
      { n: 40, speed: 0.02, color: P.hull },
      { n: 26, speed: 0.05, color: P.grey },
      { n: 12, speed: 0.10, color: P.white }
    ];
    for (var L = 0; L < layers.length; L++) {
      var lay = layers[L];
      var r = TW.rng(seed + ':sf' + L);
      ctx.fillStyle = lay.color;
      for (var i = 0; i < lay.n; i++) {
        var sx = r() * w, sy = r() * h;
        var px = (sx + t * lay.speed) % w;
        ctx.fillRect(x + Math.floor(px), y + Math.floor(sy), 1, 1);
      }
    }
  };

  // ---------- star disc with dithered corona + flicker ----------
  TW.STAR_RADIUS = { O: 26, B: 22, A: 18, F: 15, G: 13, K: 11, M: 8, D: 5 };
  TW.starDisc = function (ctx, cx, cy, spect, t) {
    var cls = (spect && spect[0]) ? spect[0].toUpperCase() : 'G';
    var rad = TW.STAR_RADIUS[cls] || 13;
    var col = TW.spectralColor(spect);
    var flick = ((t >> 3) % 2 === 0) ? 1 : 0;
    // corona (dither ring)
    TW.dither(ctx, cx - rad - 4, cy - rad - 4, (rad + 4) * 2, (rad + 4) * 2, col, 3);
    ctx.fillStyle = P.ink ? P.panel : '#000';
    // core disc
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(cx, cy, rad + flick * 0.5, 0, Math.PI * 2);
    ctx.fill();
    // hot center
    ctx.fillStyle = P.white;
    ctx.beginPath();
    ctx.arc(cx - rad * 0.25, cy - rad * 0.25, Math.max(1, rad * 0.35), 0, Math.PI * 2);
    ctx.fill();
  };

  // ---------- icons (8x8, Sprite-Studio editable via registry) ----------
  var IC = {
    fuel: [
      '..cccc..',
      '.c....c.',
      'c..gg..c',
      'c.gggg.c',
      'c.gggg.c',
      'c..gg..c',
      '.c....c.',
      '..cccc..'
    ],
    shield: [
      '.cccccc.',
      'c......c',
      'c.cccc.c',
      'c.c..c.c',
      'c.cccc.c',
      'c......c',
      '.c....c.',
      '..cccc..'
    ],
    fighter: [
      '...r....',
      '..rrr...',
      '.rrrrr..',
      'rr.r.rr.',
      '...r....',
      '..rrr...',
      '.r...r..',
      '........'
    ],
    credit: [
      '..gggg..',
      '.g....g.',
      'g..gg..g',
      'g.g.....',
      'g.g.....',
      'g..gg..g',
      '.g....g.',
      '..gggg..'
    ],
    ore: [
      '...aa...',
      '..aaaa..',
      '.aaaaaa.',
      'aaaaaaaa',
      'aa.aa.aa',
      '.aaaaaa.',
      '..aaaa..',
      '........'
    ],
    organics: [
      '...gg...',
      '..gggg..',
      '.g.gg.g.',
      '...gg...',
      '..ggg...',
      '.ggggg..',
      '..ggg...',
      '...g....'
    ],
    equipment: [
      '.ww..ww.',
      'w..ww..w',
      'w..ww..w',
      '.ww..ww.',
      '.ww..ww.',
      'w..ww..w',
      'w..ww..w',
      '.ww..ww.'
    ]
  };
  var ICON_PAL = { c: P.cyan, g: P.green, r: P.red, a: P.amber, w: P.grey, '.': null };
  // gold for credit icon
  var CREDIT_PAL = { g: P.gold, '.': null };

  TW.ICON_GRIDS = IC;
  TW.ICONS = {};
  Object.keys(IC).forEach(function (k) {
    TW.ICONS[k] = TW.fromGrid(IC[k], k === 'credit' ? CREDIT_PAL : ICON_PAL);
  });

  // ---------- text helpers ----------
  TW.FONT = '"Press Start 2P"';
  TW.text = function (ctx, str, x, y, size, color, align) {
    ctx.font = (size || 8) + 'px ' + TW.FONT;
    ctx.fillStyle = color || P.white;
    ctx.textAlign = align || 'left';
    ctx.fillText(str, x, y);
    ctx.textAlign = 'left';
  };

  TW.wrapText = function (ctx, text, maxWidth, size) {
    ctx.font = (size || 8) + 'px ' + TW.FONT;
    var words = String(text).split(' '), lines = [], line = '';
    for (var i = 0; i < words.length; i++) {
      var t = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(t).width > maxWidth && line) { lines.push(line); line = words[i]; }
      else line = t;
    }
    if (line) lines.push(line);
    return lines;
  };

  // ---------- cockpit hull strut (drawn on view edges for head-turn continuity) --
  // side: -1 = strut on left edge, +1 = strut on right edge
  TW.drawStrut = function (ctx, W, H, side, width) {
    width = width || 24;
    var x0 = side < 0 ? 0 : W - width;
    ctx.fillStyle = P.hullDark;
    ctx.fillRect(x0, 0, width, H);
    ctx.fillStyle = P.hull;
    ctx.fillRect(side < 0 ? 0 : W - width + 4, 0, width - 4, H);
    // angled cut top and bottom
    ctx.fillStyle = P.hullHi;
    ctx.fillRect(side < 0 ? width - 2 : x0, 0, 2, H);
    // rivets
    ctx.fillStyle = P.hullDark;
    var rx = side < 0 ? 8 : W - width + 12;
    for (var y = 14; y < H; y += 28) {
      ctx.fillRect(rx, y, 3, 3);
      ctx.fillStyle = P.hullHi;
      ctx.fillRect(rx, y, 1, 1);
      ctx.fillStyle = P.hullDark;
    }
  };
})();
