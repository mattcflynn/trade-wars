#!/usr/bin/env python3
"""
fetch_stars.py — One-time data pipeline for Trade Wars star map.

Downloads the HYG stellar database, filters to 50 light-years,
builds a KNN warp graph, and writes stars.json.

Usage:  uv run fetch_stars.py
Output: stars.json  (checked in alongside the game)
"""

import csv
import json
import math
import random
import urllib.request
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

HYG_URL   = "https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv"
HYG_CACHE = Path("hygdata_v41.csv")
OUTPUT    = Path("stars.json")

RADIUS_LY  = 50.0
RADIUS_PC  = RADIUS_LY / 3.26156   # ≈ 15.325 parsecs

KNN_K         = 4      # neighbours per star (bidirectional, so effective ~4–8)
MAX_WARP_LY   = 10.0   # hard cap on warp link length
MAX_WARP_PC   = MAX_WARP_LY / 3.26156
PRUNE_SEED    = 42     # reproducible 5 % pruning
PRUNE_PCT     = 0.05


# ── Step 1: Download ──────────────────────────────────────────────────────────

def download_hyg():
    if HYG_CACHE.exists():
        print(f"  Using cached {HYG_CACHE}  ({HYG_CACHE.stat().st_size // 1024} KB)")
        return
    print(f"  Downloading HYG database from GitHub...")
    urllib.request.urlretrieve(HYG_URL, HYG_CACHE)
    print(f"  Saved to {HYG_CACHE}  ({HYG_CACHE.stat().st_size // 1024} KB)")


# ── Step 2: Parse & filter ────────────────────────────────────────────────────

def load_stars() -> list[dict]:
    stars = []
    with open(HYG_CACHE, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                dist_pc = float(row["dist"])
            except (ValueError, KeyError):
                continue
            if dist_pc < 0 or dist_pc > RADIUS_PC:
                continue
            try:
                x = float(row["x"])
                y = float(row["y"])
                z = float(row["z"])
            except (ValueError, KeyError):
                continue

            # Build display name: prefer proper, then Bayer/Flamsteed, then HIP/HD
            proper = row.get("proper", "").strip()
            bf     = row.get("bf", "").strip()
            hip    = row.get("hip", "").strip()
            hd     = row.get("hd", "").strip()
            hyg_id = int(row["id"])

            if proper:
                name = proper
            elif bf:
                name = bf
            elif hip:
                name = f"HIP {hip}"
            elif hd:
                name = f"HD {hd}"
            else:
                name = f"Star {hyg_id}"

            ci_raw = row.get("ci", "")
            try:
                ci = round(float(ci_raw), 4)
            except (ValueError, TypeError):
                ci = 0.0

            stars.append({
                "hyg_id":  hyg_id,
                "name":    name,
                "proper":  proper,
                "spect":   row.get("spect", "").strip()[:6],
                "dist_ly": round(dist_pc * 3.26156, 3),
                "x": round(x, 5),
                "y": round(y, 5),
                "z": round(z, 5),
                "ci":      ci,
            })

    # Ensure Sol is present (HYG id=0, dist≈0)
    if not any(s["hyg_id"] == 0 for s in stars):
        stars.append({
            "hyg_id": 0, "name": "Sol", "proper": "Sol",
            "spect": "G2V", "dist_ly": 0.0,
            "x": 0.0, "y": 0.0, "z": 0.0, "ci": 0.65,
        })

    # Sort by distance from Sol, assign sector numbers 1..N
    stars.sort(key=lambda s: s["dist_ly"])
    for i, star in enumerate(stars):
        star["sector"] = i + 1

    print(f"  Parsed {len(stars)} stars within {RADIUS_LY} LY")
    return stars


# ── Step 3: KNN warp graph ────────────────────────────────────────────────────

def build_warps(stars: list[dict]) -> dict[int, list[int]]:
    coords = [(s["x"], s["y"], s["z"]) for s in stars]
    n      = len(stars)
    warps: dict[int, set[int]] = {s["sector"]: set() for s in stars}

    for i in range(n):
        xi, yi, zi = coords[i]
        si         = stars[i]["sector"]
        neighbours = []

        for j in range(n):
            if i == j:
                continue
            xj, yj, zj = coords[j]
            d = math.sqrt((xi-xj)**2 + (yi-yj)**2 + (zi-zj)**2)
            if d <= MAX_WARP_PC:
                neighbours.append((d, stars[j]["sector"]))

        neighbours.sort()
        for _, sj in neighbours[:KNN_K]:
            warps[si].add(sj)
            warps[sj].add(si)

    # Prune 5 % of edges (reproducible), preserving minimum connectivity
    rng = random.Random(PRUNE_SEED)
    seen: set[tuple[int,int]] = set()
    edges = []
    for s, nb_set in warps.items():
        for t in nb_set:
            edge = (min(s, t), max(s, t))
            if edge not in seen:
                seen.add(edge)
                edges.append(edge)

    rng.shuffle(edges)
    pruned = 0
    target = int(len(edges) * PRUNE_PCT)
    for a, b in edges:
        if pruned >= target:
            break
        if len(warps[a]) > 1 and len(warps[b]) > 1:
            warps[a].discard(b)
            warps[b].discard(a)
            pruned += 1

    print(f"  Warp graph: {len(edges)} links total, {pruned} pruned")
    return {s: sorted(nb) for s, nb in warps.items()}


# ── Step 4: Write output ──────────────────────────────────────────────────────

def write_output(stars: list[dict], warps: dict[int, list[int]]):
    # Strip internal sector key from star records for cleanliness
    star_records = [
        {
            "sector": s["sector"],
            "hyg_id": s["hyg_id"],
            "name":   s["name"],
            "proper": s["proper"],
            "spect":  s["spect"],
            "dist_ly": s["dist_ly"],
            "x": s["x"], "y": s["y"], "z": s["z"],
            "ci":     s["ci"],
        }
        for s in stars
    ]

    # JSON keys must be strings
    warps_str = {str(k): v for k, v in warps.items()}

    data = {
        "meta": {
            "radius_ly":  RADIUS_LY,
            "knn_k":      KNN_K,
            "max_warp_ly": MAX_WARP_LY,
            "prune_seed": PRUNE_SEED,
            "count":      len(stars),
        },
        "stars": star_records,
        "warps": warps_str,
    }

    OUTPUT.write_text(json.dumps(data, separators=(",", ":")))
    size_kb = OUTPUT.stat().st_size // 1024
    print(f"  Written {OUTPUT}  ({size_kb} KB, {len(stars)} sectors)")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("\n  Trade Wars — Star Map Builder\n")

    download_hyg()
    stars = load_stars()
    warps = build_warps(stars)
    write_output(stars, warps)

    # Quick sanity check
    sector_1 = next(s for s in stars if s["sector"] == 1)
    print(f"\n  Sector 1 = {sector_1['name']} ({sector_1['spect']}, {sector_1['dist_ly']} LY)")
    sector_2 = next(s for s in stars if s["sector"] == 2)
    print(f"  Sector 2 = {sector_2['name']} ({sector_2['spect']}, {sector_2['dist_ly']} LY)")
    print(f"\n  Done. Run the game with: uv run main.py\n")


if __name__ == "__main__":
    main()
