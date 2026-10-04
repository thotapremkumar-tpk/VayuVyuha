/* VayuVyuha planning engine (browser + node).
 * Mirrors the Python model (solver.py): same constraints, same objective.
 * Search: priority-ordered best-insertion construction, then adaptive large-neighbourhood search (destroy + repair).
 * All data is synthetic and fictional.
 */
(function (root) {
  'use strict';
  var SLOT_MIN = 15, HORIZON = 48, SPEED = 200, TURNAROUND = 4, LAUNCH_CAP = 3;
  var ROLE_VULN = { FGT: 0.8, MRC: 0.9, STK: 1.0, SEAD: 0.9, ISR: 0.6, TKR: 0.3 };
  var BASES = { 'AB-1': { name: 'Northgate', xy: [140, 180] }, 'AB-2': { name: 'Centrefield', xy: [500, 110] }, 'AB-3': { name: 'Eastridge', xy: [860, 220] } };
  var W0 = { value: 100, risk: 25, ready: 20, flight: 2, delay: 4, keep: 400, shift: 60 };
  var PROFILES = {
    balanced: {},
    safe: { risk: 45, ready: 30 },
    maxc: { risk: 0, ready: 0, flight: 0, delay: 0, keep: 0, shift: 0 }
  };

  function rng(seed) { var a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function segHit(p, q, c, r) {
    var dx = q[0] - p[0], dy = q[1] - p[1], L2 = dx * dx + dy * dy || 1e-9;
    var t = Math.max(0, Math.min(1, ((c[0] - p[0]) * dx + (c[1] - p[1]) * dy) / L2));
    return Math.hypot(p[0] + t * dx - c[0], p[1] + t * dy - c[1]) <= r;
  }
  function weight(m) { return m.priority * m.priority; }
  function hasTanker(m) { return m.reqs.some(function (r) { return r.roles.length === 1 && r.roles[0] === 'TKR'; }); }
  function nearestBase(t) { var d = 1e9; for (var b in BASES) d = Math.min(d, dist(BASES[b].xy, t)); return d; }

  function refreshReq(m, threats) {
    var reqs = m.reqs.filter(function (r) { return !r.auto; });
    if (['STRK', 'INT', 'TST'].indexOf(m.type) >= 0) {
      var hot = threats.some(function (th) { return dist(th.xy, m.target) <= th.r && th.leth >= 0.6; });
      if (hot) reqs.push({ roles: ['SEAD'], n: 1, w: 'ARM', q: 1, auto: 'sead' });
    }
    if (nearestBase(m.target) > 650 && m.type !== 'ISR') reqs.push({ roles: ['TKR'], n: 1, w: null, q: 0, auto: 'tanker' });
    m.reqs = reqs; m.sead = reqs.some(function (r) { return r.auto === 'sead'; });
  }
  function weatherForbid(m, weather) {
    var out = [];
    weather.forEach(function (w) {
      if (dist(w.xy, m.target) <= w.r) { var off = Math.floor(nearestBase(m.target) / SPEED); out.push([Math.max(0, w.t0 - off - m.dwell), w.t1 - off]); }
    });
    return out;
  }
  function riskOf(m, ac, threats) {
    var base = BASES[ac.base].xy, r = 0;
    threats.forEach(function (th) {
      if (th.from > m.latest + m.dwell) return;
      var inside = dist(th.xy, m.target) <= th.r, cross = segHit(base, m.target, th.xy, th.r);
      r += th.leth * (inside ? 1 : (cross ? 0.45 : 0)) * 60;
    });
    r *= ROLE_VULN[ac.role];
    if (m.sead && ac.role !== 'SEAD') r *= 0.4;
    return Math.round(Math.min(r, 100));
  }
  function sortieDur(m, ac) { return Math.max(2, Math.ceil(2 * dist(BASES[ac.base].xy, m.target) / SPEED) + m.dwell); }
  function eligible(m, ac, req, tk) {
    if (req.roles.indexOf(ac.role) < 0) return false;
    if (ac.role === 'TKR') return true;
    return 2 * dist(BASES[ac.base].xy, m.target) <= ac.range || tk;
  }
  function allowed(m, now) {
    var out = [];
    for (var s = Math.max(m.earliest, now || 0); s <= m.latest; s++) {
      var bad = false; for (var i = 0; i < m.forbid.length; i++) if (m.forbid[i][0] <= s && s <= m.forbid[i][1]) { bad = true; break; }
      if (!bad) out.push(s);
    }
    return out;
  }
  function frozenIds(prev, now) { var f = {}; if (prev) for (var id in prev.missions) if (prev.missions[id].start < now) f[id] = 1; return f; }

  /* ---------------- ledger of consumed resources ---------------- */
  function Ledger(sc) { this.sc = sc; this.busy = {}; this.hours = {}; this.wuse = {}; this.launch = {}; }
  Ledger.prototype.add = function (st, asg, byId) {
    for (var i = 0; i < asg.length; i++) {
      var a = asg[i], ac = byId[a.aircraft];
      (this.busy[a.aircraft] = this.busy[a.aircraft] || []).push([st, st + a.dur + TURNAROUND]);
      this.hours[a.aircraft] = (this.hours[a.aircraft] || 0) + a.dur;
      if (a.weapon) { var k = ac.base + '|' + a.weapon; this.wuse[k] = (this.wuse[k] || 0) + a.qty; }
      var lk = ac.base + '|' + st; this.launch[lk] = (this.launch[lk] || 0) + 1;
    }
  };
  // relax: {busy, crew, weapons, launch} -> ignore that constraint class (used by the explainer)
  Ledger.prototype.ok = function (ac, st, d, req, wLocal, lLocal, relax) {
    relax = relax || {};
    if (st < ac.avail_from) return false;
    if (!relax.busy) { var b = this.busy[ac.id]; if (b) for (var i = 0; i < b.length; i++) if (st < b[i][1] && b[i][0] < st + d + TURNAROUND) return false; }
    if (!relax.crew && (this.hours[ac.id] || 0) + d > Math.floor(ac.duty_h * 60 / SLOT_MIN)) return false;
    if (req.w && !relax.weapons) { var k = ac.base + '|' + req.w; if ((this.wuse[k] || 0) + (wLocal[k] || 0) + req.q > this.sc.stock[ac.base][req.w]) return false; }
    if (!relax.launch) { var lk = ac.base + '|' + st; if ((this.launch[lk] || 0) + (lLocal[lk] || 0) + 1 > LAUNCH_CAP) return false; }
    return true;
  };

  /* ---------------- context: everything precomputed for one planning call ---------------- */
  function buildCtx(sc, prev, now, weights) {
    var W = {}; for (var k in W0) W[k] = W0[k]; for (k in (weights || {})) W[k] = weights[k];
    var byId = {}; sc.fleet.forEach(function (a) { byId[a.id] = a; });
    var frozen = frozenIds(prev, now), M = {};
    sc.missions.forEach(function (m) {
      var tk = hasTanker(m), prevAsg = {}, pm = prev && prev.missions[m.id];
      if (pm && !frozen[m.id]) pm.assigned.forEach(function (a) { prevAsg[a.aircraft] = 1; });
      var reqs = m.reqs.map(function (req, ri) {
        var c = [];
        sc.fleet.forEach(function (ac) {
          if (!eligible(m, ac, req, tk) || ac.avail_from > m.latest) return;
          var d = sortieDur(m, ac), r = riskOf(m, ac, sc.threats);
          var cost = Math.round(W.risk * r + W.ready * m.priority * (ac.p_nogo == null ? 0.05 : ac.p_nogo) * 10 + W.flight * d);
          c.push({ ac: ac, dur: d, risk: r, cost: cost - (prevAsg[ac.id] ? W.keep : 0), km: dist(BASES[ac.base].xy, m.target) });
        });
        c.sort(function (x, y) { return x.cost - y.cost; });
        return { req: req, ri: ri, cands: c };
      });
      M[m.id] = { m: m, reqs: reqs, slots: frozen[m.id] ? [] : allowed(m, now), s0: (pm && !frozen[m.id]) ? pm.start : null, w: weight(m) };
    });
    return { sc: sc, W: W, byId: byId, frozen: frozen, M: M, prev: prev, now: now };
  }

  // best (or first, for the baseline) feasible package for mission m on ledger L
  function insert(ctx, L, mid, mode, relax) {
    var X = ctx.M[mid], m = X.m, W = ctx.W, best = null;
    for (var si = 0; si < X.slots.length; si++) {
      var st = X.slots[si], asg = [], used = {}, wL = {}, lL = {}, ok = true, cost = 0;
      for (var ri = 0; ri < X.reqs.length && ok; ri++) {
        var R = X.reqs[ri], req = R.req, picked = 0;
        var cs = mode === 'baseline' ? R.cands.slice().sort(function (a, b) { return a.km - b.km; }) : R.cands;
        for (var ci = 0; ci < cs.length && picked < req.n; ci++) {
          var c = cs[ci];
          if (used[c.ac.id] || !L.ok(c.ac, st, c.dur, req, wL, lL, relax)) continue;
          used[c.ac.id] = 1;
          if (req.w) { var k = c.ac.base + '|' + req.w; wL[k] = (wL[k] || 0) + req.q; }
          var lk = c.ac.base + '|' + st; lL[lk] = (lL[lk] || 0) + 1;
          asg.push({ aircraft: c.ac.id, role: c.ac.role, base: c.ac.base, req: R.ri, weapon: req.w, qty: req.q, dur: c.dur, risk: c.risk });
          cost += c.cost; picked++;
        }
        if (picked < req.n) ok = false;
      }
      if (!ok) continue;
      var delta = W.value * X.w - cost - W.delay * m.priority * (st - m.earliest) - (X.s0 == null ? 0 : W.shift * Math.abs(st - X.s0));
      if (mode === 'baseline') return { start: st, assigned: asg, delta: delta };
      if (!best || delta > best.delta) best = { start: st, assigned: asg, delta: delta };
    }
    return best;
  }
  function ledgerOf(ctx, sol) { var L = new Ledger(ctx.sc); for (var id in sol) L.add(sol[id].start, sol[id].assigned, ctx.byId); return L; }
  function objective(sol) { var t = 0; for (var id in sol) t += sol[id].delta; return t; }

  function construct(ctx, mode) {
    var sol = {}, L = new Ledger(ctx.sc), prev = ctx.prev;
    for (var id in ctx.frozen) if (ctx.M[id]) { var p = prev.missions[id]; sol[id] = { start: p.start, assigned: clone(p.assigned), delta: 0, frozen: true }; L.add(p.start, p.assigned, ctx.byId); }
    var order = ctx.sc.missions.filter(function (m) { return !ctx.frozen[m.id]; }).sort(function (a, b) { return b.priority - a.priority || a.earliest - b.earliest; });
    order.forEach(function (m) {
      var r = insert(ctx, L, m.id, mode);
      if (r && (mode === 'baseline' || r.delta > 0)) { sol[m.id] = r; L.add(r.start, r.assigned, ctx.byId); }
    });
    return sol;
  }

  /* ---------------- ALNS: destroy a few related missions, repair by best insertion ---------------- */
  function makeSearch(ctx, seed) {
    var R = rng(seed || 11), cur = construct(ctx, 'best'), curObj = objective(cur), best = cur, bestObj = curObj, iters = 0, improved = 0;
    var free = ctx.sc.missions.filter(function (m) { return !ctx.frozen[m.id] && ctx.M[m.id].slots.length; }).map(function (m) { return m.id; });
    var opW = [1, 1, 1], opUse = [0, 0, 0];
    function pickOp() { var s = opW[0] + opW[1] + opW[2], x = R() * s; return x < opW[0] ? 0 : (x < opW[0] + opW[1] ? 1 : 2); }
    function step() {
      iters++;
      var flown = free.filter(function (id) { return cur[id]; }), un = free.filter(function (id) { return !cur[id]; });
      if (!flown.length) return;
      var op = pickOp(), k = 2 + Math.floor(R() * 4), rem = {};
      if (op === 0 || !un.length) { for (var i = 0; i < k; i++) rem[flown[Math.floor(R() * flown.length)]] = 1; }
      else if (op === 1) { // related removal: missions that compete in time with a random untasked mission
        var u = ctx.M[un[Math.floor(R() * un.length)]].m;
        var near = flown.filter(function (id) { var s = cur[id].start; return s >= u.earliest - 12 && s <= u.latest + 6; });
        for (i = 0; i < k && near.length; i++) rem[near.splice(Math.floor(R() * near.length), 1)[0]] = 1;
      } else { // worst removal: lowest value-per-sortie missions
        var sorted = flown.slice().sort(function (a, b) { return cur[a].delta / cur[a].assigned.length - cur[b].delta / cur[b].assigned.length; });
        for (i = 0; i < k; i++) rem[sorted[Math.min(sorted.length - 1, Math.floor(Math.pow(R(), 2.5) * sorted.length))]] = 1;
      }
      var sol = {}; for (var id in cur) if (!rem[id]) sol[id] = cur[id];
      var L = ledgerOf(ctx, sol);
      var cand = free.filter(function (id) { return !sol[id]; }).map(function (id) { return { id: id, key: ctx.M[id].w * (0.6 + 0.8 * R()) }; }).sort(function (a, b) { return b.key - a.key; });
      for (i = 0; i < cand.length; i++) { var r = insert(ctx, L, cand[i].id, 'best'); if (r && r.delta > 0) { sol[cand[i].id] = r; L.add(r.start, r.assigned, ctx.byId); } }
      var o = objective(sol);
      opUse[op]++;
      if (o > curObj || R() < Math.exp((o - curObj) / 600)) { if (o > bestObj) { best = sol; bestObj = o; improved++; opW[op] += 0.6; } cur = sol; curObj = o; }
      if (iters % 50 === 0) { cur = best; curObj = bestObj; }
    }
    return {
      run: function (ms) { var t = Date.now(); while (Date.now() - t < ms) step(); },
      runIters: function (n) { for (var i = 0; i < n; i++) step(); },
      result: function () { return best; }, stats: function () { return { iterations: iters, improvements: improved, objective: bestObj, operators: opUse.slice() }; }
    };
  }

  /* ---------------- outputs ---------------- */
  function metrics(sc, plan) {
    var ms = {}, tot = 0, val = 0, sorties = [], used = {}, acs = {};
    sc.missions.forEach(function (m) { ms[m.id] = m; tot += weight(m); });
    for (var id in plan.missions) { val += weight(ms[id]); plan.missions[id].assigned.forEach(function (a) { sorties.push(a); acs[a.aircraft] = 1; if (a.weapon) used[a.weapon] = (used[a.weapon] || 0) + a.qty; }); }
    var hrs = sorties.reduce(function (s, a) { return s + a.dur; }, 0) * SLOT_MIN / 60, risk = sorties.reduce(function (s, a) { return s + a.risk; }, 0);
    return { missions_total: sc.missions.length, missions_flown: Object.keys(plan.missions).length, priority_total: tot, priority_covered: val,
      coverage_pct: tot ? Math.round(1000 * val / tot) / 10 : 0, sorties: sorties.length, flight_hours: Math.round(hrs * 10) / 10,
      avg_risk: sorties.length ? Math.round(10 * risk / sorties.length) / 10 : 0, weapons_used: used,
      aircraft_used: Object.keys(acs).length, aircraft_total: sc.fleet.filter(function (a) { return a.avail_from <= HORIZON; }).length };
  }
  function score(sc, plan) { // same composite as Python plan_score (no stability terms)
    var ms = {}, byId = {}, v = 0, r = 0, rd = 0, f = 0, d = 0;
    sc.missions.forEach(function (m) { ms[m.id] = m; }); sc.fleet.forEach(function (a) { byId[a.id] = a; });
    for (var id in plan.missions) {
      var m = ms[id], p = plan.missions[id]; v += W0.value * weight(m); d += W0.delay * m.priority * (p.start - m.earliest);
      p.assigned.forEach(function (a) { r += W0.risk * a.risk; rd += Math.round(W0.ready * m.priority * (byId[a.aircraft].p_nogo == null ? 0.05 : byId[a.aircraft].p_nogo) * 10); f += W0.flight * a.dur; });
    }
    return { score: v - r - rd - f - d, value: v, risk: r, readiness: rd, flight: f, delay: d };
  }
  function validate(sc, plan, now) { // missions launched before `now` are history: later groundings or closures do not apply to them
    var v = [], byId = {}, ms = {}, busy = {}, hours = {}, wuse = {}, launch = {};
    sc.fleet.forEach(function (a) { byId[a.id] = a; }); sc.missions.forEach(function (m) { ms[m.id] = m; });
    for (var mid in plan.missions) {
      var m = ms[mid], p = plan.missions[mid], st = p.start, seen = {};
      if (!m) { v.push(mid + ': unknown mission'); continue; }
      if (st < m.earliest || st > m.latest) v.push(mid + ': start outside window');
      var launched = st < (now || 0);
      if (!launched && m.forbid.some(function (f) { return f[0] <= st && st <= f[1]; })) v.push(mid + ': start in closed (weather) slot');
      m.reqs.forEach(function (req, ri) { var n = p.assigned.filter(function (a) { return a.req === ri; }).length; if (n !== req.n) v.push(mid + ': requirement ' + ri + ' has ' + n + '/' + req.n); });
      p.assigned.forEach(function (a) {
        var ac = byId[a.aircraft], d = sortieDur(m, ac);
        if (seen[a.aircraft]) v.push(mid + ': ' + a.aircraft + ' used twice'); seen[a.aircraft] = 1;
        if (m.reqs[a.req].roles.indexOf(ac.role) < 0) v.push(mid + ': ' + a.aircraft + ' wrong role');
        if (ac.role !== 'TKR' && 2 * dist(BASES[ac.base].xy, m.target) > ac.range && !hasTanker(m)) v.push(mid + ': ' + a.aircraft + ' out of range');
        if (!launched && st < ac.avail_from) v.push(mid + ': ' + a.aircraft + ' not serviceable');
        (busy[a.aircraft] || []).forEach(function (b) { if (st < b[1] && b[0] < st + d + TURNAROUND) v.push(mid + ': ' + a.aircraft + ' overlaps ' + b[2]); });
        (busy[a.aircraft] = busy[a.aircraft] || []).push([st, st + d + TURNAROUND, mid]);
        hours[a.aircraft] = (hours[a.aircraft] || 0) + d;
        if (a.weapon) { var k = ac.base + '|' + a.weapon; wuse[k] = (wuse[k] || 0) + a.qty; }
        var lk = ac.base + '|' + st; launch[lk] = (launch[lk] || 0) + 1;
      });
    }
    for (var id in hours) if (hours[id] > Math.floor(byId[id].duty_h * 60 / SLOT_MIN)) v.push(id + ': crew duty exceeded');
    for (var k2 in wuse) { var bw = k2.split('|'); if (wuse[k2] > sc.stock[bw[0]][bw[1]]) v.push(bw[0] + ': ' + bw[1] + ' stock exceeded'); }
    for (var k3 in launch) if (launch[k3] > LAUNCH_CAP) v.push(k3 + ': launch capacity exceeded');
    return v;
  }
  function diff(prev, plan, now) {
    var d = { added: [], dropped: [], retimed: [], reassigned: [], kept: [] }, fr = frozenIds(prev, now);
    for (var id in plan.missions) {
      if (!prev.missions[id]) { d.added.push(id); continue; }
      if (fr[id]) { d.kept.push(id); continue; }
      var p = plan.missions[id], q = prev.missions[id], ch = false;
      if (p.start !== q.start) { d.retimed.push(id); ch = true; }
      var a = p.assigned.map(function (x) { return x.aircraft; }).sort().join(), b = q.assigned.map(function (x) { return x.aircraft; }).sort().join();
      if (a !== b) { d.reassigned.push(id); ch = true; }
      if (!ch) d.kept.push(id);
    }
    for (id in prev.missions) if (!plan.missions[id]) d.dropped.push(id);
    var mod = {}; d.retimed.concat(d.reassigned).forEach(function (i) { mod[i] = 1; });
    d.modified = Object.keys(mod); d.disruption = d.retimed.length + d.reassigned.length + d.dropped.length;
    return d;
  }

  // plain-language reason a mission is not tasked: relax one constraint class at a time and see what unblocks it
  function explain(sc, plan, mid, now, weights) {
    var ctx = buildCtx(sc, null, now || 0, weights), X = ctx.M[mid], m = X.m;
    if (plan.missions[mid]) return { code: 'tasked', text: 'Tasked.' };
    if (m.latest < (now || 0)) return { code: 'expired', text: 'Its launch window has already passed.' };
    if (!X.slots.length) return { code: 'weather', text: 'Every remaining launch slot is closed by weather over the target.' };
    for (var i = 0; i < X.reqs.length; i++) if (X.reqs[i].cands.length < X.reqs[i].req.n) return { code: 'aircraft', text: 'Not enough serviceable ' + X.reqs[i].req.roles.join('/') + ' aircraft within range.' };
    var sol = {}; for (var id in plan.missions) sol[id] = plan.missions[id];
    var L = ledgerOf(ctx, sol), r = insert(ctx, L, mid, 'best');
    if (r) return r.delta > 0 ? { code: 'free', text: 'Can be added without displacing anything.' } : { code: 'risk', text: 'Feasible, but threat exposure and aircraft-reliability cost outweigh its value at the current risk setting.' };
    var tests = [['weapons', 'weapons'], ['busy', 'aircraft'], ['crew', 'crew'], ['launch', 'runway']];
    for (i = 0; i < tests.length; i++) {
      var rx = {}; rx[tests[i][0]] = true;
      if (insert(ctx, L, mid, 'best', rx)) {
        if (tests[i][0] === 'weapons') { var w = m.reqs.filter(function (q) { return q.w; }).map(function (q) { return q.w; }); return { code: 'weapons', text: 'Blocked by weapon stock: the bases that can reach it have no ' + w.filter(function (x, j) { return w.indexOf(x) === j; }).join(' / ') + ' left after higher-value missions.' }; }
        if (tests[i][0] === 'busy') return { code: 'aircraft', text: 'All suitable aircraft are committed to higher-value missions during its window.' };
        if (tests[i][0] === 'crew') return { code: 'crew', text: 'The available crews would exceed their duty-hour limit.' };
        return { code: 'runway', text: 'Runway launch capacity is full in every usable slot.' };
      }
    }
    return { code: 'multi', text: 'Displaced by higher-value missions: aircraft and weapons are both short during its window.' };
  }

  // Monte Carlo: each tasked aircraft may fail its pre-flight check (predicted no-go probability)
  function robust(sc, plan, n, seed, now) {
    var R = rng(seed || 5), byId = {}, ms = {}, tot = 0, res = [], intact = 0, ids = Object.keys(plan.missions);
    sc.fleet.forEach(function (a) { byId[a.id] = a; }); sc.missions.forEach(function (m) { ms[m.id] = m; tot += weight(m); });
    var acs = {}; ids.forEach(function (id) { if (plan.missions[id].start >= (now || 0)) plan.missions[id].assigned.forEach(function (a) { acs[a.aircraft] = 1; }); });
    var list = Object.keys(acs);
    for (var i = 0; i < (n || 500); i++) {
      var fail = {}, any = false; list.forEach(function (a) { if (R() < (byId[a].p_nogo || 0)) { fail[a] = 1; any = true; } });
      var v = 0; ids.forEach(function (id) { var p = plan.missions[id]; if (p.start < (now || 0) || !p.assigned.some(function (a) { return fail[a.aircraft]; })) v += weight(ms[id]); });
      res.push(100 * v / tot); if (!any) intact++;
    }
    res.sort(function (a, b) { return a - b; });
    var q = function (p) { return Math.round(res[Math.min(res.length - 1, Math.floor(p * res.length))] * 10) / 10; };
    return { mean: Math.round(res.reduce(function (s, x) { return s + x; }, 0) / res.length * 10) / 10, p10: q(0.1), p50: q(0.5), p90: q(0.9), intact: Math.round(100 * intact / res.length), samples: res };
  }

  function applyEvent(sc, plan, ev, now) {
    sc = clone(sc); var fr = frozenIds(plan, now);
    if (ev.type === 'ground') sc.fleet.forEach(function (a) { if (ev.aircraft.indexOf(a.id) >= 0) a.avail_from = 999; });
    else if (ev.type === 'sam') { sc.threats.push(ev.threat); sc.missions.forEach(function (m) { if (!fr[m.id]) refreshReq(m, sc.threats); }); }
    else if (ev.type === 'tst') {
      var m = { id: ev.id, type: 'TST', target: ev.target, priority: 10, earliest: now + 1, latest: Math.min(HORIZON - 14, now + 5), dwell: 2, reqs: [{ roles: ['STK', 'MRC'], n: 2, w: 'PGM', q: 2 }], forbid: [], label: 'Urgent target' };
      refreshReq(m, sc.threats); m.forbid = weatherForbid(m, sc.weather); sc.missions.push(m);
    } else if (ev.type === 'weather') { sc.weather.push(ev.cell); sc.missions.forEach(function (m) { if (!fr[m.id]) m.forbid = weatherForbid(m, sc.weather); }); }
    sc.now = now; return sc;
  }

  function pack(ctx, sol, engine, t0, stats) {
    var plan = { missions: {}, unflown: {} };
    for (var id in sol) plan.missions[id] = { start: sol[id].start, assigned: sol[id].assigned };
    ctx.sc.missions.forEach(function (m) { if (!plan.missions[m.id]) plan.unflown[m.id] = ''; });
    plan.metrics = metrics(ctx.sc, plan); plan.score = score(ctx.sc, plan);
    plan.solver = { engine: engine, wall_s: Math.round((Date.now() - t0)) / 1000, status: 'HEURISTIC', iterations: stats ? stats.iterations : 0, improvements: stats ? stats.improvements : 0 };
    return plan;
  }
  function plan(sc, o) { // synchronous
    o = o || {}; var t0 = Date.now(), ctx = buildCtx(sc, o.prev, o.now || 0, o.weights), S = makeSearch(ctx, o.seed);
    if (o.iters) S.runIters(o.iters); else S.run(o.budgetMs == null ? 250 : o.budgetMs);
    return pack(ctx, S.result(), 'ALNS (in-browser)', t0, S.stats());
  }
  function planAsync(sc, o, done, tick) { // chunked so the page stays responsive
    o = o || {}; var t0 = Date.now(), ctx = buildCtx(sc, o.prev, o.now || 0, o.weights), S = makeSearch(ctx, o.seed), budget = o.budgetMs == null ? 300 : o.budgetMs;
    (function loop() { S.run(30); if (tick) tick(S.stats()); if (Date.now() - t0 < budget) setTimeout(loop, 0); else done(pack(ctx, S.result(), 'ALNS (in-browser)', t0, S.stats())); })();
  }
  function baseline(sc, o) { o = o || {}; var t0 = Date.now(), ctx = buildCtx(sc, o.prev, o.now || 0, { keep: 0, shift: 0 }); return pack(ctx, construct(ctx, 'baseline'), 'Sequential baseline', t0); }

  var API = { SLOT_MIN: SLOT_MIN, HORIZON: HORIZON, SPEED: SPEED, TURNAROUND: TURNAROUND, LAUNCH_CAP: LAUNCH_CAP, BASES: BASES, W0: W0, PROFILES: PROFILES,
    plan: plan, planAsync: planAsync, baseline: baseline, metrics: metrics, score: score, validate: validate, diff: diff, explain: explain, robust: robust,
    applyEvent: applyEvent, refreshReq: refreshReq, weatherForbid: weatherForbid, frozenIds: frozenIds, weight: weight, dist: dist, clone: clone, sortieDur: sortieDur, riskOf: riskOf, allowed: allowed };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Engine = API;
})(typeof window !== 'undefined' ? window : globalThis);
