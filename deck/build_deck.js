// VayuVyuha SIH26250 deck: SIH template frame (logo, team oval, heading, rule, title page), visual-first content inside.
const pptxgen = require("pptxgenjs");
const fs = require("fs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");
const { applyTheme } = require("/mnt/skills/public/pptx/scripts/apply_theme.js");

const TEAM = "VayuVyuha", OUT = "VayuVyuha_SIH26250.pptx";
const P = (pt) => pt / 72; // template geometry measured in points on a 960 x 540 pt page
const C = { navy: "1F3864", blue: "1F6FB2", ink: "1A1A1A", grey: "595959", purple: "7030A0", band: "EEF3F9", line: "C9D5E6", soft: "F7F9FC",
  green: "2E9E5B", orange: "E07A1F", red: "C8504B", teal: "1F9D8A", violet: "8A5CD0", gold: "B8900F", link: "0000FF" };
const THEME = { name: "SIH 2026 template", headFontFace: "Cambria", bodyFontFace: "Calibri",
  colors: { dk1: C.ink, lt1: "FFFFFF", dk2: C.navy, lt2: C.band, accent1: C.blue, accent2: C.orange, accent3: C.green, accent4: C.red, accent5: C.purple, accent6: C.teal, hlink: C.link, folHlink: C.purple } };

// ---------- data from the prototype ----------
const D = JSON.parse(fs.readFileSync("../data/scen20.json", "utf8")).scen;
const SCALE = JSON.parse(fs.readFileSync("../data/bench_scale.json", "utf8"));
const SJS = JSON.parse(fs.readFileSync("../data/bench_scale_js.json", "utf8"));
const CH = JSON.parse(fs.readFileSync("../data/chain_srv.json", "utf8"));
const CHL = JSON.parse(fs.readFileSync("../data/chain_loc.json", "utf8"));
const BJ = JSON.parse(fs.readFileSync("../data/bench_js.json", "utf8"));
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const seeds = Object.keys(D), q = (e, k) => mean(seeds.map((s) => D[s][e][k]));
const covGain = q("cpsat", "cov") - q("greedy", "cov");
const riskRed = 100 * (1 - q("cpsat", "risk") / q("greedy", "risk"));
const scoreGain = 100 * (q("cpsat", "score") / q("greedy", "score") - 1);
const wins = seeds.filter((s) => D[s].cpsat.score > D[s].greedy.score).length;
const steps = CH.steps;
const covV = [CH.initial.m.coverage_pct].concat(steps.map((s) => s.balanced.cov));
const covB = [CH.initial_base.m.coverage_pct].concat(steps.map((s) => s.base.cov));
const chV = steps.map((s) => s.balanced.ch), chB = steps.map((s) => s.base.ch);
const tV = steps.map((s) => s.balanced.s), tL = CHL.steps.map((s) => s.balanced.s);
const tMin = Math.min(...tV), tMax = Math.max(...tV);
const sizes = [...new Set(SCALE.map((r) => r.aircraft))];
const gain = (key) => sizes.map((a) => { const rows = SCALE.filter((r) => r.aircraft === a), g = mean(rows.map((r) => r.g_score));
  const v = key === "js" ? mean(SJS.filter((r) => r.aircraft === a).map((r) => r.js_score)) : mean(rows.map((r) => r[key])); return +(100 * (v / g - 1)).toFixed(1); });
const gExact = gain("m_score"), gLns = gain("l_score"), gJs = gain("js");
const plansChecked = seeds.length + SCALE.length * 3 + 40 + 12 + (steps.length * 4 + 1) * 2;
const f1 = (v) => v.toFixed(1), f2 = (v) => v.toFixed(2);
const chRatio = mean(chB) / mean(chV);
console.log({ covGain, riskRed, scoreGain, wins, covV, covB, chV, chB, tV, tL, gExact, gLns, gJs, plansChecked });

const png = (p) => { const b = fs.readFileSync(p); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
async function icon(Comp, hex) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + hex, size: "256" }));
  return "image/png;base64," + (await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64");
}

(async () => {
  const pres = new pptxgen();
  pres.defineLayout({ name: "SIH", width: P(960), height: P(540) });
  pres.layout = "SIH"; pres.title = "VayuVyuha - SIH26250";
  pres.theme = { headFontFace: "Cambria", bodyFontFace: "Calibri" };

  // ---------- template frame (from the team's SIH deck) ----------
  const num = { x: P(896), y: P(512), w: P(44), h: P(18), fontFace: "Calibri", fontSize: 9, color: C.grey, align: "right" };
  pres.defineSlideMaster({ title: "SIH_TITLE", background: { color: "FFFFFF" }, objects: [
    { image: { path: "img/wm_bulb.png", x: P(600), y: P(118), w: P(300), h: P(346.9) } },
    { image: { path: "img/logo_title.png", x: P(770), y: P(12), w: P(160), h: P(75.6) } },
    { text: { text: "SMART INDIA HACKATHON 2026", options: { x: P(40), y: P(22), w: P(560), h: P(46), fontFace: "Cambria", fontSize: 30, bold: true, color: C.navy, margin: 0, valign: "middle" } } },
    { placeholder: { options: { name: "title", type: "title", x: P(180), y: P(98), w: P(600), h: P(46), fontFace: "Cambria", fontSize: 26, bold: true, color: C.navy, align: "center", valign: "middle", margin: 0 }, text: "" } },
  ] });
  pres.defineSlideMaster({ title: "SIH_CONTENT", background: { color: "FFFFFF" }, slideNumber: num, objects: [
    { image: { path: "img/logo.png", x: P(812), y: P(8), w: P(124), h: P(58.5) } },
    { text: { text: TEAM, options: { shape: pres.ShapeType.ellipse, x: P(25), y: P(19), w: P(112), h: P(38), fill: { color: "FFFFFF" }, line: { color: C.purple, width: 1.75 },
      shadow: { type: "outer", color: "000000", opacity: 0.3, blur: 4, offset: 2.5, angle: 45 }, fontFace: "Cambria", fontSize: 12.5, bold: true, italic: true, color: C.navy, align: "center", valign: "middle", margin: 0 } } },
    { line: { x: P(25), y: P(76), w: P(910), h: 0, line: { color: C.blue, width: 1.5 } } },
    { placeholder: { options: { name: "title", type: "title", x: P(150), y: P(14), w: P(652), h: P(54), fontFace: "Cambria", fontSize: 26, bold: true, color: C.navy, align: "center", valign: "middle", margin: 0 }, text: "" } },
  ] });

  // ---------- helpers ----------
  const T = (s, text, o) => s.addText(text, Object.assign({ isTextBox: true, margin: 0, fontFace: "Calibri", color: C.ink, valign: "top" }, o));
  const shadow = () => ({ type: "outer", color: "1F3864", opacity: 0.12, blur: 5, offset: 1.5, angle: 90 });
  const card = (s, x, y, w, h, name, o) => s.addShape(pres.ShapeType.roundRect, Object.assign({ x: P(x), y: P(y), w: P(w), h: P(h), rectRadius: 0.07, fill: { color: "FFFFFF" }, line: { color: C.line, width: 0.75 }, shadow: shadow(), objectName: name }, o || {}));
  const tag = (s, text, x, y, hex, name) => T(s, text, { x: P(x), y: P(y), w: P(300), h: P(13), fontSize: 8.5, bold: true, color: hex || C.blue, charSpacing: 1.2, objectName: name || ("Label " + text) });
  const circ = async (s, Comp, hex, x, y, d, name) => {
    s.addShape(pres.ShapeType.ellipse, { x: P(x), y: P(y), w: P(d), h: P(d), fill: { color: hex, transparency: 86 }, line: { color: hex, transparency: 100, width: 0 }, objectName: name + " bg" });
    s.addImage({ data: await icon(Comp, hex), x: P(x + d * 0.25), y: P(y + d * 0.25), w: P(d * 0.5), h: P(d * 0.5), altText: name });
  };
  const pic = (s, path, x, y, w, name, hMax) => {
    const d = png(path); let ww = w, hh = w * d.h / d.w; if (hMax && hh > hMax) { hh = hMax; ww = hh * d.w / d.h; }
    s.addShape(pres.ShapeType.rect, { x: P(x - 1.5), y: P(y - 1.5), w: P(ww + 3), h: P(hh + 3), fill: { color: "FFFFFF" }, line: { color: C.line, width: 0.75 }, shadow: shadow(), objectName: name + " frame" });
    s.addImage({ path, x: P(x), y: P(y), w: P(ww), h: P(hh), altText: name, objectName: name });
    return { w: ww, h: hh };
  };
  const arrowH = (s, x, y, w, name, hex) => s.addShape(pres.ShapeType.line, { x: P(x), y: P(y), w: P(w), h: 0, line: { color: hex || "7F93AD", width: 1.25, endArrowType: "triangle" }, objectName: name || "Arrow" });
  const arrowV = (s, x, y, h, name, hex) => s.addShape(pres.ShapeType.line, { x: P(x), y: P(y), w: 0, h: P(h), line: { color: hex || "7F93AD", width: 1.25, endArrowType: "triangle" }, objectName: name || "Arrow" });
  const chartText = { catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", dataLabelFontFace: "+mn-lt", legendFontFace: "+mn-lt", titleFontFace: "+mn-lt" };
  const chartBase = Object.assign({ showLegend: true, legendPos: "b", legendFontSize: 8.5, legendColor: C.ink, catAxisLabelFontSize: 8.5, valAxisLabelFontSize: 8.5, catAxisLabelColor: C.grey, valAxisLabelColor: C.grey,
    valGridLine: { color: "E3EAF4", size: 0.75 }, catGridLine: { style: "none" }, dataLabelFontSize: 8, dataLabelColor: C.ink }, chartText);

  // =============== 1. TITLE PAGE ===============
  {
    const s = pres.addSlide({ masterName: "SIH_TITLE" });
    s.addText("TITLE PAGE", { placeholder: "title" });
    const rows = [["Problem Statement ID – ", "SIH26250"], ["Problem Statement Title – ", "Air Power - Dynamic Air Operations & Resource Optimisation."],
      ["Theme – ", "Transportation & Logistics"], ["PS Category – ", "Software"], ["Team ID – ", "[to be added]"], ["Team Name (Registered on portal) – ", TEAM]];
    const runs = [];
    rows.forEach((r, i) => { runs.push({ text: r[0], options: { bold: true, paraSpaceAfter: 12 } }); runs.push({ text: r[1], options: { breakLine: i < rows.length - 1 } }); });
    T(s, runs, { x: P(52), y: P(172), w: P(560), h: P(280), fontSize: 15, objectName: "Title page fields" });
    s.addNotes("Title page in the SIH template. Fill in the Team ID from the portal. VayuVyuha (vayu = air, vyuha = battle formation) is the suggested team name.");
  }

  // =============== 2. IDEA ===============
  {
    const s = pres.addSlide({ masterName: "SIH_CONTENT" });
    s.addText([{ text: "VayuVyuha — AI Decision Support for Dynamic Air Operations & Resource Optimisation", options: { fontSize: 17 } }], { placeholder: "title" });
    // --- today vs with VayuVyuha ---
    const side = async (x, hex, label, big, bigLab, items, icons, name) => {
      card(s, x, 88, 437, 86, name + " card", { fill: { color: hex, transparency: 93 }, line: { color: hex, transparency: 55, width: 0.75 } });
      tag(s, label, x + 14, 95, hex, name + " label");
      T(s, big, { x: P(x + 14), y: P(108), w: P(120), h: P(34), fontFace: "Cambria", fontSize: 26, bold: true, color: hex, valign: "middle", objectName: name + " number" });
      T(s, bigLab, { x: P(x + 14), y: P(143), w: P(128), h: P(26), fontSize: 8.6, color: C.grey, objectName: name + " number label" });
      for (let i = 0; i < items.length; i++) {
        s.addImage({ data: await icon(icons[i], hex), x: P(x + 152), y: P(99.5 + i * 24), w: P(11), h: P(11), altText: name + " icon " + (i + 1) });
        T(s, items[i], { x: P(x + 170), y: P(95 + i * 24), w: P(258), h: P(20), fontSize: 10.5, valign: "middle", objectName: name + " point " + (i + 1) });
      }
    };
    await side(25, C.red, "THE PROBLEM TODAY", "72–96 h", "to build an air plan (US Army CALL, 2023)",
      ["Aircraft, crew, weapon, weather and threat data sit in separate systems", "Re-tasking after a change is manual and slow", "Scarce aircraft are under-used"], [fa.FaDatabase, fa.FaHourglassHalf, fa.FaPlane], "Problem");
    s.addShape(pres.ShapeType.rightArrow, { x: P(464), y: P(120), w: P(32), h: P(22), fill: { color: C.orange }, line: { color: C.orange, width: 0 }, objectName: "Problem to idea arrow" });
    await side(498, C.blue, "OUR IDEA", "< 1 s", "to re-plan after any change, in the prototype",
      ["One live operating picture from every feed", "Ranked options, with a reason for each change", "A commander approves; launched sorties never change"], [fa.FaGlobe, fa.FaListOl, fa.FaUserCheck], "Idea");

    // --- architecture ---
    tag(s, "SYSTEM ARCHITECTURE", 25, 184);
    tag(s, "LIVE FEEDS", 25, 200, C.grey); tag(s, "VAYUVYUHA ENGINE", 190, 200, C.grey); tag(s, "WHAT THE COMMANDER SEES", 748, 200, C.grey);
    const feeds = [["Aircraft status", fa.FaPlane], ["Crew duty hours", fa.FaUserClock], ["Weapon stock", fa.FaBoxes], ["Airspace and runways", fa.FaRoad], ["Weather", fa.FaCloudShowersHeavy], ["Threats", fa.FaCrosshairs], ["Mission priorities", fa.FaFlag]];
    for (let i = 0; i < feeds.length; i++) {
      const y = 215 + i * 28.5;
      s.addShape(pres.ShapeType.roundRect, { x: P(25), y: P(y), w: P(140), h: P(24), rectRadius: 0.05, fill: { color: C.soft }, line: { color: C.line, width: 0.75 }, objectName: "Feed box " + feeds[i][0] });
      s.addImage({ data: await icon(feeds[i][1], C.blue), x: P(33), y: P(y + 6.5), w: P(11), h: P(11), altText: "Feed icon " + feeds[i][0] });
      T(s, feeds[i][0], { x: P(50), y: P(y), w: P(112), h: P(24), fontSize: 9.5, bold: true, valign: "middle", objectName: "Feed " + feeds[i][0] });
    }
    arrowH(s, 167, 313, 21, "Feeds to engine");
    s.addShape(pres.ShapeType.roundRect, { x: P(190), y: P(215), w: P(536), h: P(195), rectRadius: 0.04, fill: { color: C.band }, line: { color: C.blue, width: 1.25 }, objectName: "Engine frame" });
    const stg = [["1", "Fuse", "all feeds into one state", fa.FaLayerGroup, C.blue], ["2", "Predict", "aircraft no-go risk, threat exposure", fa.FaHeartbeat, C.teal], ["3", "Optimise", "aircraft, crews, weapons, launch slots", fa.FaProjectDiagram, C.orange],
      ["4", "Validate", "nine rule families, from scratch", fa.FaCheckDouble, C.green], ["5", "Explain", "rank options, give reasons", fa.FaCommentDots, C.violet]];
    for (let i = 0; i < stg.length; i++) {
      const x = 200 + i * 104;
      card(s, x, 226, 96, 106, "Stage card " + stg[i][1]);
      await circ(s, stg[i][3], stg[i][4], x + 33, 233, 30, "Stage icon " + stg[i][1]);
      T(s, stg[i][0] + "  " + stg[i][1], { x: P(x + 4), y: P(266), w: P(88), h: P(16), fontSize: 11.5, bold: true, color: C.navy, align: "center", valign: "middle", objectName: "Stage title " + stg[i][1] });
      T(s, stg[i][2], { x: P(x + 6), y: P(284), w: P(84), h: P(44), fontSize: 8.6, color: C.ink, align: "center", objectName: "Stage text " + stg[i][1] });
      if (i < stg.length - 1) arrowH(s, x + 96.5, 279, 7, "Stage arrow " + (i + 1), C.orange);
    }
    const eng = [["Exact engine", "OR-Tools CP-SAT on a server. Proves the best plan.", fa.FaServer, C.blue], ["Built-in engine", `Adaptive search in the browser. ${BJ.js_ratio}% of exact in 0.3 s.`, fa.FaLaptopCode, C.orange]];
    for (let i = 0; i < 2; i++) {
      const x = 200 + i * 260;
      s.addShape(pres.ShapeType.roundRect, { x: P(x), y: P(342), w: P(252), h: P(34), rectRadius: 0.06, fill: { color: "FFFFFF" }, line: { color: eng[i][3], width: 1 }, objectName: "Engine " + eng[i][0] });
      s.addImage({ data: await icon(eng[i][2], eng[i][3]), x: P(x + 9), y: P(351), w: P(16), h: P(16), altText: eng[i][0] + " icon" });
      T(s, [{ text: eng[i][0] + "  ", options: { bold: true, color: eng[i][3] } }, { text: eng[i][1] }], { x: P(x + 32), y: P(342), w: P(214), h: P(34), fontSize: 9, valign: "middle", objectName: "Engine text " + eng[i][0] });
    }
    T(s, "Same rules and the same objective in both engines. Sorties already launched are locked.", { x: P(200), y: P(384), w: P(516), h: P(18), fontSize: 9, italic: true, color: C.grey, align: "center", valign: "middle", objectName: "Engine note" });
    arrowH(s, 728, 313, 18, "Engine to outputs");
    const outs = [["Ranked options", "recommended, cautious, max coverage", C.blue], ["Change list", "what moves, and why", C.orange], ["Why not tasked", "the limit that blocks a mission", C.red], ["Plan confidence", "1,000 simulated days", C.teal]];
    outs.forEach((o, i) => {
      const y = 215 + i * 38;
      s.addShape(pres.ShapeType.roundRect, { x: P(748), y: P(y), w: P(187), h: P(33), rectRadius: 0.05, fill: { color: C.soft }, line: { color: C.line, width: 0.75 }, objectName: "Output box " + o[0] });
      s.addShape(pres.ShapeType.ellipse, { x: P(756), y: P(y + 12.5), w: P(8), h: P(8), fill: { color: o[2] }, line: { color: o[2], width: 0 }, objectName: "Output dot " + o[0] });
      T(s, [{ text: o[0], options: { bold: true, fontSize: 9.5, breakLine: true } }, { text: o[1], options: { fontSize: 8, color: C.grey } }], { x: P(770), y: P(y), w: P(162), h: P(33), valign: "middle", objectName: "Output " + o[0] });
    });
    arrowV(s, 841, 367, 10, "Outputs to approval", C.green);
    T(s, [{ text: "Commander approves", options: { bold: true, color: "1F7A45", breakLine: true } }, { text: "the plan becomes the new baseline", options: { fontSize: 8, color: C.grey } }],
      { shape: pres.ShapeType.roundRect, rectRadius: 0.06, isTextBox: false, x: P(748), y: P(378), w: P(187), h: P(32), fill: { color: "E6F6EC" }, line: { color: "9FD3B4", width: 0.75 }, fontSize: 9.5, align: "center", valign: "middle", margin: 2, objectName: "Approval box" });

    // --- what is new ---
    tag(s, "WHAT IS NEW", 25, 422);
    const nw = [[fa.FaCompressArrowsAlt, C.blue, "Changes only what must change", `${f1(mean(chV))} plan changes per event, not ${f1(mean(chB))}`], [fa.FaWrench, C.teal, "Readiness-aware tasking", "unreliable jets stay off top-priority missions"],
      [fa.FaQuestionCircle, C.red, "Says why", "names the limit that blocks a mission"], [fa.FaDice, C.violet, "Plan confidence", "tested against 1,000 simulated days"], [fa.FaLaptop, C.orange, "Runs anywhere", "one file, any browser, no install"]];
    for (let i = 0; i < nw.length; i++) {
      const x = 25 + i * 183.5;
      card(s, x, 437, 176, 80, "New card " + (i + 1));
      await circ(s, nw[i][0], nw[i][1], x + 9, 446, 26, "New icon " + (i + 1));
      T(s, nw[i][2], { x: P(x + 42), y: P(443), w: P(128), h: P(30), fontSize: 10.5, bold: true, color: C.navy, valign: "middle", objectName: "New title " + (i + 1) });
      T(s, nw[i][3], { x: P(x + 10), y: P(479), w: P(158), h: P(32), fontSize: 9.2, color: C.ink, objectName: "New text " + (i + 1) });
    }
    s.addNotes("The problem, the idea, the architecture and what is new. The 72 to 96 hour figure is from the US Army Center for Army Lessons Learned handbook on the air tasking cycle (2023); RAND (Lingel et al., 2020) calls that cycle out of step with digital-speed operations. In the architecture, seven feeds enter the engine, five stages run inside it, and four kinds of output reach the commander, who approves before anything is published. Both engines apply the same rules and objective.");
  }

  // =============== 3. TECHNICAL APPROACH ===============
  {
    const s = pres.addSlide({ masterName: "SIH_CONTENT" });
    s.addText("TECHNICAL APPROACH", { placeholder: "title" });
    tag(s, "HOW A RE-PLAN HAPPENS", 25, 88);
    const nodes = [["Event arrives", "A jet is grounded, an air-defence site pops up, an urgent target appears, or a storm closes a corridor.", fa.FaBolt, C.red],
      ["Lock launched sorties", "Anything already airborne is fixed. Only the future is re-planned.", fa.FaLock, C.navy],
      ["Re-plan", "Exact CP-SAT on the server, or adaptive search in the browser, starting from the current plan.", fa.FaProjectDiagram, C.orange],
      ["Validate", "Nine rule families are re-checked from scratch.", fa.FaCheckDouble, C.green],
      ["Rank and explain", "Three options, a reason for each change, and why any mission is left out.", fa.FaListOl, C.violet],
      ["Commander approves", "The chosen plan becomes the new baseline, and the loop waits for the next event.", fa.FaUserCheck, C.blue]];
    const NX = 46, NW = 146, Y0 = 106, STEP = 52, NH = 36;
    for (let i = 0; i < nodes.length; i++) {
      const y = Y0 + i * STEP, n = nodes[i];
      s.addShape(pres.ShapeType.roundRect, { x: P(NX), y: P(y), w: P(NW), h: P(NH), rectRadius: 0.08, fill: { color: n[3], transparency: 90 }, line: { color: n[3], width: 1.25 }, objectName: "Flow node " + (i + 1) });
      s.addImage({ data: await icon(n[2], n[3]), x: P(NX + 9), y: P(y + 11), w: P(14), h: P(14), altText: "Flow icon " + (i + 1) });
      T(s, n[0], { x: P(NX + 28), y: P(y), w: P(NW - 32), h: P(NH), fontSize: 10.5, bold: true, color: C.navy, valign: "middle", objectName: "Flow label " + (i + 1) });
      T(s, n[1], { x: P(NX + NW + 12), y: P(y - 1), w: P(318), h: P(NH + 2), fontSize: 9.6, valign: "middle", objectName: "Flow note " + (i + 1) });
      if (i < nodes.length - 1) arrowV(s, NX + NW / 2, y + NH, STEP - NH, "Flow arrow " + (i + 1));
    }
    const yTop = Y0 + NH / 2, yBot = Y0 + 5 * STEP + NH / 2;
    s.addShape(pres.ShapeType.line, { x: P(31), y: P(yTop), w: 0, h: P(yBot - yTop), line: { color: "7F93AD", width: 1.25, dashType: "dash" }, objectName: "Loop back vertical" });
    s.addShape(pres.ShapeType.line, { x: P(31), y: P(yBot), w: P(NX - 31), h: 0, line: { color: "7F93AD", width: 1.25, dashType: "dash" }, objectName: "Loop back bottom" });
    arrowH(s, 31, yTop, NX - 31, "Loop back top");

    tag(s, "WORKING PROTOTYPE: THE COMMAND VIEW AFTER AN EVENT", 541, 88);
    pic(s, "img/cmd_full.png", 541, 106, 394, "Prototype screenshot", 312);

    // bottom band
    card(s, 25, 434, 272, 76, "Stack card");
    tag(s, "ENGINE STACK", 37, 440);
    const chips = [["Python", C.blue], ["OR-Tools CP-SAT", C.blue], ["scikit-learn", C.teal], ["JavaScript search", C.orange], ["REST API", C.violet], ["HTML + SVG app", C.green]];
    chips.forEach((c, i) => { const col = i % 3, row = Math.floor(i / 3);
      T(s, c[0], { shape: pres.ShapeType.roundRect, rectRadius: 0.3, isTextBox: false, x: P(35 + col * 86), y: P(456 + row * 25), w: P(81), h: P(20), fill: { color: c[1], transparency: 88 }, line: { color: c[1], width: 0.75 }, fontSize: 8.6, bold: true, color: C.navy, align: "center", valign: "middle", margin: 0, objectName: "Chip " + c[0] }); });
    card(s, 307, 434, 352, 76, "Model card");
    tag(s, "THE OPTIMISATION MODEL", 319, 440);
    T(s, [{ text: "Decide  ", options: { bold: true, color: C.blue } }, { text: "which missions fly, when, with which aircraft, crew and weapons.", options: { breakLine: true } },
      { text: "Rules  ", options: { bold: true, color: C.orange } }, { text: "roles, range, serviceability, turnaround, crew duty, weapon stock, runway cap, weather, escort.", options: { breakLine: true } },
      { text: "Maximise  ", options: { bold: true, color: C.green } }, { text: "mission value minus risk, unreliability, flight time, delay and plan change." }],
      { x: P(319), y: P(454), w: P(332), h: P(54), fontSize: 8.6, paraSpaceAfter: 1.5, objectName: "Model text" });
    card(s, 669, 434, 252, 76, "Links card", { fill: { color: "DAE3F3" }, line: { color: C.blue, width: 0.75 } });
    tag(s, "TRY IT", 681, 440);
    T(s, [{ text: "GitHub repository", options: { bold: true, breakLine: true } },
      { text: "github.com/thotapremkumar-tpk/VayuVyuha", options: { color: C.link, underline: { style: "sng" }, hyperlink: { url: "https://github.com/thotapremkumar-tpk/VayuVyuha" }, breakLine: true } },
      { text: "Live prototype, opens in any browser", options: { bold: true, breakLine: true } },
      { text: "thotapremkumar-tpk.github.io/VayuVyuha", options: { color: C.link, underline: { style: "sng" }, hyperlink: { url: "https://thotapremkumar-tpk.github.io/VayuVyuha/" } } }],
      { x: P(681), y: P(455), w: P(234), h: P(52), fontSize: 8.8, objectName: "Links text" });
    s.addNotes("Left: the loop that runs on every event. Right: the working prototype. Bottom: the stack, the optimisation model in three lines, and where to try it. The exact engine is Google OR-Tools CP-SAT; the built-in engine is an adaptive large-neighbourhood search written in JavaScript, so the app also runs with no server.");
  }

  // =============== 4. FEASIBILITY AND VIABILITY ===============
  {
    const s = pres.addSlide({ masterName: "SIH_CONTENT" });
    s.addText("FEASIBILITY AND VIABILITY", { placeholder: "title" });
    tag(s, "IT WORKS TODAY: EVERY PLAN IS CHECKED AND STRESS-TESTED", 25, 88);
    const im = pic(s, "img/engine_checks.png", 25, 106, 520, "Engine view screenshot");
    T(s, "The Engine view of the prototype: nine rule checks, how the plan was found, and how much mission value survives when aircraft fail.", { x: P(25), y: P(106 + im.h + 7), w: P(520), h: P(24), fontSize: 9, color: C.grey, italic: true, objectName: "Engine caption" });
    const proof = [[String(plansChecked), "plans checked, 0 rule violations", C.green], [`${f2(tMin)}–${f2(tMax)} s`, "exact re-plan after an event", C.blue], [`${BJ.js_ratio}%`, "of the exact score, in a browser", C.orange]];
    proof.forEach((p, i) => { const x = 25 + i * 176.5;
      card(s, x, 276, 167, 44, "Proof tile " + (i + 1));
      T(s, p[0], { x: P(x + 8), y: P(276), w: P(74), h: P(44), fontFace: "Cambria", fontSize: i === 1 ? 12.5 : 18, bold: true, color: p[2], valign: "middle", align: "center", objectName: "Proof value " + (i + 1) });
      T(s, p[1], { x: P(x + 86), y: P(276), w: P(76), h: P(44), fontSize: 8.8, valign: "middle", objectName: "Proof label " + (i + 1) }); });

    tag(s, "IT SCALES: SCORE GAIN OVER MANUAL-STYLE PLANNING (%)", 563, 88);
    s.addChart(pres.charts.BAR, [{ name: "Exact CP-SAT (10 s cap)", labels: sizes.map((a, i) => `${a} aircraft\n${[27, 54, 81, 108][i]} missions`), values: gExact },
      { name: "CP-SAT + LNS (10 s)", labels: sizes.map(String), values: gLns }, { name: "Built-in search (2 s)", labels: sizes.map(String), values: gJs }],
      Object.assign({ x: P(558), y: P(102), w: P(380), h: P(190), barDir: "col", barGapWidthPct: 55, chartColors: [C.blue, "8FB4DE", C.orange], showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0.0",
        valAxisMinVal: 0, valAxisMaxVal: 16, valAxisMajorUnit: 4, objectName: "Scale chart" }, chartBase));
    T(s, `The gain holds as the force grows: +${f1(gJs[3])}% at 112 aircraft in 2 s. Three synthetic instances per size.`, { x: P(563), y: P(294), w: P(372), h: P(24), fontSize: 9, color: C.grey, italic: true, objectName: "Scale caption" });

    tag(s, "CHALLENGES AND HOW WE HANDLE THEM", 25, 332);
    const ch = [[fa.FaLock, "Real data is classified and scattered", "Open state schema with adapters. Built on synthetic data, deployed on-premise."],
      [fa.FaEyeSlash, "Commanders will not act on a black box", "Ranked options, a reason for every change, human approval, independent validator."],
      [fa.FaExpandArrowsAlt, "The problem grows fast with force size", "Search engines hold the gain at 112 aircraft. Rolling-horizon planning is next."],
      [fa.FaBroadcastTower, "Links to a central planner can be jammed", "The built-in engine runs offline on any device. Decentralised auctions as fallback."]];
    for (let i = 0; i < ch.length; i++) {
      const x = 25 + i * 229.5;
      s.addShape(pres.ShapeType.roundRect, { x: P(x), y: P(348), w: P(221), h: P(40), rectRadius: 0.08, fill: { color: C.red, transparency: 91 }, line: { color: C.red, transparency: 50, width: 0.75 }, objectName: "Challenge box " + (i + 1) });
      s.addImage({ data: await icon(ch[i][0], C.red), x: P(x + 10), y: P(360), w: P(16), h: P(16), altText: "Challenge icon " + (i + 1) });
      T(s, ch[i][1], { x: P(x + 34), y: P(348), w: P(182), h: P(40), fontSize: 10, bold: true, color: C.navy, valign: "middle", objectName: "Challenge " + (i + 1) });
      arrowV(s, x + 110.5, 389, 10, "Challenge arrow " + (i + 1), C.green);
      s.addShape(pres.ShapeType.roundRect, { x: P(x), y: P(400), w: P(221), h: P(64), rectRadius: 0.06, fill: { color: C.green, transparency: 92 }, line: { color: C.green, transparency: 45, width: 0.75 }, objectName: "Strategy box " + (i + 1) });
      T(s, ch[i][2], { x: P(x + 10), y: P(400), w: P(203), h: P(64), fontSize: 9.5, valign: "middle", objectName: "Strategy " + (i + 1) });
    }
    T(s, "ROADMAP", { x: P(25), y: P(483), w: P(64), h: P(30), fontSize: 8.5, bold: true, color: C.blue, charSpacing: 1.2, valign: "middle", objectName: "Roadmap label" });
    const ph = [["Phase 1  Prototype", "solver, validator, app: done", C.green], ["Phase 2  Simulator pilot", "wargame feeds, planner trials", C.blue], ["Phase 3  Integrate and scale", "C2 interfaces, larger forces", C.violet]];
    ph.forEach((p, i) => T(s, [{ text: p[0], options: { bold: true, color: p[2] } }, { text: "    " + p[1] }], { shape: pres.ShapeType.homePlate, isTextBox: false, x: P(92 + i * 283), y: P(483), w: P(274), h: P(30), fill: { color: p[2], transparency: 88 }, line: { color: p[2], width: 0.75 }, fontSize: 9.5, valign: "middle", margin: [10, 14, 0, 0], objectName: "Roadmap " + (i + 1) }));
    s.addNotes("Feasibility: the prototype runs today and every plan passes an independent validator. The scale chart shows the percentage by which each engine's plan score exceeds a sequential priority-first planner on the same synthetic instances; the exact solver was capped at 10 seconds on two CPU cores and proves the optimum only at the smallest size. Viability: each challenge is paired with how it is handled, and the roadmap moves from prototype to a simulator pilot to integration.");
  }

  // =============== 5. IMPACT AND BENEFITS ===============
  {
    const s = pres.addSlide({ masterName: "SIH_CONTENT" });
    s.addText("IMPACT AND BENEFITS", { placeholder: "title" });
    tag(s, "MEASURED IN THE PROTOTYPE", 25, 88);
    const st = [[`${f2(tMin)}–${f2(tMax)} s`, "to re-plan after an event", C.blue, fa.FaStopwatch], [`−${riskRed.toFixed(0)}%`, "average risk per sortie", C.teal, fa.FaShieldAlt],
      [`${chRatio.toFixed(1)}× fewer`, "plan changes per event", C.orange, fa.FaCompressArrowsAlt], [`+${f1(scoreGain)}%`, `plan score, better in ${wins} of ${seeds.length} scenarios`, C.violet, fa.FaChartLine]];
    for (let i = 0; i < st.length; i++) {
      const x = 25 + i * 229.5;
      card(s, x, 104, 221, 58, "Stat tile " + (i + 1));
      await circ(s, st[i][3], st[i][2], x + 10, 116, 34, "Stat icon " + (i + 1));
      T(s, st[i][0], { x: P(x + 52), y: P(107), w: P(164), h: P(30), fontFace: "Cambria", fontSize: 21, bold: true, color: st[i][2], valign: "middle", objectName: "Stat value " + (i + 1) });
      T(s, st[i][1], { x: P(x + 52), y: P(137), w: P(164), h: P(20), fontSize: 9.2, color: C.grey, objectName: "Stat label " + (i + 1) });
    }
    const cats = ["Start", "Jets grounded", "Pop-up site", "Urgent target", "Storm"];
    tag(s, "MISSION VALUE STILL COVERED AFTER EACH EVENT (%)", 25, 174);
    s.addChart(pres.charts.LINE, [{ name: TEAM, labels: cats, values: covV }, { name: "Manual-style replan", labels: cats, values: covB }],
      Object.assign({ x: P(20), y: P(186), w: P(300), h: P(178), chartColors: [C.blue, C.orange], lineSize: 2.5, lineDataSymbolSize: 7, valAxisMinVal: 55, valAxisMaxVal: 80, valAxisMajorUnit: 5, objectName: "Coverage chart" }, chartBase));
    tag(s, "PLANNED MISSIONS CHANGED PER EVENT", 334, 174);
    s.addChart(pres.charts.BAR, [{ name: TEAM, labels: cats.slice(1), values: chV }, { name: "Manual-style replan", labels: cats.slice(1), values: chB }],
      Object.assign({ x: P(329), y: P(186), w: P(300), h: P(178), barDir: "col", barGapWidthPct: 60, chartColors: [C.blue, C.orange], showValue: true, dataLabelPosition: "outEnd", valAxisMinVal: 0, valAxisMaxVal: 24, valAxisMajorUnit: 6, objectName: "Changes chart" }, chartBase));
    tag(s, "THE DECISION SCREEN", 646, 174);
    const cm = pic(s, "img/compare.png", 646, 190, 289, "Options screenshot");
    T(s, "Three valid options side by side. The commander picks how much risk and change to accept.", { x: P(646), y: P(190 + cm.h + 7), w: P(289), h: P(26), fontSize: 9, color: C.grey, italic: true, objectName: "Options caption" });

    tag(s, "WHO BENEFITS", 25, 376);
    const who = [[fa.FaUserTie, C.blue, "Air operations planners", "Re-planning becomes a sub-second computation plus one decision."], [fa.FaStar, C.violet, "Commanders", "Complete options with coverage, risk and change counts."],
      [fa.FaWrench, C.teal, "Maintenance and logistics", "Sorties matched to aircraft health and weapon stock per base."], [fa.FaShieldAlt, C.red, "Aircrew", `${riskRed.toFixed(0)}% lower average threat exposure per sortie in tests.`]];
    for (let i = 0; i < who.length; i++) {
      const col = i % 2, row = Math.floor(i / 2), x = 25 + col * 232, y = 392 + row * 64;
      card(s, x, y, 224, 56, "Benefit card " + (i + 1));
      await circ(s, who[i][0], who[i][1], x + 9, y + 12, 32, "Benefit icon " + (i + 1));
      T(s, [{ text: who[i][2], options: { bold: true, color: C.navy, fontSize: 10, breakLine: true } }, { text: who[i][3], options: { fontSize: 8.8 } }], { x: P(x + 49), y: P(y), w: P(170), h: P(56), valign: "middle", objectName: "Benefit text " + (i + 1) });
    }
    tag(s, "STRATEGIC IMPACT", 500, 376);
    const tm = pic(s, "img/timeline.png", 500, 392, 220, "Timeline screenshot");
    const si = [["Fits a stated need", "the IAF plans AI decision support for air battle managers on IACCS (IDRW, 2025)."], ["Indigenous and open", "no foreign licence; runs on-premise or offline."], ["Reusable", "the same engine plans airlift, tanker and relief sorties."]];
    const runs = [];
    si.forEach((r, i) => { runs.push({ text: r[0] + ": ", options: { bold: true, color: C.navy, bullet: { characterCode: "25CF", indent: 10 }, paraSpaceAfter: 4 } }); runs.push({ text: r[1], options: { breakLine: i < si.length - 1 } }); });
    T(s, runs, { x: P(732), y: P(392), w: P(203), h: P(112), fontSize: 9.2, objectName: "Strategic text" });
    T(s, "Prototype results on synthetic scenarios (20 scenarios; 4-event chain, exact engine). Baseline: a priority-first sequential planner standing in for manual planning.", { x: P(500), y: P(392 + tm.h + 5), w: P(435), h: P(20), fontSize: 7.2, italic: true, color: C.grey, objectName: "Method note" });
    s.addNotes("Four headline results, two charts, the decision screen, who benefits and the strategic impact. The line chart shows the share of mission priority value still covered after each of four events; the bars show how many planned missions each approach had to change. These are prototype results on synthetic data, not operational claims.");
  }

  // =============== 6. RESEARCH AND REFERENCES ===============
  {
    const s = pres.addSlide({ masterName: "SIH_CONTENT" });
    s.addText("RESEARCH AND REFERENCES", { placeholder: "title" });
    const G = [
      ["Problem evidence", fa.FaNewspaper, C.red, [
        ["US Army CALL (2023)", "Air tasking cycle: six stages over 72–96 hours.", "https://api.army.mil/e2/c/downloads/2023/11/29/73a4ee9f/24-811-army-operations-and-the-air-tasking-cycle-nov-23-public.pdf"],
        ["US Air Force (2021)", "KRADOS automates planning steps once done manually.", "https://www.af.mil/News/Article-Display/Article/2599423/609th-aoc-optimizes-ato-production-first-to-use-krados-operationally/"],
        ["IDRW (Aug 2025)", "IAF to give air battle managers AI decision support on IACCS.", "https://idrw.org/indian-air-force-to-equip-air-battle-managers-with-ai-based-decision-support-tools/"],
        ["Saling (1999)", "Air University: dynamic retasking of airborne packages.", "https://man.fas.org/dod-101/sys/ac/docs/99-179.htm"]]],
      ["AI for air operations planning", fa.FaBrain, C.blue, [
        ["Lingel et al. (2020)", "RAND RR-4408/1: the 72-hour cycle and AI for all-domain C2.", "https://www.rand.org/pubs/research_reports/RR4408z1.html"],
        ["Zhang L.A. et al. (2020)", "RAND RR-4311: AI-assisted mission planning; trust needs testing.", "https://www.rand.org/pubs/research_reports/RR4311.html"],
        ["Sorton et al. (2019)", "DSIAC: one operator re-tasking several UAVs, flight-tested.", "https://dsiac.dtic.mil/articles/real-time-tasking-and-retasking-of-multiple-coordinated-uavs/"]]],
      ["Assignment and re-planning", fa.FaProjectDiagram, C.orange, [
        ["Zhang K. et al. (2020)", "Electronics: dynamic weapon-target assignment, receding horizon.", "https://www.mdpi.com/2079-9292/9/9/1511"],
        ["Li, Wu & Wang (2024)", "EAAI: survey of weapon-target assignment methods.", "https://www.sciencedirect.com/science/article/abs/pii/S0952197624013708"],
        ["Wang et al. (2025)", "Defence Technology: pre-assignment plus event-triggered re-assignment.", "https://www.sciencedirect.com/science/article/pii/S2214914724001867"],
        ["Meng et al. (2022)", "Scientific Programming: sortie generation with runway congestion.", "https://onlinelibrary.wiley.com/doi/10.1155/2022/6180618"]]],
      ["Search and decentralised allocation", fa.FaSearch, C.violet, [
        ["Ropke & Pisinger (2006)", "Transportation Science: adaptive large-neighbourhood search.", "https://pubsonline.informs.org/doi/10.1287/trsc.1050.0135"],
        ["Choi, Brunet & How (2009)", "IEEE T-RO: consensus-based decentralised auctions.", "https://dspace.mit.edu/entities/publication/b0bf0a05-be3b-433b-9f4b-ce314ed5178b"]]],
      ["Readiness and human-in-the-loop", fa.FaWrench, C.teal, [
        ["O'Neil, Khatab & Diallo (2025)", "Autonomous Intelligent Systems: predictive maintenance with mission assignment.", "https://link.springer.com/article/10.1007/s43684-025-00104-1"],
        ["Chen et al. (2025)", "Defence Technology: human-guided reinforcement learning for aircraft scheduling.", "https://www.sciencedirect.com/science/article/pii/S2214914725002260"]]],
      ["Open tools used", fa.FaTools, C.green, [
        ["Google OR-Tools CP-SAT", "constraint solver behind the exact engine.", "https://developers.google.com/optimization/cp/cp_solver"],
        ["scikit-learn", "gradient boosting for the readiness model.", "https://scikit-learn.org/stable/modules/ensemble.html"]]],
    ];
    tag(s, "HOW THE RESEARCH SHAPED THE DESIGN", 25, 88);
    const map = [["Problem", "A 72–96 hour cycle, manual steps, a stated IAF need", "CALL · RAND · USAF · IDRW", C.red], ["Predict", "Plan maintenance and missions together", "O'Neil 2025", C.teal],
      ["Optimise", "Exact model plus adaptive search; runway limits", "Li 2024 · Ropke 2006 · Meng 2022", C.orange], ["Re-plan", "Plan first, then re-assign when events hit", "Wang 2025 · Sorton 2019", C.blue],
      ["Approve", "Keep a human in the loop; test for trust", "Zhang L.A. 2020 · Chen 2025", C.violet], ["Scale next", "Rolling horizon; decentralised auctions", "Zhang K. 2020 · Choi 2009", C.green]];
    map.forEach((m, i) => { const x = 25 + i * 152.5;
      s.addShape(pres.ShapeType.roundRect, { x: P(x), y: P(104), w: P(146), h: P(72), rectRadius: 0.07, fill: { color: m[3], transparency: 91 }, line: { color: m[3], transparency: 45, width: 0.75 }, objectName: "Design tile " + m[0] });
      T(s, [{ text: m[0], options: { bold: true, color: m[3], fontSize: 11, breakLine: true } }, { text: m[1], options: { fontSize: 8.8, breakLine: true } }, { text: m[2], options: { fontSize: 8, color: C.grey, italic: true } }],
        { x: P(x + 8), y: P(104), w: P(132), h: P(72), valign: "middle", objectName: "Design text " + m[0] });
      if (i < map.length - 1) arrowH(s, x + 146.5, 140, 5.5, "Design arrow " + (i + 1)); });
    for (let gi = 0; gi < G.length; gi++) {
      const g = G[gi], col = gi % 3, row = Math.floor(gi / 3), x = 25 + col * 306.5, y = row === 0 ? 188 : 368, hgt = row === 0 ? 170 : 136;
      card(s, x, y, 297, hgt, "Reference card " + g[0]);
      s.addShape(pres.ShapeType.roundRect, { x: P(x), y: P(y), w: P(297), h: P(27), rectRadius: 0.07, fill: { color: g[2], transparency: 88 }, line: { color: g[2], transparency: 100, width: 0 }, objectName: "Reference header " + g[0] });
      s.addImage({ data: await icon(g[1], g[2]), x: P(x + 10), y: P(y + 7), w: P(13), h: P(13), altText: g[0] + " icon" });
      T(s, g[0], { x: P(x + 30), y: P(y), w: P(260), h: P(27), fontSize: 10.5, bold: true, color: C.navy, valign: "middle", objectName: "Reference title " + g[0] });
      const runs = [];
      g[3].forEach((r, i) => {
        runs.push({ text: r[0], options: { bold: true, color: C.ink, underline: { style: "sng" }, hyperlink: { url: r[2] }, paraSpaceAfter: 5 } });
        runs.push({ text: "  " + r[1] + " ", options: {} });
        runs.push({ text: "[Open]", options: { bold: true, color: C.link, underline: { style: "sng" }, hyperlink: { url: r[2] }, breakLine: i < g[3].length - 1 } }); });
      T(s, runs, { x: P(x + 12), y: P(y + 34), w: P(274), h: P(hgt - 40), fontSize: 9.4, objectName: "References " + g[0] });
    }
    s.addNotes("Seventeen sources in six groups: evidence for the problem, AI for air planning, assignment and re-planning algorithms, the search and decentralised-allocation methods, readiness and human-in-the-loop work, and the open tools used. Every item links to its source.");
  }

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("written");
})().catch((e) => { console.error(e); process.exit(1); });
