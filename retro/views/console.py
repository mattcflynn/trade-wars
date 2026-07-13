"""Pilot console — the ship's terminal HUD: who/where/what you're carrying."""

from . import title_bar, command_bar, blink
from ..palette import BG, DIM, FG, ACCENT

COMMODITIES = ["FUEL ORE", "ORGANICS", "EQUIPMENT"]


class ConsoleView:
    name = "console"

    def __init__(self, gs):
        self.gs = gs

    def handle(self, e):
        return None

    def draw(self, scr, t):
        p = self.gs.player
        info = self.gs.sector_info(p.sector)

        scr.clear(BG)
        title_bar(scr, "MERCHANT TERMINAL")

        # ── current position ─────────────────────────────────────────────
        scr.box(2, 11, 316, 40, DIM)
        scr.text(1, 2, "CURRENT POSITION", ACCENT)
        scr.text(1, 3, f"SECTOR {p.sector:>3}   {info['name'][:48]}", FG)
        scr.text(1, 4, f"CLASS {info['spect']:<8}{info['dist_ly']:8.2f} LY FROM SOL", DIM)
        wtxt = " ".join(str(w) for w in info["warps"][:16]) or "NONE"
        scr.text(1, 5, f"WARPS  {wtxt}", FG)

        # ── vessel (left) ────────────────────────────────────────────────
        scr.box(2, 55, 154, 96, DIM)
        scr.text(1, 8, "VESSEL", ACCENT)
        scr.text(1, 9, p.ship[:28], FG)
        scr.text(1, 11, "CREDITS", DIM); scr.text(13, 11, f"{p.credits:>13,}", FG)
        scr.text(1, 12, "TURNS",   DIM); scr.text(13, 12, f"{p.turns:>13}", FG)
        scr.text(1, 13, "SHIELDS", DIM); scr.text(13, 13, f"{p.shields:>13}", FG)
        scr.text(1, 14, "FIGHTERS",DIM); scr.text(13, 14, f"{p.fighters:>13}", FG)
        scr.text(1, 16, "HOLDS", DIM)
        scr.text(13, 16, f"{p.holds_used:>5}/{p.holds_total:<5}", FG)
        self._bar(scr, 6, 17 * 8 + 2, 142, p.holds_used, p.holds_total)

        # ── cargo manifest (right) ───────────────────────────────────────
        scr.box(160, 55, 158, 96, DIM)
        scr.text(33, 8, "CARGO MANIFEST", ACCENT)
        cargo = [p.ore, p.organics, p.equipment]
        for i, name in enumerate(COMMODITIES):
            row = 11 + i * 2
            scr.text(33, row, name, FG)
            scr.text(56, row, f"{cargo[i]:>5}", ACCENT if cargo[i] else DIM)

        # ── sector contacts ──────────────────────────────────────────────
        scr.box(2, 155, 316, 32, DIM)
        scr.text(1, 20, "SECTOR CONTACTS", ACCENT)
        port = info["port"]
        scr.text(1, 21, "PORT", DIM)
        scr.text(7, 21, f"{port.name} (C{port.class_id})" if port else "- none -",
                 FG if port else DIM)
        planet = info["planet"]
        scr.text(33, 21, "PLANET", DIM)
        scr.text(41, 21, planet.name[:22] if planet else "- none -",
                 FG if planet else DIM)
        pir = info["pirates"]
        if pir:
            scr.text(1, 22, f"!! HOSTILE CONTACTS: {pir} FIGHTERS",
                     ACCENT if blink(t) else FG)
        else:
            scr.text(1, 22, "SECTOR CLEAR", DIM)

        command_bar(scr, [("1", "CONSOLE"), ("2", "GALAXY"), ("3", "SYSTEM"),
                          ("Q", "QUIT")], active="CONSOLE")

    def _bar(self, scr, x, y, w, val, total):
        scr.rect(x, y, w, 4, DIM)
        if total > 0:
            fill = int((w - 2) * min(val, total) / total)
            if fill > 0:
                scr.fill_rect(x + 1, y + 1, fill, 2, FG)
