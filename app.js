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
