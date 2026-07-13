// Trade Wars — sprite-editor.js (Sprite Studio, ported from Betrayers)
// Repaint any ship, station, planet, or icon as a pixel grid. Saves override
// the shipped art via localStorage (TW_customSprites); EXPORT produces
// js/data-sprites.js so custom art can ship with the game.
(function () {
  'use strict';
  var TW = window.TW;
  var ZOOM = 16;

  var key = 'ship.cruiser';
  var px = [];            // px[y][x] = '#rrggbb' or null
  var W = 0, H = 0;
  var color = TW.PALETTE.green;
  var painting = 0;       // 1 paint, 2 erase
  var eyedrop = false;

  var canvas = document.getElementById('sp-canvas');
  var ctx = canvas.getContext('2d');

  // ---------- pixel data <-> canvas ----------
  function canvasToPixels(src) {
    var w = src.width, h = src.height;
    var data = src.getContext('2d').getImageData(0, 0, w, h).data;
    var out = [];
    for (var y = 0; y < h; y++) {
      var row = [];
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        if (data[i + 3] < 40) row.push(null);
        else row.push('#' + hex(data[i]) + hex(data[i + 1]) + hex(data[i + 2]));
      }
      out.push(row);
    }
    return out;
  }
  function hex(n) { return ('0' + n.toString(16)).slice(-2); }

  function loadSprite(k) {
    key = k;
    var src = TW.getSprite(k) || TW.DEFAULT_SPRITES[k];
    px = canvasToPixels(src);
    H = px.length; W = px[0] ? px[0].length : 0;
    document.getElementById('sp-w').value = W;
    document.getElementById('sp-h').value = H;
    sizeCanvas();
    draw();
  }

  function sizeCanvas() {
    canvas.width = W * ZOOM;
    canvas.height = H * ZOOM;
    ctx.imageSmoothingEnabled = false;
  }

  // ---------- drawing ----------
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (px[y][x]) {
          ctx.fillStyle = px[y][x];
          ctx.fillRect(x * ZOOM, y * ZOOM, ZOOM, ZOOM);
        }
      }
    }
    // grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    for (var gx = 0; gx <= W; gx++) { ctx.moveTo(gx * ZOOM + 0.5, 0); ctx.lineTo(gx * ZOOM + 0.5, H * ZOOM); }
    for (var gy = 0; gy <= H; gy++) { ctx.moveTo(0, gy * ZOOM + 0.5); ctx.lineTo(W * ZOOM, gy * ZOOM + 0.5); }
    ctx.stroke();
    drawPreview();
  }

  function drawPreview() {
    var row = document.getElementById('preview-row');
    row.innerHTML = '';
    var sprite = TW.fromPixels(px);
    [1, 2, 3].forEach(function (s) {
      var c = document.createElement('canvas');
      c.width = W * s; c.height = H * s;
      var c2 = c.getContext('2d');
      c2.imageSmoothingEnabled = false;
      c2.drawImage(sprite, 0, 0, W * s, H * s);
      row.appendChild(c);
    });
  }

  // ---------- painting ----------
  function cellFromEvent(ev) {
    var r = canvas.getBoundingClientRect();
    var x = Math.floor((ev.clientX - r.left) / (r.width / W));
    var y = Math.floor((ev.clientY - r.top) / (r.height / H));
    return { x: Math.max(0, Math.min(W - 1, x)), y: Math.max(0, Math.min(H - 1, y)) };
  }

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('mousedown', function (e) {
    var c = cellFromEvent(e);
    if (eyedrop) {
      if (px[c.y][c.x]) setColor(px[c.y][c.x]);
      return;
    }
    painting = e.button === 2 ? 2 : 1;
    px[c.y][c.x] = painting === 2 ? null : color;
    draw();
  });
  window.addEventListener('mouseup', function () { painting = 0; });
  canvas.addEventListener('mousemove', function (e) {
    if (!painting) return;
    var c = cellFromEvent(e);
    px[c.y][c.x] = painting === 2 ? null : color;
    draw();
  });
  window.addEventListener('keydown', function (e) {
    if (e.code === 'KeyI') { eyedrop = true; canvas.style.cursor = 'copy'; }
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'KeyI') { eyedrop = false; canvas.style.cursor = 'crosshair'; }
  });

  // ---------- palette ----------
  function setColor(c) {
    color = c;
    document.querySelectorAll('.sp-palette .col').forEach(function (el) {
      el.classList.toggle('selected', el.dataset.col === c);
    });
    if (c) document.getElementById('sp-picker').value = c;
  }

  function buildPalette() {
    var pal = document.getElementById('sp-palette');
    pal.innerHTML = '';
    // eraser
    var er = document.createElement('div');
    er.className = 'col erase';
    er.title = 'transparent (or right-drag)';
    er.dataset.col = '';
    er.addEventListener('click', function () { setColor(null); er.classList.add('selected'); });
    pal.appendChild(er);
    // game palette colors
    var seen = {};
    Object.keys(TW.PALETTE).forEach(function (ch) {
      var c = TW.PALETTE[ch];
      if (!c || seen[c]) return;
      seen[c] = true;
      var d = document.createElement('div');
      d.className = 'col';
      d.style.background = c;
      d.title = c;
      d.dataset.col = c;
      d.addEventListener('click', function () { setColor(c); });
      pal.appendChild(d);
    });
  }

  document.getElementById('sp-picker').addEventListener('input', function (e) {
    setColor(e.target.value);
  });

  // ---------- storage ----------
  function getSaved() {
    try { return JSON.parse(localStorage.getItem('TW_customSprites') || '{}'); }
    catch (e) { return {}; }
  }
  function setSaved(map) {
    localStorage.setItem('TW_customSprites', JSON.stringify(map));
    refreshOvList();
  }
  function refreshOvList() {
    var el = document.getElementById('ov-list');
    el.innerHTML = '';
    var map = getSaved();
    var keys = Object.keys(map);
    if (keys.length === 0) {
      el.innerHTML = '<div style="color:#666;padding:4px">none yet</div>';
      return;
    }
    keys.forEach(function (k) {
      var d = document.createElement('div');
      d.className = 'item';
      d.textContent = '🎨 ' + k;
      d.title = 'click: edit • shift-click: delete';
      d.addEventListener('click', function (e) {
        if (e.shiftKey) {
          if (confirm('Delete custom "' + k + '" (back to default art)?')) {
            var m = getSaved(); delete m[k]; setSaved(m);
          }
        } else {
          document.getElementById('sp-key').value = k;
          loadSprite(k);
        }
      });
      el.appendChild(d);
    });
  }

  // ---------- toolbar ----------
  function buildKeySelects() {
    ['sp-key', 'sp-copy'].forEach(function (id) {
      var sel = document.getElementById(id);
      TW.SPRITE_KEYS.forEach(function (k) {
        var o = document.createElement('option');
        o.value = k; o.textContent = k;
        sel.appendChild(o);
      });
    });
  }

  document.getElementById('sp-key').addEventListener('change', function (e) {
    loadSprite(e.target.value);
  });

  document.getElementById('btn-copy').addEventListener('click', function () {
    var from = document.getElementById('sp-copy').value;
    if (!confirm('Replace the canvas with a copy of "' + from + '"?')) return;
    var src = TW.getSprite(from) || TW.DEFAULT_SPRITES[from];
    px = canvasToPixels(src);
    H = px.length; W = px[0].length;
    document.getElementById('sp-w').value = W;
    document.getElementById('sp-h').value = H;
    sizeCanvas(); draw();
  });

  document.getElementById('btn-resize').addEventListener('click', function () {
    var nw = Math.max(4, Math.min(64, +document.getElementById('sp-w').value));
    var nh = Math.max(4, Math.min(64, +document.getElementById('sp-h').value));

    var out = [];
    for (var y = 0; y < nh; y++) {
      var row = [];
      for (var x = 0; x < nw; x++) row.push((px[y] && px[y][x]) || null);
      out.push(row);
    }
    px = out; W = nw; H = nh;
    sizeCanvas(); draw();
  });

  document.getElementById('btn-save').addEventListener('click', function () {
    var map = getSaved();
    map[key] = { w: W, h: H, px: px };
    setSaved(map);
    alert('Saved! "' + key + '" now uses your art everywhere\n(game, editors) next time each page loads.');
  });

  document.getElementById('btn-reset').addEventListener('click', function () {
    if (!confirm('Remove your custom "' + key + '" and reload the default art?')) return;
    var map = getSaved();
    delete map[key];
    setSaved(map);
    px = canvasToPixels(TW.DEFAULT_SPRITES[key]);
    H = px.length; W = px[0].length;
    document.getElementById('sp-w').value = W;
    document.getElementById('sp-h').value = H;
    sizeCanvas(); draw();
  });

  document.getElementById('btn-export').addEventListener('click', function () {
    var map = getSaved();
    if (Object.keys(map).length === 0) { alert('No custom sprites saved yet.'); return; }
    var body = '// Trade Wars — data-sprites.js (exported from the Sprite Studio)\n' +
      '// Drop this file into js/ to ship this art with the game.\n' +
      'window.TW_SPRITE_OVERRIDES = ' + JSON.stringify(map) + ';\n';
    var blob = new Blob([body], { type: 'text/javascript' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'data-sprites.js';
    a.click();
  });

  // ---------- PNG round trip (Aseprite, Photoshop, any pixel editor) ----------
  document.getElementById('btn-png-export').addEventListener('click', function () {
    TW.fromPixels(px).toBlob(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = key.replace(/\./g, '-') + '.png';
      a.click();
    });
  });

  function importPng(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var w = Math.min(64, img.width);
        var h = Math.min(64, img.height);
        if (img.width > w || img.height > h) {
          if (!confirm('Image is ' + img.width + 'x' + img.height + ' - it will be cropped to ' +
            w + 'x' + h + ' (top-left). Continue?\n\nTip: in Aseprite, export ONE frame at 100% scale.')) return;
        }
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var cc = c.getContext('2d');
        cc.imageSmoothingEnabled = false;
        cc.drawImage(img, 0, 0);
        px = canvasToPixels(c);
        W = w; H = h;
        document.getElementById('sp-w').value = W;
        document.getElementById('sp-h').value = H;
        sizeCanvas(); draw();
      };
      img.onerror = function () { alert('Could not read that image.'); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  document.getElementById('btn-import').addEventListener('click', function () {
    document.getElementById('file-import').click();
  });
  document.getElementById('file-import').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    if (/\.(png|gif|webp)$/i.test(f.name)) { importPng(f); e.target.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var text = reader.result;
        var m = /window\.TW_SPRITE_OVERRIDES\s*=\s*(\{[\s\S]*\});?\s*$/.exec(text.trim());
        var map = JSON.parse(m ? m[1] : text);
        var saved = getSaved();
        Object.keys(map).forEach(function (k) { saved[k] = map[k]; });
        setSaved(saved);
        loadSprite(key);
        alert('Imported ' + Object.keys(map).length + ' sprite(s).');
      } catch (err) { alert('Could not parse that file: ' + err.message); }
    };
    reader.readAsText(f);
    e.target.value = '';
  });

  // ---------- boot ----------
  buildKeySelects();
  buildPalette();
  setColor(TW.PALETTE.green);
  loadSprite('ship.cruiser');
  refreshOvList();
})();
