"""System view — the current sector up close: its star, any planet, the port
trade table, and hostiles.  UP/DOWN pick a commodity, ENTER trades the max."""

import math
import pygame

from . import title_bar, command_bar, blink
from ..palette import BG, DIM, FG, ACCENT

COMMODITIES = ["FUEL ORE", "ORGANICS", "EQUIPMENT"]

# spectral class -> star radius
_STAR_R = {"O": 16, "B": 15, "A": 13, "F": 12, "G": 11, "K": 9, "M": 7, "D": 4}


class SystemView:
    name = "system"

    def __init__(self, gs):
        self.gs = gs
        self.sel = 0
        self.msg = ""

    def _tradeable(self, info):
        port = info["port"]
        if not port:
            return []
        return [i for i in range(3) if port.trade_type(i) in ("B", "S")]

    def handle(self, e):
        if e.type != pygame.KEYDOWN:
            return None
        info = self.gs.sector_info(self.gs.player.sector)
        tr = self._tradeable(info)
        if e.key in (pygame.K_UP, pygame.K_LEFT):
            if tr: self.sel = (self.sel - 1) % len(tr)
        elif e.key in (pygame.K_DOWN, pygame.K_RIGHT):
            if tr: self.sel = (self.sel + 1) % len(tr)
        elif e.key == pygame.K_RETURN:
            self._trade(info, tr)
        return None

    def _trade(self, info, tr):
        if not tr:
            self.msg = "NO PORT HERE"
            return
        i = tr[self.sel % len(tr)]
        sector = self.gs.player.sector
        amt = self.gs.max_trade(sector, i)
        res = self.gs.trade(sector, i, amt)
        if res["ok"]:
            self.msg = f"{res['verb'].upper()} {res['amount']} {res['name'].upper()} / {res['credits']:,}CR"
        else:
            self.msg = res["reason"].upper()

    # ── draw ─────────────────────────────────────────────────────────────────
    def draw(self, scr, t):
        p = self.gs.player
        info = self.gs.sector_info(p.sector)
        scr.clear(BG)
        title_bar(scr, f"SYSTEM SCAN // SECTOR {p.sector}")

        scr.text(1, 2, info["name"][:24], ACCENT)
        scr.text(1, 3, f"CLASS {info['spect']:<6}{info['dist_ly']:.2f} LY", DIM)

        self._draw_star(scr, info, t)
        self._draw_planet(scr, info, t)
        self._draw_port(scr, info)
        self._draw_hostiles(scr, info, t)

        if self.msg:
            scr.text(1, 22, self.msg[:38], ACCENT)

        command_bar(scr, [("1", "CON"), ("2", "GALAXY"), ("3", "SYS"),
                          ("UP/DN", "SELECT"), ("RET", "TRADE")], active="SYS")

    def _draw_star(self, scr, info, t):
        r = _STAR_R.get((info["spect"] or "G")[0].upper(), 10)
        cx, cy = 60, 95
        scr.disc(cx, cy, r + 2, DIM)
        scr.disc(cx, cy, r, FG)
        scr.disc(cx, cy, max(1, r - 4), ACCENT)
        # lazy corona flicker
        for a in range(0, 360, 30):
            if (a + t) % 60 < 30:
                rad = math.radians(a)
                scr.px(cx + math.cos(rad) * (r + 3), cy + math.sin(rad) * (r + 3), DIM)

    def _draw_planet(self, scr, info, t):
        planet = info["planet"]
        if not planet:
            return
        cx, cy = 60, 95
        ang = math.radians((t * 0.6) % 360)
        ox = cx + math.cos(ang) * 30
        oy = cy + math.sin(ang) * 20
        scr.circle(cx, cy, 30, DIM)  # orbit hint
        scr.disc(ox, oy, 3, ACCENT)
        own = planet.owner or "UNCLAIMED"
        scr.text(1, 20, f"PLANET {planet.name[:16]} ({own})", FG)

    def _draw_port(self, scr, info):
        port = info["port"]
        scr.box(128, 18, 190, 120, DIM)
        if not port:
            scr.text(27, 3, "NO PORT", DIM)
            scr.text(27, 9, "DEEP SPACE", DIM)
            return
        scr.text(27, 3, f"PORT: {port.name}", ACCENT)
        scr.text(27, 4, f"CLASS {port.class_id}", DIM)
        # columns (grid cols 25..63): name 27, deal 38, price 47, stock 55
        scr.text(27, 6, "COMMODITY", DIM)
        scr.text(38, 6, "DEAL", DIM)
        scr.text(46, 6, "PRICE", DIM)
        scr.text(54, 6, "STOCK", DIM)

        p = self.gs.player
        tr = self._tradeable(info)
        for row_i, i in enumerate(tr):
            row = 8 + row_i * 2
            t = port.trade_type(i)
            # player perspective: port "S" = you BUY here, "B" = you SELL here
            deal = "BUY" if t == "S" else "SELL"
            sel = (row_i == self.sel % max(1, len(tr)))
            ci = ACCENT if sel else FG
            scr.text(25, row, ">" if sel else " ", ACCENT)
            scr.text(27, row, COMMODITIES[i], ci)
            scr.text(38, row, deal, ci)
            scr.text(47, row, f"{port.prices[i]:>4}", ci)
            scr.text(54, row, f"{port.stock[i]:>5}", DIM)

        scr.text(27, 15, "CREDITS", DIM); scr.text(47, 15, f"{p.credits:>12,}", FG)
        scr.text(27, 16, "HOLDS", DIM)
        scr.text(47, 16, f"{p.holds_used:>5}/{p.holds_total:<5}", FG)

    def _draw_hostiles(self, scr, info, t):
        pir = info["pirates"]
        if pir and blink(t):
            scr.text(1, 18, f"!! {pir} HOSTILE FIGHTERS IN SECTOR", ACCENT)
