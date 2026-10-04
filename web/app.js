/* VayuVyuha app shell: simple outside, engine inside. */
(function () {
  'use strict';
  var E = window.Engine, DATA = window.VV, NS = 'http://www.w3.org/2000/svg';
  var TYPE = {
    CAP: { label: 'Air patrol', color: '#2f6fdb' }, STRK: { label: 'Strike', color: '#e07a1f' }, ISR: { label: 'Reconnaissance', color: '#1f9d8a' },
    SEAD: { label: 'Air-defence suppression', color: '#8a5cd0' }, INT: { label: 'Interdiction', color: '#c9a017' }, TST: { label: 'Urgent target', color: '#d6455d' }
  };
  var ROLE = { FGT: 'Fighter', MRC: 'Multirole', STK: 'Strike', SEAD: 'Suppression', ISR: 'Recon', TKR: 'Tanker' };
  var OPT = {
    balanced: { name: 'Recommended', desc: 'Best overall: high coverage, low risk, few changes.' },
    safe: { name: 'Cautious', desc: 'Keeps crews further from threats; may fly fewer missions.' },
    maxc: { name: 'Maximum coverage', desc: 'Flies the most mission value; accepts more risk and change.' },
    base: { name: 'Manual-style replan', desc: 'Priority-first, done by hand. Shown for reference only.' }
  };
  var S = { view: 'command', sc: E.clone(DATA.scenario), plan: null, now: 0, proposal: null, sel: null, place: null, routes: false, heat: true,
    engine: 'local', serverOK: false, history: [], story: null, busy: null, compare: false, pick: false, frontier: null, n: { sam: 0, tst: 0, wx: 0 }, conf: null };

  /* ---------- tiny DOM helpers ---------- */
  function h(tag, cls, html, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; }
  function sv(tag, attrs, parent, txt) { var e = document.createElementNS(NS, tag); for (var k in (attrs || {})) e.setAttribute(k, attrs[k]); if (txt != null) e.textContent = txt; if (parent) parent.appendChild(e); return e; }
  function hm(s) { var m = s * 15; return 'T+' + Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2); }
  function $(id) { return document.getElementById(id); }
  var ICON = {
    ok: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    alert: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.3"/></svg>',
    plane: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21 15.5v-2l-8-5V4a1.5 1.5 0 00-3 0v4.5l-8 5v2l8-2.5V18l-2.2 1.6V21l3.7-1 3.7 1v-1.4L13 18v-5z"/></svg>',
    sam: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>',
    star: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 17.4 6.1 20.7l1.3-6.6L2.5 9.5l6.6-.8z"/></svg>',
    storm: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16a4.5 4.5 0 01.6-9A5.5 5.5 0 0118 8.5 3.8 3.8 0 0117.5 16"/><path d="M12 13l-2 4h3l-2 4"/></svg>',
    map: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
    time: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h10M4 12h16M4 18h7"/></svg>',
    fleet: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21 15.5v-2l-8-5V4a1.5 1.5 0 00-3 0v4.5l-8 5v2l8-2.5V18l-2.2 1.6V21l3.7-1 3.7 1v-1.4L13 18v-5z"/></svg>',
    gear: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/></svg>'
  };

  /* ---------- state accessors ---------- */
  function vsc() { return S.proposal ? S.proposal.sc : S.sc; }
  function vplan() { return S.proposal ? S.proposal.opts[S.proposal.chosen].plan : S.plan; }
  function vdiff() { return S.proposal ? S.proposal.opts[S.proposal.chosen].diff : null; }
  function mmap(sc) { var o = {}; sc.missions.forEach(function (m) { o[m.id] = m; }); return o; }
  function byId(sc) { var o = {}; sc.fleet.forEach(function (a) { o[a.id] = a; }); return o; }

  /* ---------- engines ---------- */
  function solveLocal(sc, prev, now, key, cb) { E.planAsync(sc, { prev: prev, now: now, weights: E.PROFILES[key], budgetMs: key === 'balanced' ? (prev ? 350 : 1200) : (prev ? 220 : 500), seed: 11 }, cb); }
  function solveServer(sc, prev, now, key, cb) {
    fetch('/api/solve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sc: sc, prev: prev, now: now, weights: E.PROFILES[key] }) })
      .then(function (r) { return r.json(); }).then(function (p) {
        if (!p || !p.missions) throw new Error('bad'); p.metrics = E.metrics(sc, p); p.score = E.score(sc, p); p.unflown = p.unflown || {}; cb(p);
      }).catch(function () { solveLocal(sc, prev, now, key, cb); });
  }
  function computeOptions(sc, prev, now, done) {
    var keys = ['balanced', 'safe', 'maxc'], opts = {}, i = 0, solve = S.engine === 'server' ? solveServer : solveLocal;
    (function next() {
      if (i === keys.length) {
        var b = E.baseline(sc, { prev: prev, now: now }); opts.base = wrap(sc, prev, now, b); return done(opts);
      }
      var k = keys[i++]; solve(sc, prev, now, k, function (p) { opts[k] = wrap(sc, prev, now, p); next(); });
    })();
  }
  function wrap(sc, prev, now, p) {
    return { plan: p, diff: prev ? E.diff(prev, p, now) : null, conf: E.robust(sc, p, 300, 5, now), viol: E.validate(sc, p, now) };
  }

  /* ---------- actions ---------- */
  function init() {
    S.busy = 'Building the first plan…'; render();
    computeOptions(S.sc, null, 0, function (opts) {
      S.plan = opts.balanced.plan; S.conf = opts.balanced.conf; S.busy = null;
      S.history.push({ t: 0, title: 'Initial 12-hour plan', n: S.plan.metrics.missions_flown + ' missions tasked', s: S.plan.solver.wall_s, eng: S.plan.solver.engine });
      render();
    });
  }
  function inject(ev, title, desc) {
    if (S.busy || S.proposal) return;
    var sc = E.applyEvent(S.sc, S.plan, ev, S.now);
    S.place = null; S.pick = false; S.busy = 'Re-planning around the event…'; S.sel = null; render();
    setTimeout(function () {
      computeOptions(sc, S.plan, S.now, function (opts) { S.proposal = { sc: sc, opts: opts, chosen: 'balanced', ev: ev, title: title, desc: desc }; S.busy = null; render(); });
    }, 30);
  }
  function approve() {
    var p = S.proposal, o = p.opts[p.chosen]; S.sc = p.sc; S.plan = o.plan; S.conf = o.conf; S.frontier = null;
    S.history.push({ t: S.now, title: p.title, n: o.diff.disruption + ' change' + (o.diff.disruption === 1 ? '' : 's') + (o.diff.added.length ? ', ' + o.diff.added.length + ' new' : ''), s: o.plan.solver.wall_s, eng: o.plan.solver.engine, opt: OPT[p.chosen].name });
    S.proposal = null; S.compare = false; S.sel = null;
    if (S.story) S.story.i++;
    render();
  }
  function setNow(v) { if (S.proposal || S.busy) return; S.now = Math.max(S.now, v); render(); }

  /* ---------- demo story ---------- */
  var STORY = [
    { t: 6, name: 'Two aircraft fail inspection', make: function () {
        var first = {}; for (var id in S.plan.missions) { var p = S.plan.missions[id]; p.assigned.forEach(function (a) { var f = first[a.aircraft] || [99, 0]; first[a.aircraft] = [Math.min(f[0], p.start), f[1] + 1]; }); }
        var c = Object.keys(first).filter(function (a) { return /^(STK|MRC)/.test(a) && first[a][0] > S.now; }).sort(function (a, b) { return first[b][1] - first[a][1]; }).slice(0, 2);
        return [{ type: 'ground', aircraft: c }, 'Two aircraft grounded', 'Maintenance finds faults on ' + c.join(' and ') + '. Both leave the available pool.'];
      } },
    { t: 10, name: 'A new air-defence site appears', make: function () {
        var mm = mmap(S.sc), up = Object.keys(S.plan.missions).filter(function (id) { var m = mm[id]; return (m.type === 'STRK' || m.type === 'INT') && S.plan.missions[id].start > S.now + 2 && !m.sead; }).sort(function (a, b) { return S.plan.missions[a].start - S.plan.missions[b].start; });
        var t = up.length ? mm[up[0]].target : [500, 700]; S.n.sam++;
        return [{ type: 'sam', threat: { id: 'TP' + S.n.sam, name: 'Pop-up site', xy: [t[0] + 15, t[1] - 10], r: 100, leth: 0.85, from: S.now } }, 'Pop-up air-defence site', 'A new high-lethality site appears on a planned route. Risk and escort needs are recomputed.'];
      } },
    { t: 14, name: 'An urgent target is found', make: function () { S.n.tst++; return [{ type: 'tst', id: 'U' + S.n.tst, target: [665, 730] }, 'Urgent target (priority 10)', 'A high-value mobile target is located inside an air-defence envelope with a 75-minute window.']; } },
    { t: 18, name: 'A storm closes a corridor', make: function () {
        var mm = mmap(S.sc), up = Object.keys(S.plan.missions).filter(function (id) { var m = mm[id]; return (m.type === 'STRK' || m.type === 'INT') && S.plan.missions[id].start > S.now + 3; }).sort(function (a, b) { return S.plan.missions[a].start - S.plan.missions[b].start; });
        var st = up.length ? S.plan.missions[up[0]].start : 24, t = up.length ? mm[up[0]].target : [330, 640]; S.n.wx++;
        return [{ type: 'weather', cell: { id: 'WP' + S.n.wx, name: 'Storm cell', xy: t, r: 140, t0: st - 3, t1: st + 9 } }, 'Storm over a strike corridor', 'Weather closes the corridor from ' + hm(st - 3) + ' to ' + hm(st + 9) + '.'];
      } }
  ];
  function storyGo() { var st = STORY[S.story.i]; S.now = Math.max(S.now, st.t); var x = st.make(); inject(x[0], x[1], x[2]); }

  /* ---------- text ---------- */
  function summary(o, mm) {
    var d = o.diff, parts = [];
    if (d.added.length) parts.push('add ' + d.added.join(', '));
    if (d.modified.length) parts.push('adjust ' + d.modified.length + ' mission' + (d.modified.length > 1 ? 's' : ''));
    if (d.dropped.length) parts.push('drop ' + d.dropped.map(function (i) { return i + ' (priority ' + mm[i].priority + ')'; }).join(', '));
    return parts.length ? parts.join('; ') : 'no change needed';
  }

  /* ---------- render: shell ---------- */
  function render() {
    var root = $('app'); root.innerHTML = '';
    var top = h('div', 'top', '', root);
    h('div', 'brand', '<div class="logo"><svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M21 15.5v-2l-8-5V4a1.5 1.5 0 00-3 0v4.5l-8 5v2l8-2.5V18l-2.2 1.6V21l3.7-1 3.7 1v-1.4L13 18v-5z"/></svg></div><div><b>VayuVyuha</b><small>Dynamic air operations planner</small></div>', top);
    var tabs = h('div', 'tabs', '', top);
    [['command', 'Command', ICON.map], ['timeline', 'Timeline', ICON.time], ['fleet', 'Fleet', ICON.fleet], ['engine', 'Engine', ICON.gear]].forEach(function (t) {
      var b = h('button', 'tab' + (S.view === t[0] ? ' on' : ''), t[2] + t[1], tabs); b.onclick = function () { S.view = t[0]; render(); };
    });
    h('div', 'sp', '', top);
    h('span', 'clock', hm(S.now), top);
    var ep = h('span', 'pill ' + (S.engine === 'server' ? 'ok' : '') + (S.serverOK ? ' btn' : ''), '<span class="dot"></span>' + (S.engine === 'server' ? 'Exact engine (CP-SAT server)' : 'Built-in engine'), top);
    if (S.serverOK) { ep.title = 'Click to switch engine'; ep.onclick = function () { S.engine = S.engine === 'server' ? 'local' : 'server'; render(); }; }
    h('span', 'pill warn', '<span class="dot"></span>Synthetic data', top);
    hero(root);
    if (S.plan) ({ command: vCommand, timeline: vTimeline, fleet: vFleet, engine: vEngine })[S.view](root);
    h('div', 'foot', 'Prototype for SIH26250. All data is synthetic; places, units and threats are fictional.', root);
    if (S.sel) drawer(root);
    if (S.compare && S.proposal) compare(root);
    if (S.story && !S.compare && !S.hideGuide) guide(root);
  }

  function hero(root) {
    var el;
    if (S.busy) { el = h('div', 'hero busy', '<div class="ic"><div class="spin"></div></div><div class="tx"><div class="k">Working</div><div class="t">' + S.busy + '</div><div class="d">Checking aircraft, crews, weapons, airspace, weather and threats.</div></div>', root); return; }
    if (!S.plan) return;
    var sc = vsc(), plan = vplan(), m = plan.metrics, mm = mmap(sc);
    if (S.proposal) {
      var o = S.proposal.opts[S.proposal.chosen];
      el = h('div', 'hero pend', '<div class="ic">' + ICON.alert + '</div><div class="tx"><div class="k">' + hm(S.now) + ' · decision needed</div><div class="t">' + S.proposal.title + '</div><div class="d">' + S.proposal.desc + ' <b style="color:var(--ink)">' + OPT[S.proposal.chosen].name + ' plan:</b> ' + summary(o, mm) + '.</div></div>', root);
    } else {
      el = h('div', 'hero ok', '<div class="ic">' + ICON.ok + '</div><div class="tx"><div class="k">Plan approved</div><div class="t">' + m.missions_flown + ' of ' + m.missions_total + ' missions are tasked</div><div class="d">Every aircraft, crew, weapon and runway limit is respected. ' + Object.keys(plan.unflown).length + ' requests cannot be met with today\'s resources.</div></div>', root);
    }
    var conf = S.proposal ? S.proposal.opts[S.proposal.chosen].conf : S.conf;
    var kp = h('div', 'kp', '', el);
    kp.innerHTML = '<div class="kpi"><div class="l">Value covered</div><div class="v">' + m.coverage_pct.toFixed(0) + '<small>%</small></div><div class="s">of mission priority</div></div>' +
      '<div class="kpi"><div class="l">Risk</div><div class="v">' + m.avg_risk.toFixed(1) + '<small>/100</small></div><div class="s">average per sortie</div></div>' +
      '<div class="kpi"><div class="l">If jets fail</div><div class="v">' + (conf ? conf.mean.toFixed(0) : '–') + '<small>%</small></div><div class="s">value still covered</div></div>';
    if (S.proposal) {
      var a = h('div', 'acts', '', el);
      var b1 = h('button', 'btn', 'Compare options', a); b1.onclick = function () { S.compare = true; render(); };
      var b2 = h('button', 'btn pri', 'Approve', a); b2.id = 'approve'; b2.onclick = approve;
    }
  }

  /* ---------- Command view ---------- */
  function vCommand(root) {
    var g = h('div', 'grid', '', root), left = h('div', 'card', '', g), right = h('div', 'col', '', g);
    h('h2', '', 'Operating picture <span class="r">' + (S.place ? 'Click the map to place it' : 'Click any mission for details') + '</span>', left);
    var ch = h('div', 'chips', '', left); ch.style.marginBottom = '8px';
    [['routes', 'All routes'], ['heat', 'Threat zones']].forEach(function (p) { var c = h('span', 'chip' + (S[p[0]] ? ' on' : ''), p[1], ch); c.onclick = function () { S[p[0]] = !S[p[0]]; render(); }; });
    var svg = sv('svg', { id: 'map', viewBox: '0 0 1000 1000', 'class': S.place ? 'place' : '' }, left); drawMap(svg);
    var lg = h('div', 'legend', '', left), html = '';
    Object.keys(TYPE).forEach(function (k) { html += '<span><i style="background:' + TYPE[k].color + '"></i>' + TYPE[k].label + '</span>'; });
    html += '<span><i style="background:#fff;border:2px dashed #9aa9bb;width:9px;height:9px"></i>Not tasked</span><span><i style="background:#fff;border:3px solid #2e9e5b;width:9px;height:9px"></i>New</span><span><i style="background:#fff;border:3px solid #e07a1f;width:9px;height:9px"></i>Changed</span>';
    lg.innerHTML = html;
    var tb = h('div', 'timebar', '', left);
    h('span', 'mutd', 'Clock', tb);
    var sl = h('input', '', null, tb); sl.type = 'range'; sl.min = 0; sl.max = 40; sl.value = S.now; sl.disabled = !!(S.proposal || S.busy);
    sl.onchange = function () { setNow(+sl.value); };
    h('b', '', hm(S.now), tb);

    // events
    var ec = h('div', 'card', '', right);
    h('h2', '', 'What just happened? <span class="r">try it</span>', ec);
    var evs = h('div', 'evs', '', ec), dis = !!(S.proposal || S.busy);
    function evb(key, ic, col, soft, t, d, fn) { var b = h('button', 'ev' + ((S.place === key || (key === 'ground' && S.pick)) ? ' on' : ''), '<div class="i" style="background:' + soft + ';color:' + col + '">' + ic + '</div><div><b>' + t + '</b><span>' + d + '</span></div>', evs); b.disabled = dis; b.id = 'ev-' + key; b.onclick = fn; }
    evb('ground', ICON.plane, '#d6455d', '#fdecef', 'Aircraft grounded', 'Pick a jet to remove', function () { S.pick = !S.pick; S.place = null; render(); });
    evb('sam', ICON.sam, '#d6455d', '#fdecef', 'Air-defence site', 'Place on the map', function () { S.place = S.place === 'sam' ? null : 'sam'; S.pick = false; render(); });
    evb('tst', ICON.star, '#e07a1f', '#fff3e6', 'Urgent target', 'Place on the map', function () { S.place = S.place === 'tst' ? null : 'tst'; S.pick = false; render(); });
    evb('wx', ICON.storm, '#2f6fdb', '#e9f1fe', 'Storm', 'Place on the map', function () { S.place = S.place === 'wx' ? null : 'wx'; S.pick = false; render(); });
    if (S.place) h('div', 'hint', 'Now click a point on the map. The planner will re-plan and ask for your approval.', ec);
    if (S.pick) {
      var cnt = {}, pl = S.plan; for (var id in pl.missions) if (pl.missions[id].start >= S.now) pl.missions[id].assigned.forEach(function (a) { cnt[a.aircraft] = (cnt[a.aircraft] || 0) + 1; });
      var box = h('div', 'chips', '', ec); box.style.marginTop = '8px';
      Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 12).forEach(function (a) { var c = h('span', 'chip', a + ' · ' + cnt[a], box); c.onclick = function () { inject({ type: 'ground', aircraft: [a] }, a + ' grounded', 'Maintenance finds a fault on ' + a + '. It leaves the available pool.'); }; });
    }
    if (!S.story) { var sb = h('button', 'btn sm', '▶ Play the 4-event demo story', ec); sb.style.marginTop = '10px'; sb.id = 'story'; sb.disabled = dis; sb.onclick = function () { S.story = { i: 0 }; render(); }; }

    // changes / attention
    var lc = h('div', 'card', '', right), list;
    var sc = vsc(), plan = vplan(), mm = mmap(sc), d = vdiff();
    if (d) {
      h('h2', '', 'What changes and why <span class="r">' + d.disruption + ' change' + (d.disruption === 1 ? '' : 's') + ' · ' + d.kept.length + ' untouched</span>', lc);
      list = h('div', 'list', '', lc);
      var row = function (cls, tag, id, txt) { var it = h('div', 'it', '<span class="tg ' + cls + '">' + tag + '</span><div><b>' + id + '</b> ' + txt + '</div>', list); it.onclick = function () { S.sel = id; render(); }; };
      d.added.forEach(function (id) { row('add', 'NEW', id, mm[id].label + ' tasked at ' + hm(plan.missions[id].start)); });
      d.dropped.forEach(function (id) { row('drop', 'DROPPED', id, mm[id].label + ', priority ' + mm[id].priority + '. ' + E.explain(sc, plan, id, S.now).text); });
      d.modified.forEach(function (id) { var p = plan.missions[id], q = S.plan.missions[id]; row(p.start !== q.start ? 'mv' : 'sw', p.start !== q.start ? 'RETIMED' : 'SWAPPED', id, mm[id].label + ': ' + (p.start !== q.start ? 'launch moves to ' + hm(p.start) : 'package now ' + p.assigned.map(function (a) { return a.aircraft; }).join(', '))); });
      if (!d.disruption && !d.added.length) h('div', 'empty', 'The current plan already copes with this event.', list);
      var lk = Object.keys(plan.missions).filter(function (i) { return plan.missions[i].start < S.now; }).length;
      if (lk) h('div', 'mutd', lk + ' missions already launched stay exactly as they were.', lc);
    } else {
      var un = Object.keys(plan.unflown).filter(function (id) { return mm[id].latest >= S.now; }).sort(function (a, b) { return mm[b].priority - mm[a].priority; });
      h('h2', '', 'Requests that cannot be met <span class="r">' + un.length + ' open</span>', lc);
      list = h('div', 'list', '', lc);
      un.slice(0, 5).forEach(function (id) { var it = h('div', 'it', '<span class="tg drop">P' + mm[id].priority + '</span><div><b>' + id + '</b> ' + mm[id].label + '<div class="mutd">' + E.explain(sc, plan, id, S.now).text + '</div></div>', list); it.onclick = function () { S.sel = id; render(); }; });
      if (!un.length) h('div', 'empty', 'Every open request is tasked.', list);
    }
    // history
    var hc = h('div', 'card', '', right);
    h('h2', '', 'Decision log', hc);
    var hl = h('div', 'list', '', hc);
    S.history.slice().reverse().slice(0, 5).forEach(function (x) { h('div', 'it', '<span class="tg keep">' + hm(x.t) + '</span><div><b>' + x.title + '</b><div class="mutd">' + x.n + ' · planned in ' + (x.s < 0.01 ? '<0.01' : x.s.toFixed(2)) + ' s' + (x.opt ? ' · ' + x.opt : '') + '</div></div>', hl).style.cursor = 'default'; });
  }

  function Y(y) { return 1000 - y; }
  function drawMap(svg) {
    var sc = vsc(), plan = vplan(), mm = mmap(sc), d = vdiff(), ev = S.proposal && S.proposal.ev;
    var defs = sv('defs', {}, svg), pat = sv('pattern', { id: 'hatch', width: 10, height: 10, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    sv('rect', { width: 10, height: 10, fill: '#e8f1fb' }, pat); sv('line', { x1: 0, y1: 0, x2: 0, y2: 10, stroke: '#9db9dd', 'stroke-width': 3 }, pat);
    for (var g = 0; g <= 1000; g += 100) { sv('line', { x1: g, y1: 0, x2: g, y2: 1000, stroke: '#e6edf6' }, svg); sv('line', { x1: 0, y1: g, x2: 1000, y2: g, stroke: '#e6edf6' }, svg); }
    for (g = 100; g < 1000; g += 200) sv('text', { x: g + 4, y: 994, fill: '#9aaabd', 'font-size': 16 }, svg, g + ' km');
    if (S.heat) {
      var N = 40, c = 1000 / N;
      for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) {
        var q = 1, cx = (i + .5) * c, cy = (j + .5) * c;
        sc.threats.forEach(function (t) { var dd = E.dist([cx, cy], t.xy); if (dd < t.r * 1.35) q *= 1 - t.leth * Math.max(0, 1 - dd / (t.r * 1.35)) * 0.9; });
        if (1 - q > 0.04) sv('rect', { x: i * c, y: Y(j * c + c), width: c, height: c, fill: '#d6455d', 'fill-opacity': ((1 - q) * 0.36).toFixed(3) }, svg);
      }
    }
    sc.weather.forEach(function (w) {
      var nw = ev && ev.type === 'weather' && ev.cell.id === w.id;
      sv('circle', { cx: w.xy[0], cy: Y(w.xy[1]), r: w.r, fill: 'url(#hatch)', 'fill-opacity': .9, stroke: '#6f93c9', 'stroke-dasharray': '8 6', 'stroke-width': nw ? 3.5 : 2, 'class': nw ? 'pulse' : '' }, svg);
      sv('text', { x: w.xy[0], y: Y(w.xy[1]) + 5, 'text-anchor': 'middle', fill: '#44699f', 'font-size': 17, 'font-weight': 600 }, svg, (nw ? 'NEW · ' : '') + w.name);
      sv('text', { x: w.xy[0], y: Y(w.xy[1]) + 25, 'text-anchor': 'middle', fill: '#44699f', 'font-size': 14 }, svg, hm(w.t0) + ' – ' + hm(w.t1));
    });
    sc.threats.forEach(function (t) {
      var nw = ev && ev.type === 'sam' && ev.threat.id === t.id;
      sv('circle', { cx: t.xy[0], cy: Y(t.xy[1]), r: t.r, fill: '#d6455d', 'fill-opacity': S.heat ? .05 : .09, stroke: '#d6455d', 'stroke-width': nw ? 3.5 : 2, 'stroke-dasharray': '10 6', 'class': nw ? 'pulse' : '' }, svg);
      var gg = sv('g', { transform: 'translate(' + t.xy[0] + ',' + Y(t.xy[1]) + ')' }, svg);
      sv('circle', { r: 10, fill: '#fff', stroke: '#d6455d', 'stroke-width': 2.5 }, gg); sv('path', { d: 'M-4.5,-4.5L4.5,4.5M4.5,-4.5L-4.5,4.5', stroke: '#d6455d', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, gg);
      sv('text', { y: -t.r + 22, 'text-anchor': 'middle', fill: '#b0283f', 'font-size': 15, 'font-weight': 600 }, gg, (nw ? 'NEW · ' : '') + t.name);
    });
    var chg = {}; if (d) { d.added.forEach(function (i) { chg[i] = 'add'; }); d.modified.forEach(function (i) { chg[i] = 'mod'; }); }
    Object.keys(plan.missions).forEach(function (id) {
      var m = mm[id]; if (!m) return; var show = S.routes || S.sel === id || chg[id]; if (!show) return; var seen = {};
      plan.missions[id].assigned.forEach(function (a) {
        if (seen[a.base]) return; seen[a.base] = 1; var b = E.BASES[a.base].xy, hot = S.sel === id || chg[id];
        sv('line', { x1: b[0], y1: Y(b[1]), x2: m.target[0], y2: Y(m.target[1]), stroke: TYPE[m.type].color, 'stroke-opacity': hot ? .9 : .28, 'stroke-width': hot ? 3.2 : 1.5 }, svg);
      });
    });
    Object.keys(E.BASES).forEach(function (k) {
      var b = E.BASES[k], gg = sv('g', { transform: 'translate(' + b.xy[0] + ',' + Y(b.xy[1]) + ')' }, svg);
      sv('rect', { x: -16, y: -16, width: 32, height: 32, rx: 7, fill: '#2f6fdb' }, gg); sv('path', { d: 'M-8,3 L0,-9 L8,3 L0,0Z', fill: '#fff' }, gg);
      sv('text', { y: 34, 'text-anchor': 'middle', fill: '#2358b3', 'font-size': 16, 'font-weight': 700 }, gg, k + ' ' + b.name);
    });
    sc.missions.forEach(function (m) {
      var p = plan.missions[m.id], t = TYPE[m.type], done = p && p.start + Math.max.apply(null, p.assigned.map(function (a) { return a.dur; })) <= S.now;
      var gg = sv('g', { transform: 'translate(' + m.target[0] + ',' + Y(m.target[1]) + ')', 'class': 'mk' }, svg);
      gg.addEventListener('click', function (e) { if (S.place) return; e.stopPropagation(); S.sel = m.id; render(); });
      if (chg[m.id]) sv('circle', { r: 21, fill: 'none', stroke: chg[m.id] === 'add' ? '#2e9e5b' : '#e07a1f', 'stroke-width': 3.5 }, gg);
      if (S.sel === m.id) sv('circle', { r: 26, fill: 'none', stroke: '#2f6fdb', 'stroke-width': 3, 'class': 'pulse' }, gg);
      if (p) sv('circle', { r: 14, fill: t.color, 'fill-opacity': done ? .4 : 1, stroke: '#fff', 'stroke-width': 2.5 }, gg);
      else { sv('circle', { r: 13, fill: '#fff', stroke: '#9aa9bb', 'stroke-width': 2.4, 'stroke-dasharray': '4 3' }, gg); }
      sv('text', { y: -20, 'text-anchor': 'middle', fill: p ? '#2a3b52' : '#8a9bb0', 'font-size': 15, 'font-weight': 600 }, gg, m.id.replace(/^M0?/, ''));
    });
    svg.addEventListener('click', function (e) {
      if (!S.place) return;
      var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; var q = pt.matrixTransform(svg.getScreenCTM().inverse()), xy = [Math.round(q.x), Math.round(1000 - q.y)];
      place(S.place, xy);
    });
  }
  function place(kind, xy) {
    if (kind === 'sam') { S.n.sam++; inject({ type: 'sam', threat: { id: 'TP' + S.n.sam, name: 'Pop-up site', xy: xy, r: 100, leth: 0.85, from: S.now } }, 'Pop-up air-defence site', 'A new high-lethality site appears. Risk and escort needs are recomputed.'); }
    else if (kind === 'tst') { S.n.tst++; inject({ type: 'tst', id: 'U' + S.n.tst, target: xy }, 'Urgent target (priority 10)', 'A high-value target must be engaged within 75 minutes.'); }
    else { S.n.wx++; inject({ type: 'weather', cell: { id: 'WP' + S.n.wx, name: 'Storm cell', xy: xy, r: 130, t0: S.now + 2, t1: S.now + 12 } }, 'Storm closes an area', 'Weather closes the area from ' + hm(S.now + 2) + ' to ' + hm(S.now + 12) + '.'); }
  }

  /* ---------- drawer ---------- */
  function drawer(root) {
    var sc = vsc(), plan = vplan(), m = mmap(sc)[S.sel]; if (!m) { S.sel = null; return; }
    var p = plan.missions[m.id], t = TYPE[m.type], dr = h('div', 'drawer', '', root);
    var x = h('button', 'x', '×', dr); x.onclick = function () { S.sel = null; render(); };
    h('div', '', '<div style="display:flex;align-items:center;gap:9px"><span style="width:14px;height:14px;border-radius:50%;background:' + t.color + '"></span><b style="font-size:18px">' + m.id + ' · ' + m.label + '</b></div>', dr);
    var st = p ? (p.start < S.now ? '<span class="st air">Launched</span>' : '<span class="st ready">Tasked</span>') : '<span class="st gnd">Not tasked</span>';
    var html = '<table class="dt" style="margin-top:12px"><tr><td>Status</td><td>' + st + '</td></tr><tr><td>Priority</td><td><b>' + m.priority + '</b> of 10</td></tr><tr><td>Launch window</td><td>' + hm(m.earliest) + ' – ' + hm(m.latest) + '</td></tr>';
    if (p) html += '<tr><td>Planned launch</td><td><b>' + hm(p.start) + '</b></td></tr>';
    if (m.forbid.length) html += '<tr><td>Closed by weather</td><td>' + m.forbid.map(function (f) { return hm(Math.max(0, f[0])) + ' – ' + hm(f[1]); }).join(', ') + '</td></tr>';
    html += '<tr><td>Needs</td><td>' + m.reqs.map(function (r) { return r.n + '× ' + r.roles.map(function (x) { return ROLE[x]; }).join(' or ') + (r.w ? ' with ' + r.q + ' ' + r.w : '') + (r.auto ? ' <span class="mutd">(added automatically)</span>' : ''); }).join('<br>') + '</td></tr></table>';
    dr.insertAdjacentHTML('beforeend', html);
    if (p) {
      var bi = byId(sc), tb = '<table class="dt" style="margin-top:10px"><tr><th>Aircraft</th><th>Base</th><th>Load</th><th>Risk</th><th>No-go</th></tr>';
      p.assigned.forEach(function (a) { tb += '<tr><td><b>' + a.aircraft + '</b></td><td>' + a.base + '</td><td>' + (a.weapon ? a.qty + '× ' + a.weapon : '–') + '</td><td>' + a.risk + '</td><td>' + Math.round((bi[a.aircraft].p_nogo || 0) * 100) + '%</td></tr>'; });
      dr.insertAdjacentHTML('beforeend', tb + '</table>');
      var why = [];
      if (m.sead) why.push('The target sits inside an air-defence envelope, so a suppression escort was added.');
      if (m.reqs.some(function (r) { return r.auto === 'tanker'; })) why.push('The target is beyond unrefuelled range, so a tanker was added.');
      var r = p.assigned.reduce(function (s, a) { return s + a.risk; }, 0) / p.assigned.length;
      why.push('This package has the lowest combined risk, flight time and reliability cost among the aircraft free in its window (average risk ' + r.toFixed(0) + ' of 100).');
      dr.insertAdjacentHTML('beforeend', '<div class="why"><b>Why this package</b>' + why.join(' ') + '</div>');
    } else dr.insertAdjacentHTML('beforeend', '<div class="why"><b>Why it is not tasked</b>' + E.explain(sc, plan, m.id, S.now).text + '</div>');
  }

  /* ---------- compare modal ---------- */
  function compare(root) {
    var P = S.proposal, mo = h('div', 'modal', '', root), bx = h('div', '', '', mo), mm = mmap(P.sc);
    mo.onclick = function (e) { if (e.target === mo) { S.compare = false; render(); } };
    h('div', '', '<b style="font-size:18px">Choose how to respond</b><div class="mutd">Each option respects every limit. They differ in how much risk and change you accept.</div>', bx);
    var g = h('div', 'opts', '', bx);
    ['balanced', 'safe', 'maxc', 'base'].forEach(function (k) {
      var o = P.opts[k], m = o.plan.metrics, c = h('div', 'opt' + (P.chosen === k ? ' on' : '') + (k === 'base' ? ' ref' : ''), '', g);
      c.innerHTML = (k === 'balanced' ? '<span class="tag">Recommended</span>' : '') + '<div class="nm">' + OPT[k].name + '</div><div class="ds">' + OPT[k].desc + '</div>' +
        '<div class="row"><span>Value covered</span><b>' + m.coverage_pct.toFixed(1) + '%</b></div><div class="row"><span>Average risk</span><b>' + m.avg_risk.toFixed(1) + '</b></div>' +
        '<div class="row"><span>Missions</span><b>' + m.missions_flown + ' / ' + m.missions_total + '</b></div><div class="row"><span>Changes to plan</span><b>' + o.diff.disruption + '</b></div>' +
        '<div class="row"><span>Covered if jets fail</span><b>' + o.conf.mean.toFixed(0) + '%</b></div><div class="row"><span>Planned in</span><b>' + (o.plan.solver.wall_s < 0.01 ? '<0.01' : o.plan.solver.wall_s.toFixed(2)) + ' s</b></div>';
      if (k !== 'base') c.onclick = function () { P.chosen = k; render(); };
    });
    var o = P.opts[P.chosen];
    h('div', 'why', '<b>' + OPT[P.chosen].name + ' in plain words</b>' + summary(o, mm).replace(/^./, function (c) { return c.toUpperCase(); }) + '. ' + o.diff.kept.length + ' missions stay untouched.', bx);
    var a = h('div', 'acts', '', bx); a.style.marginTop = '14px'; a.style.justifyContent = 'flex-end';
    var b0 = h('button', 'btn', 'Back to map', a); b0.onclick = function () { S.compare = false; render(); };
    var b1 = h('button', 'btn pri', 'Approve ' + OPT[P.chosen].name.toLowerCase(), a); b1.onclick = approve;
  }

  function guide(root) {
    var i = S.story.i, g = h('div', 'guide', '', root);
    if (i >= STORY.length) { g.innerHTML = '<div><div class="n">Demo story complete</div><b>Four events handled, each re-planned in well under a second.</b></div>'; var c = h('button', 'btn sm', 'Close', g); c.onclick = function () { S.story = null; render(); }; return; }
    if (S.proposal) { g.innerHTML = '<div><div class="n">Step ' + (i + 1) + ' of 4 · your decision</div><b>Review the change list, then approve.</b></div>'; return; }
    if (S.busy) { g.innerHTML = '<div><div class="n">Step ' + (i + 1) + ' of 4</div><b>Re-planning…</b></div>'; return; }
    g.innerHTML = '<div><div class="n">Demo story · step ' + (i + 1) + ' of 4 · ' + hm(STORY[i].t) + '</div><b>' + STORY[i].name + '</b></div>';
    var b = h('button', 'btn pri sm', 'Make it happen', g); b.id = 'storygo'; b.onclick = storyGo;
    var c2 = h('button', 'btn sm', 'Exit', g); c2.onclick = function () { S.story = null; render(); };
  }

  /* ---------- Timeline view ---------- */
  function vTimeline(root) {
    var card = h('div', 'card', '', root); card.style.marginTop = '12px';
    var sc = vsc(), plan = vplan(), mm = mmap(sc), d = vdiff(), fl = byId(sc);
    h('h2', '', 'Who flies what, and when <span class="r">shaded = already launched, never changed · click a bar for details</span>', card);
    var wrap = h('div', '', '', card); wrap.style.overflowX = 'auto';
    var svg = sv('svg', { id: 'gantt' }, wrap);
    var order = { FGT: 0, MRC: 1, STK: 2, SEAD: 3, ISR: 4, TKR: 5 };
    var ids = sc.fleet.map(function (a) { return a.id; }).sort(function (a, b) { return order[a.split('-')[0]] - order[b.split('-')[0]] || (a < b ? -1 : 1); });
    var LW = 205, RH = 20, TOP = 26, H = E.HORIZON + 14, W = 1440, k = (W - LW) / H, height = TOP + ids.length * RH + 30;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + height); svg.setAttribute('width', '100%'); svg.style.minWidth = '960px';
    var defs = sv('defs', {}, svg), p1 = sv('pattern', { id: 'mnt', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    sv('rect', { width: 8, height: 8, fill: '#f6e7e9' }, p1); sv('line', { x1: 0, y1: 0, x2: 0, y2: 8, stroke: '#e7b3bb', 'stroke-width': 2.5 }, p1);
    var p2 = sv('pattern', { id: 'turn', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    sv('rect', { width: 6, height: 6, fill: '#fff' }, p2); sv('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#dbe3ee', 'stroke-width': 2 }, p2);
    if (S.now > 0) sv('rect', { x: LW, y: TOP - 4, width: S.now * k, height: ids.length * RH + 4, fill: '#eef3f9' }, svg);
    for (var s = 0; s <= E.HORIZON; s += 4) { var x = LW + s * k; sv('line', { x1: x, y1: TOP - 4, x2: x, y2: height - 26, stroke: '#e3eaf3' }, svg); sv('text', { x: x, y: 14, 'text-anchor': 'middle', fill: '#7b8da4', 'font-size': 11.5 }, svg, 'T+' + (s / 4) + 'h'); }
    var role0 = null, rowOf = {};
    ids.forEach(function (id, i) {
      var y = TOP + i * RH, role = id.split('-')[0], a = fl[id]; rowOf[id] = i;
      if (role !== role0) { if (i > 0) sv('line', { x1: 0, y1: y - 1, x2: W, y2: y - 1, stroke: '#d3dce8' }, svg); role0 = role; }
      sv('circle', { cx: 9, cy: y + RH / 2 - 1, r: 3.8, fill: a.p_nogo > 0.3 ? '#d6455d' : (a.p_nogo > 0.12 ? '#e07a1f' : '#2e9e5b') }, svg);
      sv('text', { x: 20, y: y + RH - 6, fill: '#2a3b52', 'font-size': 12.5, 'font-weight': 600 }, svg, id);
      sv('text', { x: LW - 8, y: y + RH - 6, 'text-anchor': 'end', fill: '#8a9bb0', 'font-size': 10.5 }, svg, ROLE[role] + ' · ' + a.base);
      if (a.avail_from > 0) { var to = a.avail_from >= 999 ? H : a.avail_from; sv('rect', { x: LW, y: y + 3, width: to * k, height: RH - 7, fill: 'url(#mnt)', rx: 3 }, svg); if (a.avail_from >= 999) sv('text', { x: LW + 8, y: y + RH - 6, fill: '#b0283f', 'font-size': 11, 'font-weight': 700 }, svg, 'GROUNDED'); }
    });
    var chg = {}; if (d) { d.added.forEach(function (i) { chg[i] = 'add'; }); d.modified.forEach(function (i) { chg[i] = 'mod'; }); }
    Object.keys(plan.missions).forEach(function (mid) {
      var m = mm[mid], p = plan.missions[mid], t = TYPE[m.type];
      p.assigned.forEach(function (a) {
        var i = rowOf[a.aircraft]; if (i == null) return; var y = TOP + i * RH, x = LW + p.start * k, w = a.dur * k;
        var g = sv('g', { 'class': 'mk' }, svg); g.addEventListener('click', function () { S.sel = mid; render(); });
        sv('rect', { x: x + w, y: y + 5, width: 4 * k, height: RH - 10, fill: 'url(#turn)', rx: 2 }, g);
        sv('rect', { x: x, y: y + 2, width: w, height: RH - 5, rx: 4, fill: t.color, 'fill-opacity': p.start < S.now ? .5 : .95, stroke: S.sel === mid ? '#1f2d3d' : (chg[mid] === 'add' ? '#2e9e5b' : (chg[mid] === 'mod' ? '#e07a1f' : 'none')), 'stroke-width': 2.2 }, g);
        if (w > 34) sv('text', { x: x + 6, y: y + RH - 6, fill: '#fff', 'font-size': 11, 'font-weight': 700 }, g, mid);
      });
    });
    var nx = LW + S.now * k; sv('line', { x1: nx, y1: TOP - 6, x2: nx, y2: height - 22, stroke: '#2f6fdb', 'stroke-width': 2, 'stroke-dasharray': '5 4' }, svg);
    sv('rect', { x: nx - 40, y: height - 22, width: 80, height: 17, rx: 8.5, fill: '#2f6fdb' }, svg); sv('text', { x: nx, y: height - 9.5, 'text-anchor': 'middle', fill: '#fff', 'font-size': 11, 'font-weight': 700 }, svg, 'NOW ' + hm(S.now));
    var lg = h('div', 'legend', '', card), html = '';
    Object.keys(TYPE).forEach(function (kk) { html += '<span><i style="background:' + TYPE[kk].color + '"></i>' + TYPE[kk].label + '</span>'; });
    lg.innerHTML = html + '<span><i style="background:#f6e7e9;border:1px solid #e7b3bb;border-radius:2px"></i>Maintenance / grounded</span><span><i style="background:#2e9e5b"></i>reliable</span><span><i style="background:#e07a1f"></i>watch</span><span><i style="background:#d6455d"></i>likely to fail pre-flight</span>';
  }

  /* ---------- Fleet view ---------- */
  function vFleet(root) {
    var sc = vsc(), plan = vplan(), use = {}, hrs = {}, cnt = {}, air = {};
    for (var id in plan.missions) { var p = plan.missions[id]; p.assigned.forEach(function (a) { hrs[a.aircraft] = (hrs[a.aircraft] || 0) + a.dur / 4; cnt[a.aircraft] = (cnt[a.aircraft] || 0) + 1; if (a.weapon) { var k = a.base + '|' + a.weapon; use[k] = (use[k] || 0) + a.qty; } if (p.start <= S.now && S.now < p.start + a.dur) air[a.aircraft] = id; }); }
    var g = h('div', 'bases', '', root), cols = { PGM: '#e07a1f', AAM: '#2f6fdb', ARM: '#8a5cd0' }, wn = { PGM: 'Guided bombs', AAM: 'Air-to-air missiles', ARM: 'Anti-radar missiles' };
    Object.keys(E.BASES).forEach(function (b) {
      var c = h('div', 'card', '', g), fl = sc.fleet.filter(function (a) { return a.base === b; });
      h('h2', '', b + ' ' + E.BASES[b].name + ' <span class="r">' + fl.length + ' aircraft</span>', c);
      var w = ''; ['PGM', 'AAM', 'ARM'].forEach(function (x) { var u = use[b + '|' + x] || 0, s = sc.stock[b][x], left = s - u; w += '<div style="display:grid;grid-template-columns:130px 1fr 74px;gap:8px;align-items:center;font-size:12.5px;margin:4px 0"><span>' + wn[x] + '</span><div class="bar"><div style="width:' + Math.round(100 * u / s) + '%;background:' + cols[x] + '"></div></div><span style="text-align:right">' + left + ' of ' + s + ' left</span></div>'; });
      c.insertAdjacentHTML('beforeend', w);
      var t = '<table class="dt" style="margin-top:8px"><tr><th>Aircraft</th><th>Status</th><th>Crew hours</th><th>No-go</th><th>Sorties</th></tr>';
      fl.forEach(function (a) {
        var st = a.avail_from >= 999 ? '<span class="st gnd">Grounded</span>' : (air[a.id] ? '<span class="st air">Airborne ' + air[a.id] + '</span>' : (a.avail_from > S.now ? '<span class="st mnt">Ready ' + hm(a.avail_from) + '</span>' : '<span class="st ready">Ready</span>'));
        var u = hrs[a.id] || 0, pc = Math.min(100, Math.round(100 * u / a.duty_h)), col = a.p_nogo > 0.3 ? 'var(--red)' : (a.p_nogo > 0.12 ? 'var(--amber)' : 'var(--green)');
        t += '<tr><td><b>' + a.id + '</b><div class="mutd" style="font-size:11px">' + ROLE[a.role] + '</div></td><td>' + st + '</td><td><div class="bar"><div style="width:' + pc + '%;background:' + (pc > 90 ? 'var(--amber)' : 'var(--blue)') + '"></div></div><div class="mutd" style="font-size:11px">' + u.toFixed(1) + ' of ' + a.duty_h + ' h</div></td><td><b style="color:' + col + '">' + Math.round((a.p_nogo || 0) * 100) + '%</b></td><td>' + (cnt[a.id] || 0) + '</td></tr>';
      });
      c.insertAdjacentHTML('beforeend', t + '</table>');
    });
    var n = h('div', 'card', '<h2>How the no-go number is predicted</h2><div class="mutd">A gradient-boosting model reads each aircraft\'s health telemetry (hours since service, recent sorties, age, vibration anomaly, recent faults) and predicts the chance it fails its pre-flight check. On held-out synthetic data it scores AUC ' + DATA.model.auc.toFixed(2) + '. The planner keeps unreliable aircraft off the highest-priority missions.</div>', root); n.style.marginTop = '12px';
  }

  /* ---------- Engine view ---------- */
  function vEngine(root) {
    var sc = vsc(), plan = vplan(), m = plan.metrics, v = E.validate(sc, plan, S.now);
    var pc = h('div', 'card', '', root); pc.style.marginTop = '12px';
    h('h2', '', 'What happens between an event and your approval', pc);
    var pp = h('div', 'pipe', '', pc);
    [['1 · Fuse', 'Aircraft, crews, weapons, airspace, weather, threats and priorities become one state.'], ['2 · Predict', 'Aircraft no-go probability and a threat-risk surface.'], ['3 · Optimise', 'Search thousands of plans that respect every limit.'], ['4 · Explain', 'Rank options and say why each change is made.'], ['5 · Approve', 'You decide. Launched sorties are never touched.']].forEach(function (s, i) { if (i) h('div', 'ar', '➜', pp); h('div', 's', '<b>' + s[0] + '</b><span>' + s[1] + '</span>', pp); });
    var g = h('div', 'eng', '', root);
    // checks
    var c1 = h('div', 'card', '', g), nS = m.sorties, lk = Object.keys(plan.missions).filter(function (i) { return plan.missions[i].start < S.now; }).length;
    h('h2', '', 'Rule checks on this plan <span class="r">' + (v.length ? v.length + ' problems' : 'all passed') + '</span>', c1);
    var has = function (re) { return v.filter(function (x) { return re.test(x); }).length; };
    [['Every package has the right aircraft types and numbers', /requirement|wrong role/, m.missions_flown + ' missions'], ['No aircraft is double-booked; 1 h turnaround kept', /overlaps|twice/, nS + ' sorties'], ['Crew duty hours stay within limits', /crew/, m.aircraft_used + ' crews'],
      ['Weapon stock at each base is not exceeded', /stock/, '9 stock lines'], ['Runway launches: at most ' + E.LAUNCH_CAP + ' per 15 minutes per base', /launch/, '3 bases'], ['Range is respected, or a tanker is attached', /range/, nS + ' sorties'],
      ['Aircraft are serviceable when they launch', /serviceable/, nS + ' sorties'], ['Launches fall inside the window and outside weather closures', /window|closed/, m.missions_flown + ' missions'], ['Sorties already launched are left unchanged', /zzz/, lk + ' locked']
    ].forEach(function (r) { var n = has(r[1]); h('div', 'chk' + (n ? ' bad' : ''), '<div class="t">' + (n ? '!' : '✓') + '</div><div>' + r[0] + '</div><span>' + r[2] + '</span>', c1); });
    // search + objective
    var c2 = h('div', 'card', '', g), so = plan.solver, sco = plan.score;
    h('h2', '', 'How this plan was found', c2);
    c2.insertAdjacentHTML('beforeend', '<table class="dt"><tr><td>Engine</td><td><b>' + so.engine + '</b></td></tr><tr><td>Time</td><td><b>' + (so.wall_s < 0.01 ? '<0.01' : so.wall_s.toFixed(2)) + ' s</b></td></tr>' + (so.iterations ? '<tr><td>Plans explored</td><td><b>' + so.iterations.toLocaleString() + '</b> (' + so.improvements + ' improvements)</td></tr>' : '<tr><td>Result</td><td><b>' + String(so.status).toLowerCase() + '</b></td></tr>') + '<tr><td>Decisions</td><td>' + sc.missions.length + ' missions × ' + sc.fleet.length + ' aircraft × ' + E.HORIZON + ' time slots</td></tr></table>');
    var parts = [['Mission value', sco.value, '#2e9e5b'], ['Threat risk', -sco.risk, '#d6455d'], ['Reliability', -sco.readiness, '#e07a1f'], ['Flight time', -sco.flight, '#8a5cd0'], ['Delay', -sco.delay, '#c9a017']], mx = sco.value;
    var ob = '<div style="margin-top:10px;font-size:11px;font-weight:700;letter-spacing:.6px;color:var(--mut);text-transform:uppercase">What the score is made of</div>';
    parts.forEach(function (p) { ob += '<div style="display:grid;grid-template-columns:92px 1fr 62px;gap:8px;align-items:center;font-size:12.5px;margin:4px 0"><span>' + p[0] + '</span><div class="bar"><div style="width:' + Math.max(1.5, Math.round(100 * Math.abs(p[1]) / mx)) + '%;background:' + p[2] + '"></div></div><span style="text-align:right;font-variant-numeric:tabular-nums">' + (p[1] > 0 ? '+' : '') + p[1].toLocaleString() + '</span></div>'; });
    c2.insertAdjacentHTML('beforeend', ob + '<div class="mutd" style="margin-top:6px">Built-in engine reaches ' + DATA.bench.js_ratio + '% of the exact solver\'s score in ' + DATA.bench.js_ms + ' ms across ' + DATA.bench.n + ' test scenarios.</div>');
    // confidence
    var c3 = h('div', 'card', '', g), rb = E.robust(sc, plan, 1000, 5, S.now);
    h('h2', '', 'Plan confidence <span class="r">1,000 simulated days</span>', c3);
    var bins = [], lo = Math.floor(rb.samples[0] / 2) * 2, hi = Math.ceil(rb.samples[rb.samples.length - 1] / 2) * 2 || lo + 2; if (hi <= lo) hi = lo + 2;
    var nb = Math.max(1, Math.round((hi - lo) / 2)); for (var i = 0; i < nb; i++) bins.push(0);
    rb.samples.forEach(function (x) { bins[Math.min(nb - 1, Math.floor((x - lo) / 2))]++; });
    var svg = sv('svg', { viewBox: '0 0 360 150', width: '100%' }, c3), bw = 320 / nb, mxb = Math.max.apply(null, bins);
    bins.forEach(function (b, i2) { var hh = 100 * b / mxb; sv('rect', { x: 20 + i2 * bw + 1, y: 115 - hh, width: Math.max(2, bw - 2), height: hh, rx: 2, fill: '#2f6fdb', 'fill-opacity': .85 }, svg); });
    sv('line', { x1: 20, y1: 115, x2: 340, y2: 115, stroke: '#c9d5e6' }, svg);
    sv('text', { x: 20, y: 132, 'font-size': 11, fill: '#7b8da4' }, svg, lo + '%'); sv('text', { x: 340, y: 132, 'font-size': 11, fill: '#7b8da4', 'text-anchor': 'end' }, svg, hi + '%');
    sv('text', { x: 180, y: 146, 'font-size': 11, fill: '#7b8da4', 'text-anchor': 'middle' }, svg, 'mission value still covered');
    c3.insertAdjacentHTML('beforeend', '<div class="mutd">If aircraft fail pre-flight at their predicted rates, the plan still covers <b style="color:var(--ink)">' + rb.mean.toFixed(1) + '%</b> on average and at least <b style="color:var(--ink)">' + rb.p10.toFixed(1) + '%</b> on 9 days out of 10. On ' + rb.intact + '% of days nothing fails.</div>');
    // trade-off
    var c4 = h('div', 'card', '', root); c4.style.marginTop = '12px';
    h('h2', '', 'Risk versus coverage <span class="r">each dot is a complete, valid plan</span>', c4);
    if (!S.frontier) { var b = h('button', 'btn sm', 'Explore the trade-off', c4); b.id = 'explore'; b.onclick = function () { frontier(); }; h('div', 'mutd', 'Re-plans six times with different risk appetites, from very cautious to very bold.', c4).style.marginTop = '6px'; }
    else drawFrontier(c4, m);
  }
  function frontier() {
    var ws = [[0, 0, 'Bold'], [8, 10], [25, 20, 'Balanced'], [45, 30, 'Cautious'], [80, 40], [140, 50, 'Very cautious']], out = [], i = 0;
    S.busy = 'Exploring the trade-off…'; render();
    (function next() {
      if (i === ws.length) { S.frontier = out; S.busy = null; render(); return; }
      var w = ws[i++]; E.planAsync(S.sc, { prev: S.plan, now: S.now, weights: { risk: w[0], ready: w[1], keep: 0, shift: 0 }, budgetMs: S.now ? 300 : 900, seed: 11 }, function (p) { out.push({ risk: p.metrics.avg_risk, cov: p.metrics.coverage_pct, n: p.metrics.missions_flown, label: w[2] }); next(); });
    })();
  }
  function drawFrontier(card, m) {
    var F = [], seen = {};
    S.frontier.forEach(function (p) { var k = p.risk + '|' + p.cov; if (seen[k]) { if (p.label && !seen[k].label) seen[k].label = p.label; return; } seen[k] = p; F.push(p); });
    var svg = sv('svg', { viewBox: '0 0 1400 300', width: '100%' }, card);
    var xs = F.map(function (p) { return p.risk; }).concat([m.avg_risk]), ys = F.map(function (p) { return p.cov; }).concat([m.coverage_pct]);
    var x0 = Math.floor(Math.min.apply(null, xs) - 1), x1 = Math.ceil(Math.max.apply(null, xs) + 1), y0 = Math.floor(Math.min.apply(null, ys) - 4), y1 = Math.ceil(Math.max.apply(null, ys) + 4);
    var X = function (v) { return 80 + (v - x0) / (x1 - x0) * 1260; }, Yv = function (v) { return 245 - (v - y0) / (y1 - y0) * 215; };
    for (var gy = y0; gy <= y1; gy += Math.max(1, Math.round((y1 - y0) / 5))) { sv('line', { x1: 80, y1: Yv(gy), x2: 1340, y2: Yv(gy), stroke: '#e6edf6' }, svg); sv('text', { x: 70, y: Yv(gy) + 4, 'text-anchor': 'end', 'font-size': 13, fill: '#7b8da4' }, svg, gy + '%'); }
    for (var gx = x0; gx <= x1; gx += Math.max(1, Math.round((x1 - x0) / 8))) sv('text', { x: X(gx), y: 266, 'text-anchor': 'middle', 'font-size': 13, fill: '#7b8da4' }, svg, gx);
    sv('text', { x: 710, y: 290, 'text-anchor': 'middle', 'font-size': 13, fill: '#5d6f84' }, svg, 'average risk per sortie (lower is safer)');
    sv('text', { x: 18, y: 135, 'font-size': 13, fill: '#5d6f84', transform: 'rotate(-90 18 135)', 'text-anchor': 'middle' }, svg, 'value covered');
    var pts = F.slice().sort(function (a, b) { return a.risk - b.risk; });
    sv('polyline', { points: pts.map(function (p) { return X(p.risk) + ',' + Yv(p.cov); }).join(' '), fill: 'none', stroke: '#9db9dd', 'stroke-width': 2, 'stroke-dasharray': '5 4' }, svg);
    sv('circle', { cx: X(m.avg_risk), cy: Yv(m.coverage_pct), r: 17, fill: '#e6f6ec', stroke: '#2e9e5b', 'stroke-width': 3.5 }, svg);
    pts.forEach(function (p, i) {
      sv('circle', { cx: X(p.risk), cy: Yv(p.cov), r: 11, fill: '#2f6fdb', stroke: '#fff', 'stroke-width': 2 }, svg);
      sv('text', { x: X(p.risk), y: Yv(p.cov) + 4.5, 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 700, fill: '#fff' }, svg, String(i + 1));
    });
    var lg = h('div', 'legend', '', card); lg.style.fontSize = '12.5px'; lg.style.gap = '4px 18px';
    var html = '<span><i style="background:#e6f6ec;border:3px solid #2e9e5b;width:9px;height:9px"></i><b style="color:#1f7a45">Your approved plan</b>: ' + m.missions_flown + ' missions, ' + m.coverage_pct.toFixed(0) + '% covered, risk ' + m.avg_risk.toFixed(1) + '</span>';
    pts.forEach(function (p, i) { html += '<span><b style="color:#2358b3">' + (i + 1) + '</b> ' + (p.label ? p.label + ': ' : '') + p.n + ' missions, ' + p.cov.toFixed(0) + '%, risk ' + p.risk.toFixed(1) + '</span>'; });
    lg.innerHTML = html;
  }

  /* ---------- boot ---------- */
  window.VVApp = { S: S, render: render, inject: inject, approve: approve, setNow: setNow, storyGo: storyGo, frontier: frontier,
    view: function (v) { S.view = v; render(); }, sel: function (id) { S.sel = id; render(); }, set: function (k, v) { S[k] = v; render(); } };
  if (location.protocol.indexOf('http') === 0) {
    fetch('/api/ping').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.ok) { S.serverOK = true; S.engine = 'server'; } init(); }).catch(init);
  } else init();
})();
