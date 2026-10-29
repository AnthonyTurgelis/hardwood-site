// Drive the built userscript in Chromium against mock BetOnline pages and live ESPN data.
// usage: node test/browser.test.js   (writes screenshots to test/out/)
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
const assert = require("assert");

const SCRIPT = fs.readFileSync(path.join(__dirname, "..", "betonline-start-check.user.js"), "utf8");
const OUT = path.join(__dirname, "out"); fs.mkdirSync(OUT, { recursive: true });

async function run(url, pageFile, check) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ timezoneId: "America/New_York", viewport: { width: 1100, height: 800 } });
  const page = await ctx.newPage();
  const calls = [];
  await page.exposeFunction("__nodeGet", (u) => {
    assert(u.startsWith("https://site.api.espn.com/"), "only ESPN may be fetched: " + u);
    calls.push(u);
    return execFileSync("curl", ["-sS", "-m", "30", u], { maxBuffer: 1 << 28 }).toString();
  });
  await page.addInitScript(() => {
    window.GM_getValue = (k) => localStorage.getItem("gm." + k);
    window.GM_setValue = (k, v) => localStorage.setItem("gm." + k, v);
    window.GM_notification = (o) => (window.__notes = window.__notes || []).push(o);
    window.GM_registerMenuCommand = () => {};
    window.GM_xmlhttpRequest = (o) => window.__nodeGet(o.url).then(
      (t) => o.onload({ status: 200, responseText: t }), (e) => o.onerror(e));
  });
  await page.route("**/*", (r) => r.request().url().startsWith("https://www.betonline.ag/")
    ? r.fulfill({ contentType: "text/html", body: fs.readFileSync(path.join(__dirname, "pages", pageFile), "utf8") })
    : r.abort());
  await page.goto(url);
  await page.addScriptTag({ content: SCRIPT });
  await page.waitForFunction(() => window.__bolStartCheckApi && window.__bolStartCheckApi.state.at && !window.__bolStartCheckApi.state.busy, null, { timeout: 120000 });
  const res = await page.evaluate(() => {
    const sh = document.getElementById("bol-start-check").shadowRoot;
    sh.querySelector(".pill").click();
    return {
      pill: sh.querySelector(".pill").innerText, status: sh.querySelector(".status").innerText,
      rows: [...sh.querySelectorAll("tr")].slice(1).map((tr) => [...tr.children].map((td) => td.innerText.replace(/\n/g, " ")).join(" | ")),
      notes: (window.__notes || []).map((n) => n.text.split("\n").slice(0, 2).join(" — "))
    };
  });
  await page.screenshot({ path: path.join(OUT, pageFile.replace(".html", ".png")) });
  console.log("\n### " + url + "\n" + res.pill + "\n" + res.status + "\n" + res.rows.join("\n") + "\nalerts:\n  " + res.notes.join("\n  ") + "\nESPN requests: " + calls.length);
  check(res);
  await browser.close();
}

(async () => {
  await run("https://www.betonline.ag/sportsbook/basketball/nba", "nba_time_first.html", (r) => {
    assert.strictEqual(r.rows.length, 4);
    const row = (s) => r.rows.find((x) => x.includes(s));
    assert(/OK$/.test(row("Brooklyn Nets")) && /OK$/.test(row("Detroit Pistons")));
    assert(row("Sacramento Kings").includes("differs") && row("Sacramento Kings").includes("Started well after"));
    assert(row("Portland Trail Blazers").includes("AFTER the actual start"));
    assert.strictEqual(r.notes.length, 4);
  });
  // No league in the URL: auto-detect across every league; time sits after the team rows.
  await run("https://www.betonline.ag/sportsbook/live", "time_after_rows.html", (r) => {
    const row = (s) => r.rows.find((x) => x.includes(s));
    assert(/OK$/.test(row("Columbus Blue Jackets")));
    assert(row("Boston Bruins").includes("differs"));
    assert(/OK$/.test(row("Manchester United")));
    assert(row("Brighton").includes("differs"));
    assert(/OK$/.test(row("Crystal Palace")));
    assert.strictEqual(r.rows.length, 5);
  });
  console.log("\nALL BROWSER CHECKS PASSED");
})().catch((e) => { console.error(e); process.exit(1); });
