const ORIGIN = "https://technooptimists.org";
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clock = (t, withDay = false) => new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", ...(withDay ? { month: "short", day: "numeric" } : {}), hour: "numeric", minute: "2-digit" }).format(new Date(t)) + " Bangkok";
const longDate = (d) => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

function delta(value, before) {
  if (value == null || before == null) return `<small class="flat">no earlier day yet</small>`;
  const d = Math.round((value - before) * 100) / 100;
  if (!d) return `<small class="flat">same as the day before</small>`;
  return `<small class="${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${Math.abs(d)} vs the day before</small>`;
}

function spark(values = []) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (pts.length < 2) return `<svg class="spark" viewBox="0 0 100 24"></svg>`;
  const max = Math.max(1, ...pts.map(([, v]) => v));
  const x = (i) => (i / Math.max(1, values.length - 1)) * 100;
  const y = (v) => 22 - (v / max) * 20;
  return `<svg class="spark" viewBox="0 0 100 24" preserveAspectRatio="none"><polyline points="${pts.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/></svg>`;
}

const tile = ({ label, value, sub, help, series, key }) =>
  `<div class="tile" role="button" tabindex="0" data-open="${key}" data-title="${esc(label)}" title="${esc(help)} Click for what is behind it."><span>${esc(label)}</span><strong>${value == null ? "<i>unavailable</i>" : esc(value)}</strong>${sub}${spark(series)}</div>`;

export function renderPage({ today, now, window, numbers: n, c, scout, site, previous, trend, breakdowns, attention, sources, threads }) {
  const versus = (k) => c[k] ? delta(c[k].value, c[k].previous) : delta(null, null);
  const asked = c.signups?.value, clicked = n.signInClicks;
  const tiles = [
    { key: "threads", label: "Threads Scout added", value: n.threadsAdded, sub: versus("threads"), help: "Threads the scout account imported yesterday (UTC day, 7 AM to 7 AM Bangkok).", series: trend.threadsAdded },
    { key: "runs", label: "Scout runs", value: n.scoutRuns, sub: scout ? delta(scout.last.runs, scout.before.runs) : delta(null, null), help: "Worker cron runs yesterday. The cron expects 4 a day.", series: trend.scoutRuns },
    { key: "scoutErrors", label: "Scout errors", value: n.scoutErrors, sub: scout ? `<small class="${scout.last.errors ? "down" : "flat"}">${scout.last.checked} articles checked · ${scout.before.errors} the day before</small>` : delta(null, null), help: "Feed, fetch, model, delivery and storage errors across yesterday's runs.", series: trend.scoutErrors },
    { key: "visitors", label: "Visitors", value: n.visitors, sub: versus("visitors"), help: "Visitor-days yesterday: one per visitor per UTC day. Includes Roy's own visits.", series: trend.visitors },
    { key: "opens", label: "Threads opened per visitor", value: n.opensPerVisitor, sub: versus("opens"), help: "Thread opens divided by visitor-days, yesterday.", series: trend.opensPerVisitor },
    { key: "signups", label: "Sign-in requests", value: asked, sub: c.signups ? `<small class="flat">${clicked} clicked the link · ${c.signups.previous} asked the day before</small>` : delta(null, null), help: "Outside emails that asked for a sign-in link yesterday (test and admin addresses removed).", series: trend.signInAsks },
    { key: "contributors", label: "Outside contributors", value: n.contributors, sub: versus("contributors"), help: "Outside people who posted a thread, a typed action, a comment or an update yesterday.", series: trend.contributors },
    { key: "siteErrors", label: "Site errors", value: n.siteErrors, sub: versus("siteErrors"), help: "Browser errors plus server 5xx answers yesterday.", series: trend.siteErrors },
  ];

  const DATA = JSON.stringify(breakdowns ?? {}).replace(/</g, "\\u003c");
  const acts = attention.filter((a) => a.level === "act").length;
  const okCount = sources.filter((s) => s.ok).length;
  const verdict = acts ? `${acts} thing${acts === 1 ? "" : "s"} need${acts === 1 ? "s" : ""} you` : "Nothing needs you today";
  const list = attention.length ? attention : [{ level: "ok", text: "Nothing to look at", how: "" }];
  const LEVEL = { act: "Act", watch: "Watch", ok: "OK" };

  const runs = scout?.list.length
    ? scout.list.map((r) => `<div class="stage${r.errors ? " worst" : ""}" role="button" tabindex="0" data-open="runs" data-title="Scout runs"><b>${r.counts.published}</b><span>${esc(r.source_id)}</span><em>${clock(r.started_at)} · ${r.counts.checked} checked${r.errors ? ` · ${r.errors} error${r.errors === 1 ? "" : "s"}` : ""}</em></div>`).join("")
    : `<p class="muted">${scout ? "No Scout runs yesterday" : "Scout runs unavailable"}</p>`;
  const reasons = scout?.reasons.length ? `<p class="move"><b>Turned down most for:</b> ${scout.reasons.slice(0, 4).map(([k, v]) => `${esc(k.replace(/_/g, " "))} ${v}`).join(", ")}</p>` : "";
  const added = threads == null
    ? `<li class="muted">Threads unavailable</li>`
    : threads.slice(0, 6).map((t) => `<li><span><a href="${ORIGIN}/c/${esc(t.slug)}">${esc(t.title)}</a></span><em class="muted">${esc(t.type)}</em></li>`).join("") || `<li class="muted">No threads added yesterday</li>`;
  const pageRows = c.visitors?.rows ?? null;
  const pages = pageRows == null ? `<li class="muted">Visitors unavailable</li>` : pageRows.map(([p, v]) => `<li><span>${esc(p)}</span><b>${v}</b></li>`).join("") || `<li class="muted">No visitors yesterday</li>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Techno Optimists morning ${today}</title>
<style>
:root{--paper:#FAFAF7;--card:#fff;--ink:#17252A;--muted:#5d6b70;--line:#e3e5df;--teal:#0F766E;--lime:#D9F566;--red:#b42318;--amber:#a15c07}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.35 ui-rounded,-apple-system,system-ui,sans-serif}
main{max-width:1480px;margin:0 auto;padding:14px 16px;display:grid;gap:12px}
header{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
h1{font-size:22px;margin:0}header p{margin:0;color:var(--muted)}
.verdict{margin-left:auto;font-weight:700;padding:4px 12px;border-radius:999px;background:${acts ? "#fde7e4" : "var(--lime)"};color:${acts ? "var(--red)" : "var(--ink)"}}
.top{display:grid;grid-template-columns:minmax(300px,1fr) 2.2fr;gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:0 0 8px}
.needs{list-style:none;margin:0;padding:0;display:grid;gap:6px;max-height:420px;overflow:auto}
.needs li{display:grid;grid-template-columns:52px 1fr;gap:8px;align-items:start}
.needs small{display:block;color:var(--muted);font-size:12px;word-break:break-word}
.pill{font-size:11px;font-weight:700;text-align:center;border-radius:6px;padding:2px 0}
.act .pill{background:#fde7e4;color:var(--red)}.watch .pill{background:#fff3d6;color:var(--amber)}.ok .pill{background:#e6f4f1;color:var(--teal)}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:grid;gap:2px;cursor:help}
.tile span{color:var(--muted);font-size:12px}.tile strong{font-size:26px;line-height:1.1}.tile i{font-size:14px;color:var(--red);font-weight:600}
.tile small{font-size:12px}.up{color:var(--teal)}.down{color:var(--red)}.flat{color:var(--muted)}
.tile,.stage{cursor:pointer}.tile:hover,.stage:hover,.tile:focus,.stage:focus{border-color:var(--teal);outline:none}
#veil{position:fixed;inset:0;background:rgba(23,37,42,.35);display:none;z-index:50}#veil.on{display:block}
#panel{position:fixed;top:var(--tu-nav,0px);right:0;bottom:0;width:min(760px,100%);background:var(--card);border-left:1px solid var(--line);z-index:51;transform:translateX(100%);transition:transform .18s ease;display:flex;flex-direction:column}
#panel.on{transform:none}#panel header{padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px}#panel h3{margin:0;font-size:18px}
#panel button{margin-left:auto;border:1px solid var(--line);background:var(--paper);border-radius:8px;padding:4px 10px;font:inherit;cursor:pointer}
#panel .body{overflow:auto;padding:12px 16px;display:grid;grid-template-columns:1fr 1fr;gap:16px;align-content:start}#panel section{grid-column:1/-1}#panel section.small{grid-column:auto}#panel td+td:last-child,#panel th+th:last-child{text-align:right}#panel h4{margin:0 0 6px;font-size:13px;color:var(--muted)}
#panel table{width:100%;border-collapse:collapse;font-size:13px}#panel th{text-align:left;font-weight:600;color:var(--muted);border-bottom:1px solid var(--line);padding:4px 6px}
#panel td{border-bottom:1px solid var(--line);padding:5px 6px;vertical-align:top;word-break:break-word}#panel td a{color:var(--teal)}#panel .empty{color:var(--muted);font-size:13px;margin:0}
.spark{width:100%;height:22px}.spark polyline{fill:none;stroke:var(--teal);stroke-width:1.6;vector-effect:non-scaling-stroke}
.funnel{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
.stage{border:1px solid var(--line);border-radius:10px;padding:8px;display:grid;gap:2px}.stage b{font-size:20px}.stage span{font-size:12px}.stage em{font-size:11px;color:var(--muted);font-style:normal}
.stage.worst{border-color:var(--red);background:#fff7f6}.stage.worst em{color:var(--red);font-weight:700}
.move{margin:8px 0 0;font-size:13px}.bottom{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:12px}
ul.plain{list-style:none;margin:0;padding:0;display:grid;gap:3px;font-size:13px}ul.plain li{display:flex;gap:6px;justify-content:space-between}
ul.plain a{color:var(--ink);text-decoration:none}ul.plain a:hover{color:var(--teal);text-decoration:underline}ul.plain em{white-space:nowrap;font-size:12px}.muted{color:var(--muted)}
.sources{display:flex;flex-wrap:wrap;gap:6px}.src{font-size:12px;border-radius:999px;padding:3px 10px;border:1px solid var(--line);cursor:help}
.src.ok{background:#e6f4f1}.src.bad{background:#fde7e4;color:var(--red);font-weight:700}
@media (max-width:1000px){.top,.bottom{grid-template-columns:1fr}.tiles{grid-template-columns:repeat(2,1fr)}.funnel{grid-template-columns:repeat(3,1fr)}}
</style></head><body><main>
<header><h1>Techno Optimists morning</h1><p>${longDate(today)} · made ${clock(now)} · ${okCount} of ${sources.length} sources read</p><span class="verdict">${verdict}</span></header>
<section class="top">
<div class="card"><h2>What needs you</h2><ul class="needs">${list.map((a) => `<li class="${a.level}"><span class="pill">${LEVEL[a.level]}</span><div>${esc(a.text)}${a.how ? `<small>${esc(a.how)}</small>` : ""}</div></li>`).join("")}</ul></div>
<div class="tiles">${tiles.map(tile).join("")}</div>
</section>
<section class="card"><h2>Scout runs yesterday · threads published per run</h2><div class="funnel">${runs}</div>${reasons}</section>
<section class="bottom">
<div class="card"><h2>Threads added yesterday${site ? ` · ${site.threads} live in all` : ""}</h2><ul class="plain">${added}</ul></div>
<div class="card"><h2>Landing pages yesterday</h2><ul class="plain">${pages}</ul></div>
<div class="card"><h2>Sources · click a number for what</h2><div class="sources">${sources.map((s) => `<span class="src ${s.ok ? "ok" : "bad"}" title="${esc(s.what)} - ${esc(s.note)} (${(s.ms / 1000).toFixed(1)} s)">${s.ok ? "" : "Unavailable: "}${esc(s.name)}</span>`).join("")}</div>
<p class="muted" style="font-size:12px;margin:8px 0 0">yesterday = ${clock(window.from, true)} to ${clock(window.to, true)} · lines show 14 days by UTC day${previous ? ` · last report ${previous.date}` : ""}</p></div>
</section>
<div id="veil"></div><aside id="panel" aria-hidden="true"><header><h3 id="ptitle"></h3><button id="pclose">Close · Esc</button></header><div class="body" id="pbody"></div></aside>
<script id="breakdowns" type="application/json">${DATA}</script>
<script>
(() => {
  const data = JSON.parse(document.getElementById("breakdowns").textContent);
  const panel = document.getElementById("panel"), veil = document.getElementById("veil"), body = document.getElementById("pbody");
  const el = (tag, text) => { const e = document.createElement(tag); if (text != null) e.textContent = text; return e; };
  const cell = (v) => { const td = el("td"); if (v && typeof v === "object" && v.href) { const a = el("a", v.text); a.href = v.href; a.target = "_blank"; td.append(a); } else td.textContent = v ?? ""; return td; };
  function open(key, title) {
    const sections = data[key];
    document.getElementById("ptitle").textContent = title;
    body.replaceChildren();
    for (const s of sections || [{ title: "No breakdown for this number", rows: [], empty: "The source behind it was unavailable" }]) {
      const box = el("section"); if ((s.columns || []).length <= 2) box.className = "small"; box.append(el("h4", s.title));
      if (!s.rows.length) box.append(Object.assign(el("p", s.empty || "Nothing in this window"), { className: "empty" }));
      else { const t = el("table"), h = el("tr"); s.columns.forEach((c) => h.append(el("th", c))); t.append(h); s.rows.forEach((r) => { const tr = el("tr"); r.forEach((v) => tr.append(cell(v))); t.append(tr); }); box.append(t); }
      body.append(box);
    }
    panel.classList.add("on"); veil.classList.add("on"); panel.setAttribute("aria-hidden", "false");
    try { history.replaceState(null, "", "#" + key); } catch {}
  }
  const close = () => { panel.classList.remove("on"); veil.classList.remove("on"); panel.setAttribute("aria-hidden", "true"); try { history.replaceState(null, "", location.pathname); } catch {} };
  document.querySelectorAll("[data-open]").forEach((n) => { n.addEventListener("click", () => open(n.dataset.open, n.dataset.title)); n.addEventListener("keydown", (e) => { if (e.key === "Enter") open(n.dataset.open, n.dataset.title); }); });
  veil.addEventListener("click", close); document.getElementById("pclose").addEventListener("click", close);
  addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  const fromHash = () => { const k = location.hash.slice(1); const node = k && document.querySelector('[data-open="' + k + '"]'); if (node) open(k, node.dataset.title); else if (!k) close(); };
  addEventListener("hashchange", fromHash); fromHash();
})();
</script>
</main></body></html>`;
}
