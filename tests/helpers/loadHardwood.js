"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const HARDWOOD_PATH = path.join(__dirname, "..", "..", "hardwood.js");
const SRC = fs.readFileSync(HARDWOOD_PATH, "utf8");

const DEFAULT_HTML = "<!doctype html><html><head></head><body><nav>nav</nav></body></html>";

/**
 * Load hardwood.js into a fresh jsdom window.
 *
 * hardwood.js is an IIFE that runs `start()` on load (mount + one poll + one
 * tick) and then schedules two intervals. We stub the window's setInterval so
 * no background timers linger and keep the node:test process from hanging, and
 * we inject a controllable fetch so the single startup poll is deterministic.
 *
 * @param {object} [opts]
 * @param {string} [opts.html]   full page HTML (defaults to a page with a <nav>)
 * @param {object|null} [opts.status] payload the startup fetch resolves with
 * @param {boolean} [opts.fetchOk] whether the fetch Response reports ok (default true)
 * @param {boolean} [opts.fetchReject] make the fetch reject (exercise the catch path)
 * @returns {{window: Window, document: Document, Hardwood: object, flush: () => Promise<void>, fetchCalls: string[]}}
 */
async function loadHardwood(opts) {
  const options = opts || {};
  const html = options.html || DEFAULT_HTML;
  const status = "status" in options ? options.status : null;
  const fetchOk = options.fetchOk !== false;
  const fetchReject = options.fetchReject === true;

  const dom = new JSDOM(html, {
    url: "https://example.test/",
    runScripts: "outside-only",
  });
  const { window } = dom;
  // Run the module through the window's own VM context under its real filename
  // so V8 (and node --experimental-test-coverage) attributes coverage to
  // hardwood.js instead of an anonymous eval script.
  const ctx = dom.getInternalVMContext();

  // Prevent lingering background intervals (poll/tick) from keeping the loop alive.
  window.setInterval = function () { return 0; };

  const fetchCalls = [];
  window.fetch = function (url) {
    fetchCalls.push(url);
    if (fetchReject) return Promise.reject(new Error("network down"));
    return Promise.resolve({
      ok: fetchOk,
      json: function () { return Promise.resolve(status); },
    });
  };

  // Wait until the document has finished parsing so hardwood.js's start()
  // (which is gated on readyState) runs synchronously at eval time.
  if (window.document.readyState !== "complete") {
    await new Promise(function (resolve) {
      window.addEventListener("load", resolve, { once: true });
    });
  }
  vm.runInContext(SRC, ctx, { filename: HARDWOOD_PATH });

  function flush() {
    // Let the fetch promise chain (poll -> renderStrip) settle.
    return new Promise(function (resolve) { window.setTimeout(resolve, 0); });
  }

  return {
    window,
    document: window.document,
    Hardwood: window.Hardwood,
    flush,
    fetchCalls,
  };
}

module.exports = { loadHardwood, DEFAULT_HTML };
