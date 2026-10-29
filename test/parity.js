// Parity: run core.js on a capture with live ESPN data; print "matchup|bol|flags" rows.
// usage: node test/parity.js <capture.txt> <leagues|auto> <start YYYY-MM-DD> <end> [tz]
const C = require("../core.js");
const { execFileSync } = require("child_process");
const fs = require("fs");
const fetchJson = (u) => JSON.parse(execFileSync("curl", ["-sS", "-m", "30", u], { maxBuffer: 1 << 28 }).toString());
const [file, lg, s, e, tz = "America/New_York"] = process.argv.slice(2);
const leagues = lg === "auto" ? C.ALL_LEAGUES : lg.split(",").map((x) => C.LEAGUE_ALIASES[x] || x);
const d0 = { y: +s.slice(0, 4), m: +s.slice(5, 7), d: +s.slice(8, 10) };
const days = []; for (let d = d0; C.ymd(d) <= e; d = C.addDays(d, 1)) days.push(d);
let games = [], seen = new Set();
const lo = C.zonedToUtc(days[0].y, days[0].m, days[0].d, 0, 0, tz) - 6 * 3600e3;
const last = C.addDays(days[days.length - 1], 1), hi = C.zonedToUtc(last.y, last.m, last.d, 0, 0, tz) + 6 * 3600e3;
for (const l of leagues) for (const d of days) {
  let sb; try { sb = fetchJson(C.scoreboardUrl(l, d)); } catch { continue; }
  for (const g of C.gamesFromScoreboard(l, sb)) {
    const k = l + "|" + g.compId;
    if (g.official >= lo && g.official <= hi && !seen.has(k)) { seen.add(k); games.push(g); }
  }
}
const text = fs.readFileSync(file, "utf8");
const run = (gs) => { C.resetMatches(gs); C.dropAmbiguous(gs); return C.attach(gs, C.parseText(text, C.allNames(gs), days[0], tz)); };
run(games);
if (lg === "auto") { const kept = new Set(C.detectedLeagues(games)); games = games.filter((g) => kept.has(g.league)); run(games); }
for (const g of games) if (g.bolTimes.size && C.wantsActual(g)) { try { g.actual = C.actualStart(fetchJson(C.summaryUrl(g))); } catch {} }
const fmt = (ms) => new Date(ms).toLocaleString("en-US", { timeZone: tz, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
games.filter((g) => g.bolTimes.size).sort((a, b) => a.official - b.official || a.league.localeCompare(b.league))
  .forEach((g) => console.log([g.away + " " + g.sep + " " + g.home, [...g.bolTimes].sort().map(fmt).join(" / "), C.flagsFor(g).join(",")].join(" | ")));
