"""CP-SAT planner + sequential baseline + independent plan validator for SIH26250."""
import math, time, copy
from ortools.sat.python import cp_model
from scenario import *

def weight(m):
    return m['priority'] ** 2

W = dict(value=100, risk=25, ready=20, flight=2, delay=4, keep=400, shift=60)


# ---------------------------------------------------------------- helpers
def allowed_slots(m):
    forb = m.get("forbid", [])
    return [s for s in range(m["earliest"], m["latest"] + 1)
            if not any(a <= s <= b for a, b in forb)]

def has_tanker(m):
    return any(r["roles"] == ["TKR"] for r in m["reqs"])

def candidates(m, ri, req, fleet):
    out = []
    tk = has_tanker(m)
    for a in fleet:
        if not eligible(m, a, req, tk):
            continue
        if a["avail_from"] > m["latest"]:
            continue
        out.append(a)
    return out

def frozen_ids(prev, event_slot):
    if not prev:
        return set()
    return {mid for mid, p in prev["missions"].items() if p["start"] < event_slot}


# ---------------------------------------------------------------- CP-SAT planner
def solve_plan(sc, prev=None, event_slot=0, time_limit=8.0, workers=2, seed=1, warm=None, weights=None, fixed_plan=None):
    Wl = dict(W); Wl.update(weights or {})
    t0 = time.time()
    fleet, missions = sc["fleet"], sc["missions"]
    byid = {a["id"]: a for a in fleet}
    frozen = frozen_ids(prev, event_slot)
    pins = {mid: prev["missions"][mid] for mid in frozen}
    if fixed_plan:
        pins.update(fixed_plan["missions"]); frozen = set(pins)
    frozen = {mid for mid in frozen if any(m["id"] == mid for m in missions)}
    model = cp_model.CpModel()
    y, s, z, xv = {}, {}, {}, {}
    dur = {}
    impossible = set()

    for m in missions:
        mid = m["id"]
        y[mid] = model.NewBoolVar(f"y_{mid}")
        if m.get("must"):
            model.Add(y[mid] == 1)
        slots = [t for t in allowed_slots(m) if t >= event_slot]
        if mid in frozen:
            st = pins[mid]["start"]
            s[mid] = model.NewIntVar(st, st, f"s_{mid}")
        elif slots:
            dom = cp_model.Domain.FromValues(slots)
            s[mid] = model.NewIntVarFromDomain(dom, f"s_{mid}")
        else:
            s[mid] = model.NewIntVar(m["earliest"], m["earliest"], f"s_{mid}")
            model.Add(y[mid] == 0)
            impossible.add(mid)

    # assignment variables
    for m in missions:
        mid = m["id"]
        for ri, req in enumerate(m["reqs"]):
            cands = candidates(m, ri, req, fleet)
            for a in cands:
                z[(mid, ri, a["id"])] = model.NewBoolVar(f"z_{mid}_{ri}_{a['id']}")
            n_c = len(cands)
            if n_c < req["n"]:
                model.Add(y[mid] == 0)
            model.Add(sum(z[(mid, ri, a["id"])] for a in cands) == req["n"] * y[mid]) if n_c else None
        for a in fleet:
            vs = [z[(mid, ri, a["id"])] for ri in range(len(m["reqs"])) if (mid, ri, a["id"]) in z]
            if vs:
                x = model.NewBoolVar(f"x_{mid}_{a['id']}")
                model.Add(sum(vs) == x)
                xv[(mid, a["id"])] = x
                dur[(mid, a["id"])] = sortie_duration(m, a)
                if a["avail_from"] > 0:
                    model.Add(s[mid] >= a["avail_from"]).OnlyEnforceIf(x)

    # aircraft cannot fly two sorties at once (incl. turnaround)
    for a in fleet:
        ivs = []
        for m in missions:
            k = (m["id"], a["id"])
            if k in xv:
                ivs.append(model.NewOptionalFixedSizeIntervalVar(s[m["id"]], dur[k] + TURNAROUND, xv[k], f"iv_{k}"))
        if len(ivs) > 1:
            model.AddNoOverlap(ivs)

    # crew duty limit
    for a in fleet:
        terms = [dur[(m["id"], a["id"])] * xv[(m["id"], a["id"])] for m in missions if (m["id"], a["id"]) in xv]
        if terms:
            model.Add(sum(terms) <= int(a["duty_h"] * 60 / SLOT_MIN))

    # runway / launch capacity per base
    for b in BASES:
        ivs = []
        for m in missions:
            for a in fleet:
                if a["base"] == b and (m["id"], a["id"]) in xv:
                    ivs.append(model.NewOptionalFixedSizeIntervalVar(s[m["id"]], 1, xv[(m["id"], a["id"])], "l"))
        if ivs:
            model.AddCumulative(ivs, [1] * len(ivs), LAUNCH_CAP)

    # weapon stocks per base
    for b in BASES:
        for w in ("AAM", "PGM", "ARM"):
            terms = []
            for m in missions:
                for ri, req in enumerate(m["reqs"]):
                    if req["w"] != w:
                        continue
                    for a in fleet:
                        k = (m["id"], ri, a["id"])
                        if a["base"] == b and k in z:
                            terms.append(req["q"] * z[k])
            if terms:
                model.Add(sum(terms) <= sc["stock"][b][w])

    # freeze already-launched missions
    if pins:
        for mid in frozen:
            model.Add(y[mid] == 1)
            keep = {(a["req"], a["aircraft"]) for a in pins[mid]["assigned"]}
            for k, v in z.items():
                if k[0] == mid:
                    model.Add(v == (1 if (k[1], k[2]) in keep else 0))

    # objective
    obj = []
    risk = {}
    for m in missions:
        mid = m["id"]
        obj.append(Wl["value"] * weight(m) * y[mid])
        d = model.NewIntVar(0, HORIZON, f"d_{mid}")
        model.Add(d == s[mid] - m["earliest"]).OnlyEnforceIf(y[mid])
        model.Add(d == 0).OnlyEnforceIf(y[mid].Not())
        obj.append(-Wl["delay"] * m["priority"] * d)
        if prev and mid in prev["missions"] and mid not in frozen:
            s0 = prev["missions"][mid]["start"]
            sh = model.NewIntVar(0, HORIZON, f"sh_{mid}")
            model.Add(sh >= s[mid] - s0); model.Add(sh >= s0 - s[mid])
            obj.append(-Wl["shift"] * sh)
        for a in fleet:
            k = (mid, a["id"])
            if k not in xv:
                continue
            r = risk_table(m, a, sc["threats"])
            risk[k] = r
            c = Wl["risk"] * r + Wl["ready"] * m["priority"] * a.get("p_nogo", 0.05) * 10 + Wl["flight"] * dur[k]
            obj.append(-int(round(c)) * xv[k])
            if prev and mid in prev["missions"] and mid not in frozen:
                if any(p["aircraft"] == a["id"] for p in prev["missions"][mid]["assigned"]):
                    obj.append(Wl["keep"] * xv[k])
    model.Maximize(sum(obj))

    # warm start: previous plan (replanning) or a fast heuristic plan (cold start of large instances)
    hint = prev if prev else warm
    if hint:
        for m in missions:
            pm = hint["missions"].get(m["id"])
            if pm:
                model.AddHint(y[m["id"]], 1)
                model.AddHint(s[m["id"]], pm["start"])
                have = {(a["req"], a["aircraft"]) for a in pm["assigned"]}
                for k, v in z.items():
                    if k[0] == m["id"]:
                        model.AddHint(v, 1 if (k[1], k[2]) in have else 0)
                for (mm, aid), xvar in xv.items():
                    if mm == m["id"]:
                        model.AddHint(xvar, 1 if any(a["aircraft"] == aid for a in pm["assigned"]) else 0)
            else:
                model.AddHint(y[m["id"]], 0)
                for k, v in z.items():
                    if k[0] == m["id"]:
                        model.AddHint(v, 0)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_workers = workers
    solver.parameters.random_seed = seed
    solver.parameters.relative_gap_limit = 0.005
    status = solver.Solve(model)
    wall = time.time() - t0
    name = solver.StatusName(status)
    plan = {"missions": {}, "unflown": {}, "solver": {"status": name, "wall_s": round(wall, 3),
            "objective": solver.ObjectiveValue() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
            "bound": solver.BestObjectiveBound() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
            "n_vars": len(z) + len(missions) * 2, "engine": "CP-SAT"}}
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return plan
    for m in missions:
        mid = m["id"]
        if solver.Value(y[mid]):
            asg = []
            for ri, req in enumerate(m["reqs"]):
                for a in fleet:
                    k = (mid, ri, a["id"])
                    if k in z and solver.Value(z[k]):
                        asg.append({"aircraft": a["id"], "role": a["role"], "base": a["base"], "req": ri,
                                    "weapon": req["w"], "qty": req["q"], "dur": dur[(mid, a["id"])],
                                    "risk": risk[(mid, a["id"])]})
            plan["missions"][mid] = {"start": solver.Value(s[mid]), "assigned": asg}
        else:
            plan["unflown"][mid] = explain_unflown(sc, m, plan, impossible)
    plan["metrics"] = compute_metrics(sc, plan)
    return plan

def explain_unflown(sc, m, plan, impossible):
    if m["id"] in impossible:
        return "No usable launch window (weather / airspace closure)"
    for ri, req in enumerate(m["reqs"]):
        c = candidates(m, ri, req, sc["fleet"])
        if len(c) < req["n"]:
            return f"Not enough serviceable {'/'.join(req['roles'])} aircraft in range"
    return "Displaced by higher-value missions competing for aircraft, crew hours or weapons"


# ---------------------------------------------------------------- metrics
def compute_metrics(sc, plan):
    ms = {m["id"]: m for m in sc["missions"]}
    tot_prio = sum(weight(m) for m in sc["missions"])
    flown = plan["missions"]
    val = sum(weight(ms[i]) for i in flown)
    sorties = [a for p in flown.values() for a in p["assigned"]]
    hrs = sum(a["dur"] for a in sorties) * SLOT_MIN / 60
    avail_ac = sum(1 for a in sc["fleet"] if a["avail_from"] <= HORIZON)
    used = {}
    for p in flown.values():
        for a in p["assigned"]:
            if a["weapon"]:
                used[a["weapon"]] = used.get(a["weapon"], 0) + a["qty"]
    prio_w_risk = sum(a["risk"] for a in sorties)
    return {"missions_total": len(sc["missions"]), "missions_flown": len(flown),
            "priority_total": tot_prio, "priority_covered": val,
            "coverage_pct": round(100 * val / tot_prio, 1) if tot_prio else 0.0,
            "sorties": len(sorties), "flight_hours": round(hrs, 1),
            "avg_risk": round(prio_w_risk / len(sorties), 1) if sorties else 0.0,
            "weapons_used": used,
            "aircraft_used": len({a["aircraft"] for a in sorties}), "aircraft_total": avail_ac}


# ---------------------------------------------------------------- independent validator
def validate_plan(sc, plan):
    """Re-checks every hard constraint from scratch; returns a list of violation strings."""
    v = []
    byid = {a["id"]: a for a in sc["fleet"]}
    ms = {m["id"]: m for m in sc["missions"]}
    busy, hours, wuse, launches = {}, {}, {}, {}
    for mid, p in plan["missions"].items():
        m = ms[mid]; st = p["start"]
        if not (m["earliest"] <= st <= m["latest"]):
            v.append(f"{mid}: start {st} outside window")
        if any(a <= st <= b for a, b in m.get("forbid", [])):
            v.append(f"{mid}: start in forbidden (weather/airspace) slot")
        for ri, req in enumerate(m["reqs"]):
            got = [a for a in p["assigned"] if a["req"] == ri]
            if len(got) != req["n"]:
                v.append(f"{mid}: requirement {ri} has {len(got)}/{req['n']} aircraft")
        seen = set()
        for a in p["assigned"]:
            ac = byid[a["aircraft"]]
            if a["aircraft"] in seen:
                v.append(f"{mid}: {a['aircraft']} used twice")
            seen.add(a["aircraft"])
            if ac["role"] not in m["reqs"][a["req"]]["roles"]:
                v.append(f"{mid}: {a['aircraft']} wrong role")
            if ac["role"] != "TKR" and 2 * dist(BASES[ac["base"]]["xy"], m["target"]) > ac["range"] and not has_tanker(m):
                v.append(f"{mid}: {a['aircraft']} out of range without tanker")
            if st < ac["avail_from"]:
                v.append(f"{mid}: {a['aircraft']} not yet serviceable")
            d = sortie_duration(m, ac)
            for (s2, e2, o) in busy.get(a["aircraft"], []):
                if st < e2 and s2 < st + d + TURNAROUND:
                    v.append(f"{mid}: {a['aircraft']} overlaps sortie of {o}")
            busy.setdefault(a["aircraft"], []).append((st, st + d + TURNAROUND, mid))
            hours[a["aircraft"]] = hours.get(a["aircraft"], 0) + d
            if a["weapon"]:
                key = (ac["base"], a["weapon"]); wuse[key] = wuse.get(key, 0) + a["qty"]
            launches[(ac["base"], st)] = launches.get((ac["base"], st), 0) + 1
    for aid, h in hours.items():
        if h > int(byid[aid]["duty_h"] * 60 / SLOT_MIN):
            v.append(f"{aid}: crew duty exceeded ({h * SLOT_MIN / 60:.1f} h > {byid[aid]['duty_h']} h)")
    for (b, w), q in wuse.items():
        if q > sc["stock"][b][w]:
            v.append(f"{b}: {w} stock exceeded ({q}>{sc['stock'][b][w]})")
    for (b, t), n in launches.items():
        if n > LAUNCH_CAP:
            v.append(f"{b}: launch capacity exceeded at slot {t}")
    return v


# ---------------------------------------------------------------- baseline: sequential priority-first planner
def greedy_plan(sc, prev=None, event_slot=0):
    """Proxy for manual, sequential planning: highest priority first, earliest feasible slot, nearest free aircraft."""
    t0 = time.time()
    fleet, missions = sc["fleet"], sc["missions"]
    byid = {a["id"]: a for a in fleet}
    frozen = frozen_ids(prev, event_slot)
    plan = {"missions": {}, "unflown": {}, "solver": {"engine": "Sequential heuristic"}}
    busy, hours, wuse, launches = {}, {}, {}, {}

    def commit(m, st, asg):
        for a in asg:
            ac = byid[a["aircraft"]]
            busy.setdefault(ac["id"], []).append((st, st + a["dur"] + TURNAROUND))
            hours[ac["id"]] = hours.get(ac["id"], 0) + a["dur"]
            if a["weapon"]:
                wuse[(ac["base"], a["weapon"])] = wuse.get((ac["base"], a["weapon"]), 0) + a["qty"]
            launches[(ac["base"], st)] = launches.get((ac["base"], st), 0) + 1
        plan["missions"][m["id"]] = {"start": st, "assigned": asg}

    ms = {m["id"]: m for m in missions}
    for mid in frozen:
        if mid in ms:
            commit(ms[mid], prev["missions"][mid]["start"], copy.deepcopy(prev["missions"][mid]["assigned"]))

    order = sorted([m for m in missions if m["id"] not in frozen], key=lambda m: (-m["priority"], m["earliest"]))
    for m in order:
        done = False
        for st in [t for t in allowed_slots(m) if t >= event_slot]:
            tent_asg, used_here, w_here, l_here, ok = [], set(), {}, {}, True
            for ri, req in enumerate(m["reqs"]):
                cands = sorted(candidates(m, ri, req, fleet),
                               key=lambda a: dist(BASES[a["base"]]["xy"], m["target"]))
                picked = 0
                for a in cands:
                    if picked == req["n"]:
                        break
                    if a["id"] in used_here or st < a["avail_from"]:
                        continue
                    d = sortie_duration(m, a)
                    if any(st < e and s0 < st + d + TURNAROUND for s0, e in busy.get(a["id"], [])):
                        continue
                    if hours.get(a["id"], 0) + d > int(a["duty_h"] * 60 / SLOT_MIN):
                        continue
                    if req["w"]:
                        kk = (a["base"], req["w"])
                        if wuse.get(kk, 0) + w_here.get(kk, 0) + req["q"] > sc["stock"][a["base"]][req["w"]]:
                            continue
                    lk = (a["base"], st)
                    if launches.get(lk, 0) + l_here.get(lk, 0) + 1 > LAUNCH_CAP:
                        continue
                    used_here.add(a["id"])
                    if req["w"]:
                        w_here[kk] = w_here.get(kk, 0) + req["q"]
                    l_here[lk] = l_here.get(lk, 0) + 1
                    tent_asg.append({"aircraft": a["id"], "role": a["role"], "base": a["base"], "req": ri,
                                     "weapon": req["w"], "qty": req["q"], "dur": d,
                                     "risk": risk_table(m, a, sc["threats"])})
                    picked += 1
                if picked < req["n"]:
                    ok = False
                    break
            if ok:
                commit(m, st, tent_asg); done = True
                break
        if not done:
            plan["unflown"][m["id"]] = "No feasible slot / aircraft combination found"
    plan["solver"]["wall_s"] = round(time.time() - t0, 3)
    plan["solver"]["status"] = "HEURISTIC"
    plan["metrics"] = compute_metrics(sc, plan)
    return plan


def plan_score(sc, plan, prev=None, event_slot=0):
    """Evaluate ANY plan with the same objective the optimiser uses (value - risk - readiness - flight - delay)."""
    ms = {m["id"]: m for m in sc["missions"]}
    byid = {a["id"]: a for a in sc["fleet"]}
    val = risk = ready = flight = delay = 0
    for mid, p in plan["missions"].items():
        m = ms[mid]
        val += W["value"] * weight(m)
        delay += W["delay"] * m["priority"] * (p["start"] - m["earliest"])
        for a in p["assigned"]:
            risk += W["risk"] * a["risk"]
            ready += int(round(W["ready"] * m["priority"] * byid[a["aircraft"]].get("p_nogo", 0.05) * 10))
            flight += W["flight"] * a["dur"]
    return {"score": val - risk - ready - flight - delay, "value": val, "risk": risk, "readiness": ready,
            "flight": flight, "delay": delay}


def solve_rolling(sc, block=8, look=2, tl_block=2.0, weights=None):
    """Receding-horizon decomposition: optimise one time block (plus look-ahead) at a time, then commit it."""
    t0 = time.time()
    plan = {"missions": {}, "unflown": {}}
    allm = sc["missions"]
    for b0 in range(0, HORIZON, block):
        cur = [m for m in allm if b0 <= m["earliest"] < b0 + block]
        if not cur:
            continue
        la = [m for m in allm if b0 + block <= m["earliest"] < b0 + look * block]
        ids = set(plan["missions"]) | {m["id"] for m in cur} | {m["id"] for m in la}
        sub = dict(sc); sub["missions"] = [m for m in allm if m["id"] in ids]
        warm = greedy_plan(sub, prev=plan, event_slot=HORIZON + 99) if plan["missions"] else greedy_plan(sub)
        p = solve_plan(sub, fixed_plan=plan, time_limit=tl_block, warm=warm, weights=weights)
        if "metrics" not in p:
            p = warm
        for m in cur:
            if m["id"] in p["missions"]:
                plan["missions"][m["id"]] = p["missions"][m["id"]]
    for m in allm:
        if m["id"] not in plan["missions"]:
            plan["unflown"][m["id"]] = "Displaced by higher-value missions competing for aircraft, crew hours or weapons"
    plan["solver"] = {"status": "ROLLING", "wall_s": round(time.time() - t0, 3), "engine": "CP-SAT rolling horizon"}
    plan["metrics"] = compute_metrics(sc, plan)
    return plan


def solve_lns(sc, budget=10.0, win=10, step=5, tl_sub=1.2, weights=None, start=None, seed=3):
    """Large-neighbourhood search around CP-SAT: start from the fast heuristic, then repeatedly free one
    time window of missions, pin everything else, and let CP-SAT re-optimise that neighbourhood."""
    import random as _r
    rng = _r.Random(seed)
    t0 = time.time()
    plan = start or greedy_plan(sc)
    best = plan_score(sc, plan)["score"]
    allm = sc["missions"]
    windows = [(a, a + win) for a in range(0, HORIZON - 8, step)]
    it = 0
    order = list(windows)
    while time.time() - t0 < budget:
        if not order:
            order = list(windows); rng.shuffle(order)
        if it % 2 == 0:
            a, b = order.pop(0)
            free = {m["id"] for m in allm if a <= m["earliest"] < b}
        else:
            # mixed neighbourhood: some untasked high-value missions + tasked missions that overlap them in time
            un = sorted([m for m in allm if m["id"] not in plan["missions"]], key=lambda m: -weight(m) * rng.random())[:4]
            free = {m["id"] for m in un}
            for u in un:
                near = [m["id"] for m in allm if m["id"] in plan["missions"] and abs(m["earliest"] - u["earliest"]) <= 10]
                rng.shuffle(near); free |= set(near[:3])
        if len(free) > 14:
            free = set(rng.sample(sorted(free), 14))
        if not free:
            it += 1
            continue
        pinned = {"missions": {k: v for k, v in plan["missions"].items() if k not in free}}
        ids = set(pinned["missions"]) | free
        sub = dict(sc); sub["missions"] = [m for m in allm if m["id"] in ids]
        left = budget - (time.time() - t0)
        if left < 0.35:
            break
        p = solve_plan(sub, fixed_plan=pinned, time_limit=max(0.3, min(tl_sub, left)), warm=plan, weights=weights)
        it += 1
        if "metrics" not in p:
            continue
        cand = {"missions": p["missions"]}
        sc_ = plan_score(sc, cand)["score"]
        if sc_ > best:
            best = sc_; plan = {"missions": p["missions"], "unflown": {}}
    out = {"missions": plan["missions"], "unflown": {}}
    for m in allm:
        if m["id"] not in out["missions"]:
            out["unflown"][m["id"]] = "Displaced by higher-value missions competing for aircraft, crew hours or weapons"
    out["solver"] = {"status": "LNS", "wall_s": round(time.time() - t0, 3), "engine": "CP-SAT + LNS", "iterations": it}
    out["metrics"] = compute_metrics(sc, out)
    return out
