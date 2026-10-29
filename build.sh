#!/bin/sh
# Bundle core.js + app.js into one Tampermonkey/Violentmonkey userscript.
set -e
cd "$(dirname "$0")"
VERSION=$(sed -n 's/.*var VERSION = "\(.*\)".*/\1/p' app.js)
OUT=betonline-start-check.user.js
{
cat <<HDR
// ==UserScript==
// @name         BetOnline Start-Time Check
// @namespace    hardwood.start-check
// @version      $VERSION
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

HDR
cat core.js
echo
cat app.js
} > "$OUT"
node --check "$OUT"
echo "built $OUT ($(wc -c < "$OUT") bytes, v$VERSION)"
