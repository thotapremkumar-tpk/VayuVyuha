import json, sys
from scenario import *
from solver import *
from predict import *
clf, info = train(); pn = make_p_nogo(clf)
out = {}
for seed in range(1, 21):
    sc = build_scenario(seed, pn)
    g = greedy_plan(sc); p = solve_plan(sc, time_limit=10, warm=g)
    assert not validate_plan(sc, p)
    out[seed] = {"sc": sc, "cpsat": {"score": plan_score(sc, p)["score"], "cov": p["metrics"]["coverage_pct"], "risk": p["metrics"]["avg_risk"], "t": p["solver"]["wall_s"], "status": p["solver"]["status"]},
                 "greedy": {"score": plan_score(sc, g)["score"], "cov": g["metrics"]["coverage_pct"], "risk": g["metrics"]["avg_risk"]}}
    print(seed, out[seed]["cpsat"], out[seed]["greedy"], flush=True)
json.dump({"scen": out, "model": info}, open("data/scen20.json", "w"), default=lambda o: o.item() if hasattr(o, "item") else list(o))
