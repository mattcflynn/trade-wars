"""RetroScreen: a 320x200, 4-color framebuffer with an 8x8 bitmap font.

Everything is drawn into a tiny internal surface, then nearest-neighbour
scaled up to the window so you get crisp square "fat pixels".  A faint
scanline overlay sells the dead-terminal look.
"""

import pygame

from .palette import PALETTE, BG, DIM, FG, ACCENT
from .font5x8 import FONT, GLYPH_W, GLYPH_H

W, H = 320, 200
COLS, ROWS = W // GLYPH_W, H // GLYPH_H   # 40 x 25 text grid


class RetroScreen:
    def __init__(self, scale=4, scanlines=True, title="TRADE WARS"):
        pygame.display.set_caption(title)
        self.scale = scale
        self.scanlines = scanlines
        self.win = pygame.display.set_mode((W * scale, H * scale))
        self.surf = pygame.Surface((W, H))
        self._glyphs = self._bake_glyphs()
        self._scan = self._bake_scanlines()

    # ── glyph cache ────────────────────────────────────────────────────────
    def _bake_glyphs(self):
        """Pre-render every printable glyph in every palette colour."""
        cache = {}
        for ci, rgb in enumerate(PALETTE):
            for code in range(32, 128):
                g = pygame.Surface((GLYPH_W, GLYPH_H))
                g.fill((255, 0, 255))            # colour-key background
                g.set_colorkey((255, 0, 255))
                rows = FONT[code]
                for y, byte in enumerate(rows):
                    for x in range(GLYPH_W):
                        if byte & (1 << x):
                            g.set_at((x, y), rgb)
                cache[(code, ci)] = g
        return cache

    def _bake_scanlines(self):
        s = pygame.Surface((W * self.scale, H * self.scale), pygame.SRCALPHA)
        for y in range(0, H * self.scale, max(2, self.scale)):
            pygame.draw.line(s, (0, 0, 0, 60), (0, y), (W * self.scale, y))
        return s

    # ── primitives ─────────────────────────────────────────────────────────
    def clear(self, ci=BG):
        self.surf.fill(PALETTE[ci])

    def px(self, x, y, ci=FG):
        if 0 <= x < W and 0 <= y < H:
            self.surf.set_at((int(x), int(y)), PALETTE[ci])

    def fill_rect(self, x, y, w, h, ci=FG):
        self.surf.fill(PALETTE[ci], (int(x), int(y), int(w), int(h)))

    def rect(self, x, y, w, h, ci=FG):
        pygame.draw.rect(self.surf, PALETTE[ci], (int(x), int(y), int(w), int(h)), 1)

    def hline(self, x, y, w, ci=FG):
        self.surf.fill(PALETTE[ci], (int(x), int(y), int(w), 1))

    def vline(self, x, y, h, ci=FG):
        self.surf.fill(PALETTE[ci], (int(x), int(y), 1, int(h)))

    def line(self, x0, y0, x1, y1, ci=FG):
        pygame.draw.line(self.surf, PALETTE[ci], (int(x0), int(y0)), (int(x1), int(y1)))

    def disc(self, x, y, r, ci=FG):
        pygame.draw.circle(self.surf, PALETTE[ci], (int(x), int(y)), int(r))

    def circle(self, x, y, r, ci=FG):
        pygame.draw.circle(self.surf, PALETTE[ci], (int(x), int(y)), int(r), 1)

    # ── text ─────────────────────────────────────────────────────────────────
    def text_px(self, x, y, s, ci=FG):
        x = int(x); y = int(y)
        for ch in str(s):
            code = ord(ch)
            if 32 <= code < 128:
                self.surf.blit(self._glyphs[(code, ci)], (x, y))
            x += GLYPH_W

    def text(self, col, row, s, ci=FG):
        """Draw on the 40x25 character grid."""
        self.text_px(col * GLYPH_W, row * GLYPH_H, s, ci)

    def text_center(self, row, s, ci=FG):
        col = max(0, (COLS - len(str(s))) // 2)
        self.text(col, row, s, ci)

    # ── frames / boxes (single-line, drawn with line glyphs) ──────────────────
    def box(self, x, y, w, h, ci=DIM):
        self.hline(x + 1, y, w - 2, ci)
        self.hline(x + 1, y + h - 1, w - 2, ci)
        self.vline(x, y + 1, h - 2, ci)
        self.vline(x + w - 1, y + 1, h - 2, ci)
        for cx, cy in ((x, y), (x + w - 1, y), (x, y + h - 1), (x + w - 1, y + h - 1)):
            self.px(cx, cy, ci)

    # ── present ────────────────────────────────────────────────────────────
    def present(self):
        pygame.transform.scale(self.surf, self.win.get_size(), self.win)
        if self.scanlines:
            self.win.blit(self._scan, (0, 0))
        pygame.display.flip()
