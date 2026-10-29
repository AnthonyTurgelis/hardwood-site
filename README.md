# BetOnline Start-Time Check

A Tampermonkey userscript. While you browse BetOnline, it reads each game's listed start time and checks it against the official schedule and the actual start time from ESPN. Games with a mismatch show up in a red badge on the page and as a desktop alert.

## Install (one click)

1. Install [Tampermonkey](https://www.tampermonkey.net/). On Chrome/Edge, open the extension's **Details** page and turn on **Allow User Scripts**.
2. Click **[Install the script](https://raw.githubusercontent.com/AnthonyTurgelis/hardwood-site/userscripts/betonline-start-check.user.js)**, then press **Install** in the Tampermonkey tab that opens.
3. Open any BetOnline sportsbook page. When Tampermonkey asks to reach `site.api.espn.com`, choose **Always allow domain**.

Tampermonkey checks this link for new versions and updates the script by itself.

## Flags

| Flag | Meaning |
|---|---|
| Listed time differs from official | BetOnline's time ≠ the league's scheduled start (≥ 1 min by default) |
| Listed time is AFTER the actual start | the game began before BetOnline's listed time |
| Started well after listed time | the real start came > 20 min after BetOnline's time |
| BetOnline shows more than one time | the same game appeared with different times |

Actual start times come from ESPN's play-by-play: NBA, WNBA, college basketball, NFL, college football, NHL, MLB, college baseball, and soccer. Tennis, MMA, rugby, AFL and college hockey are checked against the official schedule only.

It only reads the page you have open; it never logs in, bets, or sends anything to BetOnline.

## Development

`core.js` (matching logic) and `app.js` (page reading and panel) are bundled by `./build.sh` into `betonline-start-check.user.js`. Bump `VERSION` in `app.js` before rebuilding so installed copies update. `node test/browser.test.js` runs the bundle in Chromium against the mock pages in `test/pages/` with live ESPN data.
