// Trade Wars — data-music.js
// Chiptune tracks for the sequencer in js/audio.js.
//   cruise — slow minor-pentatonic drift for open space
//   danger — tighter, lower pulse when hostiles share the sector
window.TW = window.TW || {};
window.TW.MUSIC = {
  cruise: {
    stepMs: 240,
    wave: 'triangle',
    bassWave: 'sine',
    melody: ['A4', '', '', 'C5', '', 'E5', '', '', 'D5', '', '', '', 'A4', '', 'G4', '',
             'E4', '', '', 'G4', '', 'A4', '', '', 'C5', '', '', '', '', '', '', ''],
    bass:   ['A2', '', 'E2', '', 'A2', '', 'G2', '', 'A2', '', 'E2', '', 'D2', '', 'E2', '']
  },
  danger: {
    stepMs: 150,
    wave: 'square',
    bassWave: 'sawtooth',
    melody: ['A4', '', 'A4', 'C5', '', 'A4', '', 'Eb5', '', 'D5', '', 'C5', '', '', 'B4', ''],
    bass:   ['A2', 'A2', '', 'A2', 'G2', 'G2', '', 'G2', 'F2', 'F2', '', 'F2', 'E2', '', 'E2', '']
  }
};
