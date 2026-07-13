"""Galaxy map.  Two modes (TAB toggles):
  FIELD - top-down projection of the real 3D starfield; depth -> brightness.
  WEB   - local warp-lane web for the current sector (classic TW2002 feel).
Arrow keys cycle the selected warp target; ENTER jumps there.
"""

import math
import pygame

from . import title_bar, command_bar, blink
from ..palette import BG, DIM, FG, ACCENT
from ..screen import W, H

CX, CY = W // 2, H // 2 + 4


class GalaxyView:
    name = "galaxy"

    def __init__(self, gs):
        self.gs = gs
        self.mode = "field"
        self.scale = 12.0          # pixels per parsec
        self.pan_x = 0.0           # world centre (parsecs)
        self.pan_y = 0.0
        self.sel = 0               # index into current warp targets
        self.msg = ""
        zs = [s["z"] for s in gs.galaxy.stars.values()]
        self._zmin, self._zmax = min(zs), max(zs)
        self.center_on_player()

    # ── helpers ────────────────────────────────────────────────────────────
    def _targets(self):
        return self.gs.galaxy.warps.get(self.gs.player.sector, [])

    def center_on_player(self):
        st = self.gs.galaxy.stars[self.gs.player.sector]
        self.pan_x, self.pan_y = st["x"], st["y"]
        self.sel = 0

    def _scr(self, st):
        sx = CX + (st["x"] - self.pan_x) * self.scale
        sy = CY - (st["y"] - self.pan_y) * self.scale
        return sx, sy

    def _depth_ci(self, st):
        if self._zmax == self._zmin:
            return FG
        f = (st["z"] - self._zmin) / (self._zmax - self._zmin)
        return DIM if f < 0.33 else (FG if f < 0.66 else ACCENT)

    # ── input ──────────────────────────────────────────────────────────────
    def handle(self, e):
        if e.type != pygame.KEYDOWN:
            return None
        k = e.key
        tgts = self._targets()

        if k == pygame.K_TAB:
            self.mode = "web" if self.mode == "field" else "field"
        elif k == pygame.K_c:
            self.center_on_player()
        elif k in (pygame.K_LEFT, pygame.K_UP):
            if tgts:
                self.sel = (self.sel - 1) % len(tgts)
        elif k in (pygame.K_RIGHT, pygame.K_DOWN):
            if tgts:
                self.sel = (self.sel + 1) % len(tgts)
        elif k == pygame.K_RETURN:
            return self._jump()
        elif self.mode == "field":
            step = 1.5 / (self.scale / 12.0)
            if k == pygame.K_w: self.pan_y += step
            elif k == pygame.K_s: self.pan_y -= step
            elif k == pygame.K_a: self.pan_x -= step
            elif k == pygame.K_d: self.pan_x += step
            elif k in (pygame.K_EQUALS, pygame.K_PLUS):
                self.scale = min(60.0, self.scale * 1.25)
            elif k == pygame.K_MINUS:
                self.scale = max(4.0, self.scale / 1.25)
        return None

    def _jump(self):
        tgts = self._targets()
        if not tgts:
            return None
        dest = tgts[self.sel % len(tgts)]
        res = self.gs.move(dest)
        if res["ok"]:
            self.center_on_player()
            self.msg = f"WARP -> SECTOR {dest}"
            if res["pirates"]:
                self.msg += f"  !! {res['pirates']} HOSTILES"
        else:
            self.msg = res["reason"].upper()
        return None

    # ── draw ─────────────────────────────────────────────────────────────────
    def draw(self, scr, t):
        scr.clear(BG)
        if self.mode == "field":
            self._draw_field(scr, t)
        else:
            self._draw_web(scr, t)

        title_bar(scr, f"GALACTIC CHART // {self.mode}")
        command_bar(scr, [("1", "CON"), ("2", "GALAXY"), ("3", "SYS"),
                          ("TAB", "MODE"), ("ARROWS", "SELECT"), ("RET", "WARP")],
                    active="GALAXY")
        if self.msg:
            scr.text(1, 22, self.msg[:62], ACCENT)

    def _draw_field(self, scr, t):
        g = self.gs.galaxy
        p = self.gs.player
        visited = p.sectors_visited
        cur = p.sector
        tgts = self._targets()
        sel_sector = tgts[self.sel % len(tgts)] if tgts else None

        # lanes: only explored ones + current sector's, to reward exploration
        drawn = set()
        for a in list(visited) + [cur]:
            for b in g.warps.get(a, []):
                key = (min(a, b), max(a, b))
                if key in drawn:
                    continue
                drawn.add(key)
                if a not in g.stars or b not in g.stars:
                    continue
                ax, ay = self._scr(g.stars[a])
                bx, by = self._scr(g.stars[b])
                ci = FG if (a == cur or b == cur) else DIM
                scr.line(ax, ay, bx, by, ci)

        # stars
        for sec, st in g.stars.items():
            sx, sy = self._scr(st)
            if sx < -2 or sx > W + 2 or sy < 8 or sy > 190:
                continue
            if sec in visited:
                scr.px(sx, sy, self._depth_ci(st))
                if self.scale > 9 and sec != cur:
                    scr.text_px(sx + 3, sy - 3, st["name"][:10], DIM)
            else:
                scr.px(sx, sy, DIM)

        # selected target ring
        if sel_sector and sel_sector in g.stars:
            sx, sy = self._scr(g.stars[sel_sector])
            scr.circle(sx, sy, 4, ACCENT)
            scr.text_px(sx - 4, sy + 6, g.stars[sel_sector]["name"][:12], ACCENT)

        # player marker (blink)
        cx, cy = self._scr(g.stars[cur])
        if blink(t):
            scr.disc(cx, cy, 2, ACCENT)
        scr.circle(cx, cy, 5, FG)

        # scale legend
        scr.text(1, 23, f"SCALE {self.scale:4.0f} PX/PC   WASD PAN   -/= ZOOM   C CENTER", DIM)

    def _draw_web(self, scr, t):
        g = self.gs.galaxy
        cur = self.gs.player.sector
        tgts = self._targets()
        sel_sector = tgts[self.sel % len(tgts)] if tgts else None

        # central node = current sector
        scr.text_center(2, f"[ SECTOR {cur} ]", ACCENT)
        scr.text_center(3, g.star_name(cur)[:20], FG)

        n = len(tgts)
        rx, ry = 110, 64
        for i, dest in enumerate(tgts):
            ang = -math.pi / 2 + (2 * math.pi * i / max(1, n))
            dx = CX + math.cos(ang) * rx
            dy = CY + math.sin(ang) * ry
            sel = (dest == sel_sector)
            ci = ACCENT if sel else FG
            scr.line(CX, CY, dx, dy, DIM)
            scr.disc(dx, dy, 3 if sel else 2, ci)
            dist = g.warp_dist(cur, dest)
            label = f"{dest} {g.star_name(dest)[:10]}"
            lx = dx - len(label) * 2
            scr.text_px(lx, dy + 5, label, ci)
            scr.text_px(lx, dy + 13, f"{dist:.1f} LY", DIM)

        scr.disc(CX, CY, 4, ACCENT if blink(t) else FG)
        if not tgts:
            scr.text_center(12, "NO WARP LANES", DIM)
