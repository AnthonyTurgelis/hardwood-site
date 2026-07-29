/* hardwood.js — shared PUBLIC status chrome for every board tab (BOARD-V2, directives #3/#5/#6/#7/#9).
 *
 * ONE small self-contained script, loaded by every page. It owns the top-of-page status strip:
 *   (i)  "Data updated: HH:MM (Xm ago)"     — from status.json's OWN baked generated timestamp
 *   (ii) "Checked for updates: Xs ago"       — the 60s background poll of status.json
 *   pipe health  "directives: N pending, last processed HH:MM"  (or UNKNOWN + the reason)
 *   scout heartbeat  "scout: alive, last poll Xs ago"
 *   pause state  TWO DISTINCT states — SELF-PAUSE (we filed it) vs PROVIDER LIMIT (they refused us)
 *   idle-beacon banner  three DISTINCT states: normal (hidden) / NEEDS DIRECTOR / paused
 *
 * NEVER-BLANK (P0-F8): every field renders a DEFINITE state. Unreadable publishes
 * "UNKNOWN — <reason>", never an empty slot and never a stale value presented as current. The
 * coordinator pill proved this pattern; every other field now follows it.
 *
 * It ALSO ticks every element with class "hw-stamp" and a data-utc attribute into a muted
 * "HH:MM . Xm ago" per-card timestamp, so every page gets per-card times for free.
 *
 * DISCIPLINE: same-origin fetch of ./status.json ONLY. No DB, no framework, no CDN, no secrets.
 * The poll is NON-DISRUPTIVE — it only rewrites the strip's own nodes; it never touches #main,
 * never scrolls, never collapses the reader's section.
 */
(function () {
  "use strict";
  var STATUS_URL = "./status.json";
  var lastFetch = 0;          // ms epoch of last status.json poll
  var genIso = null;          // status.json generated_utc (timer i basis)
  var status = null;

  // ---- tiny helpers ----
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function clockOf(iso) {
    // "2026-07-09T18:20:00Z" -> "18:20" in the viewer's local time (falls back to UTC HH:MM)
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function agoOf(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return agoSecs(Math.round((Date.now() - d.getTime()) / 1000));
  }
  function agoSecs(s) {
    s = Math.max(0, s);
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h " + (Math.floor((s % 3600) / 60)) + "m ago";
    return Math.floor(s / 86400) + "d ago";
  }

  // ---- strip DOM (built once, injected right after <nav>) ----
  function injectStyle() {
    if (document.getElementById("hw-style")) return;
    var css =
      "#hwstrip{max-width:1080px;margin:6px auto 0;padding:0 14px;font:11.5px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}" +
      "#hwbanner{display:none;border-radius:8px;padding:6px 11px;margin-bottom:6px;font-weight:650;font-size:12.5px}" +
      "#hwbanner.needs{display:block;background:#fbe9e7;color:#b3261e;border:1px solid #f3b6ae}" +
      "#hwbanner.paused{display:block;background:#fff4e2;color:#9a6700;border:1px solid #f0d9a8}" +
      "#hwpause{display:none;border-radius:8px;padding:6px 11px;margin-bottom:6px;font-weight:650;font-size:12.5px}" +
      "#hwpause.selfpause{display:block;background:#fff4e2;color:#9a6700;border:1px solid #f0d9a8}" +
      "#hwpause.provider{display:block;background:#fbe9e7;color:#b3261e;border:1px solid #f3b6ae}" +
      "#hwpause.unknownstate{display:block;background:#fbe9e7;color:#b3261e;border:1px dashed #f3b6ae}" +
      "@media (prefers-color-scheme:dark){#hwbanner.needs{background:#3a1512;color:#ff8a80;border-color:#7a271f}" +
      "#hwbanner.paused{background:#332708;color:#e3b341;border-color:#6b530f}" +
      "#hwpause.selfpause{background:#332708;color:#e3b341;border-color:#6b530f}" +
      "#hwpause.provider,#hwpause.unknownstate{background:#3a1512;color:#ff8a80;border-color:#7a271f}}" +
      "#hwbar{display:flex;flex-wrap:wrap;gap:5px;align-items:center}" +
      ".hwpill{display:inline-flex;align-items:center;gap:4px;border:1px solid #d9dee7;background:#fff;color:#5a6675;" +
      "border-radius:999px;padding:2px 9px;white-space:nowrap}" +
      ".hwpill b{color:#16181d;font-variant-numeric:tabular-nums;font-weight:640}" +
      ".hwpill.live b{color:#1f883d}" +
      ".hwpill .dot{width:6px;height:6px;border-radius:50%;background:#8a93a3}" +
      ".hwpill.ok .dot{background:#1f883d}.hwpill.warn .dot{background:#c62828}" +
      ".hw-stamp{font-size:10.5px;color:#8a93a3;font-variant-numeric:tabular-nums;white-space:nowrap}" +
      "@media (prefers-color-scheme:dark){.hwpill{background:#161b22;border-color:#2a3340;color:#9aa7b4}" +
      ".hwpill b{color:#e6edf3}.hwpill.live b{color:#3fb950}.hwpill.ok .dot{background:#3fb950}" +
      ".hwpill.warn .dot{background:#ff7b72}.hw-stamp{color:#6b7684}}";
    var st = document.createElement("style");
    st.id = "hw-style"; st.textContent = css;
    document.head.appendChild(st);
  }

  function mount() {
    injectStyle();
    var nav = document.querySelector("nav");
    if (!nav || document.getElementById("hwstrip")) return;
    var strip = document.createElement("div");
    strip.id = "hwstrip";
    strip.innerHTML =
      '<div id="hwbanner"></div>' +
      '<div id="hwpause"></div>' +
      '<div id="hwbar">' +
      '  <span class="hwpill live" id="hw-data" title="When the site data was last rebaked">Data updated: <b>—</b></span>' +
      '  <span class="hwpill" id="hw-poll" title="When your browser last checked for a fresh copy">Checked for updates: <b>—</b></span>' +
      '  <span class="hwpill" id="hw-pipe" title="Director directives waiting / last one processed">directives: <b>—</b></span>' +
      '  <span class="hwpill" id="hw-scout" title="The 24/7 directive watcher liveness"><span class="dot"></span><span class="txt">scout: starting</span></span>' +
      '  <span class="hwpill" id="hw-coord" title="The work coordinator (the chair that runs the session)"><span class="dot"></span><span class="txt">coordinator: —</span></span>' +
      '  <span class="hwpill" id="hw-pause" title="Usage/pause state: SELF-PAUSE (we stopped ourselves) vs PROVIDER LIMIT (the provider stopped us)"><span class="dot"></span><span class="txt">usage: —</span></span>' +
      '</div>';
    nav.parentNode.insertBefore(strip, nav.nextSibling);
    // legacy per-page ".ago" chip is now redundant with the two-timer strip — hide it
    var legacy = document.getElementById("ago");
    if (legacy) legacy.style.display = "none";
  }

  // ---- render the strip from the latest status payload ----
  function renderStrip() {
    var dataP = document.querySelector("#hw-data b");
    if (dataP) {
      var c = clockOf(genIso), a = agoOf(genIso);
      dataP.textContent = genIso ? (c + " (" + a + ")") : "—";
    }
    var pollP = document.querySelector("#hw-poll b");
    if (pollP) pollP.textContent = lastFetch ? agoSecs(Math.round((Date.now() - lastFetch) / 1000)) : "—";

    if (status) {
      var pipeP = document.querySelector("#hw-pipe b");
      if (pipeP) pipeP.textContent = pipeView(status.pipe_health).text;
      var sc = status.scout || {};
      var scoutPill = document.getElementById("hw-scout");
      if (scoutPill) {
        scoutPill.className = "hwpill " + (sc.alive ? "ok" : "warn");
        var txt = scoutPill.querySelector(".txt");
        if (txt) {
          txt.textContent = sc.alive
            ? ("scout: alive" + (sc.age_s != null ? ", last poll " + sc.age_s + "s ago" : ""))
            : (sc.label || "scout: starting");
        }
      }
      // COORDINATOR pill (CEO P0b 20260725) — the chair NEVER renders blank. A missing/empty
      // coordinator object, an UNKNOWN state, or alive:false all render LOUD RED (warn), never a
      // silent gap that reads as 'nothing here'. Distinguishes ALIVE / DEAD / UNKNOWN explicitly.
      renderCoordinator(status.coordinator);
      renderPause(status.pause);
      renderBanner(status.beacon || {});
    }
  }

  function fmtAge(s) { return (s == null) ? "unknown" : agoSecs(s); }

  // ---- PIPE (never-blank): a missing/unknown "last processed" says UNKNOWN + WHY, never "" ----
  // The stamp used to render blank-or-frozen: the builder read two retired sources, so the board
  // showed a July 9 clock as current for twenty days. The payload now carries an explicit
  // last_processed_known + last_processed_display; we render the honest string, never a bare clock.
  function pipeView(ph) {
    if (!ph || typeof ph !== "object") {
      return { text: "UNKNOWN — status unreadable", known: false };
    }
    var n = (ph.directives_pending == null) ? 0 : ph.directives_pending;
    var head = (n === 0 ? "none pending" : (n + " pending"));
    var known = (ph.last_processed_known === true) ||
                (ph.last_processed_known == null && !!ph.last_processed_clock);
    if (known && ph.last_processed_clock) {
      return { text: head + ", last processed " + ph.last_processed_clock, known: true };
    }
    var why = ph.last_processed_display || ("unknown" + (ph.reason ? " — " + ph.reason : ""));
    return { text: head + ", last processed " + why, known: false };
  }

  // ---- PAUSE: SELF-PAUSE and PROVIDER LIMIT are two DISTINCT states, never one "usage pause" ----
  // SELF-PAUSE  = we filed ops/PAUSED_UNTIL.json.  Remedy: ack.py --resume. Show who + when.
  // PROVIDER LIMIT = the provider actually refused/limited us. Remedy: wait for the verified reset.
  // The live percent rides along WITH ITS QUALITY — an unmeasured percent renders "unknown (not
  // measured)", never a confident number.
  function pctPhrase(pc) {
    if (!pc || typeof pc !== "object") return "usage unknown (no reading)";
    var q = (pc.quality || "UNKNOWN").toUpperCase();
    if (q === "UNKNOWN") {
      return "usage unknown" + (pc.reason ? " (" + pc.reason + ")" : " (not measured)") +
             (pc.last_known_display ? " · last known " + pc.last_known_display : "");
    }
    return "usage " + (pc.display || "?") + " (" + q.toLowerCase() + ")";
  }

  // The PILL is a one-line chip — carry the state + the qualified number, and leave the full
  // reason/last-known detail to the banner. Still never a bare unqualified number.
  function pctShort(pc) {
    if (!pc || typeof pc !== "object") return "usage unknown";
    var q = (pc.quality || "UNKNOWN").toUpperCase();
    if (q === "UNKNOWN") return "usage unknown (not measured)";
    return "usage " + (pc.display || "?") + " (" + q.toLowerCase() + ")";
  }

  function pauseView(p) {
    // NEVER-BLANK: a missing/garbled pause object is itself the UNKNOWN state.
    if (!p || typeof p !== "object") {
      return { state: "UNKNOWN", pillCls: "hwpill warn", bannerCls: "unknownstate",
               pill: "usage: UNKNOWN — status unreadable",
               banner: "⚠ PAUSE STATE UNKNOWN — the status source could not be read." };
    }
    var st = (p.state || "UNKNOWN").toUpperCase();
    var sp = p.self_pause || {}, pl = p.provider_limit || {}, pc = p.percent || {};
    var pct = pctPhrase(pc), pctp = pctShort(pc);
    if (st === "PROVIDER_LIMIT") {
      var ev = (pl.evidence && pl.evidence.length) ? pl.evidence.join("; ") : "provider refusal on record";
      var reset = pl.resets_known && pl.resets_clock
        ? ("resets " + pl.resets_clock)
        : "reset time NOT reported by the provider";
      return { state: st, pillCls: "hwpill warn", bannerCls: "provider",
               pill: "PROVIDER LIMIT — " + pctp,
               banner: "⛔ PROVIDER LIMIT — the provider limited us (" + ev + "). " + pct +
                       ". " + reset + ". Remedy: " + (pl.remedy || "wait for the verified reset") + "." };
    }
    if (st === "SELF_PAUSE") {
      var who = sp.filed_by && sp.filed_by !== "unknown" ? sp.filed_by : "filer not recorded";
      var when = sp.filed_clock ? sp.filed_clock : "time not recorded";
      var kind = sp.kind && sp.kind !== "none" ? sp.kind : "unspecified kind";
      return { state: st, pillCls: "hwpill warn", bannerCls: "selfpause",
               pill: "SELF-PAUSE — " + pctp,
               banner: "⏸ SELF-PAUSE — WE filed this pause (" + kind + "), filed " + when +
                       " by " + who + (sp.reason ? " · " + sp.reason : "") + ". " + pct +
                       ". Remedy: " + (sp.remedy || "python ops/scout/ack.py --resume") + "." };
    }
    if (st === "NORMAL") {
      var q = (pc.quality || "UNKNOWN").toUpperCase();
      return { state: st, pillCls: "hwpill " + (q === "MEASURED" ? "ok" : (q === "UNKNOWN" ? "warn" : "")),
               bannerCls: "", pill: "no pause · " + pctp, banner: "" };
    }
    return { state: "UNKNOWN", pillCls: "hwpill warn", bannerCls: "unknownstate",
             pill: "usage: UNKNOWN — " + (p.label || "pause state unreadable"),
             banner: "⚠ PAUSE STATE UNKNOWN — " + (p.label || "the pause flag could not be read") +
                     ". " + pct + "." };
  }

  function renderPause(p) {
    var v = pauseView(p);
    var pill = document.getElementById("hw-pause");
    if (pill) {
      pill.className = v.pillCls;
      var txt = pill.querySelector(".txt");
      if (txt) txt.textContent = v.pill;
    }
    var banner = document.getElementById("hwpause");
    if (banner) {
      banner.className = v.bannerCls;   // "" hides it (NORMAL)
      banner.textContent = v.banner;
    }
  }

  function renderCoordinator(co) {
    var pill = document.getElementById("hw-coord");
    if (!pill) return;
    var txt = pill.querySelector(".txt");
    // NEVER-BLANK: a missing/empty object is itself the UNKNOWN case, not an excuse to render "—".
    if (!co || typeof co !== "object") {
      pill.className = "hwpill warn";
      if (txt) txt.textContent = "coordinator: UNKNOWN — status unreadable";
      return;
    }
    var state = (co.state || (co.alive ? "ALIVE" : (co.known === false ? "UNKNOWN" : "DEAD"))).toUpperCase();
    if (state === "ALIVE" && co.alive) {
      pill.className = "hwpill ok";
      if (txt) txt.textContent = "coordinator: alive" +
        (co.session_age_secs != null ? " (up " + agoSecs(co.session_age_secs).replace(" ago", "") + ")" : "");
    } else if (state === "UNKNOWN" || co.known === false) {
      pill.className = "hwpill warn";
      if (txt) txt.textContent = "coordinator: UNKNOWN — " + (co.reason || "source unreadable");
    } else {
      // confidently DEAD: loud, but honest about what we DO know (last progress / spawn / block).
      pill.className = "hwpill warn";
      var extra = "no progress for " + fmtAge(co.last_progress_age_secs);
      if (co.blocked_reason) extra += " · " + co.blocked_reason;
      else if (co.last_spawn_attempt) extra += " · respawn attempted";
      if (txt) txt.textContent = "coordinator: DOWN — " + extra;
    }
  }

  // ---- STALENESS: the page's own 300s contract, enforced here. `stale_after_secs` is published
  // BY the baker (bake_status) so the threshold and this banner can never drift apart. A MISSING
  // threshold now falls back to the same 300s contract (the old 86400s fallback meant a payload
  // without the field could sit a whole day stale in silence). Age is measured against the payload's
  // own generated_utc, so a page that stops being republished goes loud on its own clock.
  var STALE_DEFAULT_SECS = 300;
  function staleView(genIsoStr, staleAfterSecs, nowMs) {
    var thresh = (typeof staleAfterSecs === "number" && staleAfterSecs > 0)
      ? staleAfterSecs : STALE_DEFAULT_SECS;
    if (!genIsoStr) {
      return { stale: true, age: null, thresh: thresh,
               text: "⚠ The site data has no publish timestamp — freshness UNKNOWN." };
    }
    var t = new Date(genIsoStr).getTime();
    if (isNaN(t)) {
      return { stale: true, age: null, thresh: thresh,
               text: "⚠ The site data's publish timestamp is unreadable — freshness UNKNOWN." };
    }
    var age = Math.round((nowMs - t) / 1000);
    if (age <= thresh) return { stale: false, age: age, thresh: thresh, text: "" };
    return { stale: true, age: age, thresh: thresh,
             text: "⚠ The site data hasn't refreshed in " + agoSecs(age) +
                   " (expected < " + Math.round(thresh / 60) + "m). The data shown is STALE." };
  }

  function renderBanner(b) {
    var banner = document.getElementById("hwbanner");
    if (!banner) return;

    var sv = staleView(genIso, status ? status.stale_after_secs : null, Date.now());
    var isStale = sv.stale;
    var age = sv.age;

    var state = (b.state || "active").toLowerCase();

    if (isStale) {
      banner.className = "needs";
      banner.style.borderLeft = "3px solid #d29922";
      banner.textContent = sv.text;
    } else if (state === "idle") {
      banner.className = "needs";
      banner.style.borderLeft = "";
      banner.textContent = "⏸ NEEDS DIRECTOR — idle since " + (b.idle_since_clock || "recently") +
        (b.note ? " · " + b.note : "");
    } else if (state === "paused") {
      banner.className = "paused";
      banner.style.borderLeft = "";
      banner.textContent = "⏳ paused — usage resets " + (b.usage_resets_clock || "soon") +
        (b.note ? " · " + b.note : "");
    } else {
      banner.className = "";
      banner.style.borderLeft = "";
      banner.textContent = "";
    }
  }

  // ---- per-card stamps: any .hw-stamp[data-utc] -> "HH:MM . Xm ago" ----
  function tickStamps() {
    var nodes = document.querySelectorAll(".hw-stamp[data-utc]");
    for (var i = 0; i < nodes.length; i++) {
      var iso = nodes[i].getAttribute("data-utc");
      var c = clockOf(iso);
      if (!c) { nodes[i].textContent = nodes[i].getAttribute("data-fallback") || ""; continue; }
      nodes[i].textContent = c + " · " + agoOf(iso);
    }
  }

  // ---- non-disruptive poll of status.json (strip only; never touches #main) ----
  function poll() {
    fetch(STATUS_URL, { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        lastFetch = Date.now();
        if (s) { status = s; genIso = s.generated_utc || genIso; }
        renderStrip();
      })
      .catch(function () { /* keep last-known strip; the per-page board still polls its own JSON */ });
  }

  function tick() { renderStrip(); tickStamps(); }

  function start() {
    mount();
    poll();
    setInterval(poll, 60000);
    setInterval(tick, 1000);
    tick();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  // expose a couple of helpers for pages that want to build stamps inline
  window.Hardwood = {
    stamp: function (iso, fallback) {
      var s = document.createElement("span");
      s.className = "hw-stamp";
      if (iso) s.setAttribute("data-utc", iso);
      if (fallback) s.setAttribute("data-fallback", fallback);
      s.textContent = fallback || "";
      return s;
    },
    clockOf: clockOf,
    agoOf: agoOf,
    // PURE view functions, exported so the test suite exercises THE SHIPPED CODE (not a copy):
    // tests/test_status_page_states.py drives these through node with a stub DOM.
    _pipeView: pipeView,
    _pauseView: pauseView,
    _staleView: staleView
  };
})();
