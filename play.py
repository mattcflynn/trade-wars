#!/usr/bin/env python3
"""Trade Wars — Retro Edition.  A 320x200, 4-color, bitmap-font shell.

    uv run play.py

Views:  [1] pilot console   [2] galactic chart   [3] system scan
Global: [Q]/[ESC] quit.  Each view shows its own keys along the bottom.
"""

import os
import sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("SDL_VIDEO_CENTERED", "1")

import pygame

from game_core import GameState
from retro.screen import RetroScreen
from retro.views.console import ConsoleView
from retro.views.galaxy import GalaxyView
from retro.views.system import SystemView


def main():
    pygame.init()
    scr = RetroScreen(scale=4, title="TRADE WARS // W-Y TERMINAL")

    gs = GameState()
    gs.new_game("Commander")

    views = {
        "console": ConsoleView(gs),
        "galaxy":  GalaxyView(gs),
        "system":  SystemView(gs),
    }
    order = ["console", "galaxy", "system"]
    active = "console"

    clock = pygame.time.Clock()
    t = 0
    running = True
    while running:
        for e in pygame.event.get():
            if e.type == pygame.QUIT:
                running = False
            elif e.type == pygame.KEYDOWN:
                if e.key in (pygame.K_q, pygame.K_ESCAPE):
                    running = False
                elif e.key == pygame.K_1:
                    active = "console"
                elif e.key == pygame.K_2:
                    active = "galaxy"
                elif e.key == pygame.K_3:
                    active = "system"
                else:
                    views[active].handle(e)
            else:
                views[active].handle(e)

        views[active].draw(scr, t)
        scr.present()
        t += 1
        clock.tick(30)

    pygame.quit()
    sys.exit(0)


if __name__ == "__main__":
    main()
