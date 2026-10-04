import json
from scenario import *
from solver import *
rows = []; scen = {}
for k, nm in [(1, 27), (2, 54), (3, 81), (4, 108)]:
    for seed in (1, 2, 3):
        sc = scaled_scenario(seed, k, nm)
        g = greedy_plan(sc)
        m = solve_plan(sc, time_limit=10, warm=g)
        l = solve_lns(sc, budget=10, tl_sub=1.0)
        v = len(validate_plan(sc, m)) + len(validate_plan(sc, l)) + len(validate_plan(sc, g))
        r = {"aircraft": len(sc["fleet"]), "missions": nm, "seed": seed,
             "g_score": plan_score(sc, g)["score"], "m_score": plan_score(sc, m)["score"], "l_score": plan_score(sc, l)["score"],
             "g_cov": g["metrics"]["coverage_pct"], "m_cov": m["metrics"]["coverage_pct"], "l_cov": l["metrics"]["coverage_pct"],
             "g_risk": g["metrics"]["avg_risk"], "m_risk": m["metrics"]["avg_risk"], "l_risk": l["metrics"]["avg_risk"],
             "m_s": m["solver"]["wall_s"], "m_status": m["solver"]["status"], "l_s": l["solver"]["wall_s"], "viol": v}
        rows.append(r); print(r, flush=True)
        scen[f"{k}_{seed}"] = sc
json.dump(rows, open("data/bench_scale.json", "w"))
json.dump(scen, open("data/scen_scale.json", "w"), default=lambda o: o.item() if hasattr(o, "item") else list(o))
