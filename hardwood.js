/* hardwood.js - the shared status chrome loaded by every board tab except the main board.
 *
 * ONE small self-contained script. It owns the strip under the nav on all 25 secondary pages
 * (MEASURED 2026-07-31: `grep -l '<script src="./hardwood.js">' site/*.html` = 25. This header and
 * the note in explorer.html both said 22, which was true when they were written; three tabs have
 * shipped since. A count written into prose rots - the grep is the number.), and it answers the same
 * two questions the main board's own strip answers, IN THE SAME WORDS:
 *
 *   1. IS WHAT I AM READING CURRENT?  one freshness sentence, measured against this page's own
 *      published refresh contract and escalated at the threshold the machine itself pages on.
 *   2. IS ANYTHING STOPPED?           one work-state sentence, under ONE order of precedence.
 *
 * Plus a dense pill row (updated / last checked / instructions / listening / who is running it /
 * work state) and a per-card timestamp ticker for any element with class "hw-stamp".
 *
 * COPY RULES (CEO 20260729: "there was also LOTS of technical jargon and nonsense in those updates
 * ... that's not realistic to read"). These are mechanical, not stylistic:
 *   * ASCII ONLY in anything a reader sees. A utf-8 em-dash or a warning glyph written here comes
 *     back as mojibake once anything on this box re-reads it as cp1252, and the glyphs read as the
 *     stray old emoji he asked us to stop sending. Hyphens, "...", and words instead.
 *   * NO SHELL COMMANDS, NO FILE NAMES, NO IDENTIFIERS, NO ISO TIMESTAMPS, NO snake_case. This strip
 *     used to print "Remedy: python ops/scout/ack.py --resume" and "directives: 2 pending" at him.
 *     Nobody reading a basketball page is going to run a command. Say what it MEANS or say nothing:
 *     the payload's own `remedy` / `evidence` / `reason` / `label` / `filed_by` strings are internal
 *     diagnostics and are deliberately NOT rendered. They stay in status.json, where they belong.
 *   * Plain words, but DENSE: short pills, and a banner only when something is actually wrong.
 *
 * NEVER-BLANK (P0-F8): every field renders a DEFINITE state. An unreadable signal says so in plain
 * English ("we cannot tell ..."), never an empty slot and never a stale value presented as current.
 * Silence on "is anything paused" reads as "fine", so it is banned.
 *
 * OUR OWN STAFFING IS NOT THE READER'S FAULT (2026-07-31; the same ruling site/index.html took on
 * 2026-07-30 when a red lane-count wash was removed from above the night's pick). Two of these pills
 * describe WHO IS DOING OUR WORK - is a coordinator in the chair, is the watcher ticking. Those are
 * operator quantities. They were painted in the alarm colour and shouted in capitals ("NOBODY IS
 * RUNNING THE WORK", "NOTHING IS LISTENING"), on 25 reader-facing pages.
 *
 * They are still stated, in full, in the same place - the alarm is what came off. The distinction
 * this file now holds, and it is the general one:
 *
 *   A FILED, SUSTAINED STATE MAY BE LOUD.        an outside limit, a pause somebody filed, a page
 *                                                measurably past the threshold the machine pages on
 *   AN INSTANTANEOUS SAMPLE MAY NOT.             whether a chair happens to be occupied this second
 *
 * The chair is the second kind. MEASURED on the live payload at 2026-07-31T08:25Z: coordinator
 * absent, and the payload's own account of why was "no start attempt yet - rate floor holds the next
 * one for up to 292s (one attempt guaranteed every 300s while the chair is empty)". That is a
 * SCHEDULE. Painting a designed 300-second gap in fault red is the same category error as a red dot
 * beside the word "scheduled", which is the instance that was fixed the day before this one.
 *
 * No threshold rescues it, so none was invented: a correctly-tuned chair alarm still tells a reader
 * a fact about our rota that they cannot act on. What they CAN act on - are these numbers current -
 * has its own line, keeps its own red, and is unchanged.
 *
 * ONE DEFINITION OF STALE: the loud threshold is NOT ours to invent. This page's own contract
 * (stale_after_secs, published by the baker) is when a refresh is DUE; the alarm the machine raises
 * on the public board fires at max(that, the 900s floor in scripts/publish_health.py). Both numbers
 * live here as ONE ladder, so a page can never call itself fine while the pager is paging about it.
 * tests/test_hardwood_chrome_copy.js reads that floor out of the Python and fails if they drift.
 *
 * DISCIPLINE: same-origin fetch of ./status.json ONLY. No DB, no framework, no CDN, no secrets.
 * The poll is NON-DISRUPTIVE - it only rewrites the strip's own nodes; it never touches #main,
 * never scrolls, never collapses the reader's section.
 */
(function () {
  "use strict";
  var STATUS_URL = "./status.json";
  var lastFetch = 0;          // ms epoch of last status.json poll
  var polled = false;         // has ANY poll resolved? "not asked yet" is not "asked and cannot tell"
  var genIso = null;          // status.json generated_utc (the OPERATOR heartbeat's own stamp)
  var dataIso = null;         // THIS page's own payload stamp, when the page bakes on its own clock
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
  // TERSE age, for the muted per-card stamps only (small type beside a card time).
  function agoSecs(s) {
    s = Math.max(0, s);
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h " + (Math.floor((s % 3600) / 60)) + "m ago";
    return Math.floor(s / 86400) + "d ago";
  }
  /* PLAIN-ENGLISH age, for everything a sentence or a pill says. Word-for-word the same function the
     main board's strip uses, so all 23 pages describe the same age with the same words. It TRUNCATES
     exactly as agoSecs() does (rounding here once produced "2 minutes ago" beside a chip reading "1m
     ago" off one timestamp), and under a minute it quotes no number at all, so it cannot disagree
     with a ticking seconds counter either. */
  function plainAgo(s) {
    if (s == null) return "";
    s = Math.max(0, s);
    if (s < 60) return "just now";
    if (s < 3600) { var m = Math.floor(s / 60); return (m === 1 ? "a minute ago" : m + " minutes ago"); }
    if (s < 86400) {
      var h = Math.floor(s / 3600), rm = Math.floor((s % 3600) / 60);
      return (h === 1 ? "an hour" : h + " hours") +
             (rm ? (" and " + (rm === 1 ? "a minute" : rm + " minutes")) : "") + " ago";
    }
    /* THE DAY BAND CARRIES ITS HOURS, for the same reason the hour band carries its minutes. A
       30-hour-old page used to read "last updated a day ago, well past the 28 hours we allow",
       which a reader can only parse as a contradiction - the age looked SMALLER than the threshold
       it had just breached. Truncating to whole days was harmless while every threshold on this
       strip was 15 minutes; it stopped being harmless the moment a surface earned a bound measured
       in days. */
    var d = Math.floor(s / 86400), dh = Math.floor((s % 86400) / 3600);
    return (d === 1 ? "a day" : d + " days") +
           (dh ? (" and " + (dh === 1 ? "an hour" : dh + " hours")) : "") + " ago";
  }
  function plainFor(s) { return plainAgo(s).replace(/ ago$/, ""); }   // a DURATION, not a point in time
  function plainMins(s) { var m = Math.round((s || 0) / 60); return (m <= 1 ? "minute" : m + " minutes"); }

  // ---- strip DOM (built once, injected right after <nav>) ----
  function injectStyle() {
    if (document.getElementById("hw-style")) return;
    var css =
      "#hwstrip{max-width:1080px;margin:6px auto 0;padding:0 14px;font:11.5px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}" +
      /* THE ONE LINE a reader sees when nothing is wrong: the age of the numbers, small and muted,
         with the operator detail folded away behind it. The pill row is now the CONTENT of that
         fold, not the top of the page. */
      "#hwone{color:#8a93a3;font-size:11.5px}" +
      "#hwone summary{cursor:pointer;list-style:none;display:inline-flex;gap:6px;align-items:center}" +
      "#hwone summary::-webkit-details-marker{display:none}" +
      "#hwone summary .more{color:#6b7684;border-bottom:1px dotted currentColor}" +
      "#hwone[open] #hwbar{margin-top:6px}" +
      "@media (prefers-color-scheme:dark){#hwone{color:#6b7684}}" +
      "#hwfresh,#hwwork{display:none;border-radius:8px;padding:6px 11px;margin-bottom:6px;font-weight:650;font-size:12.5px}" +
      "#hwfresh.warn,#hwwork.warn{display:block;background:#fff4e2;color:#9a6700;border:1px solid #f0d9a8}" +
      "#hwfresh.bad,#hwwork.bad{display:block;background:#fbe9e7;color:#b3261e;border:1px solid #f3b6ae}" +
      "@media (prefers-color-scheme:dark){#hwfresh.warn,#hwwork.warn{background:#332708;color:#e3b341;border-color:#6b530f}" +
      "#hwfresh.bad,#hwwork.bad{background:#3a1512;color:#ff8a80;border-color:#7a271f}}" +
      "#hwbar{display:flex;flex-wrap:wrap;gap:5px;align-items:center}" +
      /* Pills WRAP their own text and never exceed the viewport. They used to be white-space:nowrap,
         which was safe only because the copy was terse jargon: the moment a pill said something a
         human could read ("Work is being run right now (for an hour and 35 minutes)") a 320px phone
         had content unreachable off the right edge - caught by tests/test_phone_layout_overflow.py on
         the rendered page, not by any string check. Wrapping is the structural fix; tuning wording
         until it happens to fit would just break again on the next sentence. */
      ".hwpill{display:inline-flex;align-items:center;gap:4px;border:1px solid #d9dee7;background:#fff;color:#5a6675;" +
      "border-radius:999px;padding:2px 9px;max-width:100%;overflow-wrap:anywhere}" +
      ".hwpill b{color:#16181d;font-variant-numeric:tabular-nums;font-weight:640}" +
      ".hwpill.live b{color:#1f883d}" +
      ".hwpill .dot{width:6px;height:6px;border-radius:50%;background:#8a93a3}" +
      ".hwpill.ok .dot{background:#1f883d}.hwpill.warn .dot{background:#d29922}.hwpill.bad .dot{background:#c62828}" +
      ".hwpill.bad{color:#b3261e}" +
      ".hw-stamp{font-size:10.5px;color:#8a93a3;font-variant-numeric:tabular-nums;white-space:nowrap}" +
      "@media (prefers-color-scheme:dark){.hwpill{background:#161b22;border-color:#2a3340;color:#9aa7b4}" +
      ".hwpill b{color:#e6edf3}.hwpill.live b{color:#3fb950}.hwpill.ok .dot{background:#3fb950}" +
      ".hwpill.warn .dot{background:#d29922}.hwpill.bad .dot{background:#ff7b72}.hwpill.bad{color:#ff8a80}" +
      ".hw-stamp{color:#6b7684}}";
    var st = document.createElement("style");
    st.id = "hw-style"; st.textContent = css;
    document.head.appendChild(st);
  }

  /* The two banners have ONE job each and cannot contradict one another: #hwfresh only ever talks
     about how old the numbers are, #hwwork only ever talks about whether work is stopped. The old
     pair (#hwbanner reading the beacon flag, #hwpause reading the pause block) could and did show
     "paused" and nothing-is-paused at the same time; that duplication is retired here, exactly as it
     was retired on the main board. */
  function mount() {
    injectStyle();
    var nav = document.querySelector("nav");
    if (!nav || document.getElementById("hwstrip")) return;
    var strip = document.createElement("div");
    strip.id = "hwstrip";
    /* SIX PILLS AND TWO BANNERS NO LONGER GREET A READER (CEO 20260730, on the players page: six
       chips before a single player name - "numbers updated, checked for new numbers, your
       instructions none waiting, listening for new instructions, work is being run right now for 4
       hours and 46 minutes, nothing is paused at 49 percent of our limit"; and "He cannot act on
       'listening for new instructions'").
       The pills were never wrong, they were in the wrong place: they answer an OPERATOR's questions
       and they were sitting above a fan's. So the whole row moves INSIDE a closed disclosure whose
       summary is the single freshness line a reader does want, and which stays one click from the
       operator detail on every page. Nothing is deleted - every pill, every never-blank guarantee
       and every word of its copy is unchanged inside the fold, and the two banners still push
       THROUGH it when something is genuinely wrong. */
    strip.innerHTML =
      '<div id="hwfresh"></div>' +
      '<div id="hwwork"></div>' +
      '<details id="hwone"><summary><span id="hwone-txt">Numbers updated: reading...</span>' +
      '<span class="more">status</span></summary>' +
      '<div id="hwbar">' +
      '  <span class="hwpill live" id="hw-data" title="When the numbers on this page were last rebuilt">Numbers updated: <b>not read yet</b></span>' +
      '  <span class="hwpill" id="hw-poll" title="When your browser last looked for newer numbers">Checked for new numbers: <b>not yet</b></span>' +
      '  <span class="hwpill" id="hw-pipe" title="Instructions you have sent, and whether they have been picked up">Your instructions: <b>checking</b></span>' +
      '  <span class="hwpill" id="hw-scout" title="Whether anything is listening for new instructions right now"><span class="dot"></span><span class="txt">Listening for new instructions: checking</span></span>' +
      '  <span class="hwpill" id="hw-coord" title="Whether anyone is actually running the work right now"><span class="dot"></span><span class="txt">Who is running the work: checking</span></span>' +
      '  <span class="hwpill" id="hw-pause" title="Whether work is running, paused by us, or stopped from outside"><span class="dot"></span><span class="txt">Checking whether anything is paused</span></span>' +
      '</div></details>';
    nav.parentNode.insertBefore(strip, nav.nextSibling);
    // legacy per-page ".ago" chip is now redundant with the strip's own timers - hide it
    var legacy = document.getElementById("ago");
    if (legacy) legacy.style.display = "none";
  }

  // ---- render the strip from the latest status payload ----
  function renderStrip() {
    var dataP = document.querySelector("#hw-data b");
    /* THE PILL AND THE BANNER MEASURE THE SAME CLOCK, and on a surface with its own bake cadence
       that clock is the surface's own payload - not the operator heartbeat. The pill's own title
       has always said "When the numbers on this page were last rebuilt"; until now it answered with
       when the STATUS FILE was rebuilt, which on standings.html was 35 minutes optimistic. */
    var basisIso = dataIso || genIso;
    var ageNow = basisIso ? Math.round((Date.now() - new Date(basisIso).getTime()) / 1000) : null;
    var dataTxt = (basisIso && ageNow != null && !isNaN(ageNow))
      ? (clockOf(basisIso) + " (" + plainAgo(ageNow) + ")")
      : "not read yet";
    if (dataP) { dataP.textContent = dataTxt; }
    // THE ONE LINE (see mount): the same words the updated pill carries, on the closed summary, so a
    // reader gets the only operator fact that concerns them without opening anything.
    var one = document.getElementById("hwone-txt");
    if (one) { one.textContent = "Numbers updated: " + dataTxt; }
    var pollP = document.querySelector("#hw-poll b");
    if (pollP) {
      pollP.textContent = lastFetch
        ? plainAgo(Math.round((Date.now() - lastFetch) / 1000))
        : "not yet";
    }

    /* ONE precedence, computed ONCE: the work state decides its own sentence AND tells the freshness
       sentence whether an ageing page is a broken publisher or the expected result of a pause.

       COMPUTED BEFORE THE PILLS ARE PAINTED, which is the ordering the 00:43Z freeze needed: freshness
       has to be known before any now-field is allowed to assert a present-tense fact. It used to be
       computed after them, so the pills had already claimed "running right now" by the time the page
       worked out it was two hours stale. */
    var work = polled
      ? workView(status ? status.pause : null, status ? status.beacon : null, !!status)
      : { level: "", paused: false, short: "Checking whether anything is paused",
          text: "Checking whether anything is paused..." };
    /* AT MOST ONE BANNER, under a stated precedence (CEO 20260730: two full-width status banners
       greeted him before a single player name). Two rules, both deliberate:

       1. A BANNER IS FOR WORK THAT HAS ACTUALLY STOPPED - paused by us, stopped from outside, or an
          unreadable pause note that we fail closed and TREAT as stopped. "We cannot tell whether
          work is paused, that reading did not load" is an operator diagnostic, not a fact about
          this page's numbers, and he cannot act on it; it keeps its pill inside the fold, where the
          never-blank contract is still honoured in full, and stops occupying the top of a page
          somebody opened to read about basketball.
       2. STALENESS OUTRANKS the work line, not the other way round. The freshness sentence now
          fires ONLY at genuine staleness, and its paused variant already names the pause as the
          cause - so showing it says strictly more than the work line alone, in one line instead of
          two. Whichever way work is behaving, a reader is never left believing stale numbers are
          current. */
    var surface = surfaceFor(currentPath());
    var fresh = staleView(basisIso, status ? status.stale_after_secs : null, Date.now(),
                          work.paused, surfaceLoudSecs(surface));
    var freshLoud = !!(fresh.level && fresh.level !== "ok");
    var workLoud = !freshLoud && !!(work.paused || work.level === "bad");

    /* `fresh.stale` is the invalidating condition, NOT `freshLoud`. They differ, and the difference is
       the whole point: an unreadable or absent `generated_utc` is also loud (level "warn") but its
       `stale` is false, because we do not know that the payload is old - only that we cannot date it.
       Degrading the now-fields on a missing timestamp would tell a reader the chair is unknown every
       time a stamp fails to parse on an otherwise perfectly fresh page. Only a MEASURED age past the
       loud threshold retires a now-field.

       WHICH STALENESS retires them is a second question, and splitting the basis forced it. The
       now-fields (who is in the chair, is anything listening, is work paused) are read out of
       status.json, so it is STATUS.JSON's age that decides whether we may still assert them - not
       the age of the basketball numbers on this page. A daily standings bake sitting 20 hours old
       with a heartbeat 30 seconds old tells us nothing whatever about the chair, and degrading the
       chair on it would be the same category error, one layer down, as the banner reading the
       wrong file in the first place. On every fast-loop page the two views share one stamp, so this
       is a no-op there. */
    var statusFresh = (basisIso === genIso)
      ? fresh
      : staleView(genIso, status ? status.stale_after_secs : null, Date.now(), work.paused);
    var invalid = !!statusFresh.stale;

    // Now-fields, painted only after freshness is known. Each still always says something (never-blank);
    // past the threshold what it says is that it cannot know.
    var pipeP = document.querySelector("#hw-pipe b");
    if (pipeP) {
      pipeP.textContent = !status ? "checking"
        : (invalid ? "we cannot tell right now" : pipeView(status.pipe_health).text);
    }
    renderScout(status ? status.scout : null, invalid);
    // COORDINATOR pill (CEO P0b 20260725) - the chair NEVER renders blank. A missing/empty
    // coordinator object, an UNKNOWN state, or alive:false all render LOUD, never a silent gap that
    // reads as 'nothing here'. Distinguishes ALIVE / DEAD / UNKNOWN explicitly. And past the staleness
    // threshold it distinguishes a FOURTH state: we are not entitled to an opinion (see staleUnknown).
    renderCoordinator(status ? status.coordinator : null, invalid);

    /* THE WORK/PAUSE LINE IS DELIBERATELY *NOT* DEGRADED, and that is a correction: my first version
       degraded it too, and `tests/test_hardwood_chrome_copy.js` caught it on the STALE-WHILE-PAUSED
       case. It was right and the change was wrong. A pause is not a decaying now-fact like "someone is
       running the work" - it is the EXPLANATION for an ageing page, and `staleView` reads
       `work.paused` to decide whether staleness is a broken publisher or the expected result of a
       pause we filed on purpose. Retiring it would delete the reason for the very banner above it and
       leave a reader with a stale page and no account of why. The existing contract keeps one owner. */
    renderWork(work, workLoud);
    renderFresh(freshLoud ? fresh : { level: "ok", text: "" });
  }

  /* ---- INSTRUCTIONS (never-blank): how many things he has sent that are still waiting, and when
     one was last picked up. This used to render "directives: 2 pending, last processed 9:26am" and,
     when the stamp was unreadable, the internal reason verbatim ("unknown - only a retired source
     had one"). The reason is a diagnostic for us, not copy for him; it stays in status.json. The
     stamp itself still matters: the board once showed a July 9 clock as current for twenty days
     because its two sources were dead, so an unknown stamp says it is unknown rather than guessing. */
  function pipeView(ph) {
    if (!ph || typeof ph !== "object") {
      return { text: "we cannot tell right now", known: false };
    }
    var n = (ph.directives_pending == null) ? 0 : ph.directives_pending;
    var head = (n === 0 ? "none waiting" : (n === 1 ? "1 waiting" : n + " waiting"));
    var known = (ph.last_processed_known === true) ||
                (ph.last_processed_known == null && !!ph.last_processed_clock);
    if (known && ph.last_processed_clock) {
      return { text: head + ", last one picked up " + ph.last_processed_clock, known: true };
    }
    return { text: head + ", and we cannot tell when the last one was picked up", known: false };
  }

  /* ---- WHO IS LISTENING. The payload's own `label` ("scout: alive, last poll 13s ago") is an
     internal string with an internal name in it; we render our own words off the same two fields.

     DE-ALARMED, NOT DELETED (see OUR OWN STAFFING at the top). Every state this function has ever
     had still renders, in the same pill, with the same facts. What it no longer does is paint our
     own rota in the colour reserved for something the reader has to act on. The healthy reading
     keeps its green - a positive signal is not an alarm, and losing it would make its absence read
     as the fault we just removed. */
  function scoutView(sc) {
    if (!sc || typeof sc !== "object") {
      return { level: "", text: "We cannot tell if anything is listening for new instructions" };
    }
    if (sc.alive) {
      return { level: "ok", text: "Listening for new instructions" +
        (sc.age_s != null ? " (checked " + plainAgo(sc.age_s) + ")" : "") };
    }
    return { level: "", text: "Nothing is listening for new instructions right now" };
  }

  function coordView(co) {
    // NEVER-BLANK: a missing/empty object is itself the UNKNOWN case, not an excuse to render blank.
    if (!co || typeof co !== "object") {
      return { level: "", text: "We cannot tell if anyone is running the work" };
    }
    var state = (co.state || (co.alive ? "ALIVE" : (co.known === false ? "UNKNOWN" : "DEAD"))).toUpperCase();
    if (state === "ALIVE" && co.alive) {
      return { level: "ok", text: "Work is being run right now" +
        (co.session_age_secs != null ? " (for " + plainFor(co.session_age_secs) + ")" : "") };
    }
    if (state === "UNKNOWN" || co.known === false) {
      return { level: "", text: "We cannot tell if anyone is running the work" };
    }
    /* Confidently DEAD. STATED IN FULL, IN PLAIN CASE, IN THE CALM TONE. It used to open "NOBODY IS
       RUNNING THE WORK" in fault red - our staffing, shouted at somebody reading a basketball page,
       off an instantaneous sample of a quantity whose designed idle gap is 300 seconds. The duration
       stays because it is the only part with any content; the capitals and the red are the part that
       claimed a verdict. `blocked_reason` is an internal token and is deliberately still not shown. */
    var extra = (co.last_progress_age_secs == null)
      ? "nothing has moved and we cannot tell for how long"
      : "nothing has moved for " + plainFor(co.last_progress_age_secs);
    if (co.last_spawn_attempt) extra += ", and a restart has been tried";
    return { level: "", text: "Nobody is running the work right now - " + extra };
  }

  /* ---- HOW MUCH OF THE WORK LIMIT IS USED, only ever as well as we actually know it. A number is
     printed ONLY when the reading is a real one; an unread meter says it is unread. (A meter that
     scraped a plausible-looking number out of an unrelated file and showed it as real is exactly the
     failure this wording exists to make impossible.) The payload's `reason` and `last_known_display`
     are diagnostics, not copy - an old number shown beside a live page is worse than no number. */
  function pctSentence(pc) {
    if (!pc || typeof pc !== "object") return "We cannot read how much of our work limit is used.";
    var q = String(pc.quality || "UNKNOWN").toUpperCase(), d = pc.display;
    if (q === "MEASURED" && d) return "We have used " + d + " of our work limit.";
    if (q === "INFERRED" && d) return "We have used about " + d + " of our work limit, and that " +
      "figure is an estimate rather than a direct reading.";
    return "We cannot read how much of our work limit is used right now.";
  }
  function pctShort(pc) {
    if (!pc || typeof pc !== "object") return "limit use unknown";
    var q = String(pc.quality || "UNKNOWN").toUpperCase(), d = pc.display;
    if (q === "MEASURED" && d) return d + " of our limit used";
    if (q === "INFERRED" && d) return "about " + d + " of our limit used, estimated";
    return "limit use unknown";
  }

  /* ---- ONE work-state sentence, under ONE order of precedence: a limit imposed from OUTSIDE
     outranks a pause we filed ourselves, which outranks the coordinator's own beacon. A pause we
     filed for the WEEK and a short one are genuinely different situations - the weekly kind never
     restarts by itself - so they never render in the same words. Same words as the main board.
     `short` is the pill; `text` is the banner; both come off this ONE ladder so they cannot
     disagree about what is happening. */
  function workView(p, bc, ok) {
    bc = bc || {};
    if (!ok || !p || typeof p !== "object") {
      return { level: "warn", paused: false, short: "We cannot tell whether work is paused",
        text: "We cannot tell whether work is paused right now - that reading did not load. " +
              "Nothing here says it is running." };
    }
    var st = String(p.state || "UNKNOWN").toUpperCase();
    var sp = p.self_pause || {}, pl = p.provider_limit || {}, pc = p.percent || {};
    if (st === "PROVIDER_LIMIT") {
      var back = (pl.resets_known && pl.resets_clock)
        ? ("Work restarts when that clears, around " + pl.resets_clock + ".")
        : "They have not said when it clears, so we are waiting on them.";
      return { level: "bad", paused: true, short: "STOPPED FROM OUTSIDE - we have hit our limit",
        text: "STOPPED FROM OUTSIDE - we have hit the limit on our account, so nothing is running. " +
              back + " " + pctSentence(pc) };
    }
    if (st === "SELF_PAUSE") {
      var kind = String(sp.kind || "unknown").toLowerCase();
      var since = sp.filed_clock ? (" It has been paused since " + sp.filed_clock + ".") : "";
      if (kind === "weekly") {
        return { level: "bad", paused: true, short: "PAUSED BY US FOR THE WEEK",
          text: "PAUSED BY US FOR THE WEEK - this kind never restarts by itself. It stays paused " +
                "until someone here starts it again." + since + " " + pctSentence(pc) };
      }
      if (kind === "rolling") {
        return { level: "warn", paused: true, short: "Paused by us for a short while",
          text: "PAUSED BY US FOR A SHORT WHILE - this kind clears itself once the limit resets, " +
                "and work carries on on its own." + since + " " + pctSentence(pc) };
      }
      return { level: "bad", paused: true, short: "PAUSED BY US, and we cannot read which kind",
        text: "PAUSED BY US, and we could not read which kind of pause it is - so it is being " +
              "treated as the kind that never restarts by itself, and it stays paused until " +
              "someone here starts it again." + since + " " + pctSentence(pc) };
    }
    if (st !== "NORMAL") {
      return { level: "bad", paused: true, short: "WE CANNOT TELL whether work is paused",
        text: "WE CANNOT TELL whether work is paused - the pause note could not be read, and an " +
              "unreadable one counts as paused. Someone here has to look. " + pctSentence(pc) };
    }
    var bs = String(bc.state || "").toLowerCase();
    if (bs === "paused") {
      return { level: "warn", paused: true, short: "Paused on purpose for a while",
        text: "PAUSED ON PURPOSE for a while" +
              (bc.usage_resets_clock ? (" - work should be back around " + bc.usage_resets_clock) : "") +
              "." + (bc.note ? (" " + bc.note) : "") };
    }
    if (bs === "idle") {
      return { level: "bad", paused: false, short: "WORK HAS STOPPED and needs attention",
        text: "WORK HAS STOPPED and needs attention" +
              (bc.idle_since_clock ? (" - nothing has been running since " + bc.idle_since_clock) : "") +
              "." + (bc.note ? (" " + bc.note) : "") };
    }
    return { level: "ok", paused: false, short: "Nothing is paused" + (pctShort(pc) ? " (" + pctShort(pc) + ")" : ""),
      text: "" };
  }

  /* ---- FRESHNESS: three bands off TWO published numbers, never a magic constant of our own.
       calm      up to this page's own refresh contract (stale_after_secs, default 300s)
       running late  past due, but inside the window the alarm itself tolerates
       STALE     past max(contract, the 900s floor scripts/publish_health.py alarms on)
     The floor is why ordinary publish and content-delivery lag never cries wolf, and pinning to it
     is why this page can never sit calm while the pager is paging about the very same board.
     Age is measured against the payload's own generated_utc and recomputed in the browser every
     second, so a page that stops being republished goes loud on the reader's clock - a sentence
     baked server-side would freeze at "fresh" exactly when it mattered. */
  var STALE_DEFAULT_SECS = 300;
  var PUB_FLOOR_SECS = 900;
  function contractSecs(staleAfterSecs) {
    return (typeof staleAfterSecs === "number" && staleAfterSecs > 0) ? staleAfterSecs : STALE_DEFAULT_SECS;
  }
  function loudAfterSecs(staleAfterSecs) {
    return Math.max(contractSecs(staleAfterSecs), PUB_FLOOR_SECS);
  }

  /* ---- A PAGE THAT REBUILDS ONCE A DAY IS NOT STALE AT SIXTEEN MINUTES.
     ============================================================================================
     THE DEFECT, measured live 2026-08-08T18:03Z on standings.html: a full-width red banner reading
     "STALE - these numbers were last updated 17 minutes ago, well past the 15 minutes we allow ...
     Do not trust anything on this page until it refreshes." A page that shouts that all day trains
     a reader to ignore the banner, and the day it means something it is already ignored. The board
     shouting stale at five-minute-old numbers was the same shape, on a different surface.

     TWO THINGS WERE WRONG, and only fixing the second one would have left the sentence lying.

     1. THE BASIS WAS THE WRONG FILE. Everything above measured age against status.json's
        `generated_utc` - the OPERATOR heartbeat, baked by the fast site loop - on all 25 pages,
        including pages whose numbers come from somewhere else entirely. MEASURED on the live host
        at 18:03Z: status.json 17:40:12Z, and standings.json 17:08:35Z. The banner said "these
        numbers were last updated 17 minutes ago" about numbers that were 52 minutes old. It was
        not merely alarming on the wrong threshold, it was quoting the wrong clock: on a slow page
        it UNDERSTATES the age, and one late heartbeat lights all 25 pages at once. So a page with
        its own bake clock is now measured against ITS OWN payload, which is what the sentence has
        always claimed to do (see the file header, "this page's own published refresh contract").

     2. THE BOUND WAS ONE GLOBAL NUMBER. max(300s contract, 900s pager floor) = 15 minutes, for a
        daily oneshot and a five-minute loop alike. standings.json is baked by ONE daily job
        (report_scheduler.py `standings_outlook_refresh`, 15:00 ET, bake_playoff_odds_read --pair),
        so 15 minutes made it call itself untrustworthy for ~23 hours 45 minutes of every day, BY
        CONSTRUCTION.

     WHAT WAS DELIBERATELY NOT DONE: the global bound was not raised. Raising it would silence the
     honest alarm on the fast-moving boards - the opposite of the fix, and strictly worse than the
     defect. The fast loop keeps max(contract, PUB_FLOOR_SECS) EXACTLY as it was, so those pages
     and scripts/publish_health.py still page at the same second as each other.

     EVERY NUMBER BELOW IS READ OUT OF THE JOB THAT ACTUALLY REBUILDS THE FILE - none is tuned to
     make today's reading come out calm:
       everySecs  the job's own cadence (a daily oneshot = 86400; a 30-min sweep = 1800)
       graceSecs  the job's OWN declared lateness allowance - `grace_min` for the oneshots, and one
                  further sweep period for the sweeps, which is the point at which a sweep has
                  provably missed rather than merely not come round yet
       source     the scheduler job id, so the next reader re-derives the bound instead of trusting
                  this comment; tests/test_surface_freshness_cadence.js re-reads report_scheduler.py
                  and fails if a job's et_time/grace_min drifts away from the numbers here.

     A page NOT in this table is one the fast loop bakes in the SAME pass that writes status.json -
     MEASURED identical stamps at 18:03Z for board, games, teams, accuracy, players, allstar,
     compare_seasons, ledger and org (all 17:40:12Z, to the second). For those, status.json IS the
     page's own stamp, and nothing about their behaviour changes. explorer.json is deliberately
     absent: its baker rides a sweep whose period this lane could not establish from the job
     definition, and inventing a cadence is exactly what this block exists to stop. */
  var SWEEP_SECS = 1800;      // report_scheduler.py: availability/coach/gm/tempo bakes, "swept every 30 min"
  var DAILY_SECS = 86400;
  var SURFACE_CADENCE = {
    "standings.html": { payload: "standings.json", everySecs: DAILY_SECS, graceSecs: 240 * 60,
                        source: "report_scheduler.py standings_outlook_refresh (oneshot 15:00 ET, grace_min 240)" },
    "deepdive.html":  { payload: "deepdive_index.json", everySecs: DAILY_SECS, graceSecs: 300 * 60,
                        source: "report_scheduler.py deep_dives_refresh (oneshot 10:00 ET, grace_min 300)" },
    "situation.html": { payload: "situation.json", everySecs: DAILY_SECS, graceSecs: 300 * 60,
                        source: "report_scheduler.py situation_explorer_refresh (oneshot 10:30 ET, grace_min 300)" },
    "coach.html":     { payload: "coach.json", everySecs: SWEEP_SECS, graceSecs: SWEEP_SECS,
                        source: "report_scheduler.py coach_dashboard_bake (sweep, every 30 min)" },
    "gm.html":        { payload: "gm.json", everySecs: SWEEP_SECS, graceSecs: SWEEP_SECS,
                        source: "report_scheduler.py gm_dashboard_bake (sweep, every 30 min)" },
    "tempo.html":     { payload: "tempo.json", everySecs: SWEEP_SECS, graceSecs: SWEEP_SECS,
                        source: "report_scheduler.py tempo_hub_bake (sweep, every 30 min)" },
    "availability.html": { payload: "availability.json", everySecs: SWEEP_SECS, graceSecs: SWEEP_SECS,
                        source: "report_scheduler.py availability_bake (sweep, every 30 min)" }
  };
  /* The bound a surface's OWN clock earns. Never below the pager floor: a page may be slower than
     the pager, never quieter than it at the same age. */
  function surfaceLoudSecs(surface) {
    if (!surface) return null;
    return Math.max(surface.everySecs + surface.graceSecs, PUB_FLOOR_SECS);
  }
  /* Guarded because the test suites drive the SHIPPED module under a DOM shim that has no
     `location`; an unguarded read would make this file loadable only in a browser, and the whole
     point of exporting the view functions is that the tests exercise the real code. */
  function currentPath() {
    try { return (typeof location !== "undefined" && location) ? String(location.pathname || "") : ""; }
    catch (e) { return ""; }
  }
  function surfaceFor(pathname) {
    var p = String(pathname || "");
    var base = p.split("?")[0].split("#")[0].split("/").pop();
    if (!base) base = "index.html";
    return SURFACE_CADENCE[base] || null;
  }
  /* A WINDOW, not a count of minutes. plainMins(100800) reads "1680 minutes", which is true and
     unreadable; the sentence quoting the threshold has to be sayable out loud. */
  function plainWindow(s) {
    s = Math.max(0, Math.round(s || 0));
    if (s < 5400) return plainMins(s);   // unchanged wording for every bound that was already minutes
    if (s < 172800) { var h = Math.round(s / 3600); return (h <= 1 ? "hour" : h + " hours"); }
    var d = Math.round(s / 86400); return (d <= 1 ? "day" : d + " days");
  }
  function staleView(genIsoStr, staleAfterSecs, nowMs, workPaused, loudOverrideSecs) {
    // `due` (this page's published refresh contract) is still what `loud` is derived FROM - see
    // loudAfterSecs - it just no longer draws anything of its own. See the calm-band note below.
    // `loudOverrideSecs` is the surface's OWN cadence bound (SURFACE_CADENCE) when it has one; the
    // fifth argument is optional precisely so every existing caller and test keeps the old bound.
    var loud = (typeof loudOverrideSecs === "number" && loudOverrideSecs > 0)
      ? loudOverrideSecs
      : loudAfterSecs(staleAfterSecs);
    if (!genIsoStr) {
      // HONEST UNAVAILABLE, never an invented age.
      return { level: "warn", stale: false, age: null, thresh: loud,
               text: "We cannot tell how fresh these numbers are - this page did not publish a " +
                     "time. Treat nothing here as current until that is fixed." };
    }
    var t = new Date(genIsoStr).getTime();
    if (isNaN(t)) {
      return { level: "warn", stale: false, age: null, thresh: loud,
               text: "We cannot tell how fresh these numbers are - the time this page published " +
                     "cannot be read. Treat nothing here as current until that is fixed." };
    }
    var age = Math.max(0, Math.round((nowMs - t) / 1000));
    /* ONE CALM BAND, ALL THE WAY TO THE ALARM (CEO 20260730). There used to be a middle rung here:
       past `due` raised a full-width amber banner reading "A refresh is running late - these numbers
       were updated 5 minutes ago, and this page aims to refresh every 5 minutes" - an apology for
       being on time. It was never a fault. The bake behind these pages lands on a 300s cadence whose
       own gaps exceed 300s 49.7% of the time (n=1760 gaps over 7d in logs/board_bake.log; p99 895s),
       and the publish + CDN hop adds more again: 390s of live staleness measured at 18:32Z on
       2026-07-30 while scripts/publish_health.py recorded stale:false. A page must never shout before
       the machine's own pager does. So `due` no longer changes what a reader sees - it is still the
       published contract, and `loud` is still pinned to that pager's floor, but the only staleness
       banner left is the loud one below. */
    if (age <= loud) {
      return { level: "ok", stale: false, age: age, thresh: loud, text: "" };
    }
    if (workPaused) {
      /* FALSE-STALE GUARD. When work is paused on purpose, an ageing page is the EXPECTED
         consequence, not a broken publisher. State the age just as plainly, name the real reason,
         and do not paint it as a fault. */
      return { level: "warn", stale: true, age: age, thresh: loud,
               text: "These numbers were updated " + plainAgo(age) + ", so they are out of date - " +
                     "because work is paused. Nothing new arrives until work restarts." };
    }
    /* QUOTE THE THRESHOLD THAT ACTUALLY FIRED, not the schedule. This sentence used to end "and this
       page aims to refresh every 5 minutes" while the banner had in fact waited for the 15-minute
       alarm floor - so it named a number that was not the reason it was on screen, and made a
       genuinely dead page look like a page that was thirty seconds late. */
    return { level: "bad", stale: true, age: age, thresh: loud,
             text: "STALE - these numbers were last updated " + plainAgo(age) + ", well past the " +
                   plainWindow(loud) + " we allow before treating a page as out of date. " +
                   "Do not trust anything on this page until it refreshes." };
  }

  // ---- painters (every one of them writes a DEFINITE state; none of them can render blank) ----
  function paintPill(id, level, text) {
    var pill = document.getElementById(id);
    if (!pill) return;
    pill.className = "hwpill" + (level ? " " + level : "");
    var txt = pill.querySelector(".txt");
    if (txt) txt.textContent = text;
  }
  /* ---- STALENESS INVALIDATES A LIVE-STATE FIELD; IT DOES NOT MERELY APOLOGISE ABOVE IT.
     (CEO P0 #4, 2026-07-31: "a stale page renders every field UNKNOWN rather than last-known".)

     MEASURED, the exact incident. The public board published nothing between 00:43:47Z and 02:38:26Z -
     1h54m, no deploy commit at all - because an interrupted lane left a publish-guard file dirty. The
     frozen payload it left on screen said:

         generated_utc     2026-07-31T00:41:22Z
         stale_after_secs  300
         coordinator       { alive: true, last_heartbeat_utc: 2026-07-31T00:41:42Z }

     Every one of those was TRUE when it was written. `alive: true` then went on being displayed as a
     present-tense fact for the next two hours, through the death of that coordinator and an empty
     chair, because the pill only ever read the payload and the payload never changed. The freshness
     banner did its job and said "do not trust anything on this page" - and directly beneath it the
     chair pill said "Work is being run right now", which is the sentence a reader actually believes.

     A WARNING ABOVE A CONFIDENT WRONG ANSWER IS STILL A CONFIDENT WRONG ANSWER. So past the loud
     threshold, a field whose whole meaning is "right now" stops asserting anything: it degrades to
     UNKNOWN and names staleness as the reason. This is the never-blank contract, not a break from it -
     the pill still always says something, it just stops claiming to know a present-tense fact it
     cannot possibly know from a two-hour-old file.

     SCOPE, deliberately narrow: only NOW-fields (is anyone running, is the scout ticking, what is
     paused, how many directives wait). Basketball numbers are NOT degraded - a projection from
     00:41Z is still a real projection honestly labelled by the banner, and blanking the slate would
     punish a reader for our publishing fault. */
  function staleUnknown(what) {
    /* CALM, like the two pills it degrades. This is the honest-unknown state of an operator field,
       and an unknown is not a fault; the page's ACTUAL fault in this case - it stopped refreshing -
       is already stated once, loudly, in the freshness banner directly above, which is where a
       reader is meant to read it. Amber here was the same alarm a second time, one rung quieter. */
    return { level: "",
             text: "We cannot tell " + what + " - this page stopped refreshing, so anything it says " +
                   "about right now is out of date" };
  }
  function renderScout(sc, stale) {
    var v = stale ? staleUnknown("if the watcher is running") : scoutView(sc);
    paintPill("hw-scout", v.level, v.text);
  }
  function renderCoordinator(co, stale) {
    var v = stale ? staleUnknown("if anyone is running the work") : coordView(co);
    paintPill("hw-coord", v.level, v.text);
  }
  /* The PILL always states the work state in full - that is the never-blank contract, and it is
     unchanged. The BANNER is a separate decision made by the caller (see the precedence in
     renderStrip): a state that is real but not actionable stays in the pill and does not take a
     full-width line at the top of somebody's page. */
  function renderWork(v, showBanner) {
    paintPill("hw-pause", v.level, v.short);
    var banner = document.getElementById("hwwork");
    if (banner) {
      var loud = !!showBanner && v.level !== "ok";
      banner.className = loud ? v.level : "";   // "" hides it
      banner.textContent = loud ? v.text : "";
    }
  }
  function renderFresh(v) {
    var banner = document.getElementById("hwfresh");
    if (!banner) return;
    banner.className = v.level === "ok" ? "" : v.level;
    banner.textContent = v.text;
  }

  // ---- per-card stamps: any .hw-stamp[data-utc] -> "HH:MM (Xm ago)" ----
  function tickStamps() {
    var nodes = document.querySelectorAll(".hw-stamp[data-utc]");
    for (var i = 0; i < nodes.length; i++) {
      var iso = nodes[i].getAttribute("data-utc");
      var c = clockOf(iso);
      if (!c) { nodes[i].textContent = nodes[i].getAttribute("data-fallback") || ""; continue; }
      nodes[i].textContent = c + " (" + agoOf(iso) + ")";
    }
  }

  /* ---- poll THIS page's own payload, for pages that bake on their own clock.
     Same-origin, same discipline as status.json, and the page has already fetched this exact URL
     for its own content, so it is normally served straight out of the browser's cache. Only the
     one field is read. A page not in SURFACE_CADENCE makes no second request at all, and a failed
     read leaves dataIso null, which falls the basis back to status.json rather than blanking the
     line - the never-blank contract, unchanged. */
  function pollSurface() {
    var surface = surfaceFor(currentPath());
    if (!surface) return;
    fetch("./" + surface.payload, { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d) {
          var iso = d.generated_utc || (d.freshness && d.freshness.baked_utc) || null;
          if (iso) { dataIso = iso; }
        }
        renderStrip();
      })
      .catch(function () { renderStrip(); });
  }

  // ---- non-disruptive poll of status.json (strip only; never touches #main) ----
  function poll() {
    pollSurface();
    fetch(STATUS_URL, { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        lastFetch = Date.now();
        polled = true;
        if (s) { status = s; genIso = s.generated_utc || genIso; }
        renderStrip();
      })
      .catch(function () {
        // A failed poll keeps the last-known payload deliberately: the freshness line ages it on the
        // reader's own clock and goes loud by itself, which is more honest than blanking the strip.
        // A poll that has NEVER landed is a different thing, and says "we cannot tell".
        polled = true;
        renderStrip();
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
    agoOf: agoOf,
    // PURE view functions, exported so the test suites exercise THE SHIPPED CODE (not a copy):
    // tests/test_hardwood_chrome_copy.js and tests/test_status_page_states.py drive these through
    // node with a stub DOM.
    _pipeView: pipeView,
    _scoutView: scoutView,
    _coordView: coordView,
    _workView: workView,
    _staleView: staleView,
    // exported so the ruling above can be pinned on the SHIPPED function rather than a copy of it:
    // the stale-degraded chair/watcher fields must stay calm too, not merely one rung quieter.
    _staleUnknown: staleUnknown,
    _plainAgo: plainAgo,
    _pctSentence: pctSentence,
    PUB_FLOOR_SECS: PUB_FLOOR_SECS,
    STALE_DEFAULT_SECS: STALE_DEFAULT_SECS,
    _loudAfterSecs: loudAfterSecs,
    // per-surface cadence bounds, exported so tests exercise THE SHIPPED table, never a copy
    SURFACE_CADENCE: SURFACE_CADENCE,
    _surfaceFor: surfaceFor,
    _surfaceLoudSecs: surfaceLoudSecs,
    _plainWindow: plainWindow
  };
})();
