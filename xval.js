const E = require('./web/engine.js'); const fs = require('fs');
const D = JSON.parse(fs.readFileSync('data/scen20.json')).scen; const out = {};
for (const seed of Object.keys(D)) { const sc = D[seed].sc; const p = E.plan(sc, { budgetMs: 300, seed: 11 });
  // event replan too
  const ev = { type: 'sam', threat: { id: 'T9', name: 'Pop-up', xy: [500, 650], r: 110, leth: 0.85, from: 10 } };
  const sc2 = E.applyEvent(sc, p, ev, 10); const p2 = E.plan(sc2, { prev: p, now: 10, budgetMs: 200 });
  out[seed] = { p, sc2, p2, d: E.diff(p, p2, 10), v2: E.validate(sc2, p2) }; }
fs.writeFileSync('data/js_plans.json', JSON.stringify(out));
