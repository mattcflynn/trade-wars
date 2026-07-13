# TRADE WARS

A space trading game in the spirit of *Trade Wars 2002*, set in a real star
map: **982 actual stars within 50 light-years of Sol** (HYG database), with
warp lanes computed from true 3D positions. Sol is sector 1; the Stardock
orbits Rigil Kentaurus.

Built on the same philosophy as Ralph Origins and Betrayers: vanilla JS +
Canvas, zero dependencies, runs straight off `file://`, everything data-driven
and author-able in browser tools.

## Run it

```
open index.html
```

## The cockpit

The game is played from the pilot's seat. Every display is live game data —
no fake screens.

**Center — the cockpit.** A viewport showing the current system (star drawn
at its real spectral color and class size, planets, port stations, hostile
contacts), a radial scanner (contacts, warp-lane ticks, density readout), a
comms unit streaming the captain's log with incoming hails, gauges for fuel /
shields / fighters / credits / cargo, and the hyperjump cluster listing the
sector's real warp lanes with distances.

**Look left (Q) — NAV.** The galactic chart. Only charted space is drawn —
exploration reveals the map. Select any known star, see the BFS route and
fuel cost, and plot a course; the cockpit then preselects each hop.

**Look right (E) — SYSTEMS.** Three tabs: ship status and the upgrade
catalog, the dock console (port trading with player-perspective BUY/SELL
labels, Stardock services, planet claiming), and the full captain's log.

The side screens share hull struts with the cockpit frame, so turning your
head pans across one continuous cockpit.

### Keys

| Context | Keys |
|---|---|
| Anywhere | Q/E look left/right · Esc back to cockpit · M mute · N music |
| Cockpit | ↑↓ pick warp · Enter engage · F ore→fuel (Shift+F fill) · A attack · H holo scan · T dock |
| NAV | arrows select star · Enter plot course · -/= zoom · C center |
| SYSTEMS | 1/2/3 or Tab tabs · ↑↓ rows · </> qty (Shift ×10) · X max · Enter execute |
| Combat | Space advance rounds |

Mouse works on the ENGAGE button and dock rows (click to select, click again
to execute).

### The rules

- **Fuel is the clock.** 400 cells; every hyperjump (and attack run) burns 1.
  Convert Fuel Ore cargo to fuel (1 → 2) anywhere, refuel at the Stardock
  (8 cr), or dock at Sol — Federation HQ resupplies fuel and shields free.
  Run dry with no ore aboard and the ship is adrift.
- **Trade** at ports (BUY here / SELL here are always from *your*
  perspective). Stock regenerates; the Stardock buys all cargo at flat rates.
- **Pirates fire first** when you jump into their sector; attack (A) resolves
  up to 10 rounds. Shields down = cargo lost, escape pod to Sol.
- **Exploration is core**: the map, sector data, and density scanner show
  `???` for unvisited sectors. The Holo Scanner (5,000 cr) reveals adjacent
  sectors.

Progress autosaves to the browser after every jump, trade, fight, and dock.

## Authoring tools

### 🎨 Sprite Studio — `sprite-editor.html`
Repaint any ship, station, planet, or icon pixel-by-pixel, or round-trip
through Aseprite via PNG import/export. Saves override the shipped art
(localStorage); **EXPORT data-sprites.js** produces a file to ship your art
with the game.

### 🎵 Music — `js/data-music.js`
Chiptune patterns (note-name arrays) for the WebAudio sequencer in
`js/audio.js` — `cruise` plays in open space, `danger` when hostiles share
your sector. Add your own tracks or point at audio files in `music/`.

## Project layout

```
index.html            the game
sprite-editor.html    sprite studio
css/style.css         shared styling
fonts/                Press Start 2P
js/
  data-stars.js       GENERATED star catalog (see tools/convert-stars.js)
  tw-core.js          headless engine: galaxy gen, trade, combat, dock,
                      planets, scanners, routing, save/load (no DOM)
  art.js              palette + procedural drawing (panels, gauges,
                      starfields, star discs, hull struts)
  sprites.js          sprite registry + override layer
  data-sprites.js     shipped art overrides (export from Sprite Studio)
  audio.js            WebAudio SFX + music sequencer
  data-music.js       music tracks
  view-cockpit.js     center head position
  view-nav.js         left: galactic chart
  view-systems.js     right: ship / dock / log
  game.js             shell: states, input, head-turn camera, integer scaling
tools/convert-stars.js  stars.json -> js/data-stars.js (node)
tests/engine-test.js    headless engine tests (node tests/engine-test.js)
```

## Dev notes

- **No fetch, no modules** — all data ships as `data-*.js` scripts so the
  game works off `file://`. After regenerating `stars.json` (via
  `uv run fetch_stars.py`), run `node tools/convert-stars.js`.
- **Determinism**: sector contents (ports/planets/pirates) are generated from
  a seeded RNG per star — identical on every machine and session. The seeds
  differ from the Python edition's `random.Random`, so the two editions have
  different (but each internally stable) galaxies.
- Tests: `node tests/engine-test.js`.

## Other editions

- `main.py` — the original full-featured **terminal edition** (ANSI).
  Run: `uv run main.py`. Saves to `savegame.json` (separate from the browser
  save).
- `play.py` + `retro/` — an earlier pygame 320×200 4-color edition,
  **superseded by the browser cockpit edition** but kept for reference.
  Run: `uv run play.py`.
