/* Trade Wars — headless engine core.
   Ported from game_core.py (tables, galaxy, trade, move) and main.py
   (combat, stardock, planets, holo scan, BFS). Zero DOM — loads under Node.
   All state is plain JSON. Stochastic functions take a trailing
   rand = Math.random parameter so tests can inject a fixed sequence.
   Content generation NEVER uses Math.random — only TW.rng(seed). */
(function () {
  'use strict';
  window.TW = window.TW || {};
  var TW = window.TW;

  // ---------- seeded RNG (house xorshift, same as ralph/betrayers) ----------
  TW.rng = function (seed) {
    var s = 0;
    String(seed).split('').forEach(function (ch) { s = (s * 31 + ch.charCodeAt(0)) >>> 0; });
    if (s === 0) s = 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };

  function randint(r, a, b) { return a + Math.floor(r() * (b - a + 1)); }
  function uniform(r, a, b) { return a + r() * (b - a); }
  function choice(r, arr) { return arr[Math.floor(r() * arr.length)]; }

  // ---------- data tables (game_core.py) ----------
  TW.DATA = {
    PORT_CLASSES: {
      1: ['The Depot',   'B', 'B', 'B'],
      2: ['Feeders',     'B', 'S', 'B'],
      3: ['Mkt & Tech',  'S', 'S', 'B'],
      4: ['Tech Center', 'S', 'B', 'S'],
      5: ['Ore Mine',    'B', 'S', 'S'],
      6: ['The Atrium',  'S', 'S', 'S'],
      7: ['Weapons',     'S', 'B', 'B'],
      8: ['Trading Co.', 'B', 'B', 'S'],
      9: ['Stardock',    'D', 'D', 'D']
    },
    COMMODITIES: ['Fuel Ore', 'Organics', 'Equipment'],
    SHIPS: [
      { name: 'Merchant Cruiser', holds: 20, fighters: 10, shields: 100, cost: 0 },
      { name: 'Scout Marauder',   holds: 10, fighters: 25, shields: 200, cost: 25000 },
      { name: 'Merchant Prince',  holds: 50, fighters: 20, shields: 300, cost: 75000 },
      { name: 'Imperial Fighter', holds: 5,  fighters: 75, shields: 400, cost: 100000 }
    ],
    FUEL: { MAX: 400, JUMP_COST: 1, ORE_TO_FUEL: 2, STARDOCK_CR_PER_FUEL: 8 },
    PRICES: { FIGHTER: 50, SHIELD_PT: 10, HOLO: 5000 },
    DOCK_SELL: [20, 18, 25],     // stardock auto-sell rates per commodity
    LOG_MAX: 200
  };

  TW.shipByName = function (name) {
    for (var i = 0; i < TW.DATA.SHIPS.length; i++)
      if (TW.DATA.SHIPS[i].name === name) return TW.DATA.SHIPS[i];
    return TW.DATA.SHIPS[0];
  };

  // ---------- spectral colors ----------
  var SPECTRAL = {
    O: [153, 179, 255], B: [179, 204, 255], A: [230, 242, 255], F: [255, 255, 224],
    G: [255, 242, 179], K: [255, 191, 115], M: [255, 115, 64], D: [204, 230, 255]
  };
  TW.spectralRGB = function (spect) {
    var c = (spect && spect[0]) ? spect[0].toUpperCase() : 'G';
    return SPECTRAL[c] || SPECTRAL.G;
  };
  TW.spectralColor = function (spect) {
    var c = TW.spectralRGB(spect);
    function h(n) { return ('0' + n.toString(16)).slice(-2); }
    return '#' + h(c[0]) + h(c[1]) + h(c[2]);
  };

  // ---------- galaxy (static: stars + lanes; world content lives in state) ----------
  TW.buildGalaxy = function (starData) {
    starData = starData || window.TW_STARS;
    var g = { stars: {}, warps: {}, size: 0, meta: starData.meta, stardock: 2 };
    starData.stars.forEach(function (st) { g.stars[st.sector] = st; });
    g.size = starData.stars.length;
    Object.keys(starData.warps).forEach(function (k) { g.warps[+k] = starData.warps[k]; });
    Object.keys(g.stars).forEach(function (k) {
      var n = (g.stars[k].name || '').toLowerCase();
      if (n.indexOf('rigil') >= 0 || n.indexOf('toliman') >= 0 || n.indexOf('proxima') >= 0)
        g.stardock = +k;
    });
    return g;
  };

  TW.starName = function (g, sector) {
    var st = g.stars[sector];
    return st ? st.name : 'Sector ' + sector;
  };

  TW.warpDist = function (g, a, b) {
    var sa = g.stars[a] || {}, sb = g.stars[b] || {};
    var dx = (sa.x || 0) - (sb.x || 0), dy = (sa.y || 0) - (sb.y || 0), dz = (sa.z || 0) - (sb.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz) * 3.26156;   // parsecs -> LY
  };

  // ---------- procedural world content (seeded, deterministic) ----------
  function spectPortClass(spect, r) {
    var c = (spect && spect[0]) ? spect[0].toUpperCase() : 'G';
    if (c === 'O' || c === 'B') return choice(r, [3, 4, 6]);
    if (c === 'A' || c === 'F') return choice(r, [2, 5, 7]);
    if (c === 'G') return choice(r, [1, 2, 8]);
    if (c === 'K') return choice(r, [5, 7, 8]);
    if (c === 'M') return choice(r, [1, 5, 8]);
    if (c === 'D') return choice(r, [3, 4, 6]);
    return randint(r, 1, 8);
  }

  function buildContent(g) {
    var world = { ports: {}, planets: {}, pirates: {} };
    Object.keys(g.stars).forEach(function (k) {
      var sector = +k;
      if (sector === 1) return;                       // Sol = Fed HQ, kept clear
      var st = g.stars[k];
      var r = TW.rng('sec:' + ((st.hyg_id ^ 0xC0FFEE) >>> 0));

      if (r() < 0.65) {
        var cid = spectPortClass(st.spect, r);
        var cap = [randint(r, 500, 2000), randint(r, 500, 2000), randint(r, 500, 2000)];
        var stock = [], prices = [];
        for (var i = 0; i < 3; i++) {
          var t = TW.DATA.PORT_CLASSES[cid][i + 1];
          stock.push(t !== '-' ? randint(r, 100, cap[i]) : 0);
          if (t === 'B') prices.push(randint(r, 20, 60));
          else if (t === 'S') prices.push(randint(r, 5, 40));
          else prices.push(0);
        }
        world.ports[sector] = { sector: sector, classId: cid, stock: stock, prices: prices, cap: cap };
      }
      if (r() < 0.20) {
        var sfx = ['II', 'III', 'IV', 'V', 'b', 'c', 'Prime', 'Station'];
        world.planets[sector] = {
          sector: sector, name: st.name + ' ' + choice(r, sfx),
          colonists: randint(r, 50, 500), ore: randint(r, 0, 500),
          organics: randint(r, 0, 500), fighters: 0, owner: null
        };
      }
      if (r() < 0.18) world.pirates[sector] = randint(r, 5, 150);
    });
    world.ports[g.stardock] = { sector: g.stardock, classId: 9, stock: [0, 0, 0], prices: [0, 0, 0], cap: [0, 0, 0] };
    return world;
  }

  // ---------- port helpers ----------
  TW.portName = function (port) { return TW.DATA.PORT_CLASSES[port.classId][0]; };
  TW.tradeType = function (port, i) { return TW.DATA.PORT_CLASSES[port.classId][i + 1]; };
  TW.restockPort = function (port, rand) {
    rand = rand || Math.random;
    for (var i = 0; i < 3; i++) {
      var t = TW.tradeType(port, i);
      if (t === 'B' || t === 'S')
        port.stock[i] = Math.min(port.stock[i] + randint(rand, 3, 15), port.cap[i]);
    }
  };

  // ---------- state ----------
  TW.newGame = function (galaxy, name) {
    var world = buildContent(galaxy);
    var s = {
      v: 1, name: name || 'Commander',
      sector: 1, credits: 1000, fuel: TW.DATA.FUEL.MAX,
      ship: 'Merchant Cruiser', holdsTotal: 20, fighters: 10, shields: 100,
      ore: 0, organics: 0, equipment: 0,
      kills: 0, deaths: 0, hasHolo: false,
      visited: { 1: true }, portsVisited: {}, scanned: {},
      jumps: 0, log: [], course: [],
      ports: world.ports, planets: world.planets, pirates: world.pirates
    };
    TW.logEvent(s, 'system', 'Departed Federation HQ, Sol.');
    return s;
  };

  TW.holdsUsed = function (s) { return s.ore + s.organics + s.equipment; };
  TW.holdsFree = function (s) { return s.holdsTotal - TW.holdsUsed(s); };
  TW.cargo = function (s, i) { return [s.ore, s.organics, s.equipment][i]; };
  function addCargo(s, i, n) {
    if (i === 0) s.ore += n; else if (i === 1) s.organics += n; else s.equipment += n;
  }

  TW.sectorInfo = function (g, s, sector) {
    var st = g.stars[sector] || {};
    return {
      sector: sector, name: TW.starName(g, sector),
      spect: st.spect || 'G', distLy: st.dist_ly || 0,
      x: st.x || 0, y: st.y || 0, z: st.z || 0, hygId: st.hyg_id || 0,
      port: s.ports[sector] || null, planet: s.planets[sector] || null,
      pirates: s.pirates[sector] || 0, warps: g.warps[sector] || []
    };
  };

  // ---------- captain's log ----------
  TW.logEvent = function (s, kind, text) {
    if (text.length > 64) text = text.slice(0, 63) + '…';
    s.log.push({ n: s.jumps, kind: kind, text: text });
    while (s.log.length > TW.DATA.LOG_MAX) s.log.shift();
  };

  // ---------- movement / fuel ----------
  TW.move = function (g, s, dest, rand) {
    rand = rand || Math.random;
    var lanes = g.warps[s.sector] || [];
    if (lanes.indexOf(dest) < 0) return { ok: false, reason: 'NO WARP LANE' };
    if (s.fuel < TW.DATA.FUEL.JUMP_COST) return { ok: false, reason: 'FUEL EXHAUSTED' };
    s.sector = dest;
    s.visited[dest] = true;
    s.fuel -= TW.DATA.FUEL.JUMP_COST;
    s.jumps++;
    if (s.course.length && s.course[0] === dest) s.course.shift();
    var port = s.ports[dest];
    if (port) TW.restockPort(port, rand);
    TW.logEvent(s, 'jump', 'Jump ' + s.jumps + ': ' + TW.starName(g, dest) +
      ' [' + dest + ']  fuel ' + s.fuel);
    return { ok: true, pirates: s.pirates[dest] || 0 };
  };

  TW.convertFuelOre = function (s, units) {
    var F = TW.DATA.FUEL;
    var need = Math.ceil((F.MAX - s.fuel) / F.ORE_TO_FUEL);
    units = Math.max(0, Math.min(units | 0, s.ore, need));
    if (units === 0) return { ok: false, used: 0, gained: 0 };
    var before = s.fuel;
    s.fuel = Math.min(F.MAX, s.fuel + units * F.ORE_TO_FUEL);
    s.ore -= units;
    var gained = s.fuel - before;
    TW.logEvent(s, 'system', 'Converted ' + units + ' Fuel Ore → ' + gained + ' fuel.');
    return { ok: true, used: units, gained: gained };
  };

  TW.isStranded = function (s) { return s.fuel < TW.DATA.FUEL.JUMP_COST && s.ore === 0; };

  // ---------- trade (game_core.py parity; perspective labels are player's) ----------
  TW.maxTrade = function (s, port, i) {
    if (!port) return 0;
    var t = TW.tradeType(port, i);
    if (t === 'B') return Math.min(TW.cargo(s, i), port.stock[i]);       // port buys -> player SELLS here
    if (t === 'S') {                                                      // port sells -> player BUYS here
      var price = port.prices[i] || 1;
      return Math.min(port.stock[i], TW.holdsFree(s), Math.floor(s.credits / price));
    }
    return 0;
  };

  TW.trade = function (s, port, i, amount) {
    if (!port) return { ok: false, reason: 'No port here' };
    var t = TW.tradeType(port, i);
    if (t !== 'B' && t !== 'S') return { ok: false, reason: 'Not traded here' };
    amount = Math.max(0, Math.min(amount | 0, TW.maxTrade(s, port, i)));
    if (amount === 0) return { ok: false, reason: 'Nothing to trade' };
    var value = amount * port.prices[i];
    var verb;
    if (t === 'B') { addCargo(s, i, -amount); s.credits += value; verb = 'Sold'; }
    else { addCargo(s, i, amount); s.credits -= value; verb = 'Bought'; }
    port.stock[i] -= amount;
    s.portsVisited[port.sector] = true;
    TW.logEvent(s, 'trade', verb + ' ' + amount + ' ' + TW.DATA.COMMODITIES[i] +
      ' for ' + value + ' cr.');
    return { ok: true, verb: verb, amount: amount, name: TW.DATA.COMMODITIES[i], credits: value };
  };

  // ---------- combat (main.py do_attack / _auto_pirate_ambush) ----------
  function deathSequence(g, s) {
    s.ore = s.organics = s.equipment = 0;
    s.shields = 100;
    s.credits = Math.max(100, s.credits - 500);
    s.deaths++;
    s.sector = 1;
    TW.logEvent(s, 'combat', 'SHIELDS DOWN — cargo lost, emergency warp to Sol.');
  }

  // Fires automatically on arrival in a pirate sector: one exchange of fire.
  TW.resolveAmbush = function (g, s, rand) {
    rand = rand || Math.random;
    var fc = s.pirates[s.sector];
    if (!fc) return null;
    var pDmg = Math.max(1, Math.floor(s.fighters * uniform(rand, 0.5, 1.5)));
    var eDmg = Math.max(1, Math.floor(fc * uniform(rand, 0.3, 1.0)));
    var survivors = fc - pDmg;
    s.shields = Math.max(0, s.shields - eDmg);
    var res = { pDmg: pDmg, eDmg: eDmg, survivors: Math.max(0, survivors), bounty: 0, dead: false };
    if (survivors <= 0) {
      res.bounty = fc * randint(rand, 5, 15);
      s.credits += res.bounty;
      s.kills++;
      delete s.pirates[s.sector];
      TW.logEvent(s, 'combat', 'Ambush repelled! Pirates destroyed. +' + res.bounty + ' cr.');
    } else {
      s.pirates[s.sector] = survivors;
      if (s.shields <= 0) { res.dead = true; deathSequence(g, s); }
      else TW.logEvent(s, 'combat', 'Ambushed! -' + eDmg + ' shields. ' + survivors + ' hostiles remain.');
    }
    return res;
  };

  // Player-initiated attack: up to 10 rounds. Costs 1 fuel (was 1 turn).
  TW.resolveAttack = function (g, s, rand) {
    rand = rand || Math.random;
    var fc = s.pirates[s.sector];
    if (!fc) return { ok: false, reason: 'No enemies here' };
    if (s.fuel < TW.DATA.FUEL.JUMP_COST) return { ok: false, reason: 'FUEL EXHAUSTED' };
    s.fuel -= TW.DATA.FUEL.JUMP_COST;
    var original = fc, rounds = [], rnd = 0;
    while (fc > 0 && s.shields > 0 && rnd < 10) {
      rnd++;
      var pAtk = Math.max(1, Math.floor(s.fighters * uniform(rand, 0.6, 1.4)));
      var eAtk = Math.max(1, Math.floor(fc * uniform(rand, 0.3, 1.0)));
      fc = Math.max(0, fc - pAtk);
      s.shields = Math.max(0, s.shields - eAtk);
      rounds.push({ n: rnd, pAtk: pAtk, eAtk: eAtk, enemy: fc, shields: s.shields });
    }
    var res = { ok: true, rounds: rounds, outcome: 'stalemate', bounty: 0 };
    if (fc <= 0) {
      res.outcome = 'win';
      res.bounty = original * randint(rand, 5, 15);
      s.credits += res.bounty;
      s.kills++;
      delete s.pirates[s.sector];
      TW.logEvent(s, 'combat', 'VICTORY over ' + original + ' fighters. +' + res.bounty + ' cr.');
    } else {
      s.pirates[s.sector] = fc;
      if (s.shields <= 0) { res.outcome = 'dead'; deathSequence(g, s); }
      else TW.logEvent(s, 'combat', 'Broke off attack. ' + fc + ' hostiles remain.');
    }
    return res;
  };

  // ---------- stardock services (main.py _stardock) ----------
  TW.dock = {
    autoSell: function (s) {
      var earned = 0;
      for (var i = 0; i < 3; i++) {
        var qty = TW.cargo(s, i);
        if (qty > 0) { earned += qty * TW.DATA.DOCK_SELL[i]; addCargo(s, i, -qty); }
      }
      if (earned) {
        s.credits += earned;
        TW.logEvent(s, 'dock', 'Stardock bought all cargo: +' + earned + ' cr.');
      }
      return earned;
    },
    buyFighters: function (s, n) {
      n = Math.max(0, Math.min(n | 0, Math.floor(s.credits / TW.DATA.PRICES.FIGHTER)));
      if (!n) return 0;
      s.fighters += n; s.credits -= n * TW.DATA.PRICES.FIGHTER;
      TW.logEvent(s, 'dock', 'Bought ' + n + ' fighters.');
      return n;
    },
    buyShields: function (s, n) {
      n = Math.max(0, Math.min(n | 0, Math.floor(s.credits / TW.DATA.PRICES.SHIELD_PT)));
      if (!n) return 0;
      s.shields += n; s.credits -= n * TW.DATA.PRICES.SHIELD_PT;
      TW.logEvent(s, 'dock', 'Bought ' + n + ' shield points.');
      return n;
    },
    buyHolo: function (s) {
      if (s.hasHolo) return { ok: false, reason: 'Already installed' };
      if (s.credits < TW.DATA.PRICES.HOLO) return { ok: false, reason: 'Insufficient credits' };
      s.credits -= TW.DATA.PRICES.HOLO;
      s.hasHolo = true;
      TW.logEvent(s, 'dock', 'Holo Scanner installed.');
      return { ok: true };
    },
    refuel: function (s, units) {
      var F = TW.DATA.FUEL;
      units = Math.max(0, Math.min(units | 0, F.MAX - s.fuel, Math.floor(s.credits / F.STARDOCK_CR_PER_FUEL)));
      if (!units) return 0;
      s.fuel += units; s.credits -= units * F.STARDOCK_CR_PER_FUEL;
      TW.logEvent(s, 'dock', 'Refueled +' + units + '.');
      return units;
    },
    upgradeShip: function (s, name) {
      var ship = TW.shipByName(name);
      if (ship.name === s.ship) return { ok: false, reason: 'Already own it' };
      if (s.credits < ship.cost) return { ok: false, reason: 'Insufficient credits' };
      s.credits -= ship.cost;
      s.ship = ship.name;
      s.holdsTotal = ship.holds;
      s.fighters = ship.fighters;
      s.shields = ship.shields;
      // Jettison excess cargo: ore first, then organics, then equipment
      var order = ['ore', 'organics', 'equipment'];
      for (var i = 0; i < order.length && TW.holdsUsed(s) > s.holdsTotal; i++) {
        var over = TW.holdsUsed(s) - s.holdsTotal;
        s[order[i]] = Math.max(0, s[order[i]] - over);
      }
      TW.logEvent(s, 'dock', 'Upgraded to ' + ship.name + '!');
      return { ok: true };
    },
    // Federation HQ (Sol): free refuel + shield repair (main.py do_dock)
    fedResupply: function (s) {
      var did = false;
      if (s.fuel < TW.DATA.FUEL.MAX) { s.fuel = TW.DATA.FUEL.MAX; did = true; }
      if (s.shields < 100) { s.shields = 100; did = true; }
      if (did) TW.logEvent(s, 'dock', 'Fed HQ: fuel + shields restored.');
      return did;
    }
  };

  // ---------- planets (main.py do_planet) ----------
  TW.claimPlanet = function (s) {
    var pl = s.planets[s.sector];
    if (!pl) return { ok: false, reason: 'No planet here' };
    if (pl.owner) return { ok: false, reason: 'Owned by ' + pl.owner };
    pl.owner = s.name;
    TW.logEvent(s, 'system', 'Claimed ' + pl.name + '!');
    return { ok: true };
  };
  TW.dropCargo = function (s) {
    var pl = s.planets[s.sector];
    if (!pl || pl.owner !== s.name) return { ok: false, reason: 'Not your planet' };
    var dropped = [];
    if (s.ore) { pl.ore += s.ore; dropped.push(s.ore + ' ore'); s.ore = 0; }
    if (s.organics) { pl.organics += s.organics; dropped.push(s.organics + ' org'); s.organics = 0; }
    if (!dropped.length) return { ok: false, reason: 'No droppable cargo' };
    TW.logEvent(s, 'system', 'Dropped ' + dropped.join(', ') + ' on ' + pl.name + '.');
    return { ok: true, dropped: dropped };
  };

  // ---------- scanners (main.py _density / _holo_scan) ----------
  TW.densityValue = function (s, sector) {
    var d = 100;
    if (s.ports[sector]) d += 300;
    if (s.planets[sector]) d += 200;
    if (s.pirates[sector]) d += s.pirates[sector] * 3;
    if (sector === 1) d += 100;
    return d;
  };
  // Design law: unvisited & unscanned sectors read '???'
  TW.density = function (s, sector) {
    if (s.visited[sector]) return TW.densityValue(s, sector);
    if (s.scanned[sector] !== undefined) return s.scanned[sector];
    return '???';
  };

  TW.holoScan = function (g, s) {
    if (!s.hasHolo) return { ok: false, reason: 'No Holo Scanner installed' };
    var out = [];
    (g.warps[s.sector] || []).forEach(function (sec) {
      var d = TW.densityValue(s, sec);
      s.scanned[sec] = d;
      var port = s.ports[sec] || null;
      out.push({
        sector: sec, dist: TW.warpDist(g, s.sector, sec), density: d,
        port: port ? { name: TW.portName(port), classId: port.classId } : null,
        planet: s.planets[sec] ? s.planets[sec].name : null,
        pirates: s.pirates[sec] || 0, isHQ: sec === 1, visited: !!s.visited[sec]
      });
    });
    TW.logEvent(s, 'scan', 'Holo scan: ' + out.length + ' adjacent sectors mapped.');
    return { ok: true, reports: out };
  };

  // ---------- pathfinding (main.py _bfs_distance, extended to full path) ----------
  TW.bfsRoute = function (g, from, to, visitedOnly, s) {
    if (from === to) return [from];
    var seen = {}; seen[from] = true;
    var parent = {};
    var queue = [from];
    while (queue.length) {
      var cur = queue.shift();
      var lanes = g.warps[cur] || [];
      for (var i = 0; i < lanes.length; i++) {
        var nb = lanes[i];
        if (seen[nb]) continue;
        // visitedOnly: route through charted space; destination itself may be new
        if (visitedOnly && nb !== to && !(s && s.visited[nb])) continue;
        seen[nb] = true;
        parent[nb] = cur;
        if (nb === to) {
          var path = [to];
          while (path[0] !== from) path.unshift(parent[path[0]]);
          return path;
        }
        queue.push(nb);
      }
    }
    return null;
  };

  // ---------- save / load ----------
  TW.serialize = function (s) { return JSON.stringify(s); };
  TW.deserialize = function (str) {
    try {
      var s = JSON.parse(str);
      if (!s || s.v !== 1 || typeof s.sector !== 'number' || !s.ports || !s.visited) return null;
      return s;
    } catch (e) { return null; }
  };
})();
