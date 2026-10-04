"""Synthetic scenario generator for the Dynamic Air Operations Planner (SIH26250).
Everything here is FICTIONAL: a made-up 1000x1000 km theatre, no real geography or order of battle.
"""
import math, random, copy

SLOT_MIN = 15            # one planning slot = 15 minutes
HORIZON = 48             # 12 hours
SPEED = 200              # km per slot (~800 km/h)
TURNAROUND = 4           # slots of ground time between sorties (1 hour)
LAUNCH_CAP = 3           # max launches per base per slot (runway capacity)

ROLE_RANGE = {"FGT": 1600, "MRC": 1800, "STK": 1500, "SEAD": 1500, "ISR": 3000, "TKR": 3500}
ROLE_VULN = {"FGT": 0.8, "MRC": 0.9, "STK": 1.0, "SEAD": 0.9, "ISR": 0.6, "TKR": 0.3}
ROLE_NAME = {"FGT": "Fighter", "MRC": "Multirole", "STK": "Strike", "SEAD": "SEAD/Defence-suppression",
             "ISR": "ISR", "TKR": "Tanker"}

BASES = {
    "AB-1": {"name": "Northgate", "xy": (140, 180)},
    "AB-2": {"name": "Centrefield", "xy": (500, 110)},
    "AB-3": {"name": "Eastridge", "xy": (860, 220)},
}
STOCK = {  # weapons available per base
    "AB-1": {"AAM": 8, "PGM": 12, "ARM": 4},
    "AB-2": {"AAM": 8, "PGM": 12, "ARM": 4},
    "AB-3": {"AAM": 6, "PGM": 10, "ARM": 3},
}

MISSION_TYPES = {
    "CAP":  {"label": "Combat air patrol", "color": "#2f6fdb"},
    "STRK": {"label": "Strike",            "color": "#e07a1f"},
    "ISR":  {"label": "ISR",               "color": "#1f9d8a"},
    "SEAD": {"label": "SEAD sweep",        "color": "#8a5cd0"},
    "INT":  {"label": "Interdiction",      "color": "#c9a017"},
    "TST":  {"label": "Time-sensitive target", "color": "#d6455d"},
}

def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])

def seg_circle_hit(p, q, c, r):
    """True if segment p-q passes within r of centre c."""
    px, py = p; qx, qy = q; cx, cy = c
    dx, dy = qx - px, qy - py
    L2 = dx * dx + dy * dy or 1e-9
    t = max(0, min(1, ((cx - px) * dx + (cy - py) * dy) / L2))
    return math.hypot(px + t * dx - cx, py + t * dy - cy) <= r

def base_fleet(rng, p_nogo=None):
    comp = [("AB-1", {"FGT": 3, "MRC": 2, "STK": 3, "SEAD": 1, "ISR": 1, "TKR": 1}),
            ("AB-2", {"FGT": 2, "MRC": 3, "STK": 2, "SEAD": 1, "ISR": 1, "TKR": 1}),
            ("AB-3", {"FGT": 2, "MRC": 1, "STK": 1, "SEAD": 1, "ISR": 1, "TKR": 1})]
    fleet, counters = [], {}
    for base, roles in comp:
        for role, n in roles.items():
            for _ in range(n):
                counters[role] = counters.get(role, 0) + 1
                fleet.append({
                    "id": f"{role}-{counters[role]:02d}", "role": role, "base": base,
                    "range": ROLE_RANGE[role],
                    "avail_from": 0,
                    "duty_h": round(rng.uniform(6, 10), 1),
                    # health telemetry features used by the readiness model
                    "hrs_since_service": round(rng.uniform(5, 150), 1),
                    "sorties_72h": rng.randint(0, 9),
                    "age_years": round(rng.uniform(2, 24), 1),
                    "vib_anomaly": round(rng.betavariate(1.5, 6), 3),
                    "fault_count_30d": rng.randint(0, 5),
                })
    # a few aircraft still in maintenance at t=0, a few tired crews
    for a in rng.sample(fleet, 4):
        a["avail_from"] = rng.randint(3, 14)
    for a in rng.sample(fleet, 3):
        a["duty_h"] = round(rng.uniform(2.5, 4), 1)
    return fleet

def make_mission(mid, mtype, target, prio, earliest, latest, dwell, reqs, label=None):
    return {"id": mid, "type": mtype, "target": target, "priority": prio, "earliest": earliest,
            "latest": latest, "dwell": dwell, "reqs": reqs, "forbid": [], "label": label or MISSION_TYPES[mtype]["label"]}

def initial_missions(rng):
    M = []
    def pt(xr, yr):
        return (round(rng.uniform(*xr)), round(rng.uniform(*yr)))
    n = 0
    def add(mtype, prio, target, lo, width, dwell, reqs, label=None):
        nonlocal n
        n += 1
        e = lo; l = min(HORIZON - 14, lo + width)
        M.append(make_mission(f"M{n:02d}", mtype, target, prio, e, l, dwell, reqs, label))
    # CAPs near the front line
    for lo, xr in [(2, (150, 350)), (8, (450, 650)), (14, (700, 900)), (20, (300, 600)), (26, (600, 850))]:
        add("CAP", rng.randint(5, 7), pt(xr, (380, 480)), lo, 6, 8,
            [{"roles": ["FGT"], "n": 2, "w": "AAM", "q": 2}])
    # strikes deep in the theatre, several inside the SAM envelopes
    strike_slots = [3, 5, 7, 10, 12, 15, 18, 21, 24, 27, 30, 32]
    spots = [(300, 650), (640, 700), (780, 560), None, None, (310, 620), (650, 690), None, (790, 570), None, None, None]
    for lo, sp in zip(strike_slots, spots):
        tgt = (sp[0] + rng.randint(-40, 40), sp[1] + rng.randint(-40, 40)) if sp else pt((180, 880), (560, 840))
        add("STRK", rng.randint(6, 9), tgt, lo, 6, 2,
            [{"roles": ["STK", "MRC"], "n": 2, "w": "PGM", "q": 2}])
    # ISR
    for lo in [1, 9, 17, 25]:
        add("ISR", rng.randint(4, 6), pt((250, 850), (500, 800)), lo, 10, 6,
            [{"roles": ["ISR"], "n": 1, "w": None, "q": 0}])
    # SEAD sweep
    add("SEAD", 5, pt((400, 650), (600, 780)), 8, 8, 4,
        [{"roles": ["SEAD"], "n": 2, "w": "ARM", "q": 1}])
    # interdiction
    for lo in [4, 11, 16, 23, 29]:
        add("INT", rng.randint(4, 6), pt((200, 800), (450, 700)), lo, 8, 2,
            [{"roles": ["MRC", "STK"], "n": 2, "w": "PGM", "q": 1}])
    return M

def initial_threats():
    return [
        {"id": "T1", "name": "SAM battery A", "xy": (310, 640), "r": 110, "leth": 0.8, "from": 0},
        {"id": "T2", "name": "SAM battery B", "xy": (640, 700), "r": 120, "leth": 0.7, "from": 0},
        {"id": "T3", "name": "SAM battery C", "xy": (780, 560), "r": 90, "leth": 0.6, "from": 0},
    ]

def initial_weather():
    return [{"id": "W1", "name": "Squall line", "xy": (520, 520), "r": 110, "t0": 20, "t1": 28}]

def refresh_requirements(m, threats, mission_frozen=False):
    """Apply threat-driven requirements: extra SEAD escort / tanker for long legs. Idempotent."""
    if mission_frozen:
        return
    base_reqs = [r for r in m["reqs"] if not r.get("auto")]
    reqs = list(base_reqs)
    t = m["target"]
    if m["type"] in ("STRK", "INT", "TST", "ISR"):
        hot = [th for th in threats if dist(th["xy"], t) <= th["r"] and th["leth"] >= 0.6]
        if hot and m["type"] != "ISR":
            reqs.append({"roles": ["SEAD"], "n": 1, "w": "ARM", "q": 1, "auto": "sead"})
    far = min(dist(b["xy"], t) for b in BASES.values())
    if far > 650 and m["type"] != "ISR":
        reqs.append({"roles": ["TKR"], "n": 1, "w": None, "q": 0, "auto": "tanker"})
    m["reqs"] = reqs
    m["sead"] = any(r.get("auto") == "sead" for r in reqs)

def compute_weather_forbid(m, weather):
    forb = []
    for w in weather:
        if dist(w["xy"], m["target"]) <= w["r"]:
            nearest = min(dist(b["xy"], m["target"]) for b in BASES.values())
            off = int(nearest / SPEED)
            forb.append((max(0, w["t0"] - off - m["dwell"]), w["t1"] - off))
    return forb

def risk_table(m, ac, threats, t_now=0):
    """Integer risk score (0..100) for aircraft ac flying mission m."""
    base = BASES[ac["base"]]["xy"]; tgt = m["target"]
    r = 0.0
    for th in threats:
        if th["from"] > m["latest"] + m["dwell"]:
            continue
        inside = dist(th["xy"], tgt) <= th["r"]
        cross = seg_circle_hit(base, tgt, th["xy"], th["r"])
        e = 1.0 if inside else (0.45 if cross else 0.0)
        r += th["leth"] * e * 60
    r *= ROLE_VULN[ac["role"]]
    if m.get("sead") and ac["role"] != "SEAD":
        r *= 0.4
    return int(round(min(r, 100)))

def sortie_duration(m, ac):
    d = dist(BASES[ac["base"]]["xy"], m["target"])
    return max(2, int(math.ceil(2 * d / SPEED)) + m["dwell"])

def eligible(m, ac, req, tanker_in_package):
    if ac["role"] not in req["roles"]:
        return False
    if ac["role"] == "TKR":
        return True
    d = dist(BASES[ac["base"]]["xy"], m["target"])
    return (2 * d <= ac["range"]) or tanker_in_package

def build_scenario(seed=7, p_nogo=None):
    rng = random.Random(seed)
    fleet = base_fleet(rng)
    if p_nogo:
        for a in fleet:
            a["p_nogo"] = p_nogo(a)
    else:
        for a in fleet:
            a["p_nogo"] = 0.05
    threats = initial_threats()
    weather = initial_weather()
    missions = initial_missions(rng)
    for m in missions:
        refresh_requirements(m, threats)
        m["forbid"] = compute_weather_forbid(m, weather)
    return {"fleet": fleet, "missions": missions, "threats": threats, "weather": weather,
            "bases": BASES, "stock": copy.deepcopy(STOCK), "horizon": HORIZON, "now": 0, "seed": seed}

def scaled_scenario(seed, n_aircraft_mult=1.0, n_missions=18):
    """Random benchmark instances of different sizes (used for scaling & robustness experiments)."""
    rng = random.Random(seed)
    sc = build_scenario(seed)
    # replicate fleet
    fleet = sc["fleet"]
    k = max(1, int(round(n_aircraft_mult)))
    if k > 1:
        extra = []
        for rep in range(1, k):
            for a in fleet:
                b = dict(a); b["id"] = a["id"] + f"x{rep}"; extra.append(b)
        sc["fleet"] = fleet + extra
        for b in sc["stock"]:
            for w in sc["stock"][b]:
                sc["stock"][b][w] *= k
    # missions
    base = sc["missions"]
    missions = []
    for i in range(n_missions):
        m = copy.deepcopy(base[i % len(base)])
        m["id"] = f"M{i+1:02d}"
        if i >= len(base):
            m["target"] = (min(950, max(50, m["target"][0] + rng.randint(-120, 120))),
                           min(950, max(300, m["target"][1] + rng.randint(-60, 60))))
            lo = rng.randint(0, HORIZON - 20); m["earliest"] = lo; m["latest"] = min(HORIZON - 14, lo + rng.randint(6, 14))
        refresh_requirements(m, sc["threats"])
        m["forbid"] = compute_weather_forbid(m, sc["weather"])
        missions.append(m)
    sc["missions"] = missions
    return sc
