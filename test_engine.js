const E = require('./web/engine.js'); const fs = require('fs');
const D = JSON.parse(fs.readFileSync('data/scen20.json')).scen;
let rows = [];
for (const seed of Object.keys(D)) {
  const sc = D[seed].sc;
  const b = E.baseline(sc), p = E.plan(sc, { budgetMs: +process.argv[2] || 300, seed: 11 });
  const vb = E.validate(sc, b), vp = E.validate(sc, p);
  rows.push({ seed, js: p.score.score, cp: D[seed].cpsat.score, gr: D[seed].greedy.score, jsb: b.score.score, cov: p.metrics.coverage_pct, cpcov: D[seed].cpsat.cov, risk: p.metrics.avg_risk, cprisk: D[seed].cpsat.risk, it: p.solver.iterations, viol: vb.length + vp.length });
  if (vb.length + vp.length) console.log('VIOL', seed, vb.slice(0, 3), vp.slice(0, 3));
}
console.table(rows);
const m = k => rows.reduce((s, r) => s + r[k], 0) / rows.length;
console.log('mean js/cp score ratio', (m('js') / m('cp')).toFixed(4), 'js cov', m('cov').toFixed(2), 'cp cov', m('cpcov').toFixed(2), 'js risk', m('risk').toFixed(2), 'cp risk', m('cprisk').toFixed(2), 'baseline parity js/py', (m('jsb') / m('gr')).toFixed(4));
