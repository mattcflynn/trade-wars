"""The 4-color Weyland-Yutani / dead-CRT palette.

Index order runs darkest -> brightest so callers can treat them as a ramp.
"""

VOID  = (0x0F, 0x1F, 0x11)   # 0  deep olive/black   (background)
DARK  = (0x30, 0x58, 0x20)   # 1  muted forest green
LIGHT = (0x60, 0x88, 0x20)   # 2  apple green
HI    = (0x8F, 0xA8, 0x20)   # 3  pale sage/yellow    (highlight)

PALETTE = [VOID, DARK, LIGHT, HI]

# Semantic aliases
BG     = 0
DIM    = 1
FG     = 2
ACCENT = 3
