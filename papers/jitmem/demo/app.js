/* =============================================================================
 * app.js — JitMem project demo. Dependency-free. Data lives in data.js.
 * ========================================================================== */
"use strict";
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = s => (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ------------------------------------------------------------------ router
 * One scrolling page (#page-main) with sections; the Lab is a separate page
 * (#page-lab) reached via the "Live demo" button. Nav items scroll; Lab swaps. */
const SECTIONS = ["overview", "mechanisms", "compare", "results", "memguide"];
let mode = "main";           // "main" | "lab"
let activeSection = "overview";
const pageMain = $("#page-main"), pageLab = $("#page-lab");

const setNavActive = route => $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.route === route));

function showLab() {
  mode = "lab"; pageMain.hidden = true; pageLab.hidden = false;
  setNavActive("lab"); window.scrollTo({ top: 0 });
  history.replaceState(null, "", location.search + "#lab");
  labStop(); labStep = 0; renderLab();
  applyEmbedFocus("lab");
}
function navigate(route, smooth = true) {
  if (route === "lab") return showLab();
  if (!SECTIONS.includes(route)) {
    route = "overview";
  }
  if (!document.getElementById(route)) route = "overview";
  const wasLab = mode === "lab";
  mode = "main"; pageLab.hidden = true; pageMain.hidden = false;
  setNavActive(route);
  applyEmbedFocus(route);
  const target = document.getElementById(route);
  if (!target) return;
  const singlePanel = document.body.classList.contains("embed-mode") && !document.body.classList.contains("embed-paper");
  const behavior = (!smooth || wasLab || singlePanel) ? "auto" : "smooth";
  if (!singlePanel) {
    const scroll = () => target.scrollIntoView({ behavior, block: "start" });
    wasLab ? requestAnimationFrame(scroll) : scroll();
  } else {
    window.scrollTo({ top: 0 });
  }
  history.replaceState(null, "", location.search + "#" + route);
}

/* Site embeds (?embed=1): show only the focused panel, hide demo chrome */
function applyEmbedFocus(route) {
  if (document.body.classList.contains("embed-paper")) return;
  if (!document.body.classList.contains("embed-mode")) return;
  const focus = route === "lab" ? "lab" : route;
  $$("#page-main > .page-section").forEach(sec => {
    sec.hidden = sec.id !== focus;
  });
  if (focus === "lab") {
    pageMain.hidden = true;
    pageLab.hidden = false;
  } else {
    pageLab.hidden = true;
    pageMain.hidden = false;
  }
}

function setupPaperEmbed() {
  document.body.classList.add("embed-paper", "light-theme");
  pageLab.hidden = true;
  pageMain.hidden = false;
}
$$("[data-route]").forEach(b => b.addEventListener("click", () => navigate(b.dataset.route)));
$$("[data-jump]").forEach(b => b.addEventListener("click", () => navigate(b.dataset.jump)));
window.addEventListener("hashchange", () => navigate(location.hash.slice(1)));

/* scrollspy — highlight the nav item for the section in view (main mode only) */
const spy = new IntersectionObserver(entries => {
  if (mode !== "main") return;
  entries.forEach(e => {
    if (e.isIntersecting) {
      activeSection = e.target.id;
      setNavActive(activeSection);
      if (location.hash !== "#" + activeSection) history.replaceState(null, "", "#" + activeSection);
    }
  });
}, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });

/* unified keyboard: Lab stepping in lab mode; mechanism stepping when that
 * section is the one in view. */
document.addEventListener("keydown", e => {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea") return;
  if (mode === "lab") {
    if (e.key === " ")          { e.preventDefault(); labPlay(); }
    if (e.key === "ArrowRight") { labStop(); labStep = Math.min(labLen() - 1, labStep + 1); renderLab(); }
    if (e.key === "ArrowLeft")  { labStop(); labStep = Math.max(0, labStep - 1); renderLab(); }
    return;
  }
  if (activeSection === "mechanisms") {
    if (e.key === "ArrowRight") { e.preventDefault(); stepFrame(1); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); stepFrame(-1); }
    if (e.key === " ")          { e.preventDefault(); togglePlay(); }
  }
});

/* ================================================================= OVERVIEW */
function buildHero() {
  $("#hero-stat").innerHTML =
    `<div class="hs-head">JitMem vs. the best write-time baseline · frozen <b>Qwen3-8B</b></div>
     <div class="hs-rows">
       <div class="hs-row"><span class="hs-bench">ALFWorld <i>SR</i></span><span class="hs-val">77.4</span><span class="hs-delta">▲ +16.2</span></div>
       <div class="hs-row"><span class="hs-bench">WebShop <i>SR</i></span><span class="hs-val">32.8</span><span class="hs-delta">▲ +16.3</span></div>
     </div>
     <div class="hs-sub">Best of every write-time baseline (ReasoningBank · SkillOS · MemP). The gain <b>holds across three frozen executors</b> — Qwen3-8B, Gemini-2.5-Pro, GPT-5.4 — and even the <b>untrained</b> curator already beats them all.</div>`;
}

/* =============================================================== MECHANISMS */
const NODES = window.DEMO_NODES;
const METHODS = window.DEMO_METHODS;
const NODE_W = 150, NODE_H = 94, VW = 1200, VH = 460;
/* simple 24x24 stroke icons per component */
const ICONS = {
  task:       '<rect x="4" y="3" width="13" height="18" rx="2"/><path d="M8 8h6M8 12h6M8 16h4"/>',
  bank:       '<ellipse cx="12" cy="6" rx="7.5" ry="2.6"/><path d="M4.5 6v12c0 1.4 3.4 2.6 7.5 2.6s7.5-1.2 7.5-2.6V6"/><path d="M4.5 12c0 1.4 3.4 2.6 7.5 2.6s7.5-1.2 7.5-2.6"/>',
  retriever:  '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  curator:    '<path d="M12 2.5l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z"/><path d="M18.5 15l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6z"/>',
  executor:   '<rect x="6" y="6" width="12" height="12" rx="2.5"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2.5v3.5M15 2.5v3.5M9 18v3.5M15 18v3.5M2.5 9h3.5M2.5 15h3.5M18 9h3.5M18 15h3.5"/>',
  outcome:    '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.6 2.6L16 9.5"/>',
  trajectory: '<path d="M4 18c3.5-.5 3-6.5 7.5-6.5S16 15 20 13.5"/><circle cx="4" cy="18" r="1.7"/><circle cx="11.5" cy="11.5" r="1.7"/><circle cx="20" cy="13.5" r="1.7"/>',
};
let curMethod = METHODS.find(m => m.hero) || METHODS[0];
let frameIdx = 0, playTimer = null;

/* inset the normalized coords so wide nodes + glow stay inside the viewBox */
const PAD_X = 90, PAD_Y = 64;
const nodeCenter = n => ({ x: PAD_X + n.x * (VW - 2 * PAD_X), y: PAD_Y + n.y * (VH - 2 * PAD_Y) });

function buildMethodCards() {
  const wrap = $("#method-cards"); wrap.innerHTML = "";
  METHODS.forEach(m => {
    const c = el("button", "mcard" + (m.hero ? " hero" : ""));
    c.dataset.timing = m.timing;
    c.setAttribute("role", "tab");
    c.innerHTML = `<span class="mtitle">${m.title}</span><span class="mtype">${m.type}</span>${m.wip ? '<span class="wip">WIP</span>' : ""}`;
    c.addEventListener("click", () => selectMethod(m.id));
    wrap.appendChild(c);
  });
}

/* what's flowing along an active edge → a short token label */
function flowLabel(fromId, toId, frame) {
  const kind = frame.payloadKind;
  switch (toId) {
    case "retriever":  return "task";
    case "curator":    return fromId === "outcome" ? "reward" : fromId === "trajectory" ? "trajectory" : "raw traces";
    case "executor":   return fromId === "task" ? "task"
                            : kind === "adaptive" ? "briefing" : kind === "fixed" ? "fixed note" : "memory";
    case "outcome":    return "action";
    case "bank":       return fromId === "curator" ? "commit" : "store";
    case "trajectory": return "trajectory";
    default:           return "";
  }
}

function renderPipeline() {
  const svg = $("#pipeline");
  const used = new Set(curMethod.nodes);
  const frame = curMethod.frames[frameIdx];
  const active = new Set(frame.active || []);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue("--" + (curMethod.timing === "none" ? "read" : curMethod.timing)).trim();

  const defs = `<defs>
    <marker id="ah" markerWidth="9" markerHeight="9" refX="6.5" refY="3.2" orient="auto">
      <path d="M0 0L7 3.2L0 6.4z" fill="var(--muted)"/></marker>
    <marker id="ah-a" markerWidth="10" markerHeight="10" refX="6.8" refY="3.4" orient="auto">
      <path d="M0 0L7.5 3.4L0 6.8z" fill="${accent}"/></marker>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="5" result="b"/><feMerge>
      <feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`;

  const skeleton = [
    ["task","retriever"],["bank","retriever"],["retriever","curator"],
    ["curator","executor"],["executor","outcome"],["executor","trajectory"],["trajectory","bank"],
  ];
  // trim a segment so arrowheads/tokens sit outside the node bodies
  const seg = (a, b, tStart = 82, tEnd = 88) => {
    const p = nodeCenter(a), q = nodeCenter(b);
    const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    return { x1: p.x + ux * tStart, y1: p.y + uy * tStart, x2: q.x - ux * tEnd, y2: q.y - uy * tEnd };
  };

  const fe = frame.edge;
  let edgeSvg = "";
  skeleton.forEach(([f, t]) => {
    if (!used.has(f) || !used.has(t)) return;
    const isActive = fe && fe[0] === f && fe[1] === t;
    if (isActive) return; // active drawn on top below
    const s = seg(NODES.find(n => n.id === f), NODES.find(n => n.id === t));
    edgeSvg += `<line class="edge" x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" marker-end="url(#ah)"/>`;
  });

  // active edge: bright line + a labeled token gliding along it
  let flowSvg = "";
  if (fe && used.has(fe[0]) && used.has(fe[1])) {
    const s = seg(NODES.find(n => n.id === fe[0]), NODES.find(n => n.id === fe[1]));
    edgeSvg += `<line class="edge active" x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" style="stroke:${accent}" marker-end="url(#ah-a)"/>`;
    const label = flowLabel(fe[0], fe[1], frame);
    if (label) {
      const w = Math.max(58, label.length * 9 + 30);
      const path = `M${s.x1} ${s.y1} L${s.x2} ${s.y2}`;
      const tokenBody = `<g class="flow-token"><rect x="${-w/2}" y="-16" width="${w}" height="32" rx="16" style="fill:${accent}"/>
        <text x="0" y="6" text-anchor="middle">${label}</text></g>`;
      flowSvg = reduce
        ? `<g transform="translate(${(s.x1+s.x2)/2},${(s.y1+s.y2)/2})">${tokenBody}</g>`
        : `<g>${tokenBody.replace('<g class="flow-token">',
             `<g class="flow-token"><animateMotion dur="1.5s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear" path="${path}"/>`)}</g>`;
    }
  }

  // nodes: icon + label; active gets glow + pulsing ring
  let nodeSvg = "";
  NODES.forEach(n => {
    if (!used.has(n.id)) return;
    const c = nodeCenter(n);
    const x = c.x - NODE_W / 2, y = c.y - NODE_H / 2;
    const on = active.has(n.id);
    const iconColor = on ? accent : "var(--ink-2)";
    const pulse = (on && !reduce)
      ? `<animate attributeName="stroke-width" values="2.5;4.5;2.5" dur="1.5s" repeatCount="indefinite"/>` : "";
    nodeSvg += `<g class="node ${on ? "active" : ""}" ${on ? 'filter="url(#glow)"' : ""}>
        <rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="14"
          ${on ? `style="stroke:${accent}"` : ""}>${pulse}</rect>
        <g transform="translate(${c.x - 16},${c.y - 40}) scale(1.34)" fill="none"
           stroke="${iconColor}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[n.id] || ""}</g>
        <text class="nlabel" x="${c.x}" y="${c.y + 34}" text-anchor="middle"
          ${on ? `style="fill:${accent}"` : ""}>${n.label}</text>
      </g>`;
  });

  // reward badge above the Outcome node when this step yields a reward
  let badge = "";
  if (frame.reward && used.has("outcome")) {
    const c = nodeCenter(NODES.find(n => n.id === "outcome"));
    badge = `<g class="reward-badge">
        <rect x="${c.x - 52}" y="${c.y - NODE_H / 2 - 30}" width="104" height="24" rx="12"/>
        <text x="${c.x}" y="${c.y - NODE_H / 2 - 13}" text-anchor="middle">✓ reward</text>
      </g>`;
  }

  svg.innerHTML = defs + edgeSvg + nodeSvg + flowSvg + badge;
}

function renderFrame() {
  const f = curMethod.frames[frameIdx];
  $("#frame-count").textContent = `STEP ${frameIdx + 1} / ${curMethod.frames.length}`;
  $("#frame-title").textContent = f.title;
  $("#frame-caption").textContent = f.caption;

  const chip = $("#payload-chip");
  chip.hidden = false;
  if (f.payload) {
    const kind = f.payloadKind || "raw";
    chip.className = "payload-chip " + kind;
    const labels = { raw: "STORED RAW TRACE", fixed: "FIXED ARTIFACT (frozen)", adaptive: "TASK-ADAPTIVE PAYLOAD", silent: "SILENT" };
    chip.innerHTML = `<span class="plabel ${kind}">${labels[kind]}</span>${f.payload}`;
  } else {
    chip.className = "payload-chip empty";
    const msg = curMethod.id === "none"
      ? "No memory — the executor works from the task alone."
      : "No memory payload is produced at this step.";
    chip.innerHTML = `<span class="plabel">NO MEMORY PAYLOAD</span>${msg}`;
  }

  renderPipeline();
}

function renderPrinciple() {
  const p = curMethod.principle;
  $("#principle").innerHTML = [
    ["Curation", p.curation], ["Reward", p.reward], ["Commitment", p.commitment],
    ["Timing", curMethod.timing === "none" ? "task-local" : curMethod.timing + "-time"],
  ].map(([k, v]) => `<div><span class="pk">${k.toUpperCase()}</span><span class="pv">${v}</span></div>`).join("");
}

function selectMethod(id) {
  stopPlay();
  curMethod = METHODS.find(m => m.id === id) || METHODS[0];
  frameIdx = 0;
  $$(".mcard").forEach((c, i) => c.classList.toggle("active", METHODS[i].id === id));
  $("#mech-method-title").innerHTML = `${curMethod.title} <small>${curMethod.type}</small>`;
  renderPrinciple();
  renderFrame();
}

function stepFrame(d) {
  stopPlay();
  frameIdx = Math.max(0, Math.min(curMethod.frames.length - 1, frameIdx + d));
  renderFrame();
}
function stopPlay() { if (playTimer) { clearInterval(playTimer); playTimer = null; $("#play-frames").innerHTML = "▶ Play"; } }
function togglePlay() {
  if (playTimer) return stopPlay();
  if (frameIdx >= curMethod.frames.length - 1) frameIdx = 0;
  $("#play-frames").innerHTML = "❚❚ Pause";
  renderFrame();
  playTimer = setInterval(() => {
    if (frameIdx >= curMethod.frames.length - 1) return stopPlay();
    frameIdx++; renderFrame();
  }, 1600);
}
$("#prev-frame").addEventListener("click", () => stepFrame(-1));
$("#next-frame").addEventListener("click", () => stepFrame(1));
$("#play-frames").addEventListener("click", togglePlay);

/* ------------------------------- compare mode ------------------------------ */
function renderCompare() {
  const c = window.DEMO_COMPARE;
  const w = $("#compare-wrap");
  w.innerHTML = `
    <p class="compare-note">One stored trajectory, two mechanisms. ${c.illustrative ? '<span class="illus">illustrative</span>' : ""}</p>
    <div class="trace-box">${c.sharedTrace}</div>
    <div class="compare-grid">
      <div class="compare-col write">
        <h4>${c.writeTime.label}</h4>
        <p class="compare-note">${c.writeTime.note}</p>
        <div class="pay fixed"><span class="pt">Task A →</span>${c.writeTime.payload}</div>
        <div class="pay fixed"><span class="pt">Task B →</span>${c.writeTime.payload}</div>
      </div>
      <div class="compare-col read">
        <h4>READ-TIME · task-adaptive payload</h4>
        <p class="compare-note">Same trace, different distillation per task.</p>
        ${c.readTime.tasks.map(t => `<div class="pay adaptive"><span class="pt">${t.task}</span>${t.payload}</div>`).join("")}
      </div>
    </div>`;
}

/* ================================================================== LAB */
const TRAJS = window.DEMO_TRAJECTORIES;
let labBench = Object.keys(TRAJS)[0], labEx = 0, labMethod = null, labStep = 0;
const curTraj = () => TRAJS[labBench];
const curExample = () => curTraj().examples[labEx];
const curMethodData = () => curExample().methods[labMethod];

function buildLabBenchSeg() {
  $$("#lab-benchmark button").forEach(b => {
    const k = b.dataset.bench, avail = !!TRAJS[k];
    b.disabled = !avail;
    if (!avail) b.title = "recording coming soon";
    b.classList.toggle("active", k === labBench);
    if (avail) b.onclick = () => {
      labStop(); labBench = k; labEx = 0; labMethod = null; labStep = 0;
      $$("#lab-benchmark button").forEach(x => x.classList.toggle("active", x.dataset.bench === labBench));
      buildLabExampleSel(); buildLabMethodSeg(); renderLab();
    };
  });
}

function buildLabExampleSel() {
  const sel = $("#lab-example"); sel.innerHTML = "";
  curTraj().examples.forEach((ex, i) => {
    const o = el("option"); o.value = i; o.textContent = "Example " + (i + 1);
    sel.appendChild(o);
  });
  sel.value = labEx;
  sel.onchange = () => { labStop(); labEx = +sel.value; labMethod = null; labStep = 0; buildLabMethodSeg(); renderLab(); };
}

function buildLabMethodSeg() {
  const ex = curExample();
  if (!labMethod || !ex.methods[labMethod]) labMethod = ex.methodOrder[0];
  const seg = $("#lab-method"); seg.innerHTML = "";
  ex.methodOrder.forEach(id => {
    const md = ex.methods[id];
    const b = el("button", id === labMethod ? "active" : "", md.label);
    b.addEventListener("click", () => { labStop(); labMethod = id; labStep = 0; renderLab(); });
    seg.appendChild(b);
  });
}

/* conversation events: curator (curated memory) → agent turns. The user request
 * is a shared header above the box, so it's not repeated per method. */
function labEvents() {
  const md = curMethodData(); const ev = [];
  if (md.injected) ev.push({ kind: "curator", ik: md.injected.kind, text: md.injected.text });
  md.turns.forEach((s, i) => ev.push({ kind: "agent", obs: s.obs, action: s.action, n: i + 1 }));
  return ev;
}
const labLen = () => Math.max(1, labEvents().length);

function renderLab() {
  const ex = curExample(), md = curMethodData(), ev = labEvents(), N = ev.length;
  labStep = Math.min(labStep, N - 1);
  $$("#lab-method button").forEach(b => b.classList.toggle("active", b.textContent === md.label));
  $("#lab-userreq").innerHTML = `<span class="ur-label">USER REQUEST</span><span>${esc(ex.task)}</span>`;
  $("#lab-convo-meta").textContent = `${md.label} · step ${labStep + 1} of ${N}`;

  const thread = $("#lab-thread");
  thread.innerHTML = ev.map((e, i) => {
    const cur = i === labStep ? " current" : "";
    if (e.kind === "curator") {
      const k = e.ik === "adaptive" ? "adaptive" : "fixed";
      const who = e.ik === "adaptive" ? "Curator · task-adaptive memory (read-time)" : "Retrieved memory (write-time)";
      return `<div class="turn${cur}"><div class="bubble cur ${k}"><span class="who">${who}</span>${esc(e.text)}</div></div>`;
    }
    const obsBubble = (e.obs && e.obs.trim())
      ? `<div class="bubble obs"><span class="who">Environment</span>${esc(e.obs)}</div>`
      : "";
    return `<div class="turn${cur}">
        ${obsBubble}
        <div class="bubble act"><span class="who">Agent · turn ${e.n}</span><code>${esc(e.action)}</code></div>
      </div>`;
  }).join("");
  const curEl = thread.querySelector(".turn.current");
  if (curEl) curEl.scrollIntoView({ block: "nearest" });

  // ── sidebar: what's happening + outcome ──
  $("#lab-note-body").innerHTML = `<div class="lab-note">${md.summary}</div>`;
  const n = md.turns.length, pct = Math.round((md.reward || 0) * 100);
  $("#lab-out-body").innerHTML =
    `<div class="reward-val">${(md.reward || 0).toFixed(2)} <span class="rw-tag ${md.success ? "ok" : "bad"}">${md.success ? "success" : "failed"}</span></div>
     <div class="reward-meter"><i style="width:${pct}%"></i></div>
     <div style="font-size:12.5px;color:var(--ink-2)">final reward · <b>${n} agent turns</b> to finish</div>`;

  // scrubber over the conversation events
  const scrub = $("#lab-scrub"); scrub.innerHTML = "";
  ev.forEach((_, i) => {
    const d = el("button", "dot" + (i === labStep ? " active" : i < labStep ? " done" : ""));
    d.setAttribute("aria-label", "Step " + (i + 1));
    d.addEventListener("click", () => { labStop(); labStep = i; renderLab(); });
    scrub.appendChild(d);
  });
}

/* auto-play: stream the turns like a live conversation */
let labTimer = null;
function labStop() { if (labTimer) { clearInterval(labTimer); labTimer = null; } const p = $("#lab-play"); if (p) p.innerHTML = "▶ Play"; }
function labPlay() {
  if (labTimer) return labStop();
  if (labStep >= labLen() - 1) labStep = 0;
  renderLab();
  $("#lab-play").innerHTML = "❚❚ Pause";
  labTimer = setInterval(() => {
    if (labStep >= labLen() - 1) return labStop();
    labStep++; renderLab();
  }, 1300);
}
$("#lab-play").addEventListener("click", labPlay);
$("#lab-restart").addEventListener("click", () => { labStop(); labStep = 0; labPlay(); });

/* ================================================================ RESULTS */
const RES = window.DEMO_RESULTS;
const FAMILY = {
  none:        { label: "No memory (floor)", css: "none" },
  baseline:    { label: "Write-time baseline", css: "baseline" },
  "ours-base": { label: "JitMem · frozen curator (ours)", css: "ours-base" },
  ours:        { label: "JitMem · RL-trained (ours)", css: "ours" },
};
let resBench = "alfworld", resExec = "Qwen3-8B";

function buildResBenchSeg() {
  const seg = $("#res-benchmark"); seg.innerHTML = "";
  Object.keys(RES).forEach(key => {
    const b = el("button", key === resBench ? "active" : "", RES[key].name);
    b.dataset.key = key;
    b.addEventListener("click", () => {
      resBench = key;
      const execs = Object.keys(RES[key].executors);
      if (!execs.includes(resExec)) resExec = execs[0];
      buildResExecSeg(); renderChart();
      $$("#res-benchmark button").forEach(x => x.classList.toggle("active", x.textContent === RES[key].name));
    });
    seg.appendChild(b);
  });
}
function buildResExecSeg() {
  const seg = $("#res-executor"); seg.innerHTML = "";
  const execs = Object.keys(RES[resBench].executors);
  const allExecs = ["Qwen3-8B", "Gemini-2.5-Pro", "GPT-5.4"];
  allExecs.forEach(ex => {
    const avail = execs.includes(ex);
    const b = el("button", ex === resExec && avail ? "active" : "", ex);
    if (!avail) { b.disabled = true; b.title = "not run on this benchmark in the draft"; }
    else b.addEventListener("click", () => { resExec = ex; renderChart(); $$("#res-executor button").forEach(x => x.classList.toggle("active", x.textContent === ex)); });
    seg.appendChild(b);
  });
}

let tip;
function ensureTip() { if (!tip) { tip = el("div"); tip.id = "chart-tip"; tip.style.cssText = "position:fixed;pointer-events:none;z-index:50;background:var(--surface-2);border:1px solid var(--line);border-radius:9px;padding:9px 12px;font:12px/1.5 var(--mono);color:var(--ink);box-shadow:var(--shadow);display:none;max-width:260px"; document.body.appendChild(tip); } return tip; }

function renderChart() {
  const b = RES[resBench];
  const rows = b.executors[resExec];
  const bestBaseline = Math.max(...rows.filter(r => r.family === "none" || r.family === "baseline").map(r => r.value));
  const scaleMax = 100;

  $("#chart-caption").innerHTML = `<b>${b.name}</b> · ${b.metric} · frozen executor <b>${resExec}</b>`
    + `<span class="cap-blurb">${b.blurb || ""} Higher is better; the dashed line marks the strongest baseline.</span>`;
  const chart = $("#chart"); chart.innerHTML = "";

  rows.forEach(r => {
    const row = el("div", "bar-row");
    const isOurs = r.family === "ours" || r.family === "ours-base";
    row.innerHTML =
      `<div class="bar-label ${isOurs ? "ours" : ""}">${r.method}</div>
       <div class="bar-track">
         <div class="bar-fill ${FAMILY[r.family].css}"></div>
         <div class="bar-val">${r.value.toFixed(1)}</div>
       </div>`;
    chart.appendChild(row);
    // set final geometry synchronously (robust across re-renders); the grow-in
    // is a pure-CSS reveal so it never depends on rAF timing
    const pct = r.value / scaleMax * 100;
    $(".bar-fill", row).style.width = pct + "%";
    $(".bar-val", row).style.left = pct + "%";
    // tooltip
    const track = $(".bar-track", row);
    track.addEventListener("mousemove", e => {
      const t = ensureTip();
      let extra = `± ${r.std.toFixed(1)}`;
      if (r.alt != null) extra += ` · ${b.altLabel}: ${r.alt.toFixed(1)}`;
      if (r.dom) extra += "<br>" + Object.entries(r.dom).map(([k, v]) => `${k} ${v}`).join(" · ");
      t.innerHTML = `<b>${r.method}</b><br>${b.metric.split(" (")[0]}: ${r.value.toFixed(1)} ${extra}`;
      t.style.display = "block"; t.style.left = Math.min(e.clientX + 14, innerWidth - 270) + "px"; t.style.top = (e.clientY + 14) + "px";
    });
    track.addEventListener("mouseleave", () => { if (tip) tip.style.display = "none"; });
  });

  // reference line at strongest baseline — drawn synchronously so a stale rAF
  // from a previous render can never append onto the rebuilt chart
  const refPct = bestBaseline / scaleMax * 100;
  $$(".bar-track", chart).forEach((t, i) => {
    const line = el("div", "ref-line"); line.style.left = refPct + "%"; t.appendChild(line);
    if (i === 0) { const tip = el("div", "ref-tip", `best baseline ${bestBaseline.toFixed(1)}`); tip.style.left = refPct + "%"; t.appendChild(tip); }
  });

  // legend + note
  $("#chart-legend").innerHTML = Object.values(FAMILY).map(f =>
    `<span><i class="bar-fill ${f.css}" style="width:13px;position:static"></i>${f.label}</span>`).join("")
    + `<span><i style="width:13px;height:0;border-top:2px dashed var(--turn)"></i>strongest baseline</span>`;
  $("#chart-note").textContent = b.note || "";
}

function buildCallouts() {
  $("#callouts").innerHTML = window.DEMO_CALLOUTS.map(c =>
    `<div class="callout"><h4>${c.title}</h4><p>${c.body}</p><span class="ev">${c.evidence}</span></div>`).join("");
}

function buildDrawer() {
  const S = window.DEMO_SECONDARY;
  const num = v => v == null ? '<span class="prelim">—</span>' : v.toFixed(1);
  // transfer
  const tr = `<table class="subtable"><caption>${S.transfer.caption}</caption>
    <tr><th>Test executor</th><th class="num">Untrained</th><th class="num">Transferred</th><th class="num">Direct</th><th class="num">Gap</th></tr>
    ${S.transfer.rows.map(r => `<tr><td>${r.exec}</td><td class="num">${num(r.untrained)}</td><td class="num">${num(r.transferred)}</td><td class="num">${r.direct == null ? "—" : r.direct.toFixed(1)}</td><td class="num">${r.gap == null ? "—" : r.gap.toFixed(1) + "%"}</td></tr>`).join("")}</table>`;
  // efficiency
  const ef = `<table class="subtable"><caption>${S.efficiency.caption}</caption>
    <tr><th>Method</th><th class="num">Input tok. (K)</th><th class="num">Output tok. (K)</th><th class="num">Steps</th></tr>
    ${S.efficiency.rows.map(r => `<tr><td>${r.method}</td><td class="num">${r.input.toFixed(1)}</td><td class="num">${r.output.toFixed(2)}</td><td class="num">${r.steps.toFixed(1)}</td></tr>`).join("")}</table>`;
  // ablations — two studies (training-free base + RL-trained)
  const abTable = g => `<table class="subtable"><caption>${g.caption}</caption>
    <tr><th>Variant</th><th>What the drop verifies</th><th class="num">ALFWorld</th><th class="num">WebShop</th></tr>
    ${g.rows.map(r => `<tr>${r.full ? `<td><b>${r.variant}</b></td>` : `<td>${r.variant}</td>`}<td>${r.claim}</td><td class="num">${r.full ? "<b>" + r.alf.toFixed(1) + "</b>" : r.alf.toFixed(1)}</td><td class="num">${r.full ? "<b>" + r.ws.toFixed(1) + "</b>" : r.ws.toFixed(1)}</td></tr>`).join("")}</table>`;
  const ab = `<p class="drawer-note">${S.ablations.note}</p>` + abTable(S.ablations.base) + abTable(S.ablations.rl);
  $("#drawer-body").innerHTML = tr + ef + ab;
}

/* ==================================================================== INIT */
function init() {
  buildHero();
  buildMethodCards();
  selectMethod(curMethod.id);
  renderCompare();
  buildLabBenchSeg();
  const lp = new URLSearchParams(location.search);
  if (lp.get("lb") && TRAJS[lp.get("lb")]) {
    labBench = lp.get("lb");
    $$("#lab-benchmark button").forEach(x => x.classList.toggle("active", x.dataset.bench === labBench));
  }
  if (lp.get("le") != null) labEx = Math.max(0, Math.min(curTraj().examples.length - 1, +lp.get("le") || 0));
  buildLabExampleSel();
  if (lp.get("lm") && curExample().methods[lp.get("lm")]) labMethod = lp.get("lm");
  buildLabMethodSeg();
  renderLab();
  buildResBenchSeg();
  buildResExecSeg();
  renderChart();
  buildCallouts();
  buildDrawer();
  // optional deep-link to a mechanism + step, e.g. ?m=memcurator&f=3
  const params = new URLSearchParams(location.search);
  if (params.get("m") && METHODS.some(m => m.id === params.get("m"))) selectMethod(params.get("m"));
  const f = parseInt(params.get("f"), 10);
  if (!isNaN(f)) { frameIdx = Math.max(0, Math.min(curMethod.frames.length - 1, f)); renderFrame(); }
  if (params.get("bench") && RES[params.get("bench")]) {
    const rb = $(`#res-benchmark button[data-key="${params.get("bench")}"]`); if (rb) rb.click();
  }
  if (params.get("compare") === "1") {
    history.replaceState(null, "", location.search + "#compare");
  }
  if (params.get("embed") === "paper") {
    setupPaperEmbed();
    spy.disconnect();
    const paperSections = ["overview", "mechanisms", "compare", "results", "memguide"];
    paperSections.forEach(id => {
      const node = document.getElementById(id);
      if (node) spy.observe(node);
    });
    navigate(location.hash.slice(1) || "overview", false);
    return;
  }
  if (params.get("embed") === "1") {
    document.body.classList.add("embed-mode");
    spy.disconnect();
  } else {
    SECTIONS.forEach(id => {
      const node = document.getElementById(id);
      if (node) spy.observe(node);
    });
  }
  navigate(location.hash.slice(1) || (params.get("embed") === "1" ? "mechanisms" : "overview"), false);
}
init();
