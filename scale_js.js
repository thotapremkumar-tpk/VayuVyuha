const E = require('./web/engine.js'); const fs = require('fs');
const S = JSON.parse(fs.readFileSync('data/scen_scale.json')); const R = JSON.parse(fs.readFileSync('data/bench_scale.json'));
const out = [];
for (const r of R) { const k = r.aircraft / 28, sc = S[k + '_' + r.seed]; const p = E.plan(sc, { budgetMs: 2000, seed: 11 });
  out.push({ aircraft: r.aircraft, missions: r.missions, seed: r.seed, js_score: p.score.score, js_cov: p.metrics.coverage_pct, js_risk: p.metrics.avg_risk, viol: E.validate(sc, p).length, it: p.solver.iterations });
  console.log(out[out.length - 1], 'greedy', r.g_score, 'exact', r.m_score, 'lns', r.l_score); }
fs.writeFileSync('data/bench_scale_js.json', JSON.stringify(out));
