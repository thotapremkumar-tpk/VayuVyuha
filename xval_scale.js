const E = require('./web/engine.js'); const fs = require('fs');
const S = JSON.parse(fs.readFileSync('data/scen_scale.json')); const o = {};
for (const k of Object.keys(S)) o[k] = E.plan(S[k], { budgetMs: 2000, seed: 11 });
fs.writeFileSync('data/js_scale_plans.json', JSON.stringify(o));
