/* hardwood.js — shared PUBLIC status chrome for every board tab (BOARD-V2, directives #3/#5/#6/#7/#9).
 *
 * ONE small self-contained script, loaded by every page. It owns the top-of-page status strip:
 *   (i)  "Data updated: HH:MM (Xm ago)"     — from status.json's OWN baked generated timestamp
 *   (ii) "Checked for updates: Xs ago"       — the 60s background poll of status.json
 *   pipe health  "directives: N pending, last processed HH:MM"
 *   scout heartbeat  "scout: alive, last poll Xs ago"
 *   idle-beacon banner  three DISTINCT states: normal (hidden) / NEEDS DIRECTOR / paused
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
      "@media (prefers-color-scheme:dark){#hwbanner.needs{background:#3a1512;color:#ff8a80;border-color:#7a271f}" +
      "#hwbanner.paused{background:#332708;color:#e3b341;border-color:#6b530f}}" +
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
      '<div id="hwbar">' +
      '  <span class="hwpill live" id="hw-data" title="When the site data was last rebaked">Data updated: <b>—</b></span>' +
      '  <span class="hwpill" id="hw-poll" title="When your browser last checked for a fresh copy">Checked for updates: <b>—</b></span>' +
      '  <span class="hwpill" id="hw-pipe" title="Director directives waiting / last one processed">directives: <b>—</b></span>' +
      '  <span class="hwpill" id="hw-scout" title="The 24/7 directive watcher liveness"><span class="dot"></span><span class="txt">scout: starting</span></span>' +
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
      var ph = status.pipe_health || {};
      var pipeP = document.querySelector("#hw-pipe b");
      if (pipeP) {
        var n = (ph.directives_pending == null) ? 0 : ph.directives_pending;
        var lp = ph.last_processed_clock ? (", last processed " + ph.last_processed_clock) : "";
        pipeP.textContent = (n === 0 ? "none pending" : (n + " pending")) + lp;
      }
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
      renderBanner(status.beacon || {});
    }
  }

  function renderBanner(b) {
    var banner = document.getElementById("hwbanner");
    if (!banner) return;
    var state = (b.state || "active").toLowerCase();
    if (state === "idle") {
      banner.className = "needs";
      banner.textContent = "⏸ NEEDS DIRECTOR — idle since " + (b.idle_since_clock || "recently") +
        (b.note ? " · " + b.note : "");
    } else if (state === "paused") {
      banner.className = "paused";
      banner.textContent = "⏳ paused — usage resets " + (b.usage_resets_clock || "soon") +
        (b.note ? " · " + b.note : "");
    } else {
      banner.className = "";
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
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status + " fetching " + STATUS_URL);
        return r.json();
      })
      .then(function (s) {
        lastFetch = Date.now();
        if (s) { status = s; genIso = s.generated_utc || genIso; }
        renderStrip();
      })
      .catch(function (e) {
        // keep last-known strip; the per-page board still polls its own JSON.
        // surface the failure to the console so a broken status pipe isn't invisible.
        console.warn("hardwood status poll failed:", e);
      });
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
    agoOf: agoOf
  };
})();
