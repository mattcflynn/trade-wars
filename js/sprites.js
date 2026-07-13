// Trade Wars — sprites.js
// Builds the sprite registry (ships, ports, planets, contacts, icons) and
// applies custom art overrides, exactly like ralph/betrayers:
//  - js/data-sprites.js  (window.TW_SPRITE_OVERRIDES — ships with the game)
//  - localStorage TW_customSprites (saved from the Sprite Studio)
(function () {
  'use strict';
  var TW = window.TW;
  var P = TW.PALETTE;

  var PAL = {
    h: P.hull, H: P.hullHi, d: P.hullDark, w: P.white, g: P.green,
    c: P.cyan, a: P.amber, r: P.red, G: P.gold, l: P.grey, '.': null
  };

  // ---------- ship silhouettes (side view, engines left, nose right) ----------
  var SHIP_GRIDS = {
    cruiser: [
      '..........hh................',
      '.g.....hhhHHhh..............',
      '.gg.dhhhhhhhhhhhh...........',
      'gggdhhhhccchhhhhhhhhh.......',
      '.gg.dhhhhhhhhhhhhhhhhhHHh...',
      '.g.....hhhhhhhhhhhhhhhhhhHh.',
      '........dddhhhhhhhhhhhhhh...',
      '...........ddddhhhhhh.......',
      '...............ddd..........'
    ],
    scout: [
      '.g..dhh.....................',
      '.ggdhhhhhh..................',
      'gggdhhcchhhhhHHhh...........',
      '.ggdhhhhhhhhhhhhhhHHh.......',
      '.g..dhhhhhh.................',
      '....dhh.....................'
    ],
    prince: [
      '.......hhhhhhhhhh...........',
      '.g..dhhhhHHHHhhhhhh.........',
      '.ggdhhhhhhhhhhhhhhhhh.......',
      'gggdhhhcccchhhhhhhhhhhhh....',
      'gggdhhhhhhhhhhhhhhhhhhhhHh..',
      '.ggdhhhhhhhhhhhhhhhhhhhh....',
      '.g..dhhhhhhhhhhhhhhhh.......',
      '......ddddhhhhhhhh..........',
      '..........dddd..............'
    ],
    imperial: [
      '.g.dhh......hh..............',
      '.ggdhhh...hhHHhh............',
      'gggdhhhhhhhhhhhhhhh.........',
      'gggdhhrrchhhhhhhhhhhhHHh....',
      'gggdhhhhhhhhhhhhhhh.........',
      '.ggdhhh...hhhhhh............',
      '.g.dhh......hh..............'
    ]
  };

  // ---------- stations / planets / contacts ----------
  var MISC_GRIDS = {
    'port.station': [
      '.......ll.......',
      '.....llllll.....',
      '....l..ll..l....',
      '...l...ll...l...',
      '..ll.hhhhhh.ll..',
      '..l.hhhddhhh.l..',
      'lllhhhdggdhhhlll',
      '..l.hhhddhhh.l..',
      '..ll.hhhhhh.ll..',
      '...l...ll...l...',
      '....l..ll..l....',
      '.....llllll.....',
      '.......ll.......'
    ],
    'port.stardock': [
      '.......GG.......',
      '....G.GGGG.G....',
      '..GGllllllllGG..',
      '...l.hhhhhh.l...',
      '..ll.hGGGGh.ll..',
      'GGl.hhGddGhh.lGG',
      'GGlhhhGddGhhhlGG',
      '..ll.hGGGGh.ll..',
      '...l.hhhhhh.l...',
      '..GGllllllllGG..',
      '....G.GGGG.G....',
      '.......GG.......'
    ],
    'planet.rock': [
      '....aaaa....',
      '..aaaaaaaa..',
      '.aaad.aaaaa.',
      '.aaaaaad.aa.',
      'aaad.aaaaaaa',
      'aaaaaaaad.aa',
      '.aad.aaaaaa.',
      '.aaaaaa.daa.',
      '..aaaaaaaa..',
      '....aaaa....'
    ],
    'planet.terra': [
      '....cccc....',
      '..ccgggccc..',
      '.cgggggcccc.',
      '.ccgggggccc.',
      'ccccggcccccc',
      'ccggggggcccc',
      '.cggggccccc.',
      '.ccccggggcc.',
      '..ccgggccc..',
      '....cccc....'
    ],
    'pirate.delta': [
      '....r....',
      '...rrr...',
      '..rrrrr..',
      '.rr.r.rr.',
      'rr..r..rr'
    ]
  };

  TW.SPR = { ships: {}, misc: {}, icons: {} };

  Object.keys(SHIP_GRIDS).forEach(function (k) {
    TW.SPR.ships[k] = TW.fromGrid(SHIP_GRIDS[k], PAL);
  });
  Object.keys(MISC_GRIDS).forEach(function (k) {
    TW.SPR.misc[k] = TW.fromGrid(MISC_GRIDS[k], PAL);
  });
  Object.keys(TW.ICONS).forEach(function (k) {
    TW.SPR.icons[k] = TW.ICONS[k];
  });

  var SHIP_SLUGS = {
    'Merchant Cruiser': 'cruiser', 'Scout Marauder': 'scout',
    'Merchant Prince': 'prince', 'Imperial Fighter': 'imperial'
  };
  TW.shipSprite = function (name) {
    return TW.SPR.ships[SHIP_SLUGS[name] || 'cruiser'];
  };

  // ---------- sprite keys + override plumbing ----------
  TW.SPRITE_KEYS = [];
  Object.keys(SHIP_GRIDS).forEach(function (k) { TW.SPRITE_KEYS.push('ship.' + k); });
  Object.keys(MISC_GRIDS).forEach(function (k) { TW.SPRITE_KEYS.push('misc.' + k); });
  Object.keys(TW.ICONS).forEach(function (k) { TW.SPRITE_KEYS.push('icon.' + k); });

  TW.getSprite = function (key) {
    var i = key.indexOf('.');
    var cat = key.slice(0, i), id = key.slice(i + 1);
    if (cat === 'ship') return TW.SPR.ships[id] || null;
    if (cat === 'misc') return TW.SPR.misc[id] || null;
    if (cat === 'icon') return TW.SPR.icons[id] || null;
    return null;
  };

  function setSprite(key, canvas) {
    var i = key.indexOf('.');
    var cat = key.slice(0, i), id = key.slice(i + 1);
    if (cat === 'ship') TW.SPR.ships[id] = canvas;
    if (cat === 'misc') TW.SPR.misc[id] = canvas;
    if (cat === 'icon') TW.SPR.icons[id] = canvas;
  }

  TW.DEFAULT_SPRITES = {};
  TW.SPRITE_KEYS.forEach(function (k) { TW.DEFAULT_SPRITES[k] = TW.getSprite(k); });

  var overrides = {};
  try {
    if (window.TW_SPRITE_OVERRIDES) {
      Object.keys(window.TW_SPRITE_OVERRIDES).forEach(function (k) {
        overrides[k] = window.TW_SPRITE_OVERRIDES[k];
      });
    }
  } catch (e) {}
  try {
    var custom = JSON.parse(localStorage.getItem('TW_customSprites') || '{}');
    Object.keys(custom).forEach(function (k) { overrides[k] = custom[k]; });
  } catch (e) {}

  TW.ACTIVE_SPRITE_OVERRIDES = overrides;
  Object.keys(overrides).forEach(function (k) {
    try { setSprite(k, TW.fromPixels(overrides[k])); } catch (e) {}
  });
})();
