// Trade Wars — view-cockpit.js
// Center head position: the pilot's seat. Every display is live game data.
//   A viewport (current system)   B scanner   C comms
//   D dash gauges (fuel/shields/fighters/credits/cargo)
//   E hyperjump control cluster
(function () {
  'use strict';
  var TW = window.TW;
  var P = TW.PALETTE;
  var W = 640, H = 360;

  // panel zones
  var VP = { x: 156, y: 6, w: 328, h: 170 };   // viewport
  var SC = { x: 8, y: 6, w: 140, h: 170 };     // scanner
  var CM = { x: 492, y: 6, w: 140, h: 170 };   // comms
  var DASH = { y: 182, h: 94 };
  var HJ = { x: 8, y: 282, w: 624, h: 72 };    // hyperjump cluster

  function fuelColor(frac) {
    return frac > 0.5 ? P.green : frac > 0.2 ? P.amber : P.red;
  }

  // ---------- update ----------
  function update(g) {
    var st = g.st, gal = g.galaxy;
    var warps = gal.warps[st.sector] || [];
    if (g.hit('ArrowUp')) { g.warpSel = (g.warpSel + warps.length - 1) % warps.length; g.sfx('click'); }
    if (g.hit('ArrowDown')) { g.warpSel = (g.warpSel + 1) % warps.length; g.sfx('click'); }
    if (g.warpSel >= warps.length) g.warpSel = 0;

    if (g.hit('Enter') || g.hit('KeyJ')) {
      var dest = warps[g.warpSel];
      if (dest === undefined) return;
      if (st.fuel < TW.DATA.FUEL.JUMP_COST) { g.sfx('deny'); g.flash('FUEL EXHAUSTED — CONVERT ORE [F] OR DRIFT'); return; }
      g.startJump(dest);
      return;
    }
    if (g.hit('KeyF')) {
      var res = TW.convertFuelOre(st, g.held('ShiftLeft') || g.held('ShiftRight') ? 9999 : 1);
      if (res.ok) { g.sfx('refuel'); g.save(); } else { g.sfx('deny'); g.flash('NO FUEL ORE IN CARGO'); }
    }
    if (g.hit('KeyA')) {
      if (st.pirates[st.sector]) g.startCombat();
      else { g.sfx('deny'); g.flash('NO HOSTILES IN SECTOR'); }
    }
    if (g.hit('KeyH')) {
      var hs = TW.holoScan(g.galaxy, st);
      if (hs.ok) { g.sfx('scan'); g.save(); }
      else { g.sfx('deny'); g.flash('NO HOLO SCANNER — BUY AT STARDOCK'); }
    }
    if (g.hit('KeyT')) {
      var info = TW.sectorInfo(gal, st, st.sector);
      if (info.port || info.planet || st.sector === 1) { g.lookTo(2); g.sysTab = 1; }
      else { g.sfx('deny'); g.flash('NOTHING TO DOCK WITH HERE'); }
    }
  }

  // ---------- draw ----------
  function draw(ctx, g) {
    var st = g.st, gal = g.galaxy;
    var info = TW.sectorInfo(gal, st, st.sector);
    var t = g.t;

    // hull backdrop + struts both sides
    ctx.fillStyle = P.hullDark;
    ctx.fillRect(0, 0, W, H);
    TW.drawStrut(ctx, W, H, -1);
    TW.drawStrut(ctx, W, H, 1);

    drawViewport(ctx, g, info, t);
    drawScanner(ctx, g, info, t);
    drawComms(ctx, g, t);
    drawDash(ctx, g, info, t);
    drawHyperjump(ctx, g, info, t);

    // status flash line (errors/hints), sits between dash and hyperjump
    if (g.flashMsg && t < g.flashUntil) {
      TW.text(ctx, g.flashMsg, W / 2, 280, 8, P.amber, 'center');
    }
  }

  // ---- A: the window ----
  function drawViewport(ctx, g, info, t) {
    var st = g.st;
    TW.panel(ctx, VP.x, VP.y, VP.w, VP.h, { fill: P.ink });
    ctx.save();
    ctx.beginPath();
    ctx.rect(VP.x + 2, VP.y + 2, VP.w - 4, VP.h - 4);
    ctx.clip();

    if (g.state === 'jump') {
      drawJumpStreaks(ctx, g, t);
    } else {
      TW.starfield(ctx, VP.x, VP.y, VP.w, VP.h, 'sys:' + st.sector, t);
      // the local star
      TW.starDisc(ctx, VP.x + VP.w * 0.5, VP.y + 62, info.spect, t);
      // planet, lower left
      if (info.planet) {
        var pk = (info.planet.colonists > 250) ? 'planet.terra' : 'planet.rock';
        var ps = TW.SPR.misc[pk];
        ctx.drawImage(ps, VP.x + 46, VP.y + VP.h - 52, ps.width * 2, ps.height * 2);
        TW.text(ctx, info.planet.name.toUpperCase(), VP.x + 42, VP.y + VP.h - 12, 8,
          info.planet.owner ? P.green : P.grey);
      }
      // port station, right side (blinks green beacon when trading available)
      if (info.port) {
        var key = info.port.classId === 9 ? 'port.stardock' : 'port.station';
        var sp = TW.SPR.misc[key];
        ctx.drawImage(sp, VP.x + VP.w - 76, VP.y + 34, sp.width * 2, sp.height * 2);
        if ((t >> 4) % 2 === 0) {
          ctx.fillStyle = info.port.classId === 9 ? P.gold : P.green;
          ctx.fillRect(VP.x + VP.w - 76 + sp.width, VP.y + 30, 2, 2);
        }
        TW.text(ctx, TW.portName(info.port).toUpperCase(), VP.x + VP.w - 96, VP.y + 26, 8, P.grey);
      }
      // Fed HQ beacon at Sol
      if (info.sector === 1) {
        TW.text(ctx, 'FEDERATION HQ', VP.x + 12, VP.y + 26, 8, P.gold);
      }
      // pirate contacts
      if (info.pirates) {
        var d = TW.SPR.misc['pirate.delta'];
        var r = TW.rng('pir:' + info.sector);
        var n = Math.min(5, Math.ceil(info.pirates / 30));
        for (var i = 0; i < n; i++) {
          if ((t >> 3) % 2 === 0)
            ctx.drawImage(d, VP.x + 30 + r() * (VP.w - 80), VP.y + 84 + r() * 44);
        }
        if ((t >> 4) % 2 === 0)
          TW.text(ctx, '! ' + info.pirates + ' HOSTILE FIGHTERS', VP.x + 12, VP.y + VP.h - 20, 8, P.red);
      }
    }
    // id plate strip along the bottom of the glass
    ctx.fillStyle = P.panelLo;
    ctx.fillRect(VP.x + 2, VP.y + VP.h - 13, VP.w - 4, 11);
    TW.text(ctx, (info.name.toUpperCase() + ' [' + info.sector + '] ' + info.spect).slice(0, 28),
      VP.x + 8, VP.y + VP.h - 5, 8, P.white);
    TW.text(ctx, info.distLy.toFixed(1) + 'LY', VP.x + VP.w - 8, VP.y + VP.h - 5, 8, P.grey, 'right');
    ctx.restore();
  }

  function drawJumpStreaks(ctx, g, t) {
    var jt = g.jumpT;
    var r = TW.rng('jump:' + g.jumpDest);
    var cx = VP.x + VP.w / 2, cy = VP.y + VP.h / 2;
    for (var i = 0; i < 60; i++) {
      var a = r() * Math.PI * 2;
      var d0 = r() * 80;
      var len = 4 + jt * 1.5;
      var d1 = d0 + (jt * 3) % 160;
      ctx.strokeStyle = i % 3 === 0 ? P.white : i % 3 === 1 ? P.cyan : P.grey;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * d1, cy + Math.sin(a) * d1);
      ctx.lineTo(cx + Math.cos(a) * (d1 + len), cy + Math.sin(a) * (d1 + len));
      ctx.stroke();
    }
    TW.text(ctx, jt < 20 ? 'HYPERDRIVE CHARGING…' : 'JUMPING', cx, VP.y + 20, 8, P.cyan, 'center');
  }

  // ---- B: scanner ----
  function drawScanner(ctx, g, info, t) {
    var st = g.st;
    TW.panel(ctx, SC.x, SC.y, SC.w, SC.h, { title: 'SCANNER', border: P.hull, titleColor: P.cyan });
    var cx = SC.x + SC.w / 2, cy = SC.y + 14 + (SC.h - 40) / 2;
    var R = 56;
    ctx.strokeStyle = P.cyanDim;
    [R, R * 0.66, R * 0.33].forEach(function (rr) {
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
    });
    // warp-lane ticks on the rim: one per lane
    var lanes = info.warps;
    for (var i = 0; i < lanes.length; i++) {
      var a = (i / lanes.length) * Math.PI * 2 - Math.PI / 2;
      ctx.strokeStyle = P.cyan;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (R - 3), cy + Math.sin(a) * (R - 3));
      ctx.lineTo(cx + Math.cos(a) * (R + 3), cy + Math.sin(a) * (R + 3));
      ctx.stroke();
    }
    // sweep
    var sa = t * 0.04;
    ctx.strokeStyle = P.cyan;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sa) * R, cy + Math.sin(sa) * R);
    ctx.stroke();
    // contact blips (real contents of this sector), angle seeded per sector
    var r = TW.rng('scan:' + info.sector);
    function blip(radius, color, size) {
      var a = r() * Math.PI * 2;
      var bx = cx + Math.cos(a) * radius, by = cy + Math.sin(a) * radius;
      // glow when sweep is near
      var da = Math.abs(((sa - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      ctx.fillStyle = da < 0.5 ? P.white : color;
      ctx.fillRect(bx - size / 2, by - size / 2, size, size);
    }
    // self, center
    ctx.fillStyle = P.white;
    ctx.fillRect(cx - 1, cy - 1, 3, 3);
    if (info.port) blip(R * 0.4, info.port.classId === 9 ? P.gold : P.green, 4);
    if (info.planet) blip(R * 0.6, TW.spectralColor(info.spect), 4);
    if (info.pirates && (t >> 3) % 2 === 0) blip(R * 0.8, P.red, 5);
    // readouts
    var dens = TW.density(st, st.sector);
    TW.text(ctx, 'DENSITY ' + dens, SC.x + 6, SC.y + SC.h - 18, 8, P.cyan);
    TW.text(ctx, 'LANES ' + lanes.length + '  HOLO ' + (st.hasHolo ? 'OK' : '--'),
      SC.x + 6, SC.y + SC.h - 7, 8, st.hasHolo ? P.green : P.grey);
  }

  // ---- C: comms ----
  var KIND_COLOR = { jump: P.cyan, trade: P.gold, combat: P.red, dock: P.green, scan: P.cyan, system: P.grey };
  function drawComms(ctx, g, t) {
    TW.panel(ctx, CM.x, CM.y, CM.w, CM.h, { title: 'COMMS', border: P.hull, titleColor: P.green });
    var st = g.st;
    var tail = st.log.slice(-6);
    var y = CM.y + 22;
    for (var i = 0; i < tail.length; i++) {
      var e = tail[i];
      var col = KIND_COLOR[e.kind] || P.grey;
      var txt = e.text;
      // newest line gets a typewriter reveal
      if (i === tail.length - 1) {
        var chars = Math.max(0, (t - g.hailT) >> 1);
        txt = txt.slice(0, chars);
      }
      var lines = TW.wrapText(ctx, txt, CM.w - 14, 8);
      for (var L = 0; L < lines.length && y < CM.y + CM.h - 10; L++) {
        TW.text(ctx, lines[L], CM.x + 6, y, 8, i === tail.length - 1 ? col : P.grey);
        y += 10;
      }
      y += 2;
    }
    // blinking cursor
    if ((t >> 4) % 2 === 0) {
      ctx.fillStyle = P.green;
      ctx.fillRect(CM.x + 6, CM.y + CM.h - 12, 6, 8);
    }
  }

  // ---- D: dash gauges ----
  function drawDash(ctx, g, info, t) {
    var st = g.st;
    var F = TW.DATA.FUEL;
    var y = DASH.y;

    // FUEL
    TW.panel(ctx, 8, y, 160, 42, { title: 'FUEL', titleColor: fuelColor(st.fuel / F.MAX) });
    ctx.drawImage(TW.SPR.icons.fuel, 14, y + 18);
    TW.gauge(ctx, 26, y + 18, 106, 8, st.fuel / F.MAX, fuelColor(st.fuel / F.MAX));
    TW.text(ctx, String(st.fuel), 160, y + 26, 8, P.white, 'right');
    TW.text(ctx, '[F] ORE>FUEL x' + st.ore, 14, y + 37, 8, st.ore ? P.amber : P.hull);

    // SHIELDS
    TW.panel(ctx, 176, y, 130, 42, { title: 'SHIELDS', titleColor: P.cyan });
    ctx.drawImage(TW.SPR.icons.shield, 182, y + 18);
    TW.gauge(ctx, 194, y + 18, 76, 8, st.shields / TW.shipByName(st.ship).shields, P.cyan);
    TW.text(ctx, String(st.shields), 300, y + 26, 8, P.white, 'right');

    // FIGHTERS
    TW.panel(ctx, 314, y, 100, 42, { title: 'FIGHTERS', titleColor: P.red });
    ctx.drawImage(TW.SPR.icons.fighter, 320, y + 18);
    TW.text(ctx, String(st.fighters), 336, y + 26, 8, P.white);
    TW.text(ctx, 'K:' + st.kills + ' D:' + st.deaths, 320, y + 37, 8, P.grey);

    // CREDITS
    TW.panel(ctx, 422, y, 88, 42, { title: 'CREDITS', titleColor: P.gold });
    ctx.drawImage(TW.SPR.icons.credit, 428, y + 18);
    TW.text(ctx, st.credits.toLocaleString(), 504, y + 26, 8, P.gold, 'right');

    // CARGO
    TW.panel(ctx, 518, y, 114, 42, { title: 'CARGO ' + TW.holdsUsed(st) + '/' + st.holdsTotal, titleColor: P.white });
    var names = ['ore', 'organics', 'equipment'];
    var vals = [st.ore, st.organics, st.equipment];
    for (var i = 0; i < 3; i++) {
      ctx.drawImage(TW.SPR.icons[names[i]], 524, y + 14 + i * 9);
      TW.gauge(ctx, 535, y + 15 + i * 9, 70, 6, st.holdsTotal ? vals[i] / st.holdsTotal : 0,
        [P.amber, P.green, P.grey][i]);
      TW.text(ctx, String(vals[i]), 630, y + 21 + i * 9, 8, P.white, 'right');
    }

    // second row: ship id plate + quick help
    TW.panel(ctx, 8, y + 48, 624, 26, { fill: P.hullDark, border: P.hull });
    var spr = TW.shipSprite(st.ship);
    ctx.drawImage(spr, 16, y + 48 + 13 - spr.height / 2);
    TW.text(ctx, st.ship.toUpperCase(), 52, y + 64, 8, P.white);
    TW.text(ctx, '[Q]NAV [E]SYS [T]DOCK [A]ATK [H]SCAN', 624, y + 64, 8, P.grey, 'right');
  }

  // ---- E: hyperjump cluster ----
  function drawHyperjump(ctx, g, info, t) {
    var st = g.st, gal = g.galaxy;
    TW.panel(ctx, HJ.x, HJ.y, HJ.w, HJ.h, { title: 'HYPERJUMP', titleColor: P.amber });
    var lanes = info.warps;

    // course readout
    var cx = HJ.x + 8, top = HJ.y + 24;
    if (st.course.length) {
      var dest = st.course[st.course.length - 1];
      TW.text(ctx, 'COURSE > ' + TW.starName(gal, dest).toUpperCase() +
        '  (' + st.course.length + (st.course.length === 1 ? ' HOP)' : ' HOPS)'), cx, top, 8, P.amber);
      top += 11;
    }

    // warp rows, two columns
    var colW = 300;
    for (var i = 0; i < lanes.length && i < 6; i++) {
      var sec = lanes[i];
      var rx = cx + (i % 2) * colW;
      var ry = top + Math.floor(i / 2) * 11;
      var sel = i === g.warpSel;
      if (sel) {
        ctx.fillStyle = P.amberDim;
        ctx.fillRect(rx - 2, ry - 8, colW - 10, 10);
      }
      var onCourse = st.course.length && st.course[0] === sec;
      ctx.fillStyle = TW.spectralColor((gal.stars[sec] || {}).spect);
      ctx.fillRect(rx, ry - 6, 4, 4);
      TW.text(ctx, TW.starName(gal, sec).toUpperCase().slice(0, 18), rx + 8, ry, 8,
        sel ? P.white : P.grey);
      TW.text(ctx,
        TW.warpDist(gal, st.sector, sec).toFixed(1) + 'LY ' +
        (st.visited[sec] ? '' : 'NEW') + (onCourse ? ' <<' : ''),
        rx + colW - 20, ry, 8, st.visited[sec] ? (sel ? P.amber : P.hull) : P.green, 'right');
    }

    // engage button
    var canJump = st.fuel >= TW.DATA.FUEL.JUMP_COST && lanes.length;
    var bx = HJ.x + HJ.w - 110, by = HJ.y + HJ.h - 26;
    ctx.fillStyle = canJump ? ((t >> 4) % 2 === 0 ? P.amber : P.amberDim) : P.hullDark;
    ctx.fillRect(bx, by, 100, 18);
    TW.text(ctx, 'ENGAGE', bx + 50, by + 12, 8, canJump ? P.ink : P.grey, 'center');
    TW.text(ctx, '↑↓ SELECT  ENTER ENGAGE  COST 1 FUEL', HJ.x + 8, HJ.y + HJ.h - 8, 8, P.hull);
    g.hotspot(bx, by, 100, 18, 'engage');
  }

  TW.viewCockpit = { update: update, draw: draw };
})();
