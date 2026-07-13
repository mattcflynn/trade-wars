// Trade Wars — view-nav.js
// Left head position: the navigation display. Top-down galaxy chart of
// charted space (visited sectors + their lane endpoints — exploration law:
// nothing else is revealed). Plot a course; the cockpit flies it hop by hop.
(function () {
  'use strict';
  var TW = window.TW;
  var P = TW.PALETTE;
  var W = 640, H = 360;

  var ZOOMS = [10, 18, 32];          // px per parsec
  var nav = { cursor: 1, zoom: 1, camX: 0, camY: 0, msg: '', msgUntil: 0 };
  TW.nav = nav;

  function knownSectors(g) {
    var known = {};   // sector -> 'visited' | 'edge'
    Object.keys(g.st.visited).forEach(function (k) {
      known[+k] = 'visited';
      (g.galaxy.warps[+k] || []).forEach(function (nb) {
        if (!known[nb]) known[nb] = 'edge';
      });
    });
    return known;
  }

  function starXY(g, sec) {
    var st = g.galaxy.stars[sec];
    return { x: st.x, y: st.y, z: st.z };
  }

  function update(g) {
    var known = knownSectors(g);
    if (!known[nav.cursor]) nav.cursor = g.st.sector;

    // arrow keys: hop to nearest known star in that direction
    var dir = null;
    if (g.hit('ArrowLeft')) dir = [-1, 0];
    if (g.hit('ArrowRight')) dir = [1, 0];
    if (g.hit('ArrowUp')) dir = [0, -1];
    if (g.hit('ArrowDown')) dir = [0, 1];
    if (dir) {
      var cur = starXY(g, nav.cursor);
      var best = null, bestScore = Infinity;
      Object.keys(known).forEach(function (k) {
        var sec = +k;
        if (sec === nav.cursor) return;
        var p = starXY(g, sec);
        var dx = p.x - cur.x, dy = p.y - cur.y;
        var along = dx * dir[0] + dy * dir[1];
        if (along <= 0.01) return;                       // must be in that direction
        var ortho = Math.abs(dx * dir[1] - dy * dir[0]); // sideways penalty
        var score = along + ortho * 2.5;
        if (score < bestScore) { bestScore = score; best = sec; }
      });
      if (best) { nav.cursor = best; g.sfx('click'); } else g.sfx('deny');
    }

    if (g.hit('Minus')) { nav.zoom = Math.max(0, nav.zoom - 1); g.sfx('click'); }
    if (g.hit('Equal')) { nav.zoom = Math.min(ZOOMS.length - 1, nav.zoom + 1); g.sfx('click'); }
    if (g.hit('KeyC')) { nav.cursor = g.st.sector; g.sfx('click'); }

    if (g.hit('Enter')) {
      if (nav.cursor === g.st.sector) { g.sfx('deny'); return; }
      var route = TW.bfsRoute(g.galaxy, g.st.sector, nav.cursor, true, g.st);
      if (route) {
        g.st.course = route.slice(1);
        g.warpSel = Math.max(0, (g.galaxy.warps[g.st.sector] || []).indexOf(g.st.course[0]));
        nav.msg = 'COURSE PLOTTED: ' + g.st.course.length + ' HOPS — RETURN TO COCKPIT [E]';
        nav.msgUntil = g.t + 150;
        g.sfx('select');
        g.save();
      } else {
        nav.msg = 'NO CHARTED ROUTE — EXPLORE FURTHER';
        nav.msgUntil = g.t + 150;
        g.sfx('deny');
      }
    }

    // camera eases toward cursor
    var c = starXY(g, nav.cursor);
    nav.camX += (c.x - nav.camX) * 0.2;
    nav.camY += (c.y - nav.camY) * 0.2;
  }

  function project(px, py, scale) {
    return {
      x: W / 2 + (px - nav.camX) * scale,
      y: H / 2 + (py - nav.camY) * scale
    };
  }

  function depthColor(z, spect) {
    // z depth (parsecs) -> brightness band of the star's spectral color
    var az = Math.abs(z - nav.camZ || z);
    var col = TW.spectralColor(spect);
    if (Math.abs(z) < 5) return col;
    return Math.abs(z) < 10 ? P.grey : P.hull;
  }

  function draw(ctx, g) {
    var st = g.st, gal = g.galaxy, t = g.t;
    var scale = ZOOMS[nav.zoom];
    var known = knownSectors(g);

    ctx.fillStyle = P.ink;
    ctx.fillRect(0, 0, W, H);
    TW.dither(ctx, 0, 0, W, H, '#0d1319', 4);

    // lanes between charted sectors
    ctx.strokeStyle = P.cyanDim;
    Object.keys(known).forEach(function (k) {
      if (known[k] !== 'visited') return;
      var sec = +k, a = starXY(g, sec);
      (gal.warps[sec] || []).forEach(function (nb) {
        if (nb < sec && known[nb] === 'visited') return;   // draw each pair once
        if (!known[nb]) return;
        var b = starXY(g, nb);
        var pa = project(a.x, a.y, scale), pb = project(b.x, b.y, scale);
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      });
    });

    // plotted course
    if (st.course.length) {
      ctx.strokeStyle = P.amber;
      var prev = starXY(g, st.sector);
      var pp = project(prev.x, prev.y, scale);
      ctx.beginPath(); ctx.moveTo(pp.x, pp.y);
      st.course.forEach(function (sec) {
        var c = starXY(g, sec);
        var pc = project(c.x, c.y, scale);
        ctx.lineTo(pc.x, pc.y);
      });
      ctx.stroke();
    }

    // stars
    Object.keys(known).forEach(function (k) {
      var sec = +k;
      var s = gal.stars[sec];
      var pos = project(s.x, s.y, scale);
      if (pos.x < -10 || pos.x > W + 10 || pos.y < -10 || pos.y > H + 10) return;
      if (known[k] === 'visited') {
        ctx.fillStyle = depthColor(s.z, s.spect);
        ctx.fillRect(pos.x - 1, pos.y - 1, 3, 3);
        var iSt = TW.sectorInfo(gal, st, sec);
        if (iSt.port) { ctx.fillStyle = iSt.port.classId === 9 ? P.gold : P.green; ctx.fillRect(pos.x + 3, pos.y - 1, 2, 2); }
        if (iSt.pirates && (t >> 3) % 2 === 0) { ctx.fillStyle = P.red; ctx.fillRect(pos.x - 4, pos.y - 1, 2, 2); }
      } else {
        // charted-but-unvisited lane endpoint: dim unknown contact
        ctx.strokeStyle = P.hull;
        ctx.strokeRect(pos.x - 1.5, pos.y - 1.5, 4, 4);
      }
    });

    // current sector: blinking ring · cursor: amber ring
    var cur = starXY(g, st.sector);
    var pc = project(cur.x, cur.y, scale);
    if ((t >> 3) % 2 === 0) {
      ctx.strokeStyle = P.white;
      ctx.beginPath(); ctx.arc(pc.x, pc.y, 6, 0, Math.PI * 2); ctx.stroke();
    }
    var cs = starXY(g, nav.cursor);
    var pcs = project(cs.x, cs.y, scale);
    ctx.strokeStyle = P.amber;
    ctx.beginPath(); ctx.arc(pcs.x, pcs.y, 5, 0, Math.PI * 2); ctx.stroke();

    // header
    ctx.fillStyle = P.panel;
    ctx.fillRect(0, 0, W, 20);
    ctx.fillStyle = P.hull; ctx.fillRect(0, 19, W, 1);
    TW.text(ctx, 'NAV — GALACTIC CHART', 8, 13, 8, P.cyan);
    TW.text(ctx, 'CHARTED ' + Object.keys(st.visited).length + '/' + gal.size +
      '  PORTS ' + Object.keys(st.portsVisited).length +
      '  ZOOM ' + (nav.zoom + 1) + 'X', W - 30, 13, 8, P.grey, 'right');

    // selection panel
    var sec = nav.cursor;
    TW.panel(ctx, 8, H - 58, W - 40, 50, { border: P.hull });
    var s = gal.stars[sec];
    if (st.visited[sec]) {
      var info = TW.sectorInfo(gal, st, sec);
      TW.text(ctx, info.name.toUpperCase() + ' [' + sec + ']  ' + info.spect + '  ' +
        info.distLy.toFixed(1) + ' LY SOL', 16, H - 45, 8, P.white);
      var bits = [];
      if (info.port) bits.push(info.port.classId === 9 ? 'STARDOCK' : 'PORT: ' + TW.portName(info.port).toUpperCase());
      if (info.planet) bits.push('PLANET');
      if (info.pirates) bits.push(info.pirates + ' HOSTILES');
      if (sec === 1) bits.push('FED HQ');
      TW.text(ctx, bits.length ? bits.join('  ·  ') : 'EMPTY SPACE', 16, H - 34, 8, P.grey);
    } else {
      TW.text(ctx, 'SECTOR ' + sec + '  [UNCHARTED]', 16, H - 45, 8, P.amber);
      TW.text(ctx, 'NO DATA — VISIT TO CHART', 16, H - 34, 8, P.grey);
    }
    var route = sec === st.sector ? null : TW.bfsRoute(gal, st.sector, sec, true, st);
    TW.text(ctx, route ? ('ROUTE: ' + (route.length - 1) + (route.length === 2 ? ' HOP · ' : ' HOPS · ') + (route.length - 1) + ' FUEL — [ENTER] PLOT') :
      sec === st.sector ? 'CURRENT POSITION' : 'NO CHARTED ROUTE',
      16, H - 21, 8, route ? P.amber : P.hull);
    TW.text(ctx, '←↑↓→ SELECT  -/= ZOOM  C CENTER', W - 48, H - 21, 8, P.hull, 'right');

    if (nav.msg && t < nav.msgUntil) {
      TW.text(ctx, nav.msg, W / 2, 34, 8, P.amber, 'center');
    }

    // cockpit strut sliver on the right edge — head-turn continuity
    TW.drawStrut(ctx, W, H, 1, 20);
  }

  TW.viewNav = { update: update, draw: draw };
})();
