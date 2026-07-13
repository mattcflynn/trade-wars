This specification outlines the integration of an astronomically accurate, time-shifted star map into **Trade Wars 20002**. The goal is to replace generic sectors with a 100-light-year (LY) radius of the Milky Way, with future growth of the game to project 18,000 years into the future.

V1 will be the current star positions
V2 will be time shifted star positions 18000 years in the future


---

## 1. Data Requirements & Sourcing

### 1.1 Stellar Data (The HYG Database)
* **Source:** HYG Database (v3.0 or later).
* **Scope:** Filter for stars within $r \le 30.67$ parsecs (approx. 100 LY) of Sol.
* **Required Fields:**
    * `id`: Primary key (serves as the **Sector Number**).
    * `proper`: Common name (e.g., Sirius).
    * `spect`: Spectral type (used for resource/hazard generation).
    * `x, y, z`: Current Cartesian coordinates.
    * `pmra, pmdec, rv`: Proper motion and radial velocity (velocity vectors).
    * `ci`: Color index (for UI/visual rendering).

### 1.2 Planetary Data (NASA Exoplanet Archive)
* **Source:** NASA Exoplanet Archive (Confimed Planets table).
* **Scope:** Cross-reference `hip_name` or `hd_name` with the HYG database.
* **Required Fields:** * `pl_name`: Planet name.
    * `pl_orbper`: Orbital period.
    * `pl_rade` or `pl_masse`: Radius/Mass (used to determine planet class: Rocky, Gas Giant, etc.).

---

## 2. The Temporal Projection Engine

The core engine must calculate the "Future Galaxy" state to simulate the drift occurring over 18,000 years.

### 2.1 Kinematic Calculation
For every star in the filtered 100 LY subset, the developer must calculate the new position $P_{future}$ using:
$$P_{future} = P_{2002} + (\vec{V} \cdot \Delta t)$$
Where:
* $\vec{V}$ is the 3D velocity vector derived from `pmra`, `pmdec`, and `rv`.
* $\Delta t = 18,000$ years.

### 2.2 Planetary Inheritance
Planets are "child" objects of their parent star. Their relative coordinates $(0, 0, 0)$ remain anchored to the star’s center. 

---

## 3. Spatial Architecture & Navigation

### 3.1 Warp Path Generation (The "Graph")
The game is node-based. Developers must generate a "Warp Web" using a **K-Nearest Neighbors (KNN)** algorithm.
* **Connection Rule:** Every star should automatically link to its $n$ nearest neighbors (default $n=3$ to $5$).
* **Distance Cap:** Warp links cannot exceed 10 LY.
* **Dead Ends:** Randomly prune 5% of links to create strategic chokepoints and "isolated" systems.

### 3.2 Spatial Indexing
To keep the UI snappy, developers must implement a **KD-Tree** or **Octree** for spatial queries. This ensures that the "Long Range Scan" function can identify nearby stars in $O(\log n)$ time.

---

## 4. Gameplay Mechanics Integration

### 4.1 The "Corrupted Map" State
The map must support three visibility states for any given Sector (Star):
1.  **Unknown:** Star exists in the point cloud but has no name, info, or warp paths.
2.  **Telemetry Locked:** Warp path is visible, but system details (planets, hazards) are hidden.
3.  **Decoded:** Full access to star name, spectral type, and planetary data.

### 4.2 Sector Generation Logic
Upon "Jumping" to a sector for the first time, the game must generate the "Instance":
* **If Real Data Exists:** Populate with planets from the NASA database.
* **If No Data Exists:** Procedurally generate planets based on the star's `spect` (Spectral Type).
    * *Example:* M-class stars (Red Dwarfs) have a high probability of "Tidally Locked" rocky worlds.

---

## 5. Technical Performance Targets

* **Load Time:** Initial map generation/loading should be $< 2$ seconds for 10,000 nodes.
* **Memory:** Total map data (Stars + Planets) must not exceed 100MB RAM.
* **Search Speed:** Finding the closest 5 stars to the player must take $< 10ms$.

---

## 6. Atmosphere & UI (The "Retro-Dark" Spec)
* **Interface:** All navigation must be presented via a monospaced terminal aesthetic.
* **Coordinate Display:** Use $X, Y, Z$ parsec values relative to Sol ($0,0,0$).
* **Audio Hint:** The "Astrometric Alignment" (the tutorial sequence) should include a "crunching" sound effect as the CPU fast-fowards through 18,000 years of stellar drift.

---

**Developer Note:** *Do not use real-time physics for stellar movement during gameplay. Pre-calculate the "Year 20002" positions once at the start of a new save file and treat them as static nodes for the remainder of the campaign.*