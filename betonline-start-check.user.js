// ==UserScript==
// @name         BetOnline Start-Time Check
// @namespace    hardwood.start-check
// @version      1.0.0
// @description  Flags BetOnline games whose listed start time differs from the official schedule or the actual start (ESPN).
// @match        *://*.betonline.ag/*
// @match        *://betonline.ag/*
// @connect      site.api.espn.com
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @noframes
// @updateURL    https://raw.githubusercontent.com/AnthonyTurgelis/hardwood-site/userscripts/betonline-start-check.user.js
// @downloadURL  https://raw.githubusercontent.com/AnthonyTurgelis/hardwood-site/userscripts/betonline-start-check.user.js
// @homepageURL  https://github.com/AnthonyTurgelis/hardwood-site/tree/userscripts
// ==/UserScript==

// Start-time audit core: ESPN slate loading, BetOnline text parsing, matching, flags.
// Port of bol_start_audit.py. Runs in the browser (userscript) and in Node (tests).
/* eslint-disable no-var */
(function (root) {
  "use strict";

  var ESPN = "https://site.api.espn.com/apis/site/v2/sports";

  var LEAGUE_ALIASES = {
    nba: "basketball/nba", wnba: "basketball/wnba",
    ncaab: "basketball/mens-college-basketball", cbb: "basketball/mens-college-basketball", ncaaw: "basketball/womens-college-basketball",
    nbl: "basketball/nbl", fiba: "basketball/fiba",
    nfl: "football/nfl", ncaaf: "football/college-football", cfb: "football/college-football", cfl: "football/cfl", ufl: "football/ufl",
    mlb: "baseball/mlb", ncaabase: "baseball/college-baseball", softball: "baseball/college-softball",
    nhl: "hockey/nhl", ncaah: "hockey/mens-college-hockey", ncaahw: "hockey/womens-college-hockey",
    epl: "soccer/eng.1", championship: "soccer/eng.2", league1: "soccer/eng.3",
    facup: "soccer/eng.fa", carabao: "soccer/eng.league_cup",
    laliga: "soccer/esp.1", laliga2: "soccer/esp.2", seriea: "soccer/ita.1", serieb: "soccer/ita.2",
    bundesliga: "soccer/ger.1", bundesliga2: "soccer/ger.2", ligue1: "soccer/fra.1", ligue2: "soccer/fra.2",
    eredivisie: "soccer/ned.1", primeira: "soccer/por.1", spl: "soccer/sco.1", belgium: "soccer/bel.1",
    superlig: "soccer/tur.1", mls: "soccer/usa.1", nwsl: "soccer/usa.nwsl", ligamx: "soccer/mex.1",
    brasileirao: "soccer/bra.1", argentina: "soccer/arg.1",
    ucl: "soccer/uefa.champions", uel: "soccer/uefa.europa", uecl: "soccer/uefa.europa.conf",
    nations: "soccer/uefa.nations", libertadores: "soccer/conmebol.libertadores",
    concacafcl: "soccer/concacaf.champions", worldcup: "soccer/fifa.world", friendly: "soccer/fifa.friendly",
    saudi: "soccer/ksa.1", jleague: "soccer/jpn.1", aleague: "soccer/aus.1", csl: "soccer/chn.1",
    atp: "tennis/atp", wta: "tennis/wta",
    ufc: "mma/ufc", pfl: "mma/pfl", bellator: "mma/bellator",
    rwc: "rugby/164205", premrugby: "rugby/267979", urc: "rugby/270557", sixnations: "rugby/180659",
    superrugby: "rugby/242041", rugbychamp: "rugby/244293", rugbytests: "rugby/289234",
    nrl: "rugby-league/3", afl: "australian-football/afl",
    pll: "lacrosse/pll", ncaalax: "lacrosse/mens-college-lacrosse",
    ncaavb: "volleyball/womens-college-volleyball"
  };
  var ALL_LEAGUES = Array.from(new Set(Object.values(LEAGUE_ALIASES))).sort();
  var SCOREBOARD_EXTRA = {
    "basketball/mens-college-basketball": "&groups=50&limit=500",
    "basketball/womens-college-basketball": "&groups=50&limit=500",
    "football/college-football": "&groups=80&limit=500"
  };
  var NO_SUMMARY_SPORTS = { tennis: 1, mma: 1, golf: 1, racing: 1 };
  var LOCATION_ALIAS_SPORTS = { soccer: 1, rugby: 1, "rugby-league": 1, "australian-football": 1 };

  var EXTRA_ALIASES = {
    "wolverhampton wanderers": ["wolves"],
    "manchester united": ["man united", "man utd", "manchester utd"],
    "manchester city": ["man city"],
    "tottenham hotspur": ["spurs", "tottenham"],
    "nottingham forest": ["nottm forest", "nottingham", "forest"],
    "brighton and hove albion": ["brighton", "brighton hove albion"],
    "west ham united": ["west ham"], "newcastle united": ["newcastle"], "leeds united": ["leeds"],
    "afc bournemouth": ["bournemouth"], "sheffield united": ["sheffield utd"],
    "paris saint germain": ["psg", "paris sg", "paris st germain"],
    "internazionale": ["inter", "inter milan", "inter milano"],
    "ac milan": ["milan"], "as roma": ["roma"],
    "atletico madrid": ["atletico", "atl madrid", "atletico de madrid"],
    "athletic club": ["athletic bilbao", "bilbao"], "real betis": ["betis"],
    "bayern munich": ["bayern", "bayern munchen", "fc bayern"],
    "borussia dortmund": ["dortmund", "bvb"],
    "borussia monchengladbach": ["gladbach", "monchengladbach", "b monchengladbach"],
    "bayer leverkusen": ["leverkusen"], "fc cologne": ["koln", "fc koln", "cologne"],
    "eintracht frankfurt": ["frankfurt"], "rb leipzig": ["leipzig"],
    "olympique lyonnais": ["lyon"], "olympique de marseille": ["marseille"],
    "sporting cp": ["sporting lisbon", "sporting"], "psv eindhoven": ["psv"],
    "inter miami cf": ["inter miami"], "lafc": ["los angeles fc", "la fc"],
    "la galaxy": ["los angeles galaxy"], "new york red bulls": ["ny red bulls"],
    "new york city fc": ["nycfc", "ny city fc"]
  };
  var CLUB_AFFIXES = new Set(["fc", "cf", "sc", "afc", "ac", "as", "ssc", "sv", "tsg", "cd", "ud",
    "rc", "ca", "fk", "sk", "bk", "if", "1", "04", "05", "07", "club"]);

  // ------------------------------------------------------------- text helpers

  function norm(s) {
    s = String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
    s = s.replace(/&/g, " and ").replace(/['’]/g, "");
    var toks = s.replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
    return toks.map(function (t) { return t === "saint" ? "st" : t; }).join(" ");
  }
  var EXTRA = {};
  Object.keys(EXTRA_ALIASES).forEach(function (k) { EXTRA[norm(k)] = EXTRA_ALIASES[k]; });

  function variants(name) {
    var n = norm(name), out = new Set([n]);
    if (n.endsWith(" state")) out.add(n.slice(0, -6) + " st");
    [["los angeles ", "la "], ["los angeles ", "l a "], ["new york ", "ny "]].forEach(function (p) {
      if (n.startsWith(p[0])) out.add(p[1] + n.slice(p[0].length));
    });
    return out;
  }

  function teamAliases(team, sport, college) {
    sport = sport || "basketball";
    var names = new Set(["displayName", "shortDisplayName", "name"].map(function (k) { return team[k] || ""; }));
    var loc = team.location || "", nick = team.name || "";
    if (loc && nick && nick !== loc) names.add(loc + " " + nick);
    if (college || LOCATION_ALIAS_SPORTS[sport]) names.add(loc);
    var curated = new Set();
    names.forEach(function (n) { (EXTRA[norm(n)] || []).forEach(function (c) { curated.add(norm(c)); }); });
    var out = new Set();
    names.forEach(function (n) { if (n) variants(n).forEach(function (v) { out.add(v); }); });
    if (LOCATION_ALIAS_SPORTS[sport]) {
      Array.from(out).forEach(function (n) {
        var toks = n.split(" "), core = toks.filter(function (t) { return !CLUB_AFFIXES.has(t); });
        if (core.length && core.length !== toks.length) out.add(core.join(" "));
        if (core.length > 1 && core[0].length >= 5) out.add(core[0]);
      });
    }
    var res = new Set();
    out.forEach(function (n) { if (n.length > 3) res.add(n); });
    curated.forEach(function (c) { res.add(c); });
    return res;
  }

  function athleteAliases(a) {
    var names = new Set(["displayName", "fullName", "shortName"].map(function (k) { return a[k] || ""; }));
    var parts = norm(a.displayName || a.fullName || "").split(" ").filter(Boolean);
    if (parts.length >= 2) {
      names.add(parts[parts.length - 1]);
      names.add(parts[0][0] + " " + parts[parts.length - 1]);
      if (parts.length >= 3) names.add(parts.slice(-2).join(" "));
    }
    var res = new Set();
    names.forEach(function (n) { n = norm(n); if (n.length > 3) res.add(n); });
    return res;
  }

  function rosterAliases(r) {
    var out = new Set([norm(r.displayName), norm(r.shortDisplayName)]);
    var lasts = (r.athletes || []).filter(function (a) { return a.displayName; })
      .map(function (a) { var p = norm(a.displayName).split(" "); return p[p.length - 1]; });
    if (lasts.length === 2) out.add(lasts.join(" "));
    var res = new Set();
    out.forEach(function (n) { if (n.length > 3) res.add(n); });
    return res;
  }

  function competitorInfo(c, sport, college) {
    if (c.team) {
      var t = c.team;
      return [t.displayName || t.name || "?", teamAliases(t, sport, college), "team:" + (t.id || t.displayName)];
    }
    if (c.athlete) {
      var a = c.athlete;
      return [a.displayName || "?", athleteAliases(a), "ath:" + (c.id || a.displayName)];
    }
    if (c.roster) return [c.roster.displayName || "?", rosterAliases(c.roster), "pair:" + c.roster.displayName];
    return ["?", new Set(), "x:" + c.id];
  }

  // ---------------------------------------------------------------- time/tz

  function tzOffsetMs(ms, tz) {
    var f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
    var p = {};
    f.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = +x.value; });
    return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  }

  // Wall-clock time in tz -> UTC epoch ms (DST-safe to the hour).
  function zonedToUtc(y, mo, d, h, mi, tz) {
    var guess = Date.UTC(y, mo - 1, d, h, mi);
    var t = guess - tzOffsetMs(guess, tz);
    var off2 = tzOffsetMs(t, tz);
    return guess - off2;
  }

  function ymd(d) { return d.y + "-" + String(d.m).padStart(2, "0") + "-" + String(d.d).padStart(2, "0"); }
  function addDays(d, n) {
    var t = new Date(Date.UTC(d.y, d.m - 1, d.d + n));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  function todayIn(tz, nowMs) {
    var f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    var p = f.format(new Date(nowMs == null ? Date.now() : nowMs)).split("-");
    return { y: +p[0], m: +p[1], d: +p[2] };
  }
  function validDate(y, m, d) {
    var t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? { y: y, m: m, d: d } : null;
  }

  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  var RE_TIME = /\b(\d{1,2}):(\d{2})\s*([ap])\.?m?\.?(?![a-z])/i;
  var RE_TIME_G = /\b(\d{1,2}):(\d{2})\s*([ap])\.?m?\.?(?![a-z])/gi;
  var RE_DATE_LONG = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i;
  var RE_DATE_NUM = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;

  function yearFor(month, anchor) {
    var best = null, bestDiff = Infinity;
    [anchor.y - 1, anchor.y, anchor.y + 1].forEach(function (y) {
      var diff = Math.abs(Date.UTC(y, month - 1, 1) - Date.UTC(anchor.y, anchor.m - 1, 1));
      if (diff < bestDiff) { bestDiff = diff; best = y; }
    });
    return best;
  }

  function findDate(line, anchor) {
    var low = line.toLowerCase();
    if (/\btoday\b/.test(low)) return anchor;
    if (/\btomorrow\b/.test(low)) return addDays(anchor, 1);
    var m = RE_DATE_LONG.exec(line);
    if (m) {
      var mon = MONTHS[m[1].toLowerCase().slice(0, 3)], dd = +m[2];
      return validDate(m[3] ? +m[3] : yearFor(mon, anchor), mon, dd);
    }
    m = RE_DATE_NUM.exec(line);
    if (m) {
      var mo = +m[1], d = +m[2], yy = m[3];
      var y = yy ? (yy.length === 2 ? +yy + 2000 : +yy) : yearFor(mo, anchor);
      return mo >= 1 && mo <= 12 ? validDate(y, mo, d) : null;
    }
    return null;
  }

  function toHM(m) {
    var h = +m[1], mi = +m[2], ap = m[3].toLowerCase();
    if (!(h >= 1 && h <= 12 && mi < 60)) return null;
    return [h % 12 + (ap === "p" ? 12 : 0), mi];
  }
  function findTime(line) { var m = RE_TIME.exec(line); return m ? toHM(m) : null; }
  function allTimes(text) {
    var out = new Set(), m;
    RE_TIME_G.lastIndex = 0;
    while ((m = RE_TIME_G.exec(text))) { var t = toHM(m); if (t) out.add(t[0] * 60 + t[1]); }
    return out;
  }

  // Longest-first whole-word matches, so "boston celtics" wins over "celtics".
  function matchNames(text, names) {
    var t = " " + norm(text) + " ", found = [];
    for (var i = 0; i < names.length; i++) {
      var n = " " + names[i] + " ";
      if (t.indexOf(n) >= 0) { found.push(names[i]); t = t.split(n).join(" | "); }
    }
    return found;
  }

  function parseText(text, names, anchor, tz) {
    var curDate = anchor, curTime = null, out = [];
    text.split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      var d = findDate(line, anchor); if (d) curDate = d;
      var t = findTime(line); if (t) curTime = t;
      if (!curTime) return;
      var when = zonedToUtc(curDate.y, curDate.m, curDate.d, curTime[0], curTime[1], tz);
      matchNames(line, names).forEach(function (n) { out.push({ name: n, when: when }); });
    });
    return out;
  }

  // ------------------------------------------------------------- ESPN slate

  function parseIso(s) { return Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z"); }

  function gamesFromScoreboard(league, sb) {
    var sport = league.split("/")[0], college = league.indexOf("college") >= 0, games = [];
    (sb.events || []).forEach(function (ev) {
      var comps = (ev.competitions || []).slice();
      (ev.groupings || []).forEach(function (g) { comps = comps.concat(g.competitions || []); });
      comps.forEach(function (comp) {
        var cs = comp.competitors || [];
        if (cs.length !== 2) return;
        var bySide = {};
        cs.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); }).forEach(function (c, i) {
          var side = c.homeAway === "home" || c.homeAway === "away" ? c.homeAway : ["away", "home"][i];
          bySide[side] = c;
        });
        if (!bySide.home || !bySide.away) return;
        var info = { away: competitorInfo(bySide.away, sport, college), home: competitorInfo(bySide.home, sport, college) };
        var st = ((comp.status || ev.status || {}).type) || {};
        var h2h = NO_SUMMARY_SPORTS[sport] || (comp.neutralSite && sport !== "soccer");
        games.push({
          league: league, eventId: String(ev.id), compId: String(comp.id || ev.id),
          away: info.away[0], home: info.home[0],
          official: parseIso(comp.startDate || comp.date || ev.date),
          status: st.name || "", state: st.state || "",
          aliases: { away: info.away[1], home: info.home[1] },
          keys: { away: info.away[2], home: info.home[2] },
          sep: h2h ? "vs" : "@", timeValid: comp.timeValid !== false,
          actual: null, bolTimes: new Set(), bolSides: new Set(), rawAliases: null
        });
      });
    });
    return games;
  }

  function scoreboardUrl(league, day) {
    return ESPN + "/" + league + "/scoreboard?dates=" + ymd(day).replace(/-/g, "") + (SCOREBOARD_EXTRA[league] || "");
  }
  function summaryUrl(g) { return ESPN + "/" + g.league + "/summary?event=" + g.eventId; }

  // Remove aliases pointing at more than one competitor on the slate ("Santos", "LA").
  function dropAmbiguous(games) {
    var owners = new Map();
    games.forEach(function (g) {
      if (!g.rawAliases) g.rawAliases = { away: new Set(g.aliases.away), home: new Set(g.aliases.home) };
      ["away", "home"].forEach(function (side) {
        g.rawAliases[side].forEach(function (n) {
          if (!owners.has(n)) owners.set(n, new Set());
          owners.get(n).add(g.keys[side] || g.compId + ":" + side);
        });
      });
    });
    games.forEach(function (g) {
      ["away", "home"].forEach(function (side) {
        g.aliases[side] = new Set(Array.from(g.rawAliases[side]).filter(function (n) { return owners.get(n).size === 1; }));
      });
    });
  }

  function allNames(games) {
    var s = new Set();
    games.forEach(function (g) { g.aliases.away.forEach(function (n) { s.add(n); }); g.aliases.home.forEach(function (n) { s.add(n); }); });
    return Array.from(s).sort(function (a, b) { return b.length - a.length; });
  }

  // Earliest timestamped first-period event; soccer prefers the kickoff key event.
  function actualStart(summary) {
    var kick = (summary.keyEvents || []).filter(function (e) {
      return e.wallclock && ((e.type || {}).type === "kickoff");
    });
    if (kick.length) return Math.min.apply(null, kick.map(function (e) { return parseIso(e.wallclock); }));
    var items = (summary.plays || []).concat(summary.keyEvents || []);
    var drives = summary.drives;
    if (drives && !Array.isArray(drives)) {
      var groups = (drives.previous || []).slice();
      if (drives.current) groups.push(drives.current);
      groups.forEach(function (d) { items = items.concat(d.plays || []); });
    }
    var stamps = items.filter(function (p) {
      var per = p.period && p.period.number != null ? p.period.number : 1;
      return p.wallclock && per === 1;
    }).map(function (p) { return parseIso(p.wallclock); });
    return stamps.length ? Math.min.apply(null, stamps) : null;
  }

  function wantsActual(g) {
    if (NO_SUMMARY_SPORTS[g.league.split("/")[0]] || g.state === "pre") return false;
    return ["STATUS_POSTPONED", "STATUS_CANCELED", "STATUS_SCHEDULED"].indexOf(g.status) < 0;
  }

  // ---------------------------------------------------------------- compare

  var H12 = 12 * 3600 * 1000;

  // Give each sighting to that competitor's game nearest in time (within 12h); return the rest.
  function attach(games, sightings) {
    var left = [];
    sightings.forEach(function (s) {
      var best = null;
      games.forEach(function (g) {
        ["away", "home"].forEach(function (side) {
          if (!g.aliases[side].has(s.name)) return;
          var diff = Math.abs(s.when - g.official);
          if (diff <= H12 && (!best || diff < best.diff)) best = { g: g, side: side, diff: diff };
        });
      });
      if (best) { best.g.bolTimes.add(s.when); best.g.bolSides.add(best.side); } else left.push(s);
    });
    return left;
  }

  function flagsFor(g, opts) {
    var tol = opts && opts.tolerance != null ? opts.tolerance : 1;
    var late = opts && opts.lateTip != null ? opts.lateTip : 20;
    var times = Array.from(g.bolTimes);
    if (!times.length) return [];
    var f = [], bol = Math.min.apply(null, times), last = Math.max.apply(null, times);
    if (times.length > 1) f.push("MULTIPLE_LISTED");
    if (g.timeValid && Math.abs(bol - g.official) / 60000 >= tol) f.push("LISTED_TIME_MISMATCH");
    if (g.actual) {
      if (g.actual < last) f.push("LISTED_AFTER_TIP");
      if ((g.actual - bol) / 60000 > late) f.push("LATE_TIP");
    }
    return f;
  }

  // Leagues where some game had both sides sighted; a lone name hit is noise.
  function detectedLeagues(games) {
    var s = new Set();
    games.forEach(function (g) { if (g.bolSides.size === 2) s.add(g.league); });
    return Array.from(s).sort();
  }

  function resetMatches(games) {
    games.forEach(function (g) { g.bolTimes = new Set(); g.bolSides = new Set(); });
  }

  // Path words from a sportsbook URL -> candidate ESPN leagues (empty = scan everything).
  var SPORT_WORDS = {
    basketball: "basketball/", football: "football/", baseball: "baseball/", hockey: "hockey/",
    "ice-hockey": "hockey/", soccer: "soccer/", tennis: "tennis/", mma: "mma/",
    "martial-arts": "mma/", ufc: "mma/ufc", rugby: "rugby", "aussie-rules": "australian-football/",
    lacrosse: "lacrosse/", volleyball: "volleyball/"
  };
  var LEAGUE_WORDS = {
    nba: ["basketball/nba"], wnba: ["basketball/wnba"], nfl: ["football/nfl"], mlb: ["baseball/mlb"],
    nhl: ["hockey/nhl"], mls: ["soccer/usa.1"], cfl: ["football/cfl"], ufl: ["football/ufl"],
    "premier-league": ["soccer/eng.1"], epl: ["soccer/eng.1"], "champions-league": ["soccer/uefa.champions"],
    "europa-league": ["soccer/uefa.europa"], "la-liga": ["soccer/esp.1"], "serie-a": ["soccer/ita.1"],
    bundesliga: ["soccer/ger.1"], "ligue-1": ["soccer/fra.1"], "liga-mx": ["soccer/mex.1"],
    atp: ["tennis/atp"], wta: ["tennis/wta"], ufc: ["mma/ufc"], pfl: ["mma/pfl"], nrl: ["rugby-league/3"],
    afl: ["australian-football/afl"]
  };
  function leaguesForPath(path) {
    var words = String(path || "").toLowerCase().split(/[\/?#&=_.]+/).filter(Boolean);
    for (var i = 0; i < words.length; i++) if (LEAGUE_WORDS[words[i]]) return LEAGUE_WORDS[words[i]];
    var college = words.some(function (w) { return /ncaa|college/.test(w); });
    for (var j = 0; j < words.length; j++) {
      var pre = SPORT_WORDS[words[j]];
      if (!pre) continue;
      var c = ALL_LEAGUES.filter(function (l) { return l.indexOf(pre) === 0; });
      if (college) {
        var cc = c.filter(function (l) { return l.indexOf("college") >= 0; });
        if (cc.length) c = cc;
      }
      if (c.length) return c;
    }
    return [];
  }

  var api = {
    ESPN: ESPN, LEAGUE_ALIASES: LEAGUE_ALIASES, ALL_LEAGUES: ALL_LEAGUES, NO_SUMMARY_SPORTS: NO_SUMMARY_SPORTS,
    norm: norm, teamAliases: teamAliases, athleteAliases: athleteAliases,
    zonedToUtc: zonedToUtc, todayIn: todayIn, addDays: addDays, ymd: ymd,
    findDate: findDate, findTime: findTime, allTimes: allTimes, matchNames: matchNames, parseText: parseText,
    parseIso: parseIso, gamesFromScoreboard: gamesFromScoreboard, scoreboardUrl: scoreboardUrl,
    summaryUrl: summaryUrl, dropAmbiguous: dropAmbiguous, allNames: allNames, actualStart: actualStart,
    wantsActual: wantsActual, attach: attach, flagsFor: flagsFor, detectedLeagues: detectedLeagues,
    resetMatches: resetMatches, leaguesForPath: leaguesForPath
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BolCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

// Browser side: read the BetOnline page you are viewing, check it against ESPN, show results.
(function () {
  "use strict";
  var C = globalThis.BolCore;
  if (!C || window.top !== window.self || window.__bolStartCheck) return;
  window.__bolStartCheck = true;

  var VERSION = "1.0.0";
  var MIN_GAP_MS = 30 * 1000;          // never rescan more often than this
  var HISTORY_MAX = 600;
  var HISTORY_DAYS = 30;
  var FLAG_TEXT = {
    LISTED_TIME_MISMATCH: "Listed time differs from official",
    LISTED_AFTER_TIP: "Listed time is AFTER the actual start",
    LATE_TIP: "Started well after listed time",
    MULTIPLE_LISTED: "BetOnline shows more than one time"
  };

  // ------------------------------------------------------------- storage

  function load(key, dflt) {
    try {
      var v = typeof GM_getValue === "function" ? GM_getValue(key) : localStorage.getItem("bolsc." + key);
      if (v == null) return dflt;
      return typeof v === "string" ? JSON.parse(v) : v;
    } catch (e) { return dflt; }
  }
  function save(key, v) {
    try {
      var s = JSON.stringify(v);
      if (typeof GM_setValue === "function") GM_setValue(key, s); else localStorage.setItem("bolsc." + key, s);
    } catch (e) { /* storage full or blocked: keep running without persistence */ }
  }

  var browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  var settings = Object.assign({ tz: browserTz, tolerance: 1, lateTip: 20, notify: true, everyMin: 3 },
    load("settings", {}));
  var history = load("history", {});      // key -> entry
  var actuals = load("actuals", {});      // league|eventId -> epoch ms
  var detected = load("detected", {});    // path -> {leagues, at}
  var notified = load("notified", {});    // key|flag -> ms

  // --------------------------------------------------------------- fetch

  var memo = new Map();                   // url -> {at, data}
  function getJson(url) {
    return new Promise(function (resolve, reject) {
      if (typeof GM_xmlhttpRequest === "function") {
        GM_xmlhttpRequest({
          method: "GET", url: url, timeout: 30000,
          onload: function (r) {
            if (r.status !== 200) return reject(new Error("HTTP " + r.status));
            try { resolve(JSON.parse(r.responseText)); } catch (e) { reject(e); }
          },
          onerror: function () { reject(new Error("network error")); },
          ontimeout: function () { reject(new Error("timeout")); }
        });
      } else {
        fetch(url).then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        }).then(resolve, reject);
      }
    });
  }
  function cachedJson(url, ttlMs) {
    var hit = memo.get(url);
    if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.data);
    return getJson(url).then(function (d) { memo.set(url, { at: Date.now(), data: d }); return d; });
  }
  function pool(items, n, fn) {
    var i = 0, out = new Array(items.length);
    function next() {
      if (i >= items.length) return Promise.resolve();
      var k = i++;
      return Promise.resolve(fn(items[k])).then(function (v) { out[k] = v; }, function () { out[k] = null; }).then(next);
    }
    var runners = [];
    for (var j = 0; j < Math.min(n, items.length); j++) runners.push(next());
    return Promise.all(runners).then(function () { return out; });
  }

  // ------------------------------------------------------- page reading

  function slateDays(text, tz) {
    var today = C.todayIn(tz), seen = {}, days = [today];
    seen[C.ymd(today)] = 1;
    var lo = C.ymd(C.addDays(today, -1)), hi = C.ymd(C.addDays(today, 6));
    text.split("\n").forEach(function (line) {
      var d = line.length < 200 && C.findDate(line, today);
      if (d && !seen[C.ymd(d)] && C.ymd(d) >= lo && C.ymd(d) <= hi) { seen[C.ymd(d)] = 1; days.push(d); }
    });
    days.sort(function (a, b) { return C.ymd(a) < C.ymd(b) ? -1 : 1; });
    return days.slice(0, 4);
  }

  // Each competitor name on the page gets the start time of the smallest surrounding block
  // that shows exactly one time; failing that, the last time seen above it in the page.
  function extractSightings(root, names, anchor, tz) {
    var out = [], textCache = new WeakMap();
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentElement;
        if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|OPTION)$/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
        return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    function textOf(el) {
      if (!textCache.has(el)) textCache.set(el, el.innerText || el.textContent || "");
      return textCache.get(el);
    }
    var curDate = anchor, curTime = null, n;
    while ((n = walker.nextNode())) {
      var t = n.nodeValue;
      var d = C.findDate(t, anchor); if (d) curDate = d;
      var tm = C.findTime(t); if (tm) curTime = tm;
      var hits = C.matchNames(t, names);
      if (!hits.length) continue;
      var time = null, date = null, el = n.parentElement;
      for (var i = 0; el && i < 8; i++, el = el.parentElement) {
        var txt = textOf(el);
        if (txt.length > 800) break;
        var ts = C.allTimes(txt);
        if (ts.size === 1) {
          var v = ts.values().next().value;
          time = [Math.floor(v / 60), v % 60];
          date = C.findDate(txt, anchor);
          break;
        }
        if (ts.size > 1) break;
      }
      time = time || curTime;
      if (!time) continue;
      date = date || curDate;
      var when = C.zonedToUtc(date.y, date.m, date.d, time[0], time[1], tz);
      hits.forEach(function (h) { out.push({ name: h, when: when }); });
    }
    return out;
  }

  // -------------------------------------------------------------- scanning

  function loadSlate(leagues, days, tz) {
    var jobs = [];
    leagues.forEach(function (l) { days.forEach(function (d) { jobs.push([l, d]); }); });
    var today = C.ymd(C.todayIn(tz));
    return pool(jobs, 8, function (job) {
      var ttl = C.ymd(job[1]) >= today ? 5 * 60e3 : 60 * 60e3;
      return cachedJson(C.scoreboardUrl(job[0], job[1]), ttl).then(function (sb) {
        return C.gamesFromScoreboard(job[0], sb);
      });
    }).then(function (lists) {
      var first = days[0], last = C.addDays(days[days.length - 1], 1);
      var lo = C.zonedToUtc(first.y, first.m, first.d, 0, 0, tz) - 6 * 3600e3;
      var hi = C.zonedToUtc(last.y, last.m, last.d, 0, 0, tz) + 6 * 3600e3;
      var seen = {}, games = [];
      lists.forEach(function (gs) {
        (gs || []).forEach(function (g) {
          var k = g.league + "|" + g.compId;
          if (g.official >= lo && g.official <= hi && !seen[k]) { seen[k] = 1; games.push(g); }
        });
      });
      return games;
    });
  }

  function matchPage(games, days, tz) {
    C.resetMatches(games);
    C.dropAmbiguous(games);
    C.attach(games, extractSightings(document.body, C.allNames(games), days[0], tz));
  }

  function fillActuals(games) {
    var todo = games.filter(function (g) {
      if (!g.bolTimes.size) return false;
      var k = g.league + "|" + g.eventId;
      if (actuals[k]) { g.actual = actuals[k]; return false; }
      return C.wantsActual(g);
    });
    return pool(todo, 6, function (g) {
      return cachedJson(C.summaryUrl(g), 60e3).then(function (s) {
        g.actual = C.actualStart(s);
        if (g.actual) actuals[g.league + "|" + g.eventId] = g.actual;   // the first play never moves
      });
    });
  }

  // History games whose start has passed but whose actual start we haven't seen yet.
  function refreshHistoryActuals() {
    var now = Date.now();
    var todo = Object.keys(history).map(function (k) { return history[k]; }).filter(function (h) {
      return !h.actual && h.official < now - 5 * 60e3 && h.official > now - 3 * 86400e3 &&
        !C.NO_SUMMARY_SPORTS[h.league.split("/")[0]];
    }).slice(0, 20);
    return pool(todo, 4, function (h) {
      return cachedJson(C.ESPN + "/" + h.league + "/summary?event=" + h.eventId, 5 * 60e3).then(function (s) {
        var a = C.actualStart(s);
        if (a) { h.actual = a; actuals[h.league + "|" + h.eventId] = a; }
      });
    });
  }

  function entryFlags(h) {
    var g = { bolTimes: new Set(h.bolTimes), official: h.official, timeValid: h.timeValid, actual: h.actual };
    return C.flagsFor(g, settings);
  }

  function recordHistory(games) {
    var now = Date.now();
    games.forEach(function (g) {
      if (!g.bolTimes.size) return;
      var k = g.league + "|" + g.compId, h = history[k];
      if (!h) {
        h = history[k] = { league: g.league, eventId: g.eventId, compId: g.compId,
          matchup: g.away + " " + g.sep + " " + g.home, official: g.official, timeValid: g.timeValid,
          bolTimes: [], actual: null, firstSeen: now, page: location.href };
      }
      h.official = g.official;
      h.timeValid = g.timeValid;
      h.actual = g.actual || h.actual;
      h.lastSeen = now;
      g.bolTimes.forEach(function (t) { if (h.bolTimes.indexOf(t) < 0) h.bolTimes.push(t); });
      h.bolTimes.sort();
    });
    var cutoff = now - HISTORY_DAYS * 86400e3;
    var keys = Object.keys(history).filter(function (k) { return history[k].official >= cutoff; });
    keys.sort(function (a, b) { return history[b].official - history[a].official; });
    var trimmed = {};
    keys.slice(0, HISTORY_MAX).forEach(function (k) { trimmed[k] = history[k]; });
    history = trimmed;
    Object.keys(actuals).forEach(function (k) { if (actuals[k] < cutoff) delete actuals[k]; });
    Object.keys(notified).forEach(function (k) { if (notified[k] < cutoff) delete notified[k]; });
  }

  function notifyNew() {
    if (!settings.notify) return;
    Object.keys(history).forEach(function (k) {
      var h = history[k];
      entryFlags(h).forEach(function (f) {
        var nk = k + "|" + f;
        if (notified[nk]) return;
        notified[nk] = Date.now();
        var text = h.matchup + "\n" + FLAG_TEXT[f] + "\nBetOnline " + h.bolTimes.map(fmtTime).join(" / ") +
          " · official " + fmtTime(h.official) + (h.actual ? " · started " + fmtTime(h.actual, true) : "");
        if (typeof GM_notification === "function") {
          GM_notification({ title: "BetOnline start-time flag", text: text, timeout: 0 });
        }
      });
    });
  }

  var state = { games: [], leagues: [], at: null, status: "Starting…", busy: false };
  var lastScan = 0, queued = null;

  function scan() {
    if (state.busy) { schedule(5000); return Promise.resolve(); }
    state.busy = true;
    lastScan = Date.now();
    setStatus("Checking start times…");
    var tz = settings.tz;
    var text = document.body ? document.body.innerText : "";
    var days = slateDays(text, tz);
    var path = location.pathname + location.hash;
    var hinted = C.leaguesForPath(path);
    var mem = detected[path];
    var leagues = hinted.length ? hinted
      : (mem && mem.leagues.length && Date.now() - mem.at < 30 * 60e3 ? mem.leagues : C.ALL_LEAGUES);

    function attempt(ls) {
      return loadSlate(ls, days, tz).then(function (games) {
        matchPage(games, days, tz);
        var kept = C.detectedLeagues(games);
        if (!kept.length && ls !== C.ALL_LEAGUES) return attempt(C.ALL_LEAGUES);
        return { games: games, kept: kept };
      });
    }

    return attempt(leagues).then(function (r) {
      var keep = new Set(r.kept);
      var games = r.games.filter(function (g) { return keep.has(g.league); });
      matchPage(games, days, tz);
      detected[path] = { leagues: r.kept, at: Date.now() };
      return fillActuals(games).then(function () { return games; });
    }).then(function (games) {
      state.games = games.filter(function (g) { return g.bolTimes.size; });
      state.leagues = Array.from(new Set(state.games.map(function (g) { return g.league; }))).sort();
      state.at = Date.now();
      recordHistory(state.games);
      return refreshHistoryActuals();
    }).then(function () {
      notifyNew();
      save("history", history); save("actuals", actuals); save("detected", detected); save("notified", notified);
      var nflag = state.games.filter(function (g) { return C.flagsFor(g, settings).length; }).length;
      setStatus(state.games.length
        ? state.games.length + " BetOnline games checked · " + nflag + " flagged"
        : "No games on this page matched an ESPN schedule");
    }).catch(function (e) {
      setStatus("Error: " + (e && e.message || e));
    }).then(function () {
      state.busy = false;
      render();
    });
  }

  function schedule(delay) {
    var at = Math.max(Date.now() + delay, lastScan + MIN_GAP_MS);
    if (queued && queued.at <= at) return;
    if (queued) clearTimeout(queued.id);
    queued = { at: at, id: setTimeout(function () { queued = null; scan(); }, at - Date.now()) };
  }

  // ------------------------------------------------------------------ UI

  function fmtTime(ms, secs) {
    if (!ms) return "-";
    return new Date(ms).toLocaleString("en-US", { timeZone: settings.tz, month: "numeric", day: "numeric",
      hour: "numeric", minute: "2-digit", second: secs ? "2-digit" : undefined });
  }
  function fmtDelta(a, b) {
    if (a == null || b == null) return "-";
    var m = Math.round((a - b) / 60000);
    return (m > 0 ? "+" : m < 0 ? "−" : "±") + Math.abs(m) + "m";
  }
  function leagueLabel(l) {
    var hit = Object.keys(C.LEAGUE_ALIASES).find(function (k) { return C.LEAGUE_ALIASES[k] === l; });
    return (hit || l).toUpperCase();
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  var host = document.createElement("div");
  host.id = "bol-start-check";
  host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;";
  var shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = [
    "<style>",
    ":host{all:initial}",
    "*{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}",
    ".pill{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;border:0;cursor:pointer;",
    "font-size:13px;font-weight:600;color:#fff;background:#4b5563;box-shadow:0 4px 14px rgba(0,0,0,.3)}",
    ".pill.ok{background:#15803d}.pill.bad{background:#b91c1c}",
    ".panel{display:none;position:absolute;right:0;bottom:48px;width:min(760px,calc(100vw - 32px));max-height:70vh;",
    "overflow:auto;background:#fff;color:#111;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.35);font-size:13px}",
    ".panel.open{display:block}",
    "header{position:sticky;top:0;background:#111827;color:#fff;padding:10px 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
    "header b{font-size:14px;margin-right:auto}",
    "button.b{background:#374151;color:#fff;border:0;border-radius:6px;padding:5px 9px;font-size:12px;cursor:pointer}",
    "button.b.on{background:#2563eb}",
    ".status{padding:8px 14px;color:#374151;border-bottom:1px solid #e5e7eb}",
    "table{border-collapse:collapse;width:100%}",
    "th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #f0f0f0;vertical-align:top}",
    "th{font-size:11px;text-transform:uppercase;color:#6b7280;background:#f9fafb;position:sticky;top:44px}",
    "td:nth-child(n+2):nth-child(-n+6){white-space:nowrap}",
    "tr.flag td{background:#fef2f2}",
    ".tag{display:inline-block;margin:1px 0;padding:1px 6px;border-radius:4px;background:#b91c1c;color:#fff;font-size:11px}",
    ".muted{color:#6b7280}",
    ".settings{padding:12px 14px;display:none;gap:10px;flex-direction:column;border-bottom:1px solid #e5e7eb}",
    ".settings.open{display:flex}",
    ".settings label{display:flex;gap:8px;align-items:center}",
    ".settings input[type=number]{width:70px}",
    ".settings input,.settings select{font-size:13px;padding:3px}",
    ".empty{padding:18px 14px;color:#6b7280}",
    "@media (prefers-color-scheme:dark){.panel{background:#1f2937;color:#f3f4f6}th{background:#111827;color:#9ca3af}",
    "th,td{border-color:#374151}tr.flag td{background:#3f1d1d}.status,.empty,.muted{color:#9ca3af}.status,.settings{border-color:#374151}}",
    "</style>",
    "<div class='panel'>",
    "<header><b>BetOnline start-time check</b>",
    "<button class='b' data-tab='now'>This page</button><button class='b' data-tab='history'>History</button>",
    "<button class='b' data-act='rescan'>Rescan</button><button class='b' data-act='csv'>Export CSV</button>",
    "<button class='b' data-act='settings'>Settings</button><button class='b' data-act='close'>✕</button></header>",
    "<div class='settings'>",
    "<label>BetOnline shows times in <input name='tz' size='22'></label>",
    "<label>Flag listed≠official at <input type='number' name='tolerance' min='0'> min</label>",
    "<label>Flag start later than listed by <input type='number' name='lateTip' min='0'> min</label>",
    "<label>Auto-recheck every <input type='number' name='everyMin' min='1'> min</label>",
    "<label><input type='checkbox' name='notify'> Desktop alerts for new flags</label>",
    "<div><button class='b' data-act='save'>Save</button> <button class='b' data-act='copytext'>Copy page text (for troubleshooting)</button>",
    " <button class='b' data-act='clear'>Clear history</button> <span class='muted'>v" + VERSION + "</span></div>",
    "</div>",
    "<div class='status'></div><div class='body'></div></div>",
    "<button class='pill'>⏱ <span class='lbl'>Start check…</span></button>"
  ].join("");

  var $ = function (s) { return shadow.querySelector(s); };
  var tab = "now";

  function setStatus(s) { state.status = s; render(); }

  function rowHtml(r) {
    var flags = r.flags.map(function (f) { return "<span class='tag' title='" + esc(FLAG_TEXT[f]) + "'>" + esc(FLAG_TEXT[f]) + "</span>"; }).join("<br>");
    return "<tr class='" + (r.flags.length ? "flag" : "") + "'><td>" + esc(r.matchup) + "<div class='muted'>" + esc(leagueLabel(r.league)) +
      "</div></td><td>" + r.bolTimes.map(function (t) { return esc(fmtTime(t)); }).join("<br>") +
      "</td><td>" + esc(fmtTime(r.official)) + (r.timeValid ? "" : " <span class='muted'>(TBA)</span>") +
      "</td><td>" + esc(fmtTime(r.actual, true)) + "</td><td>" + fmtDelta(Math.min.apply(null, r.bolTimes), r.official) +
      "</td><td>" + fmtDelta(r.actual, Math.min.apply(null, r.bolTimes)) + "</td><td>" + (flags || "<span class='muted'>OK</span>") + "</td></tr>";
  }

  function currentRows() {
    return state.games.map(function (g) {
      return { league: g.league, matchup: g.away + " " + g.sep + " " + g.home, bolTimes: Array.from(g.bolTimes).sort(),
        official: g.official, timeValid: g.timeValid, actual: g.actual, flags: C.flagsFor(g, settings) };
    });
  }
  function historyRows() {
    return Object.keys(history).map(function (k) {
      var h = history[k];
      return { league: h.league, matchup: h.matchup, bolTimes: h.bolTimes, official: h.official,
        timeValid: h.timeValid, actual: h.actual, flags: entryFlags(h), firstSeen: h.firstSeen,
        lastSeen: h.lastSeen, page: h.page };
    });
  }
  function sortRows(rows) {
    return rows.sort(function (a, b) {
      return (b.flags.length > 0) - (a.flags.length > 0) || a.official - b.official;
    });
  }

  function render() {
    var flagged = state.games.filter(function (g) { return C.flagsFor(g, settings).length; }).length;
    var pill = $(".pill");
    pill.className = "pill" + (state.busy || !state.games.length ? "" : flagged ? " bad" : " ok");
    $(".lbl").textContent = state.busy ? "Checking…" : state.games.length
      ? (flagged ? flagged + " flagged" : "Start times OK") + " · " + state.games.length : "Start check";
    $(".status").textContent = state.status + (state.at ? " · " + new Date(state.at).toLocaleTimeString() : "") +
      (state.leagues.length && tab === "now" ? " · " + state.leagues.map(leagueLabel).join(", ") : "");
    shadow.querySelectorAll("[data-tab]").forEach(function (b) { b.classList.toggle("on", b.dataset.tab === tab); });
    var rows = sortRows(tab === "now" ? currentRows() : historyRows());
    $(".body").innerHTML = rows.length
      ? "<table><tr><th>Game</th><th>BetOnline</th><th>Official</th><th>Actual start</th><th>BOL vs off.</th><th>Start vs BOL</th><th>Flags</th></tr>" +
        rows.map(rowHtml).join("") + "</table>"
      : "<div class='empty'>" + (tab === "now"
        ? "Nothing matched yet. Open a BetOnline league page with games listed."
        : "No history yet. Games are logged as you browse BetOnline.") + "</div>";
  }

  function exportCsv() {
    var rows = sortRows(historyRows());
    var cols = ["league", "matchup", "betonline", "official", "actual_start", "bol_vs_official_min", "start_vs_bol_min", "flags", "first_seen", "last_seen", "page"];
    var q = function (v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var iso = function (ms) { return ms ? new Date(ms).toISOString() : ""; };
    var lines = [cols.join(",")].concat(rows.map(function (r) {
      var bol = Math.min.apply(null, r.bolTimes);
      return [r.league, r.matchup, r.bolTimes.map(iso).join(" / "), iso(r.official), iso(r.actual),
        Math.round((bol - r.official) / 60000), r.actual ? Math.round((r.actual - bol) / 60000) : "",
        r.flags.join(" "), iso(r.firstSeen), iso(r.lastSeen), r.page].map(q).join(",");
    }));
    var blob = new Blob([lines.join("\n")], { type: "text/csv" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "betonline-start-times-" + C.ymd(C.todayIn(settings.tz)) + ".csv";
    shadow.appendChild(a); a.click(); a.remove();
  }

  function fillSettings() {
    var f = $(".settings");
    f.querySelector("[name=tz]").value = settings.tz;
    f.querySelector("[name=tolerance]").value = settings.tolerance;
    f.querySelector("[name=lateTip]").value = settings.lateTip;
    f.querySelector("[name=everyMin]").value = settings.everyMin;
    f.querySelector("[name=notify]").checked = settings.notify;
  }

  shadow.addEventListener("click", function (e) {
    var t = e.target.closest("button");
    if (!t) return;
    if (t.classList.contains("pill")) { $(".panel").classList.toggle("open"); render(); return; }
    if (t.dataset.tab) { tab = t.dataset.tab; render(); return; }
    var act = t.dataset.act, f = $(".settings");
    if (act === "close") $(".panel").classList.remove("open");
    else if (act === "rescan") { lastScan = 0; scan(); }
    else if (act === "csv") exportCsv();
    else if (act === "settings") { fillSettings(); f.classList.toggle("open"); }
    else if (act === "save") {
      var tz = f.querySelector("[name=tz]").value.trim();
      try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch (err) { alert("Unknown time zone: " + tz); return; }
      settings = { tz: tz, tolerance: +f.querySelector("[name=tolerance]").value || 0,
        lateTip: +f.querySelector("[name=lateTip]").value || 20, everyMin: Math.max(1, +f.querySelector("[name=everyMin]").value || 3),
        notify: f.querySelector("[name=notify]").checked };
      save("settings", settings);
      f.classList.remove("open");
      restartTimer(); lastScan = 0; scan();
    } else if (act === "copytext") {
      var dump = location.href + "\n\n" + document.body.innerText;
      navigator.clipboard.writeText(dump).then(function () { t.textContent = "Copied"; });
    } else if (act === "clear") {
      if (confirm("Clear the start-time history?")) { history = {}; notified = {}; save("history", history); save("notified", notified); render(); }
    }
  });

  // ------------------------------------------------------------ triggers

  var timer = null;
  function restartTimer() {
    if (timer) clearInterval(timer);
    timer = setInterval(function () { schedule(0); }, settings.everyMin * 60e3);
  }

  function start() {
    document.documentElement.appendChild(host);
    render();
    schedule(2500);
    restartTimer();
    new MutationObserver(function () { schedule(4000); })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
    var href = location.href;
    setInterval(function () {                 // single-page app navigation
      if (location.href !== href) { href = location.href; lastScan = 0; schedule(2500); }
    }, 1000);
    if (typeof GM_registerMenuCommand === "function") {
      GM_registerMenuCommand("Recheck start times now", function () { lastScan = 0; scan(); });
    }
  }

  window.__bolStartCheckApi = { scan: scan, state: state, extractSightings: extractSightings };
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();
