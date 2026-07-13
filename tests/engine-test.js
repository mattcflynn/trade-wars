// Headless engine tests — run with: node tests/engine-test.js
// Same harness style as betrayers/tests/engine-test.js.
global.window = global;

require('../js/data-stars.js');
require('../js/tw-core.js');

var TW = window.TW;
var failures = [];
function check(cond, msg) {
  if (cond) console.log('  ok  ' + msg);
  else { console.log('FAIL  ' + msg); failures.push(msg); }
}
// deterministic rand: cycles through a fixed sequence
function fixedRand(seq) {
  var i = 0;
  return function () { return seq[i++ % seq.length]; };
}

var g = TW.buildGalaxy(window.TW_STARS);

// ---------- galaxy ----------
console.log('\n[galaxy]');
check(g.size === 982, 'loads 982 stars');
check(g.stars[1] && (g.stars[1].name || '').toLowerCase().indexOf('sol') >= 0, 'sector 1 is Sol');
check(g.stardock !== 1 && g.stars[g.stardock], 'stardock sector exists (Alpha Centauri group): ' + TW.starName(g, g.stardock));
var bidi = true, maxLane = 0;
Object.keys(g.warps).forEach(function (k) {
  g.warps[+k].forEach(function (nb) {
    if ((g.warps[nb] || []).indexOf(+k) < 0) bidi = false;
    maxLane = Math.max(maxLane, TW.warpDist(g, +k, nb));
  });
});
check(bidi, 'all warp lanes bidirectional');
check(maxLane <= 10.0001, 'all lanes <= 10 LY (max ' + maxLane.toFixed(2) + ')');

// ---------- content determinism + ratios ----------
console.log('\n[content]');
var s1 = TW.newGame(g), s2 = TW.newGame(g);
check(JSON.stringify(s1.ports) === JSON.stringify(s2.ports), 'port generation deterministic');
check(JSON.stringify(s1.planets) === JSON.stringify(s2.planets), 'planet generation deterministic');
check(JSON.stringify(s1.pirates) === JSON.stringify(s2.pirates), 'pirate generation deterministic');
var nPorts = Object.keys(s1.ports).length, nPlanets = Object.keys(s1.planets).length,
    nPirates = Object.keys(s1.pirates).length;
check(Math.abs(nPorts / 982 - 0.65) < 0.06, 'port ratio ~65% (' + nPorts + ')');
check(Math.abs(nPlanets / 982 - 0.20) < 0.05, 'planet ratio ~20% (' + nPlanets + ')');
check(Math.abs(nPirates / 982 - 0.18) < 0.05, 'pirate ratio ~18% (' + nPirates + ')');
check(s1.ports[g.stardock].classId === 9, 'stardock is class 9');
check(!s1.ports[1] && !s1.pirates[1], 'Sol has no port/pirates (Fed HQ)');

// ---------- move / fuel ----------
console.log('\n[move/fuel]');
var s = TW.newGame(g);
var lanes = g.warps[1];
check(lanes.length > 0, 'Sol has warp lanes (' + lanes.length + ')');
var r = TW.move(g, s, lanes[0], fixedRand([0.5]));
check(r.ok && s.sector === lanes[0], 'valid jump moves player');
check(s.fuel === 399, 'jump burns 1 fuel (400->399)');
check(s.visited[lanes[0]], 'destination marked visited');
var bad = TW.move(g, s, 99999, fixedRand([0.5]));
check(!bad.ok && s.fuel === 399, 'invalid lane rejected without fuel cost');
s.fuel = 0;
check(!TW.move(g, s, 1, fixedRand([0.5])).ok, 'no fuel blocks jump');
s.ore = 3;
var cv = TW.convertFuelOre(s, 2);
check(cv.ok && cv.used === 2 && s.fuel === 4 && s.ore === 1, 'ore->fuel: 2 ore = 4 fuel');
s.fuel = 399;
cv = TW.convertFuelOre(s, 5);
check(s.fuel === 400 && cv.used === 1, 'convert caps at tank max, uses minimal ore');
check(!TW.isStranded(s), 'not stranded with fuel');
s.fuel = 0; s.ore = 0;
check(TW.isStranded(s), 'stranded at 0 fuel + 0 ore');

// ---------- trade ----------
console.log('\n[trade]');
s = TW.newGame(g);
// find a port that SELLS commodity i (player buys) and one that BUYS
var sellPort = null, sellI = -1, buyPort = null, buyI = -1;
Object.keys(s.ports).forEach(function (k) {
  var p = s.ports[k];
  for (var i = 0; i < 3; i++) {
    var t = TW.tradeType(p, i);
    if (t === 'S' && !sellPort) { sellPort = p; sellI = i; }
    if (t === 'B' && !buyPort) { buyPort = p; buyI = i; }
  }
});
check(sellPort && buyPort, 'found test ports');
var maxBuy = TW.maxTrade(s, sellPort, sellI);
check(maxBuy <= TW.holdsFree(s) && maxBuy <= Math.floor(s.credits / sellPort.prices[sellI]),
  'maxTrade respects holds + credits');
var creditsBefore = s.credits, stockBefore = sellPort.stock[sellI];
var tr = TW.trade(s, sellPort, sellI, 5);
check(tr.ok && tr.verb === 'Bought', 'player BUYS where port sells');
check(s.credits === creditsBefore - 5 * sellPort.prices[sellI], 'credits debited exactly');
check(sellPort.stock[sellI] === stockBefore - 5, 'port stock debited');
check(TW.holdsUsed(s) === 5, 'cargo loaded');
// sell it somewhere that buys the same commodity
var buyer = null;
Object.keys(s.ports).forEach(function (k) {
  if (!buyer && TW.tradeType(s.ports[k], sellI) === 'B' && s.ports[k].stock[sellI] >= 5) buyer = s.ports[k];
});
check(!!buyer, 'found buyer port');
creditsBefore = s.credits;
tr = TW.trade(s, buyer, sellI, 999);
check(tr.ok && tr.verb === 'Sold' && tr.amount === 5, 'sell clamps to cargo (player SELLS where port buys)');
check(s.credits === creditsBefore + 5 * buyer.prices[sellI], 'credits credited exactly');
check(TW.holdsUsed(s) === 0, 'holds emptied');
check(!TW.trade(s, buyer, sellI, 5).ok, 'selling with empty holds rejected');

// ---------- combat ----------
console.log('\n[combat]');
s = TW.newGame(g);
var pirateSector = +Object.keys(s.pirates)[0];
s.sector = pirateSector;
s.fighters = 10000;  // guarantee win
var atk = TW.resolveAttack(g, s, fixedRand([0.5]));
check(atk.ok && atk.outcome === 'win', 'overwhelming attack wins');
check(atk.bounty > 0 && !s.pirates[pirateSector] && s.kills === 1, 'bounty paid, sector cleared, kill counted');
var atk2 = TW.resolveAttack(g, s, fixedRand([0.5]));
check(!atk2.ok, 'attack with no enemies rejected');
// death path
s = TW.newGame(g);
pirateSector = null;
Object.keys(s.pirates).forEach(function (k) { if (!pirateSector && s.pirates[k] > 100) pirateSector = +k; });
s.sector = pirateSector;
s.fighters = 1; s.shields = 1; s.credits = 1000;
atk = TW.resolveAttack(g, s, fixedRand([0.9]));
check(atk.outcome === 'dead', 'weak ship vs strong pirates dies');
check(s.sector === 1 && s.shields === 100 && s.deaths === 1 && s.credits === 500,
  'death: warped to Sol, shields reset, -500 cr');
// determinism
s = TW.newGame(g); s2 = TW.newGame(g);
var ps = +Object.keys(s.pirates)[0];
s.sector = ps; s2.sector = ps;
var a1 = TW.resolveAttack(g, s, fixedRand([0.1, 0.7, 0.4]));
var a2 = TW.resolveAttack(g, s2, fixedRand([0.1, 0.7, 0.4]));
check(JSON.stringify(a1.rounds) === JSON.stringify(a2.rounds), 'combat deterministic under fixed rand');
// ambush
s = TW.newGame(g);
s.sector = ps;
var shieldsBefore = s.shields;
var am = TW.resolveAmbush(g, s, fixedRand([0.5]));
check(am && (s.shields < shieldsBefore || am.bounty > 0), 'ambush resolves an exchange');

// ---------- stardock ----------
console.log('\n[stardock]');
s = TW.newGame(g);
s.ore = 5; s.organics = 3; s.equipment = 2;
var earned = TW.dock.autoSell(s);
check(earned === 5 * 20 + 3 * 18 + 2 * 25, 'auto-sell at 20/18/25 rates');
check(TW.holdsUsed(s) === 0, 'auto-sell empties holds');
s.credits = 1000;
check(TW.dock.buyFighters(s, 5) === 5 && s.fighters === 15 && s.credits === 750, 'buy fighters 50cr each');
check(TW.dock.buyShields(s, 10) === 10 && s.shields === 110 && s.credits === 650, 'buy shields 10cr each');
check(TW.dock.buyFighters(s, 999) === 13 && s.credits === 0, 'fighter purchase clamps to credits');
s.credits = 4999;
check(!TW.dock.buyHolo(s).ok, 'holo rejected under 5000cr');
s.credits = 5000;
check(TW.dock.buyHolo(s).ok && s.hasHolo && s.credits === 0, 'holo purchase');
s.credits = 200; s.fuel = 390;
check(TW.dock.refuel(s, 999) === 10 && s.fuel === 400 && s.credits === 120, 'refuel clamps to tank, 8cr each');
s.credits = 200000; s.ore = 15; s.organics = 5;
var up = TW.dock.upgradeShip(s, 'Imperial Fighter');
check(up.ok && s.holdsTotal === 5 && s.fighters === 75 && s.shields === 400, 'upgrade swaps ship stats');
check(TW.holdsUsed(s) <= s.holdsTotal, 'excess cargo jettisoned on downgrade of holds');
check(!TW.dock.upgradeShip(s, 'Imperial Fighter').ok, 'cannot rebuy owned ship');
s.fuel = 100; s.shields = 50;
check(TW.dock.fedResupply(s) && s.fuel === 400 && s.shields === 100, 'Fed HQ resupply restores fuel+shields');

// ---------- planets ----------
console.log('\n[planets]');
s = TW.newGame(g);
var plSector = +Object.keys(s.planets)[0];
s.sector = plSector;
check(TW.claimPlanet(s).ok && s.planets[plSector].owner === s.name, 'claim unowned planet');
check(!TW.claimPlanet(s).ok, 'cannot re-claim');
s.ore = 7; s.organics = 2; s.equipment = 4;
var oreBefore = s.planets[plSector].ore;
var dr = TW.dropCargo(s);
check(dr.ok && s.ore === 0 && s.organics === 0 && s.equipment === 4, 'drop leaves equipment aboard');
check(s.planets[plSector].ore === oreBefore + 7, 'planet received ore');

// ---------- scanners / gating ----------
console.log('\n[scanners]');
s = TW.newGame(g);
check(TW.density(s, 1) >= 200, 'visited sector density is numeric');
var unv = null;
Object.keys(g.stars).forEach(function (k) { if (!unv && !s.visited[+k]) unv = +k; });
check(TW.density(s, unv) === '???', 'unvisited density is ???');
check(!TW.holoScan(g, s).ok, 'holo scan requires scanner');
s.hasHolo = true;
var hs = TW.holoScan(g, s);
check(hs.ok && hs.reports.length === g.warps[1].length, 'holo scan reports all adjacent sectors');
check(TW.density(s, g.warps[1][0]) !== '???', 'scanned sector density revealed');

// ---------- routing ----------
console.log('\n[routing]');
var far = null;
Object.keys(g.stars).forEach(function (k) {
  if (!far && (g.stars[k].dist_ly || 0) > 30) far = +k;
});
var route = TW.bfsRoute(g, 1, far, false, null);
check(route && route[0] === 1 && route[route.length - 1] === far, 'BFS finds route Sol -> far star');
var laneOk = true;
for (var i = 0; i + 1 < route.length; i++)
  if ((g.warps[route[i]] || []).indexOf(route[i + 1]) < 0) laneOk = false;
check(laneOk, 'every route hop is a real lane');
check(TW.bfsRoute(g, 1, 1, false, null).length === 1, 'route to self is [self]');

// ---------- log ----------
console.log('\n[log]');
s = TW.newGame(g);
for (var i = 0; i < 250; i++) TW.logEvent(s, 'system', 'entry ' + i);
check(s.log.length === 200, 'log ring caps at 200');
check(s.log[s.log.length - 1].text === 'entry 249', 'log keeps newest entries');
TW.logEvent(s, 'system', new Array(100).join('x'));
check(s.log[s.log.length - 1].text.length <= 64, 'log lines capped at 64 chars');

// ---------- save/load ----------
console.log('\n[save/load]');
s = TW.newGame(g);
TW.move(g, s, g.warps[1][0], fixedRand([0.5]));
var restored = TW.deserialize(TW.serialize(s));
check(JSON.stringify(restored) === JSON.stringify(s), 'serialize/deserialize round-trip');
check(TW.deserialize('garbage{{{') === null, 'garbage save returns null');
check(TW.deserialize('{"v":99}') === null, 'wrong version returns null');

// ---------- result ----------
console.log('\n' + (failures.length ? failures.length + ' FAILURES' : 'ALL TESTS PASSED'));
process.exit(failures.length ? 1 : 0);
