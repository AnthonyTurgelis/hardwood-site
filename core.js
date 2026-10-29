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
