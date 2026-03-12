#!/usr/bin/env python3
"""
TRADE WARS - Terminal Edition
Based on Trade Wars 2002 by Gary Martin
"""

import random
import sys
import os
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

SAVE_FILE = Path("savegame.json")


# ── ANSI Colors ─────────────────────────────────────────────────────────────

class C:
    RESET   = "\033[0m"
    BOLD    = "\033[1m"
    DIM     = "\033[2m"
    BLINK   = "\033[5m"
    RED     = "\033[31m"
    GREEN   = "\033[32m"
    YELLOW  = "\033[33m"
    BLUE    = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN    = "\033[36m"
    WHITE   = "\033[37m"
    BRED    = "\033[91m"
    BGREEN  = "\033[92m"
    BYELLOW = "\033[93m"
    BBLUE   = "\033[94m"
    BMAGENTA= "\033[95m"
    BCYAN   = "\033[96m"
    BWHITE  = "\033[97m"


# ── Port definitions ─────────────────────────────────────────────────────────
# Columns: name, Fuel Ore, Organics, Equipment
# B = port Buys from player  S = port Sells to player  - = no trade

PORT_CLASSES = {
    1: ("The Depot",    "B", "B", "B"),
    2: ("Feeders",      "B", "S", "B"),
    3: ("Mkt & Tech",   "S", "S", "B"),
    4: ("Tech Center",  "S", "B", "S"),
    5: ("Ore Mine",     "B", "S", "S"),
    6: ("The Atrium",   "S", "S", "S"),
    7: ("Weapons",      "S", "B", "B"),
    8: ("Trading Co.",  "B", "B", "S"),
    9: ("Stardock",     "D", "D", "D"),
}

COMMODITIES   = ["Fuel Ore", "Organics", "Equipment"]
COMM_SHORT    = ["Ore", "Org", "Equ"]
COMM_COLORS   = [C.YELLOW, C.GREEN, C.CYAN]

SHIP_CATALOG = {
    "Merchant Cruiser": {"holds": 20, "fighters": 10,  "shields": 100, "cost": 0},
    "Scout Marauder":   {"holds": 10, "fighters": 25,  "shields": 200, "cost": 25_000},
    "Merchant Prince":  {"holds": 50, "fighters": 20,  "shields": 300, "cost": 75_000},
    "Imperial Fighter": {"holds": 5,  "fighters": 75,  "shields": 400, "cost": 100_000},
}


# ── Helpers ──────────────────────────────────────────────────────────────────

def clr():
    os.system("cls" if os.name == "nt" else "clear")

def hr(ch="─", w=62, color=C.BLUE):
    print(f"{color}{ch * w}{C.RESET}")

def box_top(w=44, color=C.BMAGENTA):
    print(f"{color}╔{'═'*(w-2)}╗{C.RESET}")

def box_bot(w=44, color=C.BMAGENTA):
    print(f"{color}╚{'═'*(w-2)}╝{C.RESET}")

def box_row(text, w=44, color=C.BMAGENTA):
    inner = w - 4
    print(f"{color}║{C.RESET}  {text:<{inner}}{color}║{C.RESET}")

def pause(msg="  [ Press ENTER to continue ]"):
    input(f"\n{C.DIM}{msg}{C.RESET}")

def ask(label="Command: "):
    return input(f"\n{C.BGREEN}>{C.BWHITE} {label}{C.RESET}").strip()

def typewrite(text, delay=0.025, color=C.WHITE):
    for ch in text:
        print(f"{color}{ch}{C.RESET}", end="", flush=True)
        time.sleep(delay)
    print()


# ── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class Port:
    sector: int
    class_id: int
    stock: list        # [ore_amt, org_amt, equ_amt]
    prices: list       # [ore_price, org_price, equ_price]
    capacity: list     # max stock

    @property
    def name(self):
        return PORT_CLASSES[self.class_id][0]

    def trade_type(self, i):
        return PORT_CLASSES[self.class_id][i + 1]

    def restock(self):
        for i in range(3):
            t = self.trade_type(i)
            if t in ("B", "S"):
                gained = random.randint(3, 15)
                self.stock[i] = min(self.stock[i] + gained, self.capacity[i])


@dataclass
class Planet:
    sector: int
    name: str
    colonists: int = 100
    ore: int = 0
    organics: int = 0
    fighters: int = 0
    owner: Optional[str] = None


@dataclass
class Player:
    name: str
    sector: int = 1
    credits: int = 1_000
    turns: int = 400

    ship: str = "Merchant Cruiser"
    holds_total: int = 20
    fighters: int = 10
    shields: int = 100

    ore: int = 0
    organics: int = 0
    equipment: int = 0

    kills: int = 0
    deaths: int = 0
    has_holo_scanner: bool = False
    sectors_visited: set  = field(default_factory=set)
    ports_visited: set    = field(default_factory=set)
    scanned_sectors: dict = field(default_factory=dict)  # sector -> density

    @property
    def holds_used(self):
        return self.ore + self.organics + self.equipment

    @property
    def holds_free(self):
        return self.holds_total - self.holds_used

    def use_turn(self, n=1):
        self.turns = max(0, self.turns - n)
        return self.turns > 0


# ── Galaxy ───────────────────────────────────────────────────────────────────

class Galaxy:
    def __init__(self, size=100, seed=None):
        if seed is not None:
            random.seed(seed)
        self.seed = seed
        self.size = size
        self.warps   = {}   # sector -> [sector, ...]
        self.ports   = {}   # sector -> Port
        self.planets = {}   # sector -> Planet
        self.pirates = {}   # sector -> fighter count
        self._build()

    def _build(self):
        # Init sectors
        for s in range(1, self.size + 1):
            self.warps[s] = []

        # Ring for connectivity
        for s in range(1, self.size + 1):
            nxt = s % self.size + 1
            self._link(s, nxt)

        # Random extra warps
        for s in range(1, self.size + 1):
            for _ in range(random.randint(0, 3)):
                t = random.randint(1, self.size)
                if t != s:
                    self._link(s, t)

        for s in self.warps:
            self.warps[s].sort()

        # Ports (~70% of sectors, skip sector 1)
        port_sectors = random.sample(range(2, self.size + 1), int(self.size * 0.7))
        for s in port_sectors:
            cid = random.randint(1, 8)
            cap = [random.randint(500, 2000) for _ in range(3)]
            stock, prices = [], []
            for i in range(3):
                t = PORT_CLASSES[cid][i + 1]
                stock.append(random.randint(100, cap[i]) if t != "-" else 0)
                if t == "B":
                    prices.append(random.randint(20, 60))   # port pays you
                elif t == "S":
                    prices.append(random.randint(5, 40))    # you pay port
                else:
                    prices.append(0)
            self.ports[s] = Port(s, cid, stock, prices, cap)

        # Stardock at sector 9
        self.ports[9] = Port(9, 9, [0, 0, 0], [0, 0, 0], [0, 0, 0])

        # Planets (~15%)
        pnames = [
            "Antares IV", "Proxima II", "Kepler-7b", "Vega Prime", "Sirius C",
            "Rigel Station", "Deneb IV", "Arcturus V", "Pollux VI", "Capella III",
            "Aldebaran II", "Fomalhaut Prime", "Tau Ceti IV", "Wolf 359 II",
        ]
        pl_sectors = random.sample(range(5, self.size + 1), min(14, int(self.size * 0.14)))
        for idx, s in enumerate(pl_sectors):
            self.planets[s] = Planet(
                sector=s, name=pnames[idx % len(pnames)],
                colonists=random.randint(50, 500),
                ore=random.randint(0, 500), organics=random.randint(0, 500),
            )

        # Pirates (~20%, skip sectors 1–3)
        pir_sectors = random.sample(range(4, self.size + 1), int(self.size * 0.20))
        for s in pir_sectors:
            self.pirates[s] = random.randint(5, 150)

    def _link(self, a, b):
        if b not in self.warps[a]:
            self.warps[a].append(b)
        if a not in self.warps[b]:
            self.warps[b].append(a)


# ── Game ─────────────────────────────────────────────────────────────────────

class Game:
    def __init__(self):
        self.galaxy: Optional[Galaxy] = None
        self.player: Optional[Player] = None
        self.log_msgs: list[str] = []

    # ── logging ──────────────────────────────────────────────────────────────

    def log(self, msg, color=""):
        entry = f"{color}{msg}{C.RESET}" if color else msg
        self.log_msgs.append(entry)
        if len(self.log_msgs) > 4:
            self.log_msgs.pop(0)

    # ── splash / new game ────────────────────────────────────────────────────

    def splash(self):
        clr()
        print(f"""
{C.BCYAN}  ╔══════════════════════════════════════════════════════════╗
  ║                                                          ║
  ║   ████████╗██╗    ██╗    ██████╗  ██████╗  ██████╗ ██████╗  ║
  ║      ██╔══╝██║    ██║    ╚════██╗██╔═████╗██╔═████╗╚════██╗ ║
  ║      ██║   ██║ █╗ ██║     █████╔╝██║██╔██║██║██╔██║ █████╔╝ ║
  ║      ██║   ██║███╗██║    ██╔═══╝ ████╔╝██║████╔╝██║██╔═══╝  ║
  ║      ██║   ╚███╔███╔╝    ███████╗╚██████╔╝╚██████╔╝███████╗ ║
  ║      ╚═╝    ╚══╝╚══╝     ╚══════╝ ╚═════╝  ╚═════╝ ╚══════╝ ║
  ║                                                          ║
  ║{C.BYELLOW}              T R A D E   W A R S{C.BCYAN}                       ║
  ║{C.WHITE}                  Terminal  Edition{C.BCYAN}                      ║
  ║                                                          ║
  ║{C.DIM}          Inspired by Trade Wars 2002 by Gary Martin{C.BCYAN}       ║
  ╚══════════════════════════════════════════════════════════╝{C.RESET}
""")

    # ── save / load ──────────────────────────────────────────────────────────

    def save_game(self):
        p = self.player
        g = self.galaxy
        data = {
            "version": 1,
            "seed": g.seed,
            "player": {
                "name": p.name, "sector": p.sector, "credits": p.credits,
                "turns": p.turns, "ship": p.ship, "holds_total": p.holds_total,
                "fighters": p.fighters, "shields": p.shields,
                "ore": p.ore, "organics": p.organics, "equipment": p.equipment,
                "kills": p.kills, "deaths": p.deaths,
                "has_holo_scanner": p.has_holo_scanner,
                "sectors_visited": list(p.sectors_visited),
                "ports_visited": list(p.ports_visited),
                "scanned_sectors": {str(k): v for k, v in p.scanned_sectors.items()},
            },
            "ports": {
                str(s): {"stock": port.stock, "prices": port.prices}
                for s, port in g.ports.items()
            },
            "planets": {
                str(s): {"owner": pl.owner, "ore": pl.ore,
                         "organics": pl.organics, "fighters": pl.fighters}
                for s, pl in g.planets.items()
            },
            "pirates": {str(s): fc for s, fc in g.pirates.items()},
        }
        SAVE_FILE.write_text(json.dumps(data, indent=2))
        self.log(f"Game saved to {SAVE_FILE}.", C.DIM)

    def load_game(self):
        if not SAVE_FILE.exists():
            return False
        try:
            data = json.loads(SAVE_FILE.read_text())
            if data.get("version") != 1:
                return False

            self.galaxy = Galaxy(size=100, seed=data["seed"])

            # Overlay mutable port state
            for s_str, pdata in data["ports"].items():
                s = int(s_str)
                if s in self.galaxy.ports:
                    self.galaxy.ports[s].stock  = pdata["stock"]
                    self.galaxy.ports[s].prices = pdata["prices"]

            # Overlay planet state
            for s_str, pldata in data["planets"].items():
                s = int(s_str)
                if s in self.galaxy.planets:
                    pl = self.galaxy.planets[s]
                    pl.owner = pldata["owner"]
                    pl.ore = pldata["ore"]
                    pl.organics = pldata["organics"]
                    pl.fighters = pldata["fighters"]

            # Restore pirates
            self.galaxy.pirates = {int(s): fc for s, fc in data["pirates"].items()}

            pd = data["player"]
            self.player = Player(name=pd["name"])
            self.player.sector       = pd["sector"]
            self.player.credits      = pd["credits"]
            self.player.turns        = pd["turns"]
            self.player.ship         = pd["ship"]
            self.player.holds_total  = pd["holds_total"]
            self.player.fighters     = pd["fighters"]
            self.player.shields      = pd["shields"]
            self.player.ore          = pd["ore"]
            self.player.organics     = pd["organics"]
            self.player.equipment    = pd["equipment"]
            self.player.kills        = pd["kills"]
            self.player.deaths       = pd["deaths"]
            self.player.sectors_visited  = set(pd["sectors_visited"])
            self.player.ports_visited    = set(pd["ports_visited"])
            self.player.has_holo_scanner = pd.get("has_holo_scanner", False)
            self.player.scanned_sectors  = {int(k): v for k, v in pd.get("scanned_sectors", {}).items()}
            return True
        except Exception:
            return False

    def new_game(self):
        self.splash()
        save_exists = SAVE_FILE.exists()
        print(f"  {C.BYELLOW}[N]{C.RESET} New Game")
        if save_exists:
            print(f"  {C.BYELLOW}[L]{C.RESET} Load Saved Game")
        print(f"  {C.BYELLOW}[Q]{C.RESET} Quit\n")
        choice = ask("Selection: ").upper()
        if choice == "Q":
            sys.exit(0)

        if choice == "L" and save_exists:
            print(f"\n  {C.BGREEN}Loading save...{C.RESET}")
            if self.load_game():
                typewrite(f"\n  Welcome back, {self.player.name}.", delay=0.03, color=C.WHITE)
                typewrite(f"  Resuming at Sector {self.player.sector}.", delay=0.025, color=C.DIM)
                pause()
                return
            else:
                print(f"  {C.BRED}Save file corrupted. Starting new game.{C.RESET}")
                time.sleep(1)

        name = ask("Enter your name, trader: ")
        if not name:
            name = "Trader"

        print(f"\n  {C.BGREEN}Generating galaxy...{C.RESET}")
        seed = random.randint(1, 99_999)
        self.galaxy = Galaxy(size=100, seed=seed)
        self.player = Player(name=name)
        self.player.sectors_visited.add(1)

        time.sleep(0.3)
        print(f"  Seed: {C.DIM}{seed}{C.RESET}  │  "
              f"{len(self.galaxy.ports)} ports  │  "
              f"{len(self.galaxy.planets)} planets  │  "
              f"{len(self.galaxy.pirates)} danger zones")
        time.sleep(0.4)

        typewrite(f"\n  Welcome to the galaxy, {name}.", delay=0.03, color=C.WHITE)
        typewrite(f"  Your {self.player.ship} awaits at Sector 1.", delay=0.025, color=C.DIM)
        pause()

    # ── sector display ───────────────────────────────────────────────────────

    def display_sector(self):
        p  = self.player
        g  = self.galaxy
        s  = p.sector
        clr()

        # Status bar
        hr("━", color=C.BBLUE)
        print(f" {C.BCYAN}SECTOR {C.BWHITE}{s:04d}{C.RESET}  "
              f"{C.DIM}Turns:{C.RESET} {C.BYELLOW}{p.turns}{C.RESET}  "
              f"{C.DIM}Credits:{C.RESET} {C.BGREEN}{p.credits:,}{C.RESET}  "
              f"{C.DIM}Holds:{C.RESET} {C.WHITE}{p.holds_used}/{p.holds_total}{C.RESET}  "
              f"{C.DIM}Shields:{C.RESET} {C.CYAN}{p.shields}{C.RESET}  "
              f"{C.DIM}Fighters:{C.RESET} {C.RED}{p.fighters}{C.RESET}")
        hr("━", color=C.BBLUE)

        # Warps
        warp_str = "  ".join(f"{C.BCYAN}{w}{C.RESET}" for w in g.warps[s])
        print(f"\n  {C.WHITE}Warps to:{C.RESET}  {warp_str}")

        # Features
        print()
        if s == 1:
            print(f"  {C.BYELLOW}*** FEDERATION HEADQUARTERS — SAFE ZONE ***{C.RESET}")

        if s in g.ports:
            port = g.ports[s]
            if port.class_id == 9:
                print(f"  {C.BMAGENTA}[ STARDOCK ]{C.RESET}")
            else:
                trade_disp = ""
                for i in range(3):
                    t = port.trade_type(i)
                    if t == "B":
                        trade_disp += f"{COMM_COLORS[i]}B{C.RESET}"
                    elif t == "S":
                        trade_disp += f"{C.RED}S{C.RESET}"
                    else:
                        trade_disp += f"{C.DIM}-{C.RESET}"
                print(f"  {C.BMAGENTA}Port:{C.RESET} {port.name} "
                      f"{C.DIM}(Class {port.class_id}){C.RESET}  [{trade_disp}]")

        if s in g.planets:
            pl = g.planets[s]
            owner_str = f"  {C.BGREEN}[{pl.owner}]{C.RESET}" if pl.owner else f"  {C.DIM}[Unclaimed]{C.RESET}"
            print(f"  {C.BBLUE}Planet:{C.RESET} {pl.name}{owner_str}")

        if s in g.pirates:
            fc = g.pirates[s]
            print(f"  {C.BRED}! Pirate fighters detected: {fc}{C.RESET}")

        # Cargo
        if p.holds_used > 0:
            parts = []
            if p.ore:        parts.append(f"{C.YELLOW}{p.ore} Ore{C.RESET}")
            if p.organics:   parts.append(f"{C.GREEN}{p.organics} Org{C.RESET}")
            if p.equipment:  parts.append(f"{C.CYAN}{p.equipment} Equ{C.RESET}")
            print(f"\n  {C.DIM}Cargo:{C.RESET} {'  '.join(parts)}")

        # Message log
        if self.log_msgs:
            print(f"\n{C.DIM}{'─'*62}{C.RESET}")
            for m in self.log_msgs[-3:]:
                print(f"  {m}")

        # Command bar
        hr("━", color=C.BBLUE)
        self._cmd_bar()

    def _cmd_bar(self):
        p = self.player
        s = p.sector
        cmds = [
            f"{C.BWHITE}[M]{C.RESET}Move",
        ]
        if s in self.galaxy.ports:
            cmds.append(f"{C.BWHITE}[T]{C.RESET}Trade")
        if s in self.galaxy.pirates:
            cmds.append(f"{C.BRED}[A]{C.RESET}Attack")
        if s in self.galaxy.planets:
            cmds.append(f"{C.BWHITE}[P]{C.RESET}Planet")
        if s in (1, 9):
            cmds.append(f"{C.BWHITE}[D]{C.RESET}Dock")
        cmds += [
            f"{C.BWHITE}[S]{C.RESET}Status",
            f"{C.BWHITE}[C]{C.RESET}Computer",
            f"{C.BWHITE}[W]{C.RESET}Save",
            f"{C.BWHITE}[?]{C.RESET}Help",
            f"{C.BWHITE}[Q]{C.RESET}Quit",
        ]
        print("  " + "  ".join(cmds))

    # ── move ─────────────────────────────────────────────────────────────────

    def do_move(self):
        p = self.player
        g = self.galaxy
        warps = g.warps[p.sector]
        warp_str = ", ".join(str(w) for w in warps)

        print(f"\n  Available warps: {C.BCYAN}{warp_str}{C.RESET}")
        raw = ask("Warp to sector (ENTER=cancel): ")
        if not raw:
            return

        try:
            dest = int(raw)
        except ValueError:
            self.log("Invalid sector number.", C.DIM)
            return

        if dest not in warps:
            self.log(f"No warp lane to sector {dest} from here.", C.BRED)
            return

        if not p.use_turn():
            self.log("OUT OF TURNS!", C.BRED)
            return

        p.sector = dest
        p.sectors_visited.add(dest)
        self.log(f"Warped to sector {dest}.", C.DIM)

        if dest in g.pirates:
            self._auto_pirate_ambush()

    def _auto_pirate_ambush(self):
        p  = self.player
        s  = p.sector
        g  = self.galaxy
        fc = g.pirates[s]

        p_dmg = max(1, int(p.fighters * random.uniform(0.5, 1.5)))
        e_dmg = max(1, int(fc * random.uniform(0.3, 1.0)))

        survivors = fc - p_dmg
        p.shields = max(0, p.shields - e_dmg)

        if survivors <= 0:
            bounty = fc * random.randint(5, 15)
            p.credits += bounty
            p.kills += 1
            del g.pirates[s]
            self.log(f"Ambush! Pirates destroyed. +{bounty} credits.", C.BGREEN)
        else:
            g.pirates[s] = survivors
            if p.shields <= 0:
                self._death_sequence()
            else:
                self.log(f"Ambush! Took {e_dmg} shield damage. "
                         f"Pirates: {survivors} remain.", C.YELLOW)

    def _death_sequence(self):
        p = self.player
        self.log("SHIELDS DOWN — cargo jettisoned, emergency warp!", C.BRED)
        p.ore = p.organics = p.equipment = 0
        p.shields = 100
        p.credits = max(100, p.credits - 500)
        p.deaths += 1
        p.sector = 1

    # ── attack ───────────────────────────────────────────────────────────────

    def do_attack(self):
        p = self.player
        s = p.sector
        g = self.galaxy

        if s not in g.pirates:
            self.log("No enemies here.", C.DIM)
            return

        fc = g.pirates[s]
        print(f"\n  {C.BRED}═══ COMBAT ═══{C.RESET}")
        print(f"  Enemy fighters : {C.BRED}{fc}{C.RESET}")
        print(f"  Your fighters  : {C.BGREEN}{p.fighters}{C.RESET}")
        print(f"  Your shields   : {C.BCYAN}{p.shields}{C.RESET}")

        if ask("Attack? [Y/N]: ").upper() != "Y":
            return

        p.use_turn()
        original_fc = fc
        rnd = 0

        while fc > 0 and p.shields > 0 and rnd < 10:
            rnd += 1
            p_atk = max(1, int(p.fighters * random.uniform(0.6, 1.4)))
            e_atk = max(1, int(fc * random.uniform(0.3, 1.0)))
            fc = max(0, fc - p_atk)
            p.shields = max(0, p.shields - e_atk)
            print(f"  Rnd {rnd}: fired {C.BGREEN}{p_atk}{C.RESET}, "
                  f"took {C.BRED}{e_atk}{C.RESET} dmg  │  "
                  f"Enemy:{C.BRED}{fc}{C.RESET}  Shields:{C.BCYAN}{p.shields}{C.RESET}")

        if fc <= 0:
            bounty = original_fc * random.randint(5, 15)
            p.credits += bounty
            p.kills += 1
            del g.pirates[s]
            print(f"\n  {C.BGREEN}VICTORY! +{bounty} credits.{C.RESET}")
        else:
            g.pirates[s] = fc
            if p.shields <= 0:
                print(f"\n  {C.BRED}DESTROYED! Emergency warp.{C.RESET}")
                self._death_sequence()

        pause()

    # ── trade ────────────────────────────────────────────────────────────────

    def do_trade(self):
        p = self.player
        s = p.sector
        g = self.galaxy

        if s not in g.ports:
            self.log("No port here.", C.DIM)
            return

        port = g.ports[s]
        if port.class_id == 9:
            self._stardock()
            return

        p.use_turn()
        p.ports_visited.add(s)

        while True:
            clr()
            W = 56
            print(f"\n{C.BMAGENTA}╔{'═'*(W-2)}╗{C.RESET}")
            print(f"{C.BMAGENTA}║{C.RESET}  PORT: {C.BWHITE}{port.name:<{W-10}}{C.BMAGENTA}║{C.RESET}")
            print(f"{C.BMAGENTA}╚{'═'*(W-2)}╝{C.RESET}")
            print(f"\n  Credits: {C.BGREEN}{p.credits:,}{C.RESET}  "
                  f"Free holds: {C.BYELLOW}{p.holds_free}{C.RESET}\n")

            tradeable = []
            print(f"  {'#':<3} {'Commodity':<14} {'You':<10} {'Stock':>7} {'Price':>6}  {'Cargo':>5}")
            print(f"  {'─'*57}")
            for i, name in enumerate(COMMODITIES):
                t = port.trade_type(i)
                if t == "-":
                    continue
                color = COMM_COLORS[i]
                cargo = [p.ore, p.organics, p.equipment][i]
                if t == "B":
                    # Port buys — player sells here
                    actionable = cargo > 0
                    action_str = f"{C.BGREEN}SELL here{C.RESET}" if actionable else f"{C.DIM}SELL here{C.RESET}"
                else:
                    # Port sells — player buys here
                    actionable = p.holds_free > 0 and p.credits >= port.prices[i]
                    action_str = f"{C.BCYAN}BUY  here{C.RESET}" if actionable else f"{C.DIM}BUY  here{C.RESET}"
                num_str = str(len(tradeable) + 1) if actionable else " "
                name_str = f"{color}{name}{C.RESET}" if actionable else f"{C.DIM}{name}{C.RESET}"
                print(f"  {num_str:<3} {name_str:<23} {action_str}  "
                      f"{port.stock[i]:>7} {port.prices[i]:>5}cr"
                      f"  {cargo:>5}")
                if actionable:
                    tradeable.append(i)

            print(f"\n  {C.BWHITE}[1-{len(tradeable)}]{C.RESET} trade  "
                  f"{C.BWHITE}[D]{C.RESET} done")
            cmd = ask("Trade: ").upper()

            if cmd in ("D", ""):
                break
            if cmd.isdigit():
                idx = int(cmd) - 1
                if 0 <= idx < len(tradeable):
                    self._trade_commodity(port, tradeable[idx])

            port.restock()

    def _trade_commodity(self, port, i):
        p    = self.player
        name = COMMODITIES[i]
        t    = port.trade_type(i)

        if t == "B":
            # Port buys — player sells
            have = [p.ore, p.organics, p.equipment][i]
            if have == 0:
                print(f"  {C.RED}You have no {name}.{C.RESET}")
                pause()
                return
            max_sell = min(have, port.stock[i])
            raw = ask(f"Sell how many {name}? (max {max_sell}, ENTER=all): ")
            amount = max_sell if raw == "" else int(raw) if raw.isdigit() else 0
            amount = max(0, min(amount, max_sell))
            if amount == 0:
                return
            earned = amount * port.prices[i]
            if i == 0: p.ore      -= amount
            elif i == 1: p.organics -= amount
            else:        p.equipment -= amount
            p.credits += earned
            port.stock[i] -= amount
            self.log(f"Sold {amount} {name} for {earned:,} cr.", C.BGREEN)

        else:
            # Port sells — player buys
            if port.stock[i] == 0:
                print(f"  {C.RED}Port has no {name} in stock.{C.RESET}")
                pause()
                return
            can_afford = p.credits // port.prices[i]
            max_buy = min(port.stock[i], p.holds_free, can_afford)
            if max_buy <= 0:
                reason = "no free holds" if p.holds_free == 0 else "not enough credits"
                print(f"  {C.RED}Cannot buy ({reason}).{C.RESET}")
                pause()
                return
            raw = ask(f"Buy how many {name}? (max {max_buy}, ENTER=all): ")
            amount = max_buy if raw == "" else int(raw) if raw.isdigit() else 0
            amount = max(0, min(amount, max_buy))
            if amount == 0:
                return
            cost = amount * port.prices[i]
            if i == 0: p.ore      += amount
            elif i == 1: p.organics += amount
            else:        p.equipment += amount
            p.credits -= cost
            port.stock[i] -= amount
            self.log(f"Bought {amount} {name} for {cost:,} cr.", C.BCYAN)

    # ── stardock ─────────────────────────────────────────────────────────────

    def _stardock(self):
        p = self.player
        clr()
        print(f"""
{C.BMAGENTA}  ╔══════════════════════════════════════╗
  ║        ☆  STARDOCK  ☆               ║
  ╚══════════════════════════════════════╝{C.RESET}
""")
        # Auto-sell all cargo at standard rates
        earned = 0
        for label, qty, price in [("Fuel Ore", p.ore, 20),
                                   ("Organics", p.organics, 18),
                                   ("Equipment", p.equipment, 25)]:
            if qty > 0:
                val = qty * price
                earned += val
                print(f"  Sold {qty} {label} @ {price}cr = {C.BGREEN}{val:,} cr{C.RESET}")

        if earned:
            p.credits += earned
            p.ore = p.organics = p.equipment = 0
            print(f"\n  {C.BGREEN}Total earned: {earned:,} cr{C.RESET}")

        print(f"\n  {C.BCYAN}── Ship Services ──────────────────{C.RESET}")
        print(f"  [F] Buy fighters   50 cr each  (have: {p.fighters})")
        print(f"  [S] Buy shields    10 cr each  (have: {p.shields})")
        print(f"  [U] Upgrade ship")
        holo_str = f"{C.BGREEN}(owned){C.RESET}" if p.has_holo_scanner else "5,000 cr"
        print(f"  [H] Holo Scanner   {holo_str}")
        print(f"  [D] Done\n")

        while True:
            cmd = ask("Service: ").upper()
            if cmd in ("D", ""):
                break
            elif cmd == "F":
                n = self._buy_n("fighters", 50)
                if n > 0:
                    p.fighters += n
                    p.credits  -= n * 50
                    print(f"  Fighters now: {p.fighters}")
            elif cmd == "S":
                n = self._buy_n("shield points", 10)
                if n > 0:
                    p.shields  += n
                    p.credits  -= n * 10
                    print(f"  Shields now: {p.shields}")
            elif cmd == "U":
                self._upgrade_ship()
            elif cmd == "H":
                if p.has_holo_scanner:
                    print(f"  {C.DIM}Holo Scanner already installed.{C.RESET}")
                elif p.credits < 5_000:
                    print(f"  {C.RED}Insufficient credits (need 5,000 cr).{C.RESET}")
                else:
                    p.credits -= 5_000
                    p.has_holo_scanner = True
                    print(f"  {C.BGREEN}Holo Scanner installed. Use [C] → [5] to scan adjacent sectors.{C.RESET}")
        pause()

    def _buy_n(self, thing, price):
        p = self.player
        max_n = p.credits // price
        if max_n == 0:
            print(f"  {C.RED}Insufficient credits.{C.RESET}")
            return 0
        raw = ask(f"Buy how many {thing}? ({price} cr each, max {max_n}): ")
        if not raw.isdigit():
            return 0
        return max(0, min(int(raw), max_n))

    def _upgrade_ship(self):
        p = self.player
        clr()
        print(f"\n  {C.BCYAN}── Ship Upgrades ──────────────────{C.RESET}")
        ships = list(SHIP_CATALOG.items())
        for idx, (name, stats) in enumerate(ships):
            marker = f"{C.BGREEN}[CURRENT]{C.RESET}" if name == p.ship else ""
            print(f"  [{idx+1}] {name:<22} "
                  f"holds:{stats['holds']:>3}  "
                  f"ftrs:{stats['fighters']:>3}  "
                  f"shlds:{stats['shields']:>4}  "
                  f"cost:{stats['cost']:>8,} cr  {marker}")

        raw = ask("Buy ship #(ENTER=cancel): ")
        if not raw.isdigit():
            return
        idx = int(raw) - 1
        if idx < 0 or idx >= len(ships):
            return
        name, stats = ships[idx]
        if name == p.ship:
            print(f"  {C.DIM}You already own that ship.{C.RESET}")
            pause()
            return
        if p.credits < stats["cost"]:
            print(f"  {C.RED}Insufficient credits.{C.RESET}")
            pause()
            return
        p.credits     -= stats["cost"]
        p.ship         = name
        p.holds_total  = stats["holds"]
        p.fighters     = stats["fighters"]
        p.shields      = stats["shields"]
        # Jettison excess cargo
        excess = p.holds_used - p.holds_total
        if excess > 0:
            p.ore = max(0, p.ore - excess); excess -= p.ore
            p.organics = max(0, p.organics - excess)
        self.log(f"Upgraded to {name}!", C.BMAGENTA)
        pause()

    # ── planet ───────────────────────────────────────────────────────────────

    def do_planet(self):
        p  = self.player
        s  = p.sector
        g  = self.galaxy

        if s not in g.planets:
            self.log("No planet here.", C.DIM)
            return

        pl = g.planets[s]
        clr()
        print(f"""
{C.BBLUE}  ╔══════════════════════════════════════╗
  ║  PLANET: {pl.name:<29}║
  ╚══════════════════════════════════════╝{C.RESET}

  Colonists : {pl.colonists}
  Ore       : {pl.ore}
  Organics  : {pl.organics}
  Fighters  : {pl.fighters}
  Owner     : {pl.owner or C.DIM + "Unclaimed" + C.RESET}
""")
        if pl.owner == p.name:
            print(f"  {C.BGREEN}You own this planet.{C.RESET}")
            print(f"  [D] Drop cargo   [L] Leave")
        elif pl.owner is None:
            print(f"  [C] Claim planet   [L] Leave")
        else:
            print(f"  {C.YELLOW}Owned by {pl.owner}.{C.RESET}")
            print(f"  [L] Leave")

        cmd = ask("Action: ").upper()

        if cmd == "C" and pl.owner is None:
            pl.owner = p.name
            self.log(f"Claimed {pl.name}!", C.BGREEN)
        elif cmd == "D" and pl.owner == p.name:
            dropped = []
            if p.ore:      pl.ore += p.ore;           dropped.append(f"{p.ore} ore");      p.ore = 0
            if p.organics: pl.organics += p.organics; dropped.append(f"{p.organics} org");  p.organics = 0
            if p.equipment:
                self.log("Equipment stays aboard (used for ship).", C.DIM)
            if dropped:
                self.log(f"Dropped {', '.join(dropped)} on {pl.name}.", C.DIM)
        pause()

    # ── status ───────────────────────────────────────────────────────────────

    def do_status(self):
        p = self.player
        clr()
        print(f"""
{C.BCYAN}  ╔══════════════════════════════════════╗
  ║  SHIP STATUS                         ║
  ╚══════════════════════════════════════╝{C.RESET}

  Trader    : {C.BWHITE}{p.name}{C.RESET}
  Ship      : {p.ship}
  Sector    : {p.sector}
  Credits   : {C.BGREEN}{p.credits:,}{C.RESET}
  Turns     : {C.BYELLOW}{p.turns}{C.RESET}

  {C.BCYAN}── Combat ──────────────────────────{C.RESET}
  Fighters  : {C.BRED}{p.fighters}{C.RESET}
  Shields   : {C.BCYAN}{p.shields}{C.RESET}
  Kills     : {p.kills}   Deaths: {p.deaths}

  {C.BCYAN}── Cargo Hold ({p.holds_used}/{p.holds_total}) ──────────{C.RESET}
  Fuel Ore  : {C.YELLOW}{p.ore}{C.RESET}
  Organics  : {C.GREEN}{p.organics}{C.RESET}
  Equipment : {C.CYAN}{p.equipment}{C.RESET}

  {C.BCYAN}── Explorer Log ────────────────────{C.RESET}
  Sectors   : {len(p.sectors_visited)} / {self.galaxy.size} visited
  Ports     : {len(p.ports_visited)} docked at
""")
        pause()

    # ── computer ─────────────────────────────────────────────────────────────

    def do_computer(self):
        clr()
        holo_status = f"{C.BGREEN}(installed){C.RESET}" if self.player.has_holo_scanner else f"{C.DIM}(not installed — buy at Stardock){C.RESET}"
        print(f"""
{C.BCYAN}  ╔══════════════════════════════════════╗
  ║  NAVIGATION COMPUTER                 ║
  ╚══════════════════════════════════════╝{C.RESET}

  {C.BWHITE}[1]{C.RESET} Sector database
  {C.BWHITE}[2]{C.RESET} Trade route analysis
  {C.BWHITE}[3]{C.RESET} Galaxy map
  {C.BWHITE}[4]{C.RESET} Density scanner  {C.DIM}(adjacent sectors, numbers only){C.RESET}
  {C.BWHITE}[5]{C.RESET} Holo scanner     {holo_status}
  {C.BWHITE}[Q]{C.RESET} Exit
""")
        cmd = ask("Computer: ").upper()
        if cmd == "1": self._sector_db()
        elif cmd == "2": self._route_scan()
        elif cmd == "3": self._galaxy_map()
        elif cmd == "4": self._density_scanner()
        elif cmd == "5": self._holo_scan()

    def _density(self, s):
        """Compute density reading for a sector (100 = empty, higher = more content)."""
        g = self.galaxy
        d = 100
        if s in g.ports:   d += 300
        if s in g.planets: d += 200
        if s in g.pirates: d += g.pirates[s] * 3
        if s == 1:         d += 100   # Fed HQ always shows activity
        return d

    def _density_scanner(self):
        """Scan adjacent sectors and record their density. Display numbers only."""
        g = self.galaxy
        p = self.player
        clr()
        print(f"\n  {C.BCYAN}DENSITY SCANNER{C.RESET}  "
              f"{C.DIM}from Sector {p.sector}{C.RESET}\n")
        print(f"  {C.DIM}Reading mass concentrations in adjacent sectors.{C.RESET}")
        print(f"  {C.DIM}100=empty  400+=something  600+=significant  800+=danger{C.RESET}\n")

        warps = g.warps[p.sector]
        print(f"  {'Sector':<8} {'Density':>8}")
        print(f"  {'─'*20}")
        for s in warps:
            d = self._density(s)
            p.scanned_sectors[s] = d   # record the scan result
            if d >= 800:     d_color = C.BRED
            elif d >= 600:   d_color = C.BYELLOW
            elif d >= 400:   d_color = C.BMAGENTA
            elif d > 100:    d_color = C.BCYAN
            else:            d_color = C.DIM
            print(f"  {C.BCYAN}{s:<8}{C.RESET} {d_color}{d:>8}{C.RESET}")

        pause()

    def _holo_scan(self):
        """Detailed scan of adjacent sectors. Requires Holo Scanner."""
        g = self.galaxy
        p = self.player

        if not p.has_holo_scanner:
            print(f"\n  {C.BRED}No Holo Scanner installed.{C.RESET}")
            print(f"  {C.DIM}Purchase one at Stardock.{C.RESET}")
            pause()
            return

        clr()
        print(f"\n  {C.BCYAN}HOLO SCANNER{C.RESET}  "
              f"{C.DIM}from Sector {p.sector}{C.RESET}\n")

        warps = g.warps[p.sector]
        print(f"  {'Sect':<6} {'Density':>7}  Contents")
        print(f"  {'─'*58}")

        for s in warps:
            d = self._density(s)
            p.scanned_sectors[s] = d
            contents = []

            if s in g.ports:
                port = g.ports[s]
                if port.class_id == 9:
                    contents.append(f"{C.BMAGENTA}STARDOCK{C.RESET}")
                else:
                    trade_disp = ""
                    for i in range(3):
                        t = port.trade_type(i)
                        if t == "B":   trade_disp += f"{COMM_COLORS[i]}B{C.RESET}"
                        elif t == "S": trade_disp += f"{C.RED}S{C.RESET}"
                        else:          trade_disp += f"{C.DIM}-{C.RESET}"
                    contents.append(f"{C.BMAGENTA}Port{C.RESET} {port.name} [{trade_disp}]")

            if s in g.planets:
                pl = g.planets[s]
                owner_tag = f" [{C.BGREEN}{pl.owner}{C.RESET}]" if pl.owner else ""
                contents.append(f"{C.BBLUE}Planet{C.RESET} {pl.name}{owner_tag}")

            if s in g.pirates:
                contents.append(f"{C.BRED}! {g.pirates[s]} fighters{C.RESET}")

            if s == 1:
                contents.append(f"{C.BYELLOW}Federation HQ{C.RESET}")

            if not contents:
                contents.append(f"{C.DIM}empty{C.RESET}")

            visited_tag = f" {C.DIM}[visited]{C.RESET}" if s in p.sectors_visited else f" {C.BYELLOW}[new]{C.RESET}"
            if d >= 800:     d_color = C.BRED
            elif d >= 400:   d_color = C.BMAGENTA
            elif d > 100:    d_color = C.BCYAN
            else:            d_color = C.DIM
            print(f"  {C.BCYAN}{s:<6}{C.RESET} {d_color}{d:>7}{C.RESET}  {'  '.join(contents)}{visited_tag}")

        pause()

    def _sector_db(self):
        raw = ask("Sector #: ")
        if not raw.isdigit():
            return
        s = int(raw)
        g = self.galaxy
        if s < 1 or s > g.size:
            print(f"  {C.RED}Invalid sector.{C.RESET}")
            pause()
            return

        clr()
        if s not in self.player.sectors_visited:
            print(f"\n  {C.BCYAN}SECTOR {s}{C.RESET}  {C.BYELLOW}[UNCHARTED]{C.RESET}")
            print(f"  {C.DIM}No data — you have not visited this sector.{C.RESET}")
            pause()
            return

        print(f"\n  {C.BCYAN}SECTOR {s}{C.RESET}")
        print(f"  Warps : {', '.join(map(str, g.warps[s]))}")

        if s in g.ports:
            port = g.ports[s]
            print(f"  Port  : {port.name} (Class {port.class_id})")
            for i in range(3):
                t = port.trade_type(i)
                if t not in ("B", "S"):
                    continue
                action = "BUYS from you" if t == "B" else "SELLS to you"
                print(f"    {COMM_COLORS[i]}{COMMODITIES[i]}{C.RESET}  "
                      f"{action}  @{port.prices[i]}cr  stock:{port.stock[i]}")

        if s in g.planets:
            pl = g.planets[s]
            print(f"  Planet: {pl.name} ({pl.colonists} colonists, "
                  f"owner: {pl.owner or 'none'})")

        if s in g.pirates:
            print(f"  {C.BRED}DANGER: {g.pirates[s]} pirate fighters{C.RESET}")

        print(f"  {C.DIM}[Visited]{C.RESET}")
        pause()

    def _bfs_distance(self, start, end):
        """Return hop count between two sectors via BFS."""
        if start == end:
            return 0
        visited = {start}
        queue = [(start, 0)]
        while queue:
            cur, dist = queue.pop(0)
            for nb in self.galaxy.warps[cur]:
                if nb == end:
                    return dist + 1
                if nb not in visited:
                    visited.add(nb)
                    queue.append((nb, dist + 1))
        return 999

    def _route_scan(self):
        g = self.galaxy
        p = self.player
        clr()
        print(f"\n  {C.BCYAN}TRADE ROUTE ANALYSIS{C.RESET}")
        print(f"  {C.DIM}BUY = fill holds there (port sells to you)  "
              f"SELL = empty holds there (port buys from you){C.RESET}\n")

        visited = p.sectors_visited
        routes = []
        for s1, p1 in g.ports.items():
            if s1 not in visited:
                continue
            for i in range(3):
                if p1.trade_type(i) == "S" and p1.stock[i] > 50:
                    buy_price = p1.prices[i]
                    for s2, p2 in g.ports.items():
                        if s2 == s1 or s2 not in visited:
                            continue
                        if p2.trade_type(i) == "B" and p2.stock[i] > 50:
                            sell_price = p2.prices[i]
                            profit = sell_price - buy_price
                            if profit > 0:
                                dist = self._bfs_distance(s1, s2)
                                routes.append((profit, dist, s1, buy_price, s2, sell_price, i))

        # Best profit first; among equal profit, fewest hops first
        routes.sort(key=lambda r: (-r[0], r[1]))

        if not routes:
            print(f"  {C.DIM}No profitable routes found in charted sectors.{C.RESET}")
            print(f"  {C.DIM}Explore more of the galaxy to discover trade opportunities.{C.RESET}")
        else:
            print(f"  {'Profit':>6}  {'Hops':>4}   {'BUY at':^20}   {'SELL at':^20}  Commodity")
            print(f"  {'per unit':>6}               {'sect   price':^20}   {'sect   price':^20}")
            print(f"  {'─'*74}")
            for profit, dist, s1, bp, s2, sp, i in routes[:15]:
                col  = COMM_COLORS[i]
                here1 = " (here)" if s1 == p.sector else ""
                here2 = " (here)" if s2 == p.sector else ""
                dist_str = f"{C.BGREEN}adj{C.RESET}" if dist == 1 else f"{dist:>3}"
                print(f"  {C.BGREEN}+{profit:<5}cr{C.RESET}  {dist_str}    "
                      f"sect {C.BCYAN}{s1:<4}{C.RESET}@ {C.RED}{bp:>2}cr{C.RESET}{here1:<7}   "
                      f"sect {C.BCYAN}{s2:<4}{C.RESET}@ {C.BGREEN}{sp:>2}cr{C.RESET}{here2:<7}  "
                      f"{col}{COMMODITIES[i]}{C.RESET}")
        pause()

    def _galaxy_map(self):
        g = self.galaxy
        p = self.player
        clr()
        print(f"\n  {C.BCYAN}GALAXY MAP  ({g.size} sectors){C.RESET}")
        print(f"  {C.DIM}@ you  P port  * planet  % port+planet  ! pirates  . empty"
              f"  ### density scan  ??? unknown{C.RESET}\n")

        cols = 20
        for s in range(1, g.size + 1):
            if s == p.sector:
                sym = f"{C.BGREEN}@{C.BWHITE}  {C.RESET}"
            elif s in p.sectors_visited:
                if s in g.pirates:
                    sym = f"{C.BRED}!{C.BWHITE}  {C.RESET}"
                elif s in g.planets and s in g.ports:
                    sym = f"{C.BYELLOW}%{C.BWHITE}  {C.RESET}"
                elif s in g.planets:
                    sym = f"{C.BBLUE}*{C.BWHITE}  {C.RESET}"
                elif s in g.ports:
                    sym = f"{C.BMAGENTA}P{C.BWHITE}  {C.RESET}"
                else:
                    sym = f"{C.DIM}.  {C.RESET}"
            elif s in p.scanned_sectors:
                d = p.scanned_sectors[s]
                if d >= 800:     d_color = C.BRED
                elif d >= 600:   d_color = C.BYELLOW
                elif d >= 400:   d_color = C.BMAGENTA
                else:            d_color = C.BCYAN
                sym = f"{d_color}{d:<3}{C.RESET}"
            else:
                sym = f"{C.DIM}?  {C.RESET}"

            print(f"{C.DIM}{s:3}{C.RESET}{sym}", end=" ")
            if s % cols == 0:
                print()
        print()
        pause()

    # ── dock (Fed HQ) ────────────────────────────────────────────────────────

    def do_dock(self):
        p = self.player
        s = p.sector

        if s == 9 and s in self.galaxy.ports:
            self._stardock()
            return

        if s != 1:
            self.log("Nothing to dock with here.", C.DIM)
            return

        clr()
        print(f"""
{C.BYELLOW}  ╔══════════════════════════════════════╗
  ║   FEDERATION HEADQUARTERS            ║
  ╚══════════════════════════════════════╝{C.RESET}

  Welcome, {p.name}.

  Your turns have been fully restored.
  Turns: {C.BYELLOW}{p.turns} → 400{C.RESET}
""")
        p.turns = 400
        # Repair shields at Fed HQ
        if p.shields < 100:
            print(f"  Shields repaired: {p.shields} → 100")
            p.shields = 100
        pause()

    # ── help ─────────────────────────────────────────────────────────────────

    def do_help(self):
        clr()
        print(f"""
{C.BCYAN}  ╔══════════════════════════════════════════╗
  ║  COMMAND REFERENCE                       ║
  ╚══════════════════════════════════════════╝{C.RESET}

  {C.BWHITE}M{C.RESET} - Move to adjacent sector        (1 turn)
  {C.BWHITE}T{C.RESET} - Trade at port in this sector
  {C.BWHITE}A{C.RESET} - Attack pirates in sector       (1 turn)
  {C.BWHITE}P{C.RESET} - Interact with planet
  {C.BWHITE}D{C.RESET} - Dock (Federation HQ or Stardock)
  {C.BWHITE}S{C.RESET} - View ship status
  {C.BWHITE}C{C.RESET} - Navigation computer
  {C.BWHITE}Q{C.RESET} - Quit

{C.BCYAN}  TRADING{C.RESET}
  Port {C.BGREEN}BUYS{C.RESET} = port pays you (sell your cargo here)
  Port {C.RED}SELLS{C.RESET} = you pay port (buy to fill holds)
  Find ports that sell cheap → ports that buy high.
  Computer → Trade Route Analysis finds pairs for you.

{C.BCYAN}  PORT CLASS KEY  (Ore / Org / Equ){C.RESET}
  Class 1: B B B   Class 5: B S S
  Class 2: B S B   Class 6: S S S
  Class 3: S S B   Class 7: S B B
  Class 4: S B S   Class 8: B B S

{C.BCYAN}  PLANETS{C.RESET}
  Claim unclaimed planets and drop resources on them.
  Planets grow colonists and accumulate value over time.
""")
        pause()

    # ── game over ────────────────────────────────────────────────────────────

    def game_over(self, out_of_turns=False):
        p = self.player
        score = p.credits + (p.kills * 500) + (len(p.sectors_visited) * 10)
        clr()
        print(f"""
{C.BRED}  ╔══════════════════════════════════════╗
  ║             GAME  OVER               ║
  ╚══════════════════════════════════════╝{C.RESET}
""")
        if out_of_turns:
            print(f"  {C.YELLOW}Your turns have expired.{C.RESET}\n")

        print(f"  Trader  : {p.name}")
        print(f"  Credits : {p.credits:,}")
        print(f"  Sectors : {len(p.sectors_visited)} explored")
        print(f"  Kills   : {p.kills}   Deaths: {p.deaths}")
        print(f"\n  {C.BYELLOW}Final Score: {score:,}{C.RESET}\n")

    # ── main loop ────────────────────────────────────────────────────────────

    def run(self):
        self.new_game()

        while True:
            self.display_sector()

            if self.player.turns <= 0:
                self.game_over(out_of_turns=True)
                break

            cmd = ask("Command: ").upper()

            if   cmd == "M": self.do_move()
            elif cmd == "T": self.do_trade()
            elif cmd == "A": self.do_attack()
            elif cmd == "P": self.do_planet()
            elif cmd == "D": self.do_dock()
            elif cmd == "S": self.do_status()
            elif cmd == "C": self.do_computer()
            elif cmd == "W": self.save_game()
            elif cmd == "?": self.do_help()
            elif cmd == "Q":
                self.save_game()
                print(f"\n  {C.DIM}Farewell, {self.player.name}.{C.RESET}\n")
                self.game_over()
                break
            else:
                self.log("Unknown command. [?] for help.", C.DIM)


def main():
    try:
        Game().run()
    except KeyboardInterrupt:
        print(f"\n\n{C.DIM}  Connection terminated.{C.RESET}\n")


if __name__ == "__main__":
    main()
