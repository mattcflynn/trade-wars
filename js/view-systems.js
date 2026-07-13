// Trade Wars — view-systems.js
// Right head position: ship systems console. Three tabs:
//   [1] SHIP — status, bars, catalog     [2] DOCK — trade / stardock / planet
//   [3] LOG — captain's log
(function () {
  'use strict';
  var TW = window.TW;
  var P = TW.PALETTE;
  var W = 640, H = 360;
  var LEFT = 28;   // content starts right of the strut sliver

  var TABS = ['SHIP', 'DOCK', 'LOG'];

  function fuelColor(frac) { return frac > 0.5 ? P.green : frac > 0.2 ? P.amber : P.red; }

  // ---------- action rows for the DOCK tab (built fresh each frame) ----------
  function dockRows(g) {
    var st = g.st, gal = g.galaxy;
    var info = TW.sectorInfo(gal, st, st.sector);
    var rows = [];
    var F = TW.DATA.FUEL, PR = TW.DATA.PRICES;

    if (st.sector === 1) {
      rows.push({
        label: 'FED HQ RESUPPLY — FUEL + SHIELDS', cost: 'FREE', color: P.gold,
        act: function () {
          if (TW.dock.fedResupply(st)) { g.sfx('refuel'); g.save(); return true; }
          g.flash('ALREADY AT FULL FUEL + SHIELDS'); return false;
        }
      });
    }

    if (info.port && info.port.classId === 9) {
      rows.push({
        label: 'SELL ALL CARGO (20/18/25 CR)', cost: TW.holdsUsed(st) ? '+' : '--',
        act: function () {
          var e = TW.dock.autoSell(st);
          if (e) { g.sfx('trade'); g.save(); return true; }
          g.flash('HOLDS EMPTY'); return false;
        }
      });
      var refuelN = Math.min(F.MAX - st.fuel, Math.floor(st.credits / F.STARDOCK_CR_PER_FUEL));
      rows.push({
        label: 'REFUEL TO FULL (' + F.STARDOCK_CR_PER_FUEL + ' CR EA)',
        cost: refuelN ? refuelN * F.STARDOCK_CR_PER_FUEL + ' CR' : '--',
        act: function () {
          if (TW.dock.refuel(st, 9999)) { g.sfx('refuel'); g.save(); return true; }
          g.flash(st.fuel >= F.MAX ? 'TANK FULL' : 'INSUFFICIENT CREDITS'); return false;
        }
      });
      rows.push({
        label: 'BUY 10 FIGHTERS', cost: 10 * PR.FIGHTER + ' CR',
        act: function () {
          if (TW.dock.buyFighters(st, 10)) { g.sfx('trade'); g.save(); return true; }
          g.flash('INSUFFICIENT CREDITS'); return false;
        }
      });
      rows.push({
        label: 'BUY 50 SHIELD PTS', cost: 50 * PR.SHIELD_PT + ' CR',
        act: function () {
          if (TW.dock.buyShields(st, 50)) { g.sfx('trade'); g.save(); return true; }
          g.flash('INSUFFICIENT CREDITS'); return false;
        }
      });
      rows.push({
        label: 'HOLO SCANNER', cost: st.hasHolo ? 'OWNED' : PR.HOLO + ' CR', dim: st.hasHolo,
        act: function () {
          var r = TW.dock.buyHolo(st);
          if (r.ok) { g.sfx('bounty'); g.save(); return true; }
          g.flash(r.reason.toUpperCase()); return false;
        }
      });
      TW.DATA.SHIPS.forEach(function (ship) {
        if (ship.name === st.ship) return;
        rows.push({
          label: 'BUY ' + ship.name.toUpperCase() +
            '  H' + ship.holds + ' F' + ship.fighters + ' S' + ship.shields,
          cost: ship.cost.toLocaleString() + ' CR',
          act: function () {
            var r = TW.dock.upgradeShip(st, ship.name);
            if (r.ok) { g.sfx('bounty'); g.save(); return true; }
            g.flash(r.reason.toUpperCase()); return false;
          }
        });
      });
    } else if (info.port) {
      for (var i = 0; i < 3; i++) {
        (function (i) {
          var t = TW.tradeType(info.port, i);
          if (t !== 'B' && t !== 'S') return;
          rows.push({
            trade: true, comm: i, port: info.port, type: t,
            act: function () {
              var res = TW.trade(st, info.port, i, g.tradeQty[i]);
              if (res.ok) { g.sfx('trade'); g.save(); return true; }
              g.flash(res.reason.toUpperCase()); return false;
            }
          });
        })(i);
      }
    }

    if (info.planet) {
      var pl = info.planet;
      if (!pl.owner) {
        rows.push({
          label: 'CLAIM PLANET ' + pl.name.toUpperCase(), cost: 'FREE', color: P.green,
          act: function () {
            if (TW.claimPlanet(st).ok) { g.sfx('bounty'); g.save(); return true; }
            return false;
          }
        });
      } else if (pl.owner === st.name) {
        rows.push({
          label: 'DROP ORE+ORGANICS ON ' + pl.name.toUpperCase(), cost: '',
          act: function () {
            var r = TW.dropCargo(st);
            if (r.ok) { g.sfx('click'); g.save(); return true; }
            g.flash(r.reason.toUpperCase()); return false;
          }
        });
      }
    }
    return rows;
  }

  // ---------- update ----------
  function update(g) {
    var st = g.st;
    if (g.hit('Tab')) { g.sysTab = (g.sysTab + 1) % 3; g.sysSel = 0; g.sfx('click'); }
    if (g.hit('Digit1')) { g.sysTab = 0; g.sfx('click'); }
    if (g.hit('Digit2')) { g.sysTab = 1; g.sysSel = 0; g.sfx('click'); }
    if (g.hit('Digit3')) { g.sysTab = 2; g.sfx('click'); }

    if (g.sysTab === 1) {
      var rows = dockRows(g);
      if (!rows.length) return;
      if (g.sysSel >= rows.length) g.sysSel = rows.length - 1;
      if (g.hit('ArrowUp')) { g.sysSel = (g.sysSel + rows.length - 1) % rows.length; g.sfx('click'); }
      if (g.hit('ArrowDown')) { g.sysSel = (g.sysSel + 1) % rows.length; g.sfx('click'); }
      var row = rows[g.sysSel];
      if (row && row.trade) {
        var max = TW.maxTrade(st, row.port, row.comm);
        var step = (g.held('ShiftLeft') || g.held('ShiftRight')) ? 10 : 1;
        if (g.hit('ArrowLeft')) { g.tradeQty[row.comm] = Math.max(1, g.tradeQty[row.comm] - step); g.sfx('click'); }
        if (g.hit('ArrowRight')) { g.tradeQty[row.comm] = Math.min(Math.max(1, max), g.tradeQty[row.comm] + step); g.sfx('click'); }
        if (g.hit('KeyX')) { g.tradeQty[row.comm] = Math.max(1, max); g.sfx('click'); }
      }
      if (g.hit('Enter') && row) row.act();
    } else if (g.sysTab === 2) {
      var maxScroll = Math.max(0, st.log.length - 24);
      if (g.hit('ArrowUp')) g.logScroll = Math.min(maxScroll, g.logScroll + 1);
      if (g.hit('ArrowDown')) g.logScroll = Math.max(0, g.logScroll - 1);
      if (g.hit('PageUp')) g.logScroll = Math.min(maxScroll, g.logScroll + 10);
      if (g.hit('PageDown')) g.logScroll = Math.max(0, g.logScroll - 10);
    }
  }

  // ---------- draw ----------
  function draw(ctx, g) {
    var st = g.st, t = g.t;
    ctx.fillStyle = P.hullDark;
    ctx.fillRect(0, 0, W, H);

    // header tabs
    ctx.fillStyle = P.panel;
    ctx.fillRect(0, 0, W, 20);
    ctx.fillStyle = P.hull; ctx.fillRect(0, 19, W, 1);
    var x = LEFT + 4;
    for (var i = 0; i < TABS.length; i++) {
      var on = g.sysTab === i;
      if (on) { ctx.fillStyle = P.hull; ctx.fillRect(x - 4, 2, TABS[i].length * 8 + 20, 17); }
      TW.text(ctx, '[' + (i + 1) + ']' + TABS[i], x, 13, 8, on ? P.white : P.grey);
      x += TABS[i].length * 8 + 34;
    }
    TW.text(ctx, 'SYSTEMS CONSOLE', W - 8, 13, 8, P.cyan, 'right');

    if (g.sysTab === 0) drawShip(ctx, g, t);
    else if (g.sysTab === 1) drawDock(ctx, g, t);
    else drawLog(ctx, g, t);

    if (g.flashMsg && t < g.flashUntil) {
      TW.text(ctx, g.flashMsg, W / 2, 32, 8, P.amber, 'center');
    }

    // cockpit strut sliver on the left edge — head-turn continuity
    TW.drawStrut(ctx, W, H, -1, 20);
  }

  function drawShip(ctx, g, t) {
    var st = g.st;
    var ship = TW.shipByName(st.ship);

    TW.panel(ctx, LEFT + 4, 28, 290, 130, { title: 'VESSEL', titleColor: P.white });
    var spr = TW.shipSprite(st.ship);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(spr, LEFT + 24, 48, spr.width * 3, spr.height * 3);
    TW.text(ctx, st.ship.toUpperCase(), LEFT + 14, 44, 8, P.white);
    TW.text(ctx, 'CMDR ' + st.name.toUpperCase(), LEFT + 14, 100, 8, P.grey);
    TW.text(ctx, 'KILLS ' + st.kills + '   DEATHS ' + st.deaths, LEFT + 14, 112, 8, P.grey);
    TW.text(ctx, 'JUMPS ' + st.jumps + '   CHARTED ' + Object.keys(st.visited).length,
      LEFT + 14, 124, 8, P.grey);
    TW.text(ctx, 'HOLO SCANNER ' + (st.hasHolo ? 'INSTALLED' : 'NOT FITTED'),
      LEFT + 14, 136, 8, st.hasHolo ? P.green : P.hull);
    TW.text(ctx, 'CREDITS ' + st.credits.toLocaleString(), LEFT + 14, 150, 8, P.gold);

    // live bars
    TW.panel(ctx, LEFT + 302, 28, 290, 130, { title: 'STATUS', titleColor: P.cyan });
    var bx = LEFT + 314, by = 52;
    var F = TW.DATA.FUEL;
    var bars = [
      ['FUEL', st.fuel / F.MAX, fuelColor(st.fuel / F.MAX), st.fuel + '/' + F.MAX],
      ['SHIELDS', st.shields / ship.shields, P.cyan, st.shields + '/' + ship.shields],
      ['FIGHTERS', Math.min(1, st.fighters / Math.max(ship.fighters, st.fighters)), P.red, String(st.fighters)],
      ['HOLDS', st.holdsTotal ? TW.holdsUsed(st) / st.holdsTotal : 0, P.amber, TW.holdsUsed(st) + '/' + st.holdsTotal]
    ];
    bars.forEach(function (b, i) {
      TW.text(ctx, b[0], bx, by + i * 26, 8, P.grey);
      TW.gauge(ctx, bx, by + i * 26 + 4, 180, 8, b[1], b[2]);
      TW.text(ctx, b[3], bx + 268, by + i * 26 + 11, 8, P.white, 'right');
    });

    // catalog comparison
    TW.panel(ctx, LEFT + 4, 166, 588, 108, { title: 'SHIP CATALOG', titleColor: P.grey });
    var atDock = st.ports[st.sector] && st.ports[st.sector].classId === 9;
    TW.text(ctx, 'SHIP', LEFT + 14, 190, 8, P.hull);
    TW.text(ctx, 'HOLDS', LEFT + 260, 190, 8, P.hull);
    TW.text(ctx, 'FTRS', LEFT + 330, 190, 8, P.hull);
    TW.text(ctx, 'SHLDS', LEFT + 390, 190, 8, P.hull);
    TW.text(ctx, 'COST', LEFT + 470, 190, 8, P.hull);
    TW.DATA.SHIPS.forEach(function (s, i) {
      var y = 204 + i * 14;
      var own = s.name === st.ship;
      var col = own ? P.green : atDock ? P.white : P.grey;
      TW.text(ctx, s.name.toUpperCase() + (own ? '  < CURRENT' : ''), LEFT + 14, y, 8, col);
      TW.text(ctx, String(s.holds), LEFT + 260, y, 8, col);
      TW.text(ctx, String(s.fighters), LEFT + 330, y, 8, col);
      TW.text(ctx, String(s.shields), LEFT + 390, y, 8, col);
      TW.text(ctx, s.cost ? s.cost.toLocaleString() : '--', LEFT + 470, y, 8, col);
    });
    TW.text(ctx, atDock ? 'PURCHASE VIA [2] DOCK' : 'UPGRADES SOLD AT STARDOCK ONLY',
      LEFT + 14, 268, 8, atDock ? P.amber : P.hull);
  }

  function drawDock(ctx, g, t) {
    var st = g.st, gal = g.galaxy;
    var info = TW.sectorInfo(gal, st, st.sector);
    var rows = dockRows(g);

    // banner
    var banner, bcol;
    if (st.sector === 1) { banner = 'FEDERATION HEADQUARTERS — SOL'; bcol = P.gold; }
    else if (info.port && info.port.classId === 9) { banner = '☆ STARDOCK ☆ — ' + info.name.toUpperCase(); bcol = P.gold; }
    else if (info.port) { banner = 'PORT: ' + TW.portName(info.port).toUpperCase() + ' (CLASS ' + info.port.classId + ') — ' + info.name.toUpperCase(); bcol = P.green; }
    else if (info.planet) { banner = 'PLANET: ' + info.planet.name.toUpperCase(); bcol = P.cyan; }
    else { banner = 'NO PORT IN SECTOR — ' + info.name.toUpperCase(); bcol = P.grey; }
    TW.panel(ctx, LEFT + 4, 28, 588, 24, { fill: P.panelLo, border: P.hull });
    TW.text(ctx, banner, LEFT + 14, 44, 8, bcol);
    TW.text(ctx, st.credits.toLocaleString() + ' CR', LEFT + 582, 44, 8, P.gold, 'right');

    if (!rows.length) {
      TW.text(ctx, 'NOTHING TO INTERACT WITH HERE.', LEFT + 14, 80, 8, P.grey);
      TW.text(ctx, 'DOCKABLE: PORTS · STARDOCK · PLANETS · FED HQ', LEFT + 14, 94, 8, P.hull);
      return;
    }

    var y = 66;
    // column headers for trade ports
    var isTrade = rows.some(function (r) { return r.trade; });
    if (isTrade) {
      TW.text(ctx, 'COMMODITY', LEFT + 14, y, 8, P.hull);
      TW.text(ctx, 'DEAL', LEFT + 170, y, 8, P.hull);
      TW.text(ctx, 'PRICE', LEFT + 280, y, 8, P.hull);
      TW.text(ctx, 'STOCK', LEFT + 345, y, 8, P.hull);
      TW.text(ctx, 'CARGO', LEFT + 410, y, 8, P.hull);
      TW.text(ctx, 'QTY <> [X]MAX', LEFT + 470, y, 8, P.hull);
      y += 8;
    }

    rows.forEach(function (row, i) {
      y += 16;
      var sel = i === g.sysSel;
      if (sel) { ctx.fillStyle = P.panelLo; ctx.fillRect(LEFT + 6, y - 11, 586, 15); }
      if (row.trade) {
        var iC = row.comm, port = row.port;
        var mine = TW.cargo(st, iC);
        var max = TW.maxTrade(st, port, iC);
        var qty = Math.min(g.tradeQty[iC], Math.max(1, max));
        g.tradeQty[iC] = qty;
        // player-perspective labels (design law)
        var deal = row.type === 'S' ? 'BUY here' : 'SELL here';
        var dealCol = row.type === 'S' ? P.amber : P.green;
        TW.text(ctx, TW.DATA.COMMODITIES[iC].toUpperCase(), LEFT + 14, y, 8, sel ? P.white : P.grey);
        TW.text(ctx, deal, LEFT + 170, y, 8, max ? dealCol : P.hull);
        TW.text(ctx, port.prices[iC] + 'CR', LEFT + 280, y, 8, sel ? P.white : P.grey);
        TW.text(ctx, String(port.stock[iC]), LEFT + 345, y, 8, sel ? P.white : P.grey);
        TW.text(ctx, String(mine), LEFT + 410, y, 8, sel ? P.white : P.grey);
        TW.text(ctx, max ? ('< ' + qty + ' >  = ' + (qty * port.prices[iC]).toLocaleString() + 'CR')
          : 'MAX 0', LEFT + 470, y, 8, max ? (sel ? P.amber : P.grey) : P.hull);
      } else {
        TW.text(ctx, row.label, LEFT + 14, y, 8, row.dim ? P.hull : (sel ? P.white : (row.color || P.grey)));
        TW.text(ctx, row.cost || '', LEFT + 582, y, 8, sel ? P.amber : P.grey, 'right');
      }
      g.hotspot(LEFT + 6, y - 11, 586, 15, 'sysrow:' + i);
    });

    y += 24;
    if (info.planet) {
      var pl = info.planet;
      TW.panel(ctx, LEFT + 4, y, 588, 54, { title: 'PLANET SURVEY', titleColor: P.cyan });
      TW.text(ctx, pl.name.toUpperCase() + '  ·  COLONISTS ' + pl.colonists +
        '  ·  ORE ' + pl.ore + '  ·  ORGANICS ' + pl.organics, LEFT + 14, y + 24, 8, P.grey);
      TW.text(ctx, 'OWNER: ' + (pl.owner ? pl.owner.toUpperCase() : 'UNCLAIMED'),
        LEFT + 14, y + 38, 8, pl.owner === st.name ? P.green : pl.owner ? P.amber : P.grey);
      y += 62;
    }
    TW.text(ctx, '↑↓ SELECT   ENTER EXECUTE   SHIFT+<> x10', LEFT + 14, H - 14, 8, P.hull);
  }

  function drawLog(ctx, g, t) {
    var st = g.st;
    TW.panel(ctx, LEFT + 4, 28, 588, 316, { title: "CAPTAIN'S LOG", titleColor: P.green });
    var KIND = { jump: ['>', P.cyan], trade: ['$', P.gold], combat: ['!', P.red], dock: ['#', P.green], scan: ['@', P.cyan], system: ['·', P.grey] };
    var lines = st.log.slice();
    var end = lines.length - g.logScroll;
    var view = lines.slice(Math.max(0, end - 24), end);
    var y = 50;
    view.forEach(function (e) {
      var k = KIND[e.kind] || KIND.system;
      TW.text(ctx, String(e.n), LEFT + 14, y, 8, P.hull);
      TW.text(ctx, k[0], LEFT + 46, y, 8, k[1]);
      TW.text(ctx, e.text, LEFT + 60, y, 8, P.grey);
      y += 12;
    });
    TW.text(ctx, st.log.length + ' ENTRIES   ↑↓ SCROLL', LEFT + 14, H - 22, 8, P.hull);
  }

  TW.viewSystems = { update: update, draw: draw };
})();
