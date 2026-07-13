// Trade Wars — game.js
// Shell: 640x360 internal resolution, integer-scaled for crisp pixels.
// The flight state is three head positions on a 1920px virtual strip:
//   NAV (left) · COCKPIT (center) · SYSTEMS (right)
// Q/E (or Esc) turn the pilot's head; the camera pans with hull-strut
// continuity so it reads as one cockpit.
(function () {
  'use strict';
  var TW = window.TW;
  var P = TW.PALETTE;
  var W = 640, H = 360;

  var canvas, ctx;

  // ---------------- input (update-phase handling only) ----------------
  var keys = {}, pressed = {};
  window.addEventListener('keydown', function (e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].indexOf(e.code) >= 0) e.preventDefault();
    if (!keys[e.code]) pressed[e.code] = true;
    keys[e.code] = true;
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });

  // ---------------- game object ----------------
  var game = {
    state: 'title',
    t: 0,
    galaxy: null,
    st: null,             // player/world state (tw-core)
    // head turn
    head: 1, camX: W,     // lane 0 nav, 1 cockpit, 2 systems
    // cockpit
    warpSel: 0,
    hailT: 0, lastLogLen: 0,
    // systems console
    sysTab: 0, sysSel: 0, logScroll: 0, tradeQty: [1, 1, 1],
    // jump / combat payloads
    jumpT: 0, jumpDest: 0, jumpResult: null,
    combat: null, ambush: null,
    // ui
    flashMsg: '', flashUntil: 0,
    menuIdx: 0,
    _simEnter: false
  };
  TW.game = game;

  game.hit = function (code) {
    if (code === 'Enter' && game._simEnter) return true;
    return !!pressed[code];
  };
  game.held = function (code) { return !!keys[code]; };
  game.sfx = function (name, arg) { if (TW.sfx) TW.sfx(name, arg); };
  game.flash = function (msg) { game.flashMsg = msg; game.flashUntil = game.t + 120; };
  game.save = function () {
    try { localStorage.setItem('TW_save', TW.serialize(game.st)); } catch (e) {}
  };
  game.lookTo = function (lane) {
    if (game.state !== 'flight') return;
    game.head = Math.max(0, Math.min(2, lane));
    game.sfx('click');
  };

  // ---------------- mouse hotspots ----------------
  var hotspots = [], hotspotsPrev = [], click = null, curLane = 1;
  game.hotspot = function (x, y, w, h, act) {
    hotspots.push({ x: x, y: y, w: w, h: h, act: act, lane: curLane });
  };
  function handleClick() {
    if (!click) return;
    var c = click; click = null;
    for (var i = 0; i < hotspotsPrev.length; i++) {
      var hs = hotspotsPrev[i];
      var sx = hs.x + hs.lane * W - game.camX;   // strip -> screen space
      if (c.x >= sx && c.x < sx + hs.w && c.y >= hs.y && c.y < hs.y + hs.h) {
        if (hs.act === 'engage') {
          pressed['Enter'] = true;
        } else if (hs.act.indexOf('sysrow:') === 0) {
          var idx = +hs.act.slice(7);
          if (game.sysSel === idx) game._simEnter = true;   // second click executes
          else game.sysSel = idx;
          game.sfx('click');
        }
        return;
      }
    }
  }

  // ---------------- jump ----------------
  game.startJump = function (dest) {
    game.jumpDest = dest;
    game.jumpT = 0;
    game.jumpResult = null;
    game.state = 'jump';
    game.sfx('jumpCharge');
  };

  function updateJump() {
    game.jumpT++;
    if (game.jumpT === 22) {
      game.jumpResult = TW.move(game.galaxy, game.st, game.jumpDest);
      game.sfx('jumpEngage');
    }
    if (game.jumpT >= 48) {
      game.state = 'flight';
      game.warpSel = 0;
      // fly the plotted course: preselect the next hop
      if (game.st.course.length) {
        var idx = (game.galaxy.warps[game.st.sector] || []).indexOf(game.st.course[0]);
        if (idx >= 0) game.warpSel = idx;
      }
      game.sfx('arrive');
      // pirates fire first on arrival (auto ambush, as in the terminal edition)
      if (game.jumpResult && game.jumpResult.ok && game.jumpResult.pirates) {
        game.sfx('alarm');
        game.ambush = TW.resolveAmbush(game.galaxy, game.st);
        if (game.ambush && game.ambush.dead) game.state = 'dead';
      }
      game.save();
      if (game.state === 'flight' && isGameOver()) game.state = 'gameover';
    }
  }

  // ---------------- combat ----------------
  game.startCombat = function () {
    var res = TW.resolveAttack(game.galaxy, game.st);
    if (!res.ok) { game.flash(res.reason.toUpperCase()); game.sfx('deny'); return; }
    game.combat = { res: res, shown: 0, autoT: game.t };
    game.state = 'combat';
    game.sfx('laser');
  };

  function updateCombat() {
    var c = game.combat;
    var advance = game.hit('Space') || game.hit('Enter') || game.t - c.autoT > 26;
    if (!advance) return;
    c.autoT = game.t;
    if (c.shown < c.res.rounds.length) {
      c.shown++;
      game.sfx(c.shown % 2 ? 'laser' : 'hit');
    } else if (game.hit('Space') || game.hit('Enter')) {
      game.state = c.res.outcome === 'dead' ? 'dead' : 'flight';
      if (c.res.outcome === 'win') game.sfx('bounty');
      game.combat = null;
      game.save();
      if (game.state === 'flight' && isGameOver()) game.state = 'gameover';
    }
  }

  function drawCombat() {
    drawFlight();
    var c = game.combat;
    ctx.fillStyle = 'rgba(10,14,18,0.55)';
    ctx.fillRect(0, 0, W, H);
    TW.panel(ctx, 140, 60, 360, 220, { title: 'COMBAT', titleColor: P.ink, border: P.red });
    var y = 92;
    for (var i = 0; i < c.shown; i++) {
      var r = c.res.rounds[i];
      TW.text(ctx, 'RND ' + r.n + '  FIRED ' + r.pAtk + '  TOOK ' + r.eAtk +
        '  ENEMY ' + r.enemy + '  SHLD ' + r.shields, 156, y, 8, i === c.shown - 1 ? P.white : P.grey);
      y += 13;
    }
    if (c.shown >= c.res.rounds.length) {
      var o = c.res.outcome;
      var msg = o === 'win' ? 'VICTORY! BOUNTY +' + c.res.bounty + ' CR'
        : o === 'dead' ? 'SHIELDS DOWN — DESTROYED'
          : 'STALEMATE — ENEMIES REMAIN';
      TW.text(ctx, msg, 320, y + 10, 8, o === 'win' ? P.green : o === 'dead' ? P.red : P.amber, 'center');
      TW.text(ctx, '[SPACE] CLOSE', 320, 266, 8, P.hull, 'center');
    } else {
      TW.text(ctx, '[SPACE] NEXT ROUND', 320, 266, 8, P.hull, 'center');
    }
  }

  // ---------------- game over conditions ----------------
  function isGameOver() {
    var st = game.st;
    if (!TW.isStranded(st)) return false;
    if (st.sector === 1) return false;   // Fed HQ resupplies for free
    var port = st.ports[st.sector];
    if (port && port.classId === 9 && st.credits >= TW.DATA.FUEL.STARDOCK_CR_PER_FUEL) return false;
    return true;
  }

  // ---------------- flight (three-headed main state) ----------------
  var VIEWS = [null, null, null];   // offscreen canvases, lazy
  function viewCanvas(i) {
    if (!VIEWS[i]) VIEWS[i] = TW.makeCanvas(W, H);
    return VIEWS[i];
  }
  var VIEW_MODULES = function () { return [TW.viewNav, TW.viewCockpit, TW.viewSystems]; };

  function updateFlight() {
    // head turn (Q/E always; arrows only meaningful in cockpit for look)
    if (game.hit('KeyQ')) game.lookTo(game.head - 1);
    if (game.hit('KeyE')) game.lookTo(game.head + 1);
    if (game.hit('Escape') && game.head !== 1) game.lookTo(1);

    var target = game.head * W;
    var settled = Math.abs(game.camX - target) < 1;
    game.camX += (target - game.camX) * 0.28;
    if (Math.abs(game.camX - target) < 1) game.camX = target;

    if (settled) VIEW_MODULES()[game.head].update(game);

    // soundtrack follows the threat level (play() no-ops if already playing)
    if (TW.music) TW.music.play(game.st.pirates[game.st.sector] ? 'danger' : 'cruise');

    // typewriter clock for comms
    if (game.st.log.length !== game.lastLogLen) {
      game.lastLogLen = game.st.log.length;
      game.hailT = game.t;
      game.sfx('hail');
    }
  }

  function drawFlight() {
    ctx.fillStyle = P.ink;
    ctx.fillRect(0, 0, W, H);
    var mods = VIEW_MODULES();
    for (var i = 0; i < 3; i++) {
      var laneX = i * W - game.camX;
      if (laneX > -W && laneX < W) {
        curLane = i;
        var vc = viewCanvas(i);
        mods[i].draw(vc.getContext('2d'), game);
        ctx.drawImage(vc, Math.round(laneX), 0);
      }
    }
    curLane = 1;
  }

  // ---------------- title ----------------
  function titleMenu() {
    var items = [{ label: 'LAUNCH NEW GAME', act: newGame }];
    if (localStorage.getItem('TW_save')) items.unshift({
      label: 'CONTINUE', act: function () {
        var st = TW.deserialize(localStorage.getItem('TW_save'));
        if (st) { game.st = st; enterFlight(); }
        else { game.flash('SAVE CORRUPT'); newGame(); }
      }
    });
    items.push({ label: 'SPRITE STUDIO', act: function () { location.href = 'sprite-editor.html'; } });
    return items;
  }

  function newGame() {
    game.st = TW.newGame(game.galaxy, 'Commander');
    game.save();
    enterFlight();
  }

  function enterFlight() {
    game.state = 'flight';
    game.head = 1; game.camX = W;
    game.warpSel = 0; game.sysTab = 0; game.sysSel = 0; game.logScroll = 0;
    game.lastLogLen = game.st.log.length;
    game.hailT = game.t;
  }

  function updateTitle() {
    var items = titleMenu();
    if (game.menuIdx >= items.length) game.menuIdx = 0;
    if (game.hit('ArrowUp')) { game.menuIdx = (game.menuIdx + items.length - 1) % items.length; game.sfx('click'); }
    if (game.hit('ArrowDown')) { game.menuIdx = (game.menuIdx + 1) % items.length; game.sfx('click'); }
    if (game.hit('Enter') || game.hit('Space')) { game.sfx('select'); if (TW.music) TW.music.start(); items[game.menuIdx].act(); }
  }

  function drawTitle() {
    ctx.fillStyle = P.ink;
    ctx.fillRect(0, 0, W, H);
    TW.starfield(ctx, 0, 0, W, H, 'title', game.t);
    TW.starDisc(ctx, W / 2, 96, 'G2V', game.t);
    var spr = TW.shipSprite('Merchant Cruiser');
    var sx = (game.t * 0.4) % (W + 200) - 100;
    ctx.drawImage(spr, sx, 140 + Math.sin(game.t * 0.02) * 6, spr.width * 2, spr.height * 2);

    TW.text(ctx, 'TRADE WARS', W / 2, 200, 24, P.green, 'center');
    TW.text(ctx, 'COCKPIT EDITION — 982 REAL STARS WITHIN 50 LY', W / 2, 220, 8, P.cyan, 'center');

    var items = titleMenu();
    for (var i = 0; i < items.length; i++) {
      var sel = i === game.menuIdx;
      TW.text(ctx, (sel ? '> ' : '  ') + items[i].label, W / 2, 258 + i * 18, 8,
        sel ? P.amber : P.grey, 'center');
    }
    TW.text(ctx, '↑↓ SELECT   ENTER CONFIRM', W / 2, H - 16, 8, P.hull, 'center');
  }

  // ---------------- dead / gameover ----------------
  function updateDead() {
    if (game.hit('Enter') || game.hit('Space')) {
      game.state = 'flight';
      enterFlight();
      game.save();
    }
  }
  function drawDead() {
    drawFlight();
    ctx.fillStyle = 'rgba(10,14,18,0.75)';
    ctx.fillRect(0, 0, W, H);
    TW.panel(ctx, 150, 110, 340, 130, { border: P.red, title: 'EMERGENCY', titleColor: P.red });
    TW.text(ctx, 'SHIELDS DOWN — SHIP LOST', 320, 150, 8, P.red, 'center');
    TW.text(ctx, 'CARGO JETTISONED - 500 CR LOST', 320, 168, 8, P.grey, 'center');
    TW.text(ctx, 'ESCAPE POD RECOVERED AT SOL', 320, 186, 8, P.grey, 'center');
    TW.text(ctx, '[ENTER] RESUME COMMAND', 320, 218, 8, P.amber, 'center');
  }

  function updateGameover() {
    if (game.hit('Enter') || game.hit('Space')) {
      localStorage.removeItem('TW_save');
      game.state = 'title';
      game.menuIdx = 0;
    }
  }
  function drawGameover() {
    drawFlight();
    ctx.fillStyle = 'rgba(10,14,18,0.85)';
    ctx.fillRect(0, 0, W, H);
    TW.panel(ctx, 150, 100, 340, 150, { border: P.amber, title: 'ADRIFT', titleColor: P.amber });
    var st = game.st;
    TW.text(ctx, 'FUEL EXHAUSTED — NO ORE ABOARD', 320, 140, 8, P.amber, 'center');
    TW.text(ctx, 'THE ' + st.ship.toUpperCase() + ' DRIFTS AMONG THE STARS', 320, 158, 8, P.grey, 'center');
    TW.text(ctx, 'JUMPS ' + st.jumps + ' · CHARTED ' + Object.keys(st.visited).length +
      ' · CREDITS ' + st.credits.toLocaleString(), 320, 182, 8, P.white, 'center');
    TW.text(ctx, '[ENTER] NEW COMMAND', 320, 226, 8, P.amber, 'center');
  }

  // ---------------- main loop ----------------
  var STATES = {
    title: { update: updateTitle, draw: drawTitle },
    flight: { update: updateFlight, draw: drawFlight },
    jump: { update: updateJump, draw: drawFlight },
    combat: { update: updateCombat, draw: drawCombat },
    dead: { update: updateDead, draw: drawDead },
    gameover: { update: updateGameover, draw: drawGameover }
  };

  function frame() {
    game.t++;
    if (pressed['KeyM'] && TW.toggleMute) TW.toggleMute();
    if (pressed['KeyN'] && TW.music) TW.music.toggle();
    handleClick();
    hotspotsPrev = hotspots; hotspots = [];
    var st = STATES[game.state];
    st.update();
    st = STATES[game.state];
    st.draw();
    pressed = {};
    game._simEnter = false;
    requestAnimationFrame(frame);
  }

  // ---------------- boot ----------------
  function fitCanvas() {
    var availW = window.innerWidth - 16;
    var availH = window.innerHeight - 90;
    var s = Math.min(availW / W, availH / H);
    // integer scale for crisp pixels; below 2x, half-steps (1x, 1.5x)
    // still map cleanly to physical pixels on 2x retina displays
    var k = Math.floor(s);
    if (k < 2) k = Math.max(1, Math.floor(s * 2) / 2);
    canvas.style.width = (W * k) + 'px';
    canvas.style.height = (H * k) + 'px';
  }

  window.addEventListener('load', function () {
    canvas = document.getElementById('game');
    canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    fitCanvas();
    window.addEventListener('resize', fitCanvas);
    if (document.fonts && document.fonts.load) document.fonts.load('8px ' + TW.FONT);

    canvas.addEventListener('mousedown', function (e) {
      var r = canvas.getBoundingClientRect();
      click = {
        x: (e.clientX - r.left) / r.width * W,
        y: (e.clientY - r.top) / r.height * H
      };
    });

    game.galaxy = TW.buildGalaxy(window.TW_STARS);

    if (location.hash === '#playtest') {
      newGame();
      history.replaceState(null, '', location.pathname);
    }
    requestAnimationFrame(frame);
  });
})();
