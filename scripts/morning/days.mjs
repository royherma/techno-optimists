import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATED = /^(\d{4}-\d{2}-\d{2})\.html$/;
const DAY = 86_400_000;
const START = "<!--days-->", END = "<!--/days-->";

export function calendar(dates, today) {
  const first = dates[0] ?? today;
  const out = [];
  for (let t = Date.parse(first); t <= Date.parse(today); t += DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out.map((d) => ({ d, made: dates.includes(d) }));
}

export function daysNav(days, current) {
  const made = days.filter((x) => x.made).map((x) => x.d);
  const at = made.indexOf(current);
  const prev = made[at - 1], next = made[at + 1];
  const label = (d) => `${new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${Number(d.slice(8))}`;
  const missed = days.filter((x) => !x.made).length;
  const pill = ({ d, made: ok }) => ok
    ? `<a class="dp${d === current ? " on" : ""}" href="${d}.html">${label(d)}</a>`
    : `<span class="dp miss" title="No report was made this day">${label(d)}</span>`;
  const arrow = (d, txt, key, tip) => d ? `<a class="da" href="${d}.html" data-key="${key}" title="${tip} (${key === "ArrowLeft" ? "←" : "→"} key)">${txt}</a>` : `<span class="da off">${txt}</span>`;
  return `${START}<nav class="days"><style>
.days{display:flex;margin-left:auto;align-items:center;gap:6px;flex-wrap:wrap;font:13px/1 ui-rounded,-apple-system,system-ui,sans-serif}
.days a{color:inherit;text-decoration:none}.days .da,.days .dp{padding:4px 9px;border-radius:999px;border:1px solid #e3e5df;background:#fff}
.days .da{font-weight:700}.days .off{opacity:.35}.days a:hover{border-color:#0F766E}
.days .on{background:#17252A;color:#D9F566;border-color:#17252A;font-weight:700}
.days .miss{background:#fde7e4;color:#b42318;text-decoration:line-through}
.days .tally{margin-left:6px;color:${missed ? "#b42318" : "#5d6b70"};font-weight:${missed ? 700 : 400}}
</style>${arrow(prev, "←", "ArrowLeft", "Day before")}${days.map(pill).join("")}${arrow(next, "→", "ArrowRight", "Day after")}<span class="tally">${missed ? `${missed} day${missed > 1 ? "s" : ""} missed` : "every day collected"}</span>
<script>addEventListener("keydown",(e)=>{if(e.target.closest("input,textarea")||e.metaKey||e.ctrlKey)return;const a=document.querySelector('.days a[data-key="'+e.key+'"]');if(a)location.href=a.href})</script></nav>${END}`;
}

export function stampDays(dir, today) {
  const dates = readdirSync(dir).map((f) => f.match(DATED)?.[1]).filter(Boolean).sort();
  const days = calendar(dates, today);
  const put = (file, current) => {
    const html = readFileSync(file, "utf8");
    const nav = daysNav(days, current);
    const s = html.indexOf(START), e = html.indexOf(END);
    const bare = s >= 0 && e > s ? html.slice(0, s) + html.slice(e + END.length) : html;
    const next = bare.replace('<span class="verdict">', `${nav}<span class="verdict">`);
    if (next !== html) writeFileSync(file, next);
  };
  for (const d of dates) put(join(dir, `${d}.html`), d);
  if (dates.includes(today)) put(join(dir, "index.html"), today);
  return days;
}
