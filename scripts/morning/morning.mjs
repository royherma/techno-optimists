#!/usr/bin/env node
// Usage: node scripts/morning/morning.mjs   Output: .claude/artifacts/morning/<Bangkok date>.html + .json + index.html + history.jsonl
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { renderPage } from "./page.mjs";
import { stampDays } from "./days.mjs";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(root, ".claude/artifacts/morning");
const HISTORY = join(OUT, "history.jsonl");
const ORIGIN = "https://technooptimists.org";
const HOUR = 3_600_000, DAY = 24 * HOUR, BANGKOK = 7 * HOUR;
const ERROR_COUNTS = ["feed_errors", "fetch_errors", "model_errors", "delivery_errors", "storage_errors"];

const now = Date.now();
const bangkokDate = (t) => new Date(t + BANGKOK).toISOString().slice(0, 10);
const today = bangkokDate(now);
const utcDay = (t) => new Date(t).toISOString().slice(0, 10);
const end = Date.parse(`${utcDay(now)}T00:00:00Z`);
const window = { from: end - DAY, to: end, before: end - 2 * DAY };
const days14 = Array.from({ length: 14 }, (_, i) => utcDay(end - (14 - i) * DAY));

const sources = [];
async function source(name, what, read) {
  const started = Date.now();
  try {
    const data = await read();
    sources.push({ name, what, ok: true, note: data.note ?? "", ms: Date.now() - started });
    return data;
  } catch (error) {
    sources.push({ name, what, ok: false, note: String(error.message ?? error).trim().split("\n")[0].slice(0, 140), ms: Date.now() - started });
    return null;
  }
}

const getJson = async (path) => {
  const res = await fetch(`${ORIGIN}${path}`, { headers: { "x-tg-tester": "1" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw Error(`HTTP ${res.status} ${path}`);
  return res.json();
};

const keyTool = join(process.env.HOME ?? "", ".local/bin/key");
const cfToken = (() => {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  if (!existsSync(keyTool)) return "";
  try { return execFileSync(keyTool, ["get", "CLOUDFLARE_API_TOKEN"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 20_000 }).trim(); } catch { return ""; }
})();

const report = async (id, days) => {
  try {
    const { stdout } = await run(process.execPath, [join(root, ".mightymouse/reports", `${id}.mjs`)], { cwd: root, timeout: 120_000, maxBuffer: 10e6, env: { ...process.env, CLOUDFLARE_API_TOKEN: cfToken, REPORT_DAYS: String(days) } });
    return JSON.parse(stdout);
  } catch (error) {
    throw Error(String(error.stderr || error.message).trim().split("\n")[0]);
  }
};
const card = (id) => Promise.all([report(id, 1), report(id, 14)]).then(([day, fortnight]) => ({ ...day, series: fortnight.series }));

const CARDS = {
  threads: ["Threads added", "Threads Scout imported in the window, with title, type and place (.mightymouse/reports/scout-threads.mjs, prod D1)", "scout-threads", (r) => `${r.value} yesterday, ${r.previous} the day before`],
  visitors: ["Visitors", "Visitor-days on the site, one row per visitor per UTC day, includes Roy (.mightymouse/reports/visitors.mjs, prod D1 + Analytics Engine)", "visitors", (r) => `${r.value} visitor-day${r.value === 1 ? "" : "s"}`],
  opens: ["Thread opens", "Threads opened per visitor and the most opened threads (.mightymouse/reports/thread-opens.mjs, prod D1)", "thread-opens", (r) => `${r.value} per visitor`],
  signups: ["Sign-ins", "Outside people who asked for a sign-in link, and who clicked it (.mightymouse/reports/signups.mjs, prod D1)", "signups", (r) => `${r.value} asked`],
  contributors: ["Contributors", "Outside people who posted a thread, typed action, comment or update (.mightymouse/reports/contributors.mjs, prod D1)", "contributors", (r) => `${r.value} outside people`],
  siteErrors: ["Site errors", "Browser errors and server 5xx answers (.mightymouse/reports/errors.mjs, Analytics Engine)", "errors", (r) => `${r.value} errors`],
};
const read = await Promise.all(Object.entries(CARDS).map(([k, [name, what, id, note]]) => source(name, what, async () => {
  const r = await card(id);
  return { ...r, note: note(r) };
}).then((r) => [k, r])));
const c = Object.fromEntries(read);

const scout = await source("Scout runs", "Every Scout run from the Worker cron, what it checked, published and rejected (public /api/scout/source-runs + /api/scout/status)", async () => {
  const runs = [];
  let cursor = null;
  for (let page = 0; page < 20; page++) {
    const r = await getJson(`/api/scout/source-runs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
    runs.push(...r.runs);
    if (!r.next_cursor) break;
    cursor = r.next_cursor;
  }
  const status = await getJson("/api/scout/status");
  const errorsOf = (r) => ERROR_COUNTS.reduce((n, k) => n + (r.counts[k] ?? 0), 0);
  const within = (from, to) => runs.filter((r) => r.started_at >= from && r.started_at < to).sort((a, b) => a.started_at - b.started_at);
  const sum = (list, f) => list.reduce((n, r) => n + f(r), 0);
  const tally = (list) => ({ runs: list.length, checked: sum(list, (r) => r.counts.checked), published: sum(list, (r) => r.counts.published), rejected: sum(list, (r) => r.counts.rejected), errors: sum(list, errorsOf) });
  const last = within(window.from, window.to), before = within(window.before, window.from);
  const reasons = {};
  for (const r of last) for (const [k, n] of Object.entries(r.reasons ?? {})) reasons[k] = (reasons[k] ?? 0) + n;
  const daily = days14.map((d) => runs.filter((r) => utcDay(r.started_at) === d));
  return {
    last: tally(last), before: tally(before), list: last.map((r) => ({ ...r, errors: errorsOf(r) })),
    reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]),
    status: status.last_run, enabled: status.enabled, schedule: status.schedule,
    series: { runs: daily.map((l) => l.length), errors: daily.map((l) => sum(l, errorsOf)) },
    note: `${last.length} runs yesterday, ${runs.length} on record`,
  };
});

const site = await source("Site", "technooptimists.org answers and how many threads are live (/api/health)", async () => {
  const started = Date.now();
  const h = await getJson("/api/health");
  if (!h.ok) throw Error("health check said not ok");
  return { threads: h.challenges, ms: Date.now() - started, note: `${h.challenges} threads live` };
});

const SOURCE_ORDER = ["Site", "Scout runs", ...Object.values(CARDS).map((x) => x[0])];
sources.sort((a, b) => SOURCE_ORDER.indexOf(a.name) - SOURCE_ORDER.indexOf(b.name));
const v = (k, f = (r) => r.value) => (c[k] ? f(c[k]) : null);
const rowsOf = (k) => c[k]?.rows ?? [];
const clicked = c.signups ? Number(rowsOf("signups").find((r) => r[0] === "clicked the link")?.[1] ?? 0) : null;
const numbers = {
  threadsAdded: v("threads"),
  threadsLive: site?.threads ?? null,
  scoutRuns: scout?.last.runs ?? null,
  scoutChecked: scout?.last.checked ?? null,
  scoutPublished: scout?.last.published ?? null,
  scoutErrors: scout?.last.errors ?? null,
  visitors: v("visitors"),
  opensPerVisitor: v("opens"),
  signInAsks: v("signups"),
  signInClicks: clicked,
  contributors: v("contributors"),
  siteErrors: v("siteErrors"),
};

const history = existsSync(HISTORY) ? readFileSync(HISTORY, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const previous = history.filter((h) => h.date < today).at(-1) ?? null;
const row = { date: today, madeAt: new Date(now).toISOString(), ...numbers };

const attention = [];
const flag = (level, text, how = "") => attention.push({ level, text, how });
const clock = (t) => new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t)) + " Bangkok";
for (const s of sources) if (!s.ok) flag("act", `${s.name}: unavailable`, s.note);
if (site) flag("ok", "technooptimists.org is up", `${site.threads} threads live, answered in ${site.ms} ms`);
if (scout) {
  const sum = (list, f) => list.reduce((x, r) => x + f(r), 0);
  const lastRun = scout.status;
  const ranAt = lastRun?.started_at ? Date.parse(lastRun.started_at) : null;
  if (!scout.enabled) flag("act", "Scout is switched off in production", "SCOUT_ENABLED in wrangler.jsonc env prod");
  if (lastRun?.status === "failed") flag("act", `Last Scout run failed: ${(lastRun.errors ?? []).join("; ") || "no reason given"}`.slice(0, 140), `${lastRun.source_name ?? ""} at ${clock(ranAt)}`);
  if (ranAt && now - ranAt > 7 * HOUR) flag("act", `Scout has not run since ${clock(ranAt)}`, `cron ${scout.schedule} UTC should run every 6 h; npm run tail:prod`);
  if (!scout.last.runs) flag("act", "Scout did not run yesterday", `cron ${scout.schedule} UTC expects 4 runs a day`);
  if (scout.last.errors) flag("watch", `Scout hit ${scout.last.errors} error${scout.last.errors === 1 ? "" : "s"} in ${scout.last.runs} runs`, `${ERROR_COUNTS.map((k) => [k.replace("_errors", ""), sum(scout.list, (r) => r.counts[k])]).filter(([, x]) => x).map(([k, x]) => `${k} ${x}`).join(", ")} · curl ${ORIGIN}/api/scout/source-runs`);
  if (scout.last.runs && c.threads && !c.threads.value) flag("watch", `Scout checked ${scout.last.checked} articles and added no threads`, scout.reasons.slice(0, 3).map(([k, n]) => `${k.replace(/_/g, " ")} ${n}`).join(", "));
  else if (scout.last.runs && c.threads) flag("ok", `Scout added ${c.threads.value} thread${c.threads.value === 1 ? "" : "s"} in ${scout.last.runs} runs`, `${scout.last.checked} articles checked, ${scout.last.rejected} turned down`);
}
if (c.contributors?.value) flag("act", `${c.contributors.value} outside ${c.contributors.value === 1 ? "person" : "people"} took part yesterday, reply to them`, rowsOf("contributors").filter((r) => r[1]).map((r) => `${r[1]} ${r[0]}`).join(", "));
if (c.signups && c.signups.value > clicked) flag("watch", `${c.signups.value - clicked} of ${c.signups.value} sign-in links never clicked`, "check the sign-in email lands (npm run auth:doctor)");
if (c.siteErrors?.value) flag("watch", `${c.siteErrors.value} site error${c.siteErrors.value === 1 ? "" : "s"} yesterday`, rowsOf("siteErrors").slice(0, 2).map((r) => `${r[0]} ${r[1]}`).join(", "));
const order = { act: 0, watch: 1, ok: 2 };
attention.sort((a, b) => order[a.level] - order[b.level]);

const acts = attention.filter((a) => a.level === "act");
const status = acts.length ? "act" : attention.some((a) => a.level === "watch") ? "watch" : "ok";
const plural = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;
const summary = [
  numbers.threadsAdded != null && `Scout added ${plural(numbers.threadsAdded, "thread")}${numbers.scoutRuns != null ? ` in ${plural(numbers.scoutRuns, "run")}` : ""}`,
  numbers.visitors != null && plural(numbers.visitors, "visitor-day"),
  numbers.contributors != null && `${numbers.contributors} outside contributor${numbers.contributors === 1 ? "" : "s"}`,
].filter(Boolean).join(", ");
const headlineRaw = acts.length ? `${acts[0].text}${acts.length > 1 ? ` (+${acts.length - 1} more)` : ""}` : summary || "No source could be read";
const headline = headlineRaw.length > 90 ? `${headlineRaw.slice(0, 87).trimEnd()}...` : headlineRaw;

const link = (slug, text) => ({ text, href: `${ORIGIN}/c/${slug}` });
const table = (title, columns, rows, empty) => ({ title, columns, rows, empty });
const breakdowns = {
  threads: [
    table("Threads Scout added yesterday", ["Thread", "Type", "Place", "Added"], (c.threads?.threads ?? []).map((t) => [link(t.slug, t.title), t.type, t.location ?? "", clock(Date.parse(`${t.imported_at.replace(" ", "T")}Z`))]), "No threads added yesterday"),
    table("By type", ["Type", "Threads"], rowsOf("threads"), "None"),
  ],
  runs: [
    table("Scout runs yesterday", ["Started", "Feed", "Checked", "Published", "Turned down", "Errors"], (scout?.list ?? []).map((r) => [clock(r.started_at), r.source_id, r.counts.checked, r.counts.published, r.counts.rejected, r.errors]), "No runs yesterday"),
    table("Why articles were turned down", ["Reason", "Articles"], (scout?.reasons ?? []).map(([k, n]) => [k.replace(/_/g, " "), n]), "Nothing turned down"),
  ],
  scoutErrors: [
    table("Runs with errors", ["Started", "Feed", ...ERROR_COUNTS.map((k) => k.replace("_errors", ""))], (scout?.list ?? []).filter((r) => r.errors).map((r) => [clock(r.started_at), r.source_id, ...ERROR_COUNTS.map((k) => r.counts[k])]), "No errors yesterday"),
    table("Last run", ["Field", "Value"], scout?.status ? [["Status", scout.status.status], ["Feed", scout.status.source_name ?? ""], ["Started", clock(Date.parse(scout.status.started_at))], ["Errors", (scout.status.errors ?? []).join("; ") || "none"]] : [], "Unavailable"),
  ],
  visitors: [table("Landing pages yesterday", ["Page", "Visits"], rowsOf("visitors"), "No visitors yesterday")],
  opens: [table("Most opened threads", ["Thread", "Opens"], rowsOf("opens"), "No threads opened yesterday")],
  signups: [table("Sign-in links, outside people", ["Step", "People"], rowsOf("signups"), "None")],
  contributors: [table("What outside people did", ["Kind", "Count"], rowsOf("contributors"), "None")],
  siteErrors: [table("Where the errors were", ["Where", "Count"], rowsOf("siteErrors"), "No errors yesterday")],
};

const trend = {
  threadsAdded: c.threads?.series.map((s) => s[1]),
  scoutRuns: scout?.series.runs,
  scoutErrors: scout?.series.errors,
  visitors: c.visitors?.series.map((s) => s[1]),
  opensPerVisitor: c.opens?.series.map((s) => s[1]),
  signInAsks: c.signups?.series.map((s) => s[1]),
  contributors: c.contributors?.series.map((s) => s[1]),
  siteErrors: c.siteErrors?.series.map((s) => s[1]),
};

mkdirSync(OUT, { recursive: true });
writeFileSync(HISTORY, [...history.filter((h) => h.date !== today), row].map((h) => JSON.stringify(h)).join("\n") + "\n");
const page = renderPage({ today, now, window, numbers, c, scout, site, previous, trend, breakdowns, attention, sources, threads: c.threads?.threads ?? null });
writeFileSync(join(OUT, `${today}.html`), page);
writeFileSync(join(OUT, "index.html"), page);
writeFileSync(join(OUT, `${today}.json`), JSON.stringify({ date: today, project: "techno-optimists", headline, status, acts: attention.filter((a) => a.level !== "ok"), numbers, sources: sources.map(({ name, ok, note }) => ({ name, ok, note })) }, null, 2) + "\n");
const missed = stampDays(OUT, today).filter((d) => !d.made).map((d) => d.d);

console.log(`${new Date(now).toISOString()} ${join(OUT, `${today}.html`)}`);
console.log(`${status} · ${headline} · sources ${sources.filter((s) => s.ok).length}/${sources.length} ok`);
if (missed.length) console.log(`MISSED DAYS ${missed.join(" ")}`);
for (const s of sources.filter((x) => !x.ok)) console.log(`UNAVAILABLE ${s.name}: ${s.note}`);
