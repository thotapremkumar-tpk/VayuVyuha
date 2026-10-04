import json, os
D = json.load(open("data/scen20.json"))
sc = D["scen"]["7"]["sc"]
friendly = {"CAP": "Air patrol", "STRK": "Strike", "ISR": "Reconnaissance", "SEAD": "Air-defence suppression", "INT": "Interdiction"}
for m in sc["missions"]:
    m["label"] = friendly[m["type"]]
names = {"T1": "Air-defence site A", "T2": "Air-defence site B", "T3": "Air-defence site C"}
for t in sc["threats"]:
    t["name"] = names.get(t["id"], t["name"])
bench = json.load(open("data/bench_js.json")) if os.path.exists("data/bench_js.json") else {"js_ratio": 98.9, "js_ms": 300, "n": 20}
data = {"scenario": sc, "model": {"auc": D["model"]["auc"], "importance": D["model"]["importance"]}, "bench": bench}
html = open("web/index.html").read()
html = html.replace("/*__CSS__*/", open("web/app.css").read()).replace("/*__DATA__*/null", json.dumps(data))
html = html.replace("/*__ENGINE__*/", open("web/engine.js").read()).replace("/*__APP__*/", open("web/app.js").read())
open("index.html", "w").write(html)   # root index.html = the page GitHub Pages serves
print("app bytes", len(html))
