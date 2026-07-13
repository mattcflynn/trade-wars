"""Shared game logic extracted from main.py — no terminal I/O."""

import random
import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

SAVE_FILE  = Path("savegame.json")
STARS_FILE = Path("stars.json")

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

COMMODITIES = ["Fuel Ore", "Organics", "Equipment"]

SHIP_CATALOG = {
    "Merchant Cruiser": {"holds": 20, "fighters": 10,  "shields": 100, "cost": 0},
    "Scout Marauder":   {"holds": 10, "fighters": 25,  "shields": 200, "cost": 25_000},
    "Merchant Prince":  {"holds": 50, "fighters": 20,  "shields": 300, "cost": 75_000},
    "Imperial Fighter": {"holds": 5,  "fighters": 75,  "shields": 400, "cost": 100_000},
}

SPECTRAL_COLORS = {
    'O': (0.60, 0.70, 1.00),
    'B': (0.70, 0.80, 1.00),
    'A': (0.90, 0.95, 1.00),
    'F': (1.00, 1.00, 0.88),
    'G': (1.00, 0.95, 0.70),
    'K': (1.00, 0.75, 0.45),
    'M': (1.00, 0.45, 0.25),
    'D': (0.80, 0.90, 1.00),
}

def spectral_color(spect: str) -> tuple:
    c = spect[0].upper() if spect else 'G'
    return SPECTRAL_COLORS.get(c, SPECTRAL_COLORS['G'])


@dataclass
class Port:
    sector: int
    class_id: int
    stock: list
    prices: list
    capacity: list

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
    scanned_sectors: dict = field(default_factory=dict)

    @property
    def holds_used(self):
        return self.ore + self.organics + self.equipment

    @property
    def holds_free(self):
        return self.holds_total - self.holds_used

    def use_turn(self, n=1):
        self.turns = max(0, self.turns - n)
        return self.turns > 0


class Galaxy:
    def __init__(self, stars_file: Path = STARS_FILE):
        self.warps   = {}
        self.ports   = {}
        self.planets = {}
        self.pirates = {}
        self.stars   = {}
        self.size    = 0
        self._load(stars_file)
        self._build_content()

    def _load(self, stars_file: Path):
        if not stars_file.exists():
            raise FileNotFoundError(f"{stars_file} not found. Run: uv run fetch_stars.py")
        data = json.loads(stars_file.read_text())
        for star in data["stars"]:
            self.stars[star["sector"]] = star
        self.size  = len(self.stars)
        self.warps = {int(k): v for k, v in data["warps"].items()}

    def star_name(self, sector: int) -> str:
        return self.stars.get(sector, {}).get("name", f"Sector {sector}")

    def star_info(self, sector: int) -> str:
        star = self.stars.get(sector, {})
        spect   = star.get("spect", "?")
        dist_ly = star.get("dist_ly", 0.0)
        return f"{spect:<6}  {dist_ly:.2f} LY"

    def warp_dist(self, a: int, b: int) -> float:
        sa = self.stars.get(a, {})
        sb = self.stars.get(b, {})
        dx = sa.get("x", 0) - sb.get("x", 0)
        dy = sa.get("y", 0) - sb.get("y", 0)
        dz = sa.get("z", 0) - sb.get("z", 0)
        return math.sqrt(dx*dx + dy*dy + dz*dz) * 3.26156

    def _build_content(self):
        for sector, star in self.stars.items():
            if sector == 1:
                continue
            hyg_id = star["hyg_id"]
            spect  = star.get("spect", "")
            rng    = random.Random(hyg_id ^ 0xC0FFEE)

            if rng.random() < 0.65:
                cid = self._spect_port_class(spect, rng)
                cap = [rng.randint(500, 2000) for _ in range(3)]
                stock, prices = [], []
                for i in range(3):
                    t = PORT_CLASSES[cid][i + 1]
                    stock.append(rng.randint(100, cap[i]) if t != "-" else 0)
                    if t == "B":    prices.append(rng.randint(20, 60))
                    elif t == "S":  prices.append(rng.randint(5, 40))
                    else:           prices.append(0)
                self.ports[sector] = Port(sector, cid, stock, prices, cap)

            if rng.random() < 0.20:
                suffixes = ["II", "III", "IV", "V", "b", "c", "Prime", "Station"]
                pname = f"{star['name']} {rng.choice(suffixes)}"
                self.planets[sector] = Planet(
                    sector=sector, name=pname,
                    colonists=rng.randint(50, 500),
                    ore=rng.randint(0, 500),
                    organics=rng.randint(0, 500),
                )

            if rng.random() < 0.18:
                self.pirates[sector] = rng.randint(5, 150)

        sd = self._stardock_sector()
        self.ports[sd] = Port(sd, 9, [0, 0, 0], [0, 0, 0], [0, 0, 0])

    def _stardock_sector(self) -> int:
        for sector, star in self.stars.items():
            name = star.get("name", "").lower()
            if "rigil" in name or "toliman" in name or "proxima" in name:
                return sector
        return 2

    def _spect_port_class(self, spect: str, rng: random.Random) -> int:
        c = spect[0].upper() if spect else "G"
        if c in ("O", "B"):   return rng.choice([3, 4, 6])
        if c in ("A", "F"):   return rng.choice([2, 5, 7])
        if c == "G":          return rng.choice([1, 2, 8])
        if c == "K":          return rng.choice([5, 7, 8])
        if c == "M":          return rng.choice([1, 5, 8])
        if c == "D":          return rng.choice([3, 4, 6])
        return rng.randint(1, 8)


class GameState:
    def __init__(self):
        self.galaxy: Optional[Galaxy] = None
        self.player: Optional[Player] = None

    def new_game(self, name: str = "Commander"):
        self.galaxy = Galaxy()
        self.player = Player(name=name, sector=1)
        self.player.sectors_visited.add(1)

    def move(self, dest_sector: int) -> dict:
        p, g = self.player, self.galaxy
        if dest_sector not in g.warps.get(p.sector, []):
            return {"ok": False, "reason": "No warp lane to that sector"}
        p.sector = dest_sector
        p.sectors_visited.add(dest_sector)
        p.use_turn()
        pirate_count = g.pirates.get(dest_sector, 0)
        return {"ok": True, "pirates": pirate_count}

    def _cargo(self, i):
        p = self.player
        return [p.ore, p.organics, p.equipment][i]

    def _add_cargo(self, i, n):
        p = self.player
        if   i == 0: p.ore       += n
        elif i == 1: p.organics  += n
        else:        p.equipment += n

    def max_trade(self, sector: int, i: int) -> int:
        """How many units the player can transact for commodity i at this port."""
        port = self.galaxy.ports.get(sector)
        if not port:
            return 0
        t = port.trade_type(i)
        p = self.player
        if t == "B":        # port buys -> player sells
            return min(self._cargo(i), port.stock[i])
        if t == "S":        # port sells -> player buys
            price = port.prices[i] or 1
            return min(port.stock[i], p.holds_free, p.credits // price)
        return 0

    def trade(self, sector: int, i: int, amount: int) -> dict:
        """Buy/sell commodity i at the port in `sector`. Direction follows the
        port's trade type; `amount` is clamped to what's actually possible."""
        port = self.galaxy.ports.get(sector)
        if not port:
            return {"ok": False, "reason": "No port here"}
        t = port.trade_type(i)
        if t not in ("B", "S"):
            return {"ok": False, "reason": "Not traded here"}
        amount = max(0, min(int(amount), self.max_trade(sector, i)))
        if amount == 0:
            return {"ok": False, "reason": "Nothing to trade"}

        p = self.player
        value = amount * port.prices[i]
        if t == "B":                       # player sells
            self._add_cargo(i, -amount)
            p.credits += value
            port.stock[i] -= amount
            verb = "Sold"
        else:                              # player buys
            self._add_cargo(i, amount)
            p.credits -= value
            port.stock[i] -= amount
            verb = "Bought"
        p.ports_visited.add(sector)
        return {"ok": True, "verb": verb, "amount": amount,
                "name": COMMODITIES[i], "credits": value}

    def sector_info(self, sector: int) -> dict:
        g = self.galaxy
        star = g.stars.get(sector, {})
        return {
            "sector":   sector,
            "name":     g.star_name(sector),
            "spect":    star.get("spect", "G"),
            "dist_ly":  star.get("dist_ly", 0.0),
            "x": star.get("x", 0), "y": star.get("y", 0), "z": star.get("z", 0),
            "hyg_id":   star.get("hyg_id", 0),
            "port":     g.ports.get(sector),
            "planet":   g.planets.get(sector),
            "pirates":  g.pirates.get(sector, 0),
            "warps":    g.warps.get(sector, []),
        }
