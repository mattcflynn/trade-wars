"""Screen views and shared chrome for the retro shell."""

from ..screen import COLS, ROWS
from ..palette import BG, DIM, FG, ACCENT
from ..font5x8 import GLYPH_W as GW


def title_bar(scr, text, t=0):
    scr.fill_rect(0, 0, 320, 9, DIM)
    scr.text(1, 0, text.upper(), BG)
    scr.text(COLS - 9, 0, "W-Y CORP", BG)
    scr.hline(0, 9, 320, DIM)


def command_bar(scr, items, active=None):
    """items: list of (key, label).  Bottom HUD line."""
    scr.hline(0, 191, 320, DIM)
    x = 2
    for key, label in items:
        scr.text_px(x, 193, key, ACCENT)
        x += len(key) * GW + 2
        ci = ACCENT if label == active else FG
        scr.text_px(x, 193, label, ci)
        x += len(label) * GW + 5


def blink(t, rate=30):
    return (t // rate) % 2 == 0
