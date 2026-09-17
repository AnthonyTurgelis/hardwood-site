"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadHardwood, DEFAULT_HTML } = require("./helpers/loadHardwood");

// ISO for a moment `sec` seconds in the past, so ago-formatters are deterministic.
function isoAgo(sec) {
  return new Date(Date.now() - sec * 1000).toISOString();
}

// A realistic status.json payload (mirrors the shape shipped in the repo).
function baseStatus(overrides) {
  const s = {
    generated_utc: "2026-07-11T16:57:55+00:00",
    pipe_health: {
      directives_pending: 0,
      last_processed_clock: "9:37pm",
    },
    scout: { alive: true, age_s: 45, label: "scout: alive, last poll 45s ago" },
    beacon: { state: "active", idle_since_clock: "", usage_resets_clock: "", note: "" },
  };
  return Object.assign(s, overrides || {});
}

test("window.Hardwood exposes the public helpers", async () => {
  const { Hardwood } = await loadHardwood();
  assert.equal(typeof Hardwood.clockOf, "function");
  assert.equal(typeof Hardwood.agoOf, "function");
  assert.equal(typeof Hardwood.stamp, "function");
});

test("clockOf formats an ISO timestamp as zero-padded HH:MM", async () => {
  const { Hardwood, window } = await loadHardwood();
  const iso = "2026-07-09T18:05:00Z";
  const d = new window.Date(iso);
  const expected =
    String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  assert.equal(Hardwood.clockOf(iso), expected);
});

test("clockOf returns empty string for missing/invalid input", async () => {
  const { Hardwood } = await loadHardwood();
  assert.equal(Hardwood.clockOf(""), "");
  assert.equal(Hardwood.clockOf(null), "");
  assert.equal(Hardwood.clockOf("not-a-date"), "");
});

test("agoOf returns empty string for missing/invalid input", async () => {
  const { Hardwood } = await loadHardwood();
  assert.equal(Hardwood.agoOf(""), "");
  assert.equal(Hardwood.agoOf("nonsense"), "");
});

test("agoOf renders seconds / minutes / hours / days buckets", async () => {
  const { Hardwood } = await loadHardwood();
  assert.equal(Hardwood.agoOf(isoAgo(5)), "5s ago");
  assert.equal(Hardwood.agoOf(isoAgo(125)), "2m ago");
  assert.equal(Hardwood.agoOf(isoAgo(2 * 3600 + 5 * 60)), "2h 5m ago");
  assert.equal(Hardwood.agoOf(isoAgo(3 * 86400 + 500)), "3d ago");
});

test("agoOf clamps future timestamps to 0s ago", async () => {
  const { Hardwood } = await loadHardwood();
  assert.equal(Hardwood.agoOf(isoAgo(-30)), "0s ago");
});

test("stamp builds a .hw-stamp span with data-utc and fallback text", async () => {
  const { Hardwood } = await loadHardwood();
  const s = Hardwood.stamp("2026-07-11T16:57:55Z", "just now");
  assert.equal(s.className, "hw-stamp");
  assert.equal(s.getAttribute("data-utc"), "2026-07-11T16:57:55Z");
  assert.equal(s.getAttribute("data-fallback"), "just now");
  assert.equal(s.textContent, "just now");
});

test("stamp without an ISO omits data-utc and has empty text", async () => {
  const { Hardwood } = await loadHardwood();
  const s = Hardwood.stamp();
  assert.equal(s.className, "hw-stamp");
  assert.equal(s.hasAttribute("data-utc"), false);
  assert.equal(s.textContent, "");
});

test("mount injects the status strip right after <nav> and hides legacy #ago", async () => {
  const html =
    '<!doctype html><html><head></head><body><nav>nav</nav><span id="ago">old</span></body></html>';
  const { document } = await loadHardwood({ html });
  const strip = document.getElementById("hwstrip");
  assert.ok(strip, "#hwstrip should be mounted");
  const nav = document.querySelector("nav");
  assert.equal(nav.nextSibling, strip, "strip is inserted immediately after nav");
  assert.ok(document.getElementById("hwbar"));
  assert.ok(document.getElementById("hwbanner"));
  assert.ok(document.getElementById("hw-data"));
  assert.equal(document.getElementById("ago").style.display, "none");
});

test("mount injects the shared <style> exactly once", async () => {
  const { document } = await loadHardwood();
  assert.equal(document.querySelectorAll("#hw-style").length, 1);
});

test("no strip is mounted on a page without a <nav>", async () => {
  const html = "<!doctype html><html><head></head><body><main>x</main></body></html>";
  const { document } = await loadHardwood({ html });
  assert.equal(document.getElementById("hwstrip"), null);
});

test("renderStrip fills the data pill with clock + ago from generated_utc", async () => {
  const { document, flush } = await loadHardwood({ status: baseStatus() });
  await flush();
  const text = document.querySelector("#hw-data b").textContent;
  assert.match(text, /^\d{2}:\d{2} \(.+ ago\)$/);
});

test("renderStrip fills the poll pill once a fetch has completed", async () => {
  const { document, flush } = await loadHardwood({ status: baseStatus() });
  await flush();
  assert.equal(document.querySelector("#hw-poll b").textContent, "0s ago");
});

test("pipe pill shows 'none pending' with last-processed clock", async () => {
  const { document, flush } = await loadHardwood({ status: baseStatus() });
  await flush();
  assert.equal(
    document.querySelector("#hw-pipe b").textContent,
    "none pending, last processed 9:37pm"
  );
});

test("pipe pill shows a pending count when directives are queued", async () => {
  const status = baseStatus({
    pipe_health: { directives_pending: 3, last_processed_clock: "" },
  });
  const { document, flush } = await loadHardwood({ status });
  await flush();
  assert.equal(document.querySelector("#hw-pipe b").textContent, "3 pending");
});

test("scout pill goes ok/alive with the last-poll age", async () => {
  const { document, flush } = await loadHardwood({ status: baseStatus() });
  await flush();
  const pill = document.getElementById("hw-scout");
  assert.equal(pill.className, "hwpill ok");
  assert.equal(pill.querySelector(".txt").textContent, "scout: alive, last poll 45s ago");
});

test("pipe pill treats a null directives_pending as none pending", async () => {
  const status = baseStatus({ pipe_health: { last_processed_clock: "" } });
  const { document, flush } = await loadHardwood({ status });
  await flush();
  assert.equal(document.querySelector("#hw-pipe b").textContent, "none pending");
});

test("data pill stays as a placeholder when generated_utc is absent", async () => {
  const status = baseStatus({ generated_utc: undefined });
  const { document, flush } = await loadHardwood({ status });
  await flush();
  assert.equal(document.querySelector("#hw-data b").textContent, "—");
});

test("scout pill omits the age when age_s is absent", async () => {
  const status = baseStatus({ scout: { alive: true } });
  const { document, flush } = await loadHardwood({ status });
  await flush();
  assert.equal(document.getElementById("hw-scout").querySelector(".txt").textContent, "scout: alive");
});

test("scout pill falls back to a default label when down without one", async () => {
  const status = baseStatus({ scout: { alive: false } });
  const { document, flush } = await loadHardwood({ status });
  await flush();
  assert.equal(
    document.getElementById("hw-scout").querySelector(".txt").textContent,
    "scout: starting"
  );
});

test("scout pill goes warn and shows its label when not alive", async () => {
  const status = baseStatus({ scout: { alive: false, label: "scout: down" } });
  const { document, flush } = await loadHardwood({ status });
  await flush();
  const pill = document.getElementById("hw-scout");
  assert.equal(pill.className, "hwpill warn");
  assert.equal(pill.querySelector(".txt").textContent, "scout: down");
});

test("banner shows the NEEDS DIRECTOR state when idle", async () => {
  const status = baseStatus({
    beacon: { state: "idle", idle_since_clock: "3:00pm", note: "waiting" },
  });
  const { document, flush } = await loadHardwood({ status });
  await flush();
  const banner = document.getElementById("hwbanner");
  assert.equal(banner.className, "needs");
  assert.match(banner.textContent, /NEEDS DIRECTOR/);
  assert.match(banner.textContent, /3:00pm/);
  assert.match(banner.textContent, /waiting/);
});

test("banner idle state falls back to 'recently' without an idle clock", async () => {
  const status = baseStatus({ beacon: { state: "idle" } });
  const { document, flush } = await loadHardwood({ status });
  await flush();
  const banner = document.getElementById("hwbanner");
  assert.equal(banner.className, "needs");
  assert.match(banner.textContent, /idle since recently/);
});

test("banner paused state falls back to 'soon' without a reset clock", async () => {
  const status = baseStatus({ beacon: { state: "paused" } });
  const { document, flush } = await loadHardwood({ status });
  await flush();
  const banner = document.getElementById("hwbanner");
  assert.equal(banner.className, "paused");
  assert.match(banner.textContent, /usage resets soon/);
});

test("banner defaults to the active (cleared) state when beacon is empty", async () => {
  const status = baseStatus({ beacon: {} });
  const { document, flush } = await loadHardwood({ status });
  await flush();
  assert.equal(document.getElementById("hwbanner").textContent, "");
});

test("banner shows the paused state with usage-reset clock", async () => {
  const status = baseStatus({
    beacon: { state: "paused", usage_resets_clock: "5:00pm", note: "quota" },
  });
  const { document, flush } = await loadHardwood({ status });
  await flush();
  const banner = document.getElementById("hwbanner");
  assert.equal(banner.className, "paused");
  assert.match(banner.textContent, /paused/);
  assert.match(banner.textContent, /5:00pm/);
});

test("banner is cleared in the active state", async () => {
  const { document, flush } = await loadHardwood({ status: baseStatus() });
  await flush();
  const banner = document.getElementById("hwbanner");
  assert.equal(banner.className, "");
  assert.equal(banner.textContent, "");
});

test("startup tick renders .hw-stamp[data-utc] nodes as 'HH:MM · Xm ago'", async () => {
  const iso = isoAgo(120);
  const html =
    '<!doctype html><html><head></head><body><nav>nav</nav>' +
    '<span class="hw-stamp" data-utc="' + iso + '"></span></body></html>';
  const { document } = await loadHardwood({ html });
  const stamp = document.querySelector(".hw-stamp");
  assert.match(stamp.textContent, /^\d{2}:\d{2} · 2m ago$/);
});

test("a stamp with an invalid data-utc falls back to data-fallback", async () => {
  const html =
    '<!doctype html><html><head></head><body><nav>nav</nav>' +
    '<span class="hw-stamp" data-utc="bogus" data-fallback="n/a"></span></body></html>';
  const { document } = await loadHardwood({ html });
  assert.equal(document.querySelector(".hw-stamp").textContent, "n/a");
});

test("renderStrip tolerates a status payload missing all optional sections", async () => {
  const { document, flush } = await loadHardwood({
    status: { generated_utc: "2026-07-11T16:57:55+00:00" },
  });
  await flush();
  assert.equal(document.querySelector("#hw-pipe b").textContent, "none pending");
  assert.equal(document.getElementById("hw-scout").className, "hwpill warn");
  assert.equal(document.getElementById("hwbanner").textContent, "");
});

test("a stamp with an invalid data-utc and no fallback becomes empty text", async () => {
  const html =
    '<!doctype html><html><head></head><body><nav>nav</nav>' +
    '<span class="hw-stamp" data-utc="bogus"></span></body></html>';
  const { document } = await loadHardwood({ html });
  assert.equal(document.querySelector(".hw-stamp").textContent, "");
});

test("poll swallows fetch rejection and leaves the strip mounted", async () => {
  const { document, flush } = await loadHardwood({ fetchReject: true });
  await flush();
  assert.ok(document.getElementById("hwstrip"));
  // No status arrived, so the data pill keeps its placeholder.
  assert.equal(document.querySelector("#hw-data b").textContent, "—");
});

test("a non-ok response still records the poll time but no status", async () => {
  const { document, flush } = await loadHardwood({ fetchOk: false, status: baseStatus() });
  await flush();
  assert.equal(document.querySelector("#hw-poll b").textContent, "0s ago");
  assert.equal(document.querySelector("#hw-data b").textContent, "—");
  assert.equal(document.querySelector("#hw-pipe b").textContent, "—");
});

test("the startup fetch targets ./status.json", async () => {
  const { fetchCalls, flush } = await loadHardwood({ status: baseStatus() });
  await flush();
  assert.deepEqual(fetchCalls, ["./status.json"]);
});

test("DEFAULT_HTML export is a page containing a nav", async () => {
  assert.match(DEFAULT_HTML, /<nav>/);
});
