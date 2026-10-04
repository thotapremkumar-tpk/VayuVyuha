"""Records the guided walkthrough of the live VayuVyuha app (Playwright video), timed to the narration clips."""
import asyncio, json, math, sys, time, os, shutil
from playwright.async_api import async_playwright

URL = "http://localhost:8000"
TIMING = json.load(open("tts/timing.json"))
W, H = 1760, 990
VW, VH = 1920, 1080

CSS = """
*{transition:none !important}
.app{max-width:1730px !important;padding:12px 18px 90px !important}
.grid{grid-template-columns:572px 1fr !important}
.legend{font-size:10.5px !important;gap:3px 10px !important}
.guide{display:none !important}
.pulse{animation:pulse 1.4s steps(6) infinite !important}
.spin{animation:sp .8s steps(8) infinite !important}
#vcap{position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:300;max-width:1400px;background:rgba(255,255,255,.97);border:1.5px solid #b9cdee;
  border-radius:14px;padding:11px 26px;font:600 23px/1.3 -apple-system,"Segoe UI",Inter,Roboto,Arial,sans-serif;color:#1f3864;text-align:center;box-shadow:0 10px 30px rgba(31,61,120,.22);opacity:0}
#vcap.on{opacity:1}
#vcur{position:fixed;left:0;top:0;z-index:400;pointer-events:none;width:30px;height:30px;transform:translate(-3px,-2px)}
.vrip{position:fixed;z-index:390;pointer-events:none;width:14px;height:14px;border-radius:50%;border:3px solid #2f6fdb;transform:translate(-50%,-50%);animation:vr .5s steps(8) forwards}
@keyframes vr{to{width:64px;height:64px;opacity:0}}
#vcard{position:fixed;inset:0;z-index:350;background:linear-gradient(135deg,#f4f7fb,#e9f1fe);display:grid;place-items:center;transition:opacity .6s steps(10) !important;font-family:-apple-system,"Segoe UI",Inter,Roboto,Arial,sans-serif}
#vcard.off{opacity:0;pointer-events:none}
#vmk{position:fixed;left:0;top:0;width:12px;height:12px;z-index:500;background:#f4f7fb}
#vcard .in{text-align:center;color:#1f3864}
#vcard .lg{width:120px;height:120px;border-radius:32px;background:linear-gradient(135deg,#3b82f6,#22b8c9);display:grid;place-items:center;margin:0 auto 30px}
#vcard h1{font-size:84px;margin:0;letter-spacing:.5px}
#vcard h2{font-size:34px;font-weight:500;margin:14px 0 0;color:#3d5373}
#vcard p{font-size:24px;color:#5d6f84;margin:34px 0 0}
#vcard .pl{display:inline-block;margin-top:26px;font-size:22px;border-radius:999px;padding:8px 22px;background:#fff3e6;color:#a85a10;border:1px solid #f6d9b8}
"""
JS = """
(() => {
  const cap = document.createElement('div'); cap.id = 'vcap'; document.body.appendChild(cap);
  const cur = document.createElement('div'); cur.id = 'vcur';
  cur.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2l15 9.5-6.6 1.2 4 7.3-2.7 1.4-4-7.4L5 18.5z" fill="#1f2d3d" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.body.appendChild(cur);
  document.addEventListener('mousemove', e => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; }, true);
  document.addEventListener('mousedown', e => { const r = document.createElement('div'); r.className = 'vrip'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 600); }, true);
  const card = document.createElement('div'); card.id = 'vcard';
  card.innerHTML = '<div class="in"><div class="lg"><svg width="70" height="70" viewBox="0 0 24 24" fill="#fff"><path d="M21 15.5v-2l-8-5V4a1.5 1.5 0 00-3 0v4.5l-8 5v2l8-2.5V18l-2.2 1.6V21l3.7-1 3.7 1v-1.4L13 18v-5z"/></svg></div><h1>VayuVyuha</h1><h2 id="vsub">Dynamic air operations planner</h2><p id="vp">Working prototype walkthrough · SIH26250</p><span class="pl">All data is synthetic and fictional</span></div>';
  document.body.appendChild(card);
  const mk = document.createElement('div'); mk.id = 'vmk'; document.body.appendChild(mk); let mi = 0; const MC = ['#ff0000', '#00ff00', '#0000ff'];
  window.__cap = (t) => { if (t) { cap.textContent = t; cap.classList.add('on'); mk.style.background = MC[mi++ % 3]; } else cap.classList.remove('on'); };
  window.__card = (on, sub, p) => { if (sub) document.getElementById('vsub').textContent = sub; if (p) document.getElementById('vp').textContent = p; card.classList.toggle('off', !on); };
  window.__pt = (xy) => { const svg = document.getElementById('map'); const pt = svg.createSVGPoint(); pt.x = xy[0]; pt.y = 1000 - xy[1]; const s = pt.matrixTransform(svg.getScreenCTM()); return [s.x, s.y]; };
})();
"""


class Rec:
    def __init__(self, page):
        self.pg = page; self.t0 = time.monotonic(); self.mx, self.my = W / 2, H / 2; self.marks = {}; self.scene_t = 0; self.info = {}

    def now(self): return time.monotonic() - self.t0

    async def ev(self, js): return await self.pg.evaluate(js)

    async def idle(self, timeout=40):
        t = time.monotonic()
        while time.monotonic() - t < timeout:
            if await self.ev("!!(window.VVApp && VVApp.S.plan && !VVApp.S.busy)"): return
            await asyncio.sleep(0.06)

    async def proposal(self, timeout=40):
        t = time.monotonic()
        while time.monotonic() - t < timeout:
            if await self.ev("!!(VVApp.S.proposal && !VVApp.S.busy)"): return
            await asyncio.sleep(0.05)
        raise RuntimeError("no proposal")

    async def move(self, x, y, dur=0.55):
        n = max(6, int(dur / 0.05)); x0, y0 = self.mx, self.my
        for i in range(1, n + 1):
            u = i / n; e = u * u * (3 - 2 * u)
            await self.pg.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e); await asyncio.sleep(dur / n)
        self.mx, self.my = x, y

    async def click_at(self, x, y, dur=0.55):
        await self.move(x, y, dur); await asyncio.sleep(0.12)
        await self.pg.mouse.down(); await asyncio.sleep(0.07); await self.pg.mouse.up(); await asyncio.sleep(0.15)

    async def box(self, sel, nth=0, text=None):
        loc = self.pg.locator(sel, has_text=text) if text else self.pg.locator(sel)
        loc = loc.nth(nth); await loc.wait_for(state="visible", timeout=8000)
        b = await loc.bounding_box(); return b

    async def click(self, sel, nth=0, text=None, dur=0.55, fx=0.5, fy=0.5):
        b = await self.box(sel, nth, text); await self.click_at(b["x"] + b["width"] * fx, b["y"] + b["height"] * fy, dur)

    async def hover(self, sel, nth=0, text=None, dur=0.6, fx=0.5, fy=0.5):
        b = await self.box(sel, nth, text); await self.move(b["x"] + b["width"] * fx, b["y"] + b["height"] * fy, dur)

    async def until(self, t):
        d = self.scene_t + t - self.now()
        if d > 0: await asyncio.sleep(d)

    def sent(self, key, i): return TIMING[key]["sentences"][i]["start"]

    async def subs(self, key):
        for s in TIMING[key]["sentences"]:
            d = self.scene_t + s["start"] - self.now()
            if d > 0: await asyncio.sleep(d)
            await self.ev("window.__cap(%s)" % json.dumps(s["text"]))
            await asyncio.sleep(s["dur"])
        await self.ev("window.__cap('')")

    async def scene(self, key, action, tail=0.45, captions=True):
        self.scene_t = self.now(); self.marks[key] = round(self.scene_t, 3)
        task = asyncio.create_task(self.subs(key)) if captions else None
        await action()
        await self.until(TIMING[key]["dur"] + tail)
        if task: await task
        print("scene", key, "start", self.marks[key], "len", round(self.now() - self.scene_t, 2), flush=True)

    async def clock(self, v):
        b = await self.box(".timebar input")
        await self.click_at(b["x"] + 8 + (b["width"] - 16) * v / 40, b["y"] + b["height"] / 2)
        await self.ev("(function(){ if (VVApp.S.now !== %d) { VVApp.S.now = %d; VVApp.render(); } })()" % (v, v))
        await asyncio.sleep(0.25)

    async def scroll(self, y, dur=0.9):
        y0 = await self.ev("window.scrollY"); n = max(4, int(dur / 0.05))
        for i in range(1, n + 1):
            u = i / n; e = u * u * (3 - 2 * u)
            await self.ev("window.scrollTo(0, %f)" % (y0 + (y - y0) * e)); await asyncio.sleep(dur / n)


async def run(out_dir):
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": W, "height": H}, device_scale_factor=VW / W, record_video_dir=out_dir, record_video_size={"width": W, "height": H})
        pg = await ctx.new_page()
        R = Rec(pg)
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL)
        await pg.add_style_tag(content=CSS); await pg.evaluate(JS)
        await pg.mouse.move(W / 2, H / 2)

        # ---- title
        await R.idle(); await R.ev("VVApp.render()"); await asyncio.sleep(0.6)
        trim = R.now()
        async def a_title():
            await R.until(TIMING["title"]["dur"] - 0.2); await R.ev("window.__card(false)")
        await R.scene("title", a_title, tail=0.7)
        R.info["engine"] = await R.ev("VVApp.S.engine"); R.info["initial"] = await R.ev("VVApp.S.plan.metrics")

        # ---- overview
        async def a_over():
            await R.hover(".hero .t", fx=0.3); await R.until(R.sent("overview", 1)); await R.hover("#map", fx=0.5, fy=0.45, dur=0.9)
            await R.until(R.sent("overview", 2)); await R.hover(".hero .t", fx=0.6, dur=0.8); await R.until(R.sent("overview", 2) + 3.2); await R.hover(".kp .kpi", nth=0, dur=0.7)
            await asyncio.sleep(0.7); await R.hover(".kp .kpi", nth=1, dur=0.5); await asyncio.sleep(0.5); await R.hover(".kp .kpi", nth=2, dur=0.5)
        await R.scene("overview", a_over)

        # ---- mission drawer
        async def a_mission():
            mid = await R.ev("(function(){var S=VVApp.S,ms=S.sc.missions.filter(function(m){return S.plan.missions[m.id]&&m.sead;});ms.sort(function(a,b){return b.priority-a.priority;});return (ms[0]||S.sc.missions.filter(function(m){return S.plan.missions[m.id];})[0]).id;})()")
            xy = await R.ev("window.__pt(VVApp.S.sc.missions.filter(function(m){return m.id==='%s';})[0].target)" % mid)
            await R.click_at(xy[0], xy[1], 0.8); R.info["mission"] = mid
            await R.until(R.sent("mission", 1)); await R.hover(".drawer table.dt", nth=1, dur=0.8); await asyncio.sleep(1.2); await R.hover(".drawer .why", dur=0.6)
            await R.until(TIMING["mission"]["dur"] - 0.3); await R.click(".drawer .x", dur=0.45)
        await R.scene("mission", a_mission)

        # ---- untasked
        async def a_untasked():
            await R.hover(".col .card", nth=1, fx=0.3, fy=0.25, dur=0.8)
            await R.until(R.sent("untasked", 1) - 0.3)
            idx = await R.ev("(function(){var it=document.querySelectorAll('.col .card:nth-child(2) .list .it');for(var i=0;i<it.length;i++)if(/weapon stock/.test(it[i].textContent))return i;return 0;})()")
            await R.click(".col .card:nth-child(2) .list .it", nth=idx, fx=0.25)
            await asyncio.sleep(0.5); await R.hover(".drawer .why", dur=0.7)
            await R.until(TIMING["untasked"]["dur"] - 0.3); await R.click(".drawer .x", dur=0.45)
        await R.scene("untasked", a_untasked)

        # ---- event 1: ground
        async def a_ground():
            await R.until(R.sent("ground", 1) - 0.4); await R.clock(6)
            await R.click("#ev-ground"); await asyncio.sleep(0.5); await R.click(".chip", text="·", nth=0)
        await R.scene("ground", a_ground, tail=0.1)

        async def a_ground_plan():
            await R.proposal(); R.info["e1"] = await R.ev("({d:VVApp.S.proposal.opts.balanced.diff.disruption,s:VVApp.S.proposal.opts.balanced.plan.solver.wall_s,t:VVApp.S.proposal.title})")
            await R.until(R.sent("ground_plan", 1) - 0.2); await R.hover(".hero .t", fx=0.25, dur=0.7); await asyncio.sleep(1.0); await R.hover(".hero .d", fx=0.4, dur=0.6)
            await R.until(R.sent("ground_plan", 2)); await R.hover(".col .card:nth-child(2) .list .it", nth=0, fx=0.3, dur=0.7); await asyncio.sleep(0.9)
            n = await R.ev("document.querySelectorAll('.col .card:nth-child(2) .list .it').length")
            if n > 2: await R.hover(".col .card:nth-child(2) .list .it", nth=2, fx=0.4, dur=0.6)
            await R.until(R.sent("ground_plan", 3)); await R.hover(".col .card:nth-child(2) .mutd", nth=-1, fx=0.3, dur=0.6) if await R.ev("!!document.querySelector('.col .card:nth-child(2) > .mutd')") else None
            await R.until(R.sent("ground_plan", 4) - 0.5); await R.click("#approve", dur=0.8)
        await R.scene("ground_plan", a_ground_plan)

        # ---- event 2: air-defence site
        async def a_sam():
            await R.clock(10); await R.click("#ev-sam")
            xy = await R.ev("(function(){var S=VVApp.S,mm={};S.sc.missions.forEach(function(m){mm[m.id]=m;});var up=Object.keys(S.plan.missions).filter(function(id){var m=mm[id];return (m.type==='STRK'||m.type==='INT')&&S.plan.missions[id].start>S.now+2&&!m.sead;}).sort(function(a,b){return S.plan.missions[a].start-S.plan.missions[b].start;});var t=up.length?mm[up[0]].target:[500,700];return window.__pt([t[0]+15,t[1]-10]);})()")
            await R.until(R.sent("sam", 1) - 0.3); await R.click_at(xy[0], xy[1], 0.8)
        await R.scene("sam", a_sam, tail=0.1)

        async def a_sam_plan():
            await R.proposal(); R.info["e2"] = await R.ev("({d:VVApp.S.proposal.opts.balanced.diff.disruption,s:VVApp.S.proposal.opts.balanced.plan.solver.wall_s})")
            await R.hover(".hero .d", fx=0.5, dur=0.8); await asyncio.sleep(1.0); await R.hover(".col .card:nth-child(2) .list .it", nth=0, fx=0.3, dur=0.7)
            await R.until(R.sent("sam_plan", 1) - 0.2); await R.click("button.btn", text="Compare options", dur=0.8)
            await R.until(R.sent("sam_plan", 2)); await R.hover(".opt", nth=0, fy=0.3, dur=0.6); await asyncio.sleep(0.9); await R.hover(".opt", nth=1, fy=0.3, dur=0.5); await asyncio.sleep(0.8); await R.hover(".opt", nth=2, fy=0.3, dur=0.5)
            await R.until(R.sent("sam_plan", 3)); await R.hover(".opt", nth=1, fy=0.62, dur=0.6); await asyncio.sleep(1.1); await R.hover(".opt", nth=2, fy=0.72, dur=0.6)
            await R.until(R.sent("sam_plan", 4)); await R.hover(".opt", nth=3, fy=0.4, dur=0.7)
            await R.until(R.sent("sam_plan", 5) - 0.2); await R.hover(".opt", nth=0, fy=0.5, dur=0.6); await asyncio.sleep(0.4); await R.click(".modal .btn.pri", dur=0.7)
        await R.scene("sam_plan", a_sam_plan)

        # ---- event 3: urgent target
        async def a_tst():
            await R.clock(14); await R.click("#ev-tst")
            xy = await R.ev("window.__pt([665,730])"); await R.until(R.sent("tst", 1) - 0.3); await R.click_at(xy[0], xy[1], 0.8)
        await R.scene("tst", a_tst, tail=0.1)

        async def a_tst_plan():
            await R.proposal(); R.info["e3"] = await R.ev("({d:VVApp.S.proposal.opts.balanced.diff.disruption,added:VVApp.S.proposal.opts.balanced.diff.added,s:VVApp.S.proposal.opts.balanced.plan.solver.wall_s})")
            await R.hover(".col .card:nth-child(2) .list .it", nth=1, fx=0.3, dur=0.8)
            await R.until(R.sent("tst_plan", 1) - 0.4); await R.click(".col .card:nth-child(2) .list .it", nth=0, fx=0.2)
            await asyncio.sleep(0.4); await R.hover(".drawer table.dt", nth=1, dur=0.6)
            await R.until(TIMING["tst_plan"]["dur"] - 1.7); await R.click(".drawer .x", dur=0.45); await R.click("#approve", dur=0.7)
        await R.scene("tst_plan", a_tst_plan)

        # ---- event 4: storm
        async def a_storm():
            await R.clock(18); await R.click("#ev-wx")
            xy = await R.ev("(function(){var S=VVApp.S,mm={};S.sc.missions.forEach(function(m){mm[m.id]=m;});var up=Object.keys(S.plan.missions).filter(function(id){var m=mm[id];return (m.type==='STRK'||m.type==='INT'||m.type==='TST')&&S.plan.missions[id].start>S.now+3;}).sort(function(a,b){return S.plan.missions[a].start-S.plan.missions[b].start;});var t=up.length?mm[up[0]].target:[330,640];return window.__pt(t);})()")
            await R.click_at(xy[0], xy[1], 0.8); await R.proposal()
            R.info["e4"] = await R.ev("({d:VVApp.S.proposal.opts.balanced.diff.disruption,s:VVApp.S.proposal.opts.balanced.plan.solver.wall_s})")
            await R.hover(".col .card:nth-child(2) .list .it", nth=0, fx=0.3, dur=0.7)
            await R.until(max(TIMING["storm"]["dur"] - 0.9, R.now() - R.scene_t + 1.2)); await R.click("#approve", dur=0.7)
        await R.scene("storm", a_storm, tail=0.6)

        # ---- timeline
        async def a_timeline():
            await R.click(".tab", nth=1); await asyncio.sleep(0.4)
            await R.hover("#gantt", fx=0.35, fy=0.25, dur=0.9); await R.until(R.sent("timeline", 1)); await R.hover("#gantt", fx=0.2, fy=0.3, dur=0.7)
            await R.until(R.sent("timeline", 2)); await R.hover("#gantt", fx=0.5, fy=0.47, dur=0.7); await asyncio.sleep(0.9)
            k = await R.ev("document.querySelectorAll('#gantt g.mk').length")
            await R.click("#gantt g.mk rect:nth-child(2)", nth=min(k - 1, 22)); await asyncio.sleep(1.2); await R.click(".drawer .x", dur=0.45)
        await R.scene("timeline", a_timeline, tail=0.3)

        # ---- fleet
        async def a_fleet():
            await R.click(".tab", nth=2); await asyncio.sleep(0.4)
            await R.hover(".bases .card", nth=0, fx=0.5, fy=0.08, dur=0.8); await R.until(R.sent("fleet", 1)); await R.hover(".bases .card", nth=1, fx=0.5, fy=0.1, dur=0.8)
            await asyncio.sleep(1.2); await R.hover(".bases .card table.dt", nth=1, fx=0.55, fy=0.2, dur=0.7); await asyncio.sleep(1.3); await R.hover(".bases .card table.dt", nth=1, fx=0.78, fy=0.5, dur=0.7)
            await R.until(R.sent("fleet", 2)); await R.scroll(260, 1.0); await R.hover(".bases .card table.dt", nth=1, fx=0.78, fy=0.95, dur=0.7)
            await R.until(TIMING["fleet"]["dur"] - 0.2); await R.scroll(0, 0.7)
        await R.scene("fleet", a_fleet, tail=0.3)

        # ---- engine
        async def a_engine():
            await R.click(".tab", nth=3); await asyncio.sleep(0.4)
            await R.hover(".pipe", fx=0.3, dur=0.8); await R.until(R.sent("engine", 1)); await R.hover(".eng .card", nth=0, fx=0.4, fy=0.3, dur=0.8); await asyncio.sleep(0.9); await R.hover(".eng .card", nth=0, fx=0.4, fy=0.8, dur=0.7)
            await R.until(R.sent("engine", 2)); await R.hover(".eng .card", nth=1, fx=0.5, fy=0.2, dur=0.8); await asyncio.sleep(1.6); await R.hover(".eng .card", nth=1, fx=0.5, fy=0.7, dur=0.7)
            await asyncio.sleep(1.8); await R.hover(".eng .card", nth=2, fx=0.5, fy=0.4, dur=0.8)
        await R.scene("engine", a_engine)

        # ---- trade-off
        async def a_trade():
            b = await R.box("#explore");
            if b["y"] > H - 160: await R.scroll(b["y"] - 500, 0.6)
            await R.click("#explore"); await R.idle(); await asyncio.sleep(0.3)
            h = await R.ev("document.documentElement.scrollHeight"); await R.scroll(max(0, h - H), 0.8)
            await R.until(R.sent("tradeoff", 1) - 0.2); await R.hover("#app > .card >> nth=-1", fx=0.55, fy=0.5, dur=0.9)
        await R.scene("tradeoff", a_trade, tail=0.6)

        # ---- built-in engine
        async def a_builtin():
            await R.scroll(0, 0.8); await R.hover(".pill.btn", dur=0.8)
            await R.until(R.sent("builtin", 2) - 0.2); await R.click(".pill.btn", dur=0.3); await asyncio.sleep(0.6)
            await R.click(".tab", nth=0); await asyncio.sleep(0.4)
            await R.click("#ev-ground"); await asyncio.sleep(0.4); await R.click(".chip", text="·", nth=0)
            await R.proposal(); R.info["e5"] = await R.ev("({d:VVApp.S.proposal.opts.balanced.diff.disruption,s:VVApp.S.proposal.opts.balanced.plan.solver.wall_s,eng:VVApp.S.proposal.opts.balanced.plan.solver.engine})")
            await R.hover(".col .card:nth-child(2) .list .it", nth=0, fx=0.3, dur=0.7)
            await R.until(max(R.sent("builtin", 3) + 1.4, R.now() - R.scene_t + 1.0)); await R.click("#approve", dur=0.7)
        await R.scene("builtin", a_builtin, tail=0.8)

        # ---- end card
        async def a_end():
            await R.ev("window.__card(true, 'One live picture. A new plan in under a second. A reason for every change. A human approves.', 'SIH26250 · Air Power: Dynamic Air Operations & Resource Optimisation')")
        await R.scene("end", a_end, tail=1.2)

        R.info["final_viol"] = await R.ev("Engine.validate(VVApp.S.sc, VVApp.S.plan, VVApp.S.now).length")
        R.info["history"] = await R.ev("VVApp.S.history")
        total = R.now()
        path = await pg.video.path()
        await ctx.close(); await b.close()
        json.dump({"marks": R.marks, "trim": trim, "total": total, "video": path, "info": R.info, "errors": errs}, open("marks.json", "w"), indent=1)
        print("video", path, "total", round(total, 1), "errors", errs[:3])

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "raw"
    shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    asyncio.run(run(out))
