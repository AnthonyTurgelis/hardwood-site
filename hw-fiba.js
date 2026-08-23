/* FIBA international surface: same-origin public artifacts only.
   Reads fiba.json, which the bake writes from the warehouse. Shell + artifact, per the
   2026-08-22 ruling: no markup is baked here, every count is computed at render. */
(function () {
  "use strict";

  const FILE = "fiba.json";

  const state = {
    payload: null,
    players: [],
    playersFiltered: [],
    tournaments: [],
    sortKey: "ppg",
    sortDir: "desc",
    minGp: 3,
  };

  const $ = (id) => document.getElementById(id);
  const present = (v) => v !== null && v !== undefined && v !== "";
  const number = (v) => {
    if (!present(v) || v === true || v === false) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
  const fmt = (v, dp) => {
    const n = number(v);
    return n === null ? "—" : n.toFixed(dp === undefined ? 1 : dp);
  };
  const int = (v) => {
    const n = number(v);
    return n === null ? "—" : String(Math.round(n));
  };

  function setFresh(iso, et) {
    const el = document.querySelector("[data-fresh]");
    if (!el) return;
    if (!iso) {
      el.innerHTML = '<span class="hw-fresh-dot"></span>Freshness unknown';
      el.classList.add("is-stale");
      return;
    }
    const age = (Date.now() - new Date(iso).getTime()) / 1000;
    const stale = !(age >= 0) || age > 6 * 3600;
    const label = et || new Date(iso).toISOString().slice(0, 16).replace("T", " ") + "Z";
    el.innerHTML = '<span class="hw-fresh-dot"></span>' + esc(stale ? "Stale — " + label : label);
    el.classList.toggle("is-stale", stale);
  }

  function fail(message) {
    const main = $("fiba-root");
    if (main) {
      main.innerHTML = '<div class="hw-module"><div class="hw-module-head"><h2>This page could not load</h2></div>'
        + '<p>' + esc(message) + '</p>'
        + '<p>The page is a shell over <code>' + esc(FILE) + '</code>. If that artifact is missing from the '
        + 'published site, the page says so here rather than rendering an empty table that looks like real emptiness.</p>'
        + '</div>';
    }
    setFresh(null);
  }

  /* ------------------------------------------------------------ world cup 2026 */
  function renderWorldCup(wc) {
    const host = $("fiba-wc");
    if (!host) return;
    const comp = (wc && wc.competition && wc.competition[0]) || null;
    const teams = (wc && wc.teams) || [];
    if (!comp && !teams.length) {
      host.innerHTML = '<p>No World Cup competition rows are published in this artifact.</p>';
      return;
    }
    let html = "";
    if (comp) {
      html += '<dl class="hw-kv">'
        + kv("Competition", comp.competition_name)
        + kv("Host", comp.city)
        + kv("Venues", comp.venues)
        + kv("Dates", [comp.first_date_local, comp.last_date_local].filter(present).join(" to "))
        + kv("Teams", comp.n_teams)
        + kv("Groups", comp.n_groups)
        + "</dl>";
    }
    const groups = {};
    teams.forEach((t) => {
      const g = present(t.group_code) ? String(t.group_code) : "—";
      (groups[g] = groups[g] || []).push(t);
    });
    const keys = Object.keys(groups).sort();
    if (keys.length) {
      html += '<div class="hw-group-grid">';
      keys.forEach((g) => {
        html += '<div class="hw-group"><h3>Group ' + esc(g) + "</h3><ul>";
        groups[g].slice().sort((a, b) => String(a.team_name || a.team).localeCompare(String(b.team_name || b.team)))
          .forEach((t) => {
            const route = present(t.qual_route) ? ' <span class="hw-muted">' + esc(t.qual_route) + "</span>" : "";
            html += "<li><strong>" + esc(t.team || "—") + "</strong> " + esc(t.team_name || "") + route + "</li>";
          });
        html += "</ul></div>";
      });
      html += "</div>";
    }
    host.innerHTML = html;
    const c = $("fiba-wc-count");
    if (c) c.textContent = teams.length + (teams.length === 1 ? " team" : " teams");
  }

  function kv(label, value) {
    return "<dt>" + esc(label) + "</dt><dd>" + (present(value) ? esc(value) : "—") + "</dd>";
  }

  /* ------------------------------------------------- roster certification states */
  function renderCertification(wc) {
    const body = $("fiba-cert-body");
    if (!body) return;
    const rows = (wc && wc.roster_certification_states) || [];
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="4">No certification rows published.</td></tr>';
      return;
    }
    const contested = rows.filter((r) => r.contested === true).length;
    const note = $("fiba-cert-note");
    if (note) {
      note.textContent = rows.length + " roster rows, " + contested + " contested"
        + (contested ? " — a contested row means two source rows disagree and the wider, less confident reading is shown." : ".");
    }
    const sorted = rows.slice().sort((a, b) => {
      const t = String(a.team || "").localeCompare(String(b.team || ""));
      return t !== 0 ? t : String(a.player_name || "").localeCompare(String(b.player_name || ""));
    });
    body.innerHTML = sorted.map((r) => {
      const flag = r.contested === true
        ? '<span class="hw-flag" title="' + esc(r.contested_note || "sources disagree") + '">contested</span>'
        : "";
      return "<tr><td>" + esc(r.team || "—") + "</td><td>" + esc(r.player_name || "—") + "</td><td>"
        + esc(r.roster_status || "—") + "</td><td>" + flag + "</td></tr>";
    }).join("");
  }

  /* ------------------------------------------------------------ tournament table */
  function renderTournaments(rows) {
    const body = $("fiba-tourn-body");
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6">No tournament rows published.</td></tr>';
      return;
    }
    const sorted = rows.slice().sort((a, b) => {
      const s = (number(b.season) || 0) - (number(a.season) || 0);
      return s !== 0 ? s : String(a.tournament_name || "").localeCompare(String(b.tournament_name || ""));
    });
    body.innerHTML = sorted.map((r) => "<tr>"
      + "<td>" + int(r.season) + "</td>"
      + "<td>" + esc(r.tournament_name || "—") + "</td>"
      + "<td>" + esc(r.tournament_type || "—") + "</td>"
      + "<td>" + (present(r.gold_team) ? esc(r.gold_team) : "—") + "</td>"
      + "<td>" + (present(r.silver_team) ? esc(r.silver_team) : "—") + "</td>"
      + "<td>" + (present(r.bronze_team) ? esc(r.bronze_team) : "—") + "</td>"
      + "</tr>").join("");
    const c = $("fiba-tourn-count");
    if (c) c.textContent = rows.length + " tournaments";
  }

  /* ---------------------------------------------------------------- player table */
  function applyPlayerFilters() {
    const q = ($("fiba-search") && $("fiba-search").value || "").trim().toLowerCase();
    const type = ($("fiba-type") && $("fiba-type").value) || "";
    const minGp = number($("fiba-mingp") && $("fiba-mingp").value);
    state.minGp = minGp === null ? 0 : minGp;

    state.playersFiltered = state.players.filter((p) => {
      if (state.minGp && (number(p.gp) || 0) < state.minGp) return false;
      if (type && String(p.tournament_type || "") !== type) return false;
      if (q) {
        const hay = (String(p.player_raw || "") + " " + String(p.team || "") + " "
          + String(p.tournament_name || "")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    const key = state.sortKey;
    const dir = state.sortDir === "asc" ? 1 : -1;
    state.playersFiltered.sort((a, b) => {
      const av = key === "player" ? String(a.player_raw || "") : number(a[key]);
      const bv = key === "player" ? String(b.player_raw || "") : number(b[key]);
      if (key === "player") return String(av).localeCompare(String(bv)) * dir;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;      // missing always sorts last, both directions
      if (bv === null) return -1;
      return (av - bv) * dir;
    });
    renderPlayers();
  }

  const PLAYER_CAP = 250;

  function renderPlayers() {
    const body = $("fiba-players-body");
    if (!body) return;
    const rows = state.playersFiltered;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9">No player rows match these filters.</td></tr>';
    } else {
      body.innerHTML = rows.slice(0, PLAYER_CAP).map((p) => "<tr>"
        + "<td>" + esc(p.player_raw || p.player_norm || "—") + "</td>"
        + "<td>" + esc(p.team || "—") + "</td>"
        + "<td>" + esc(p.tournament_name || "—") + "</td>"
        + "<td>" + int(p.season) + "</td>"
        + "<td>" + int(p.gp) + "</td>"
        + "<td>" + fmt(p.mpg) + "</td>"
        + "<td>" + fmt(p.ppg) + "</td>"
        + "<td>" + fmt(p.rpg) + "</td>"
        + "<td>" + fmt(p.apg) + "</td>"
        + "</tr>").join("");
    }
    const c = $("fiba-players-count");
    if (c) {
      c.textContent = rows.length + " of " + state.players.length + " rows"
        + (rows.length > PLAYER_CAP ? " — showing the first " + PLAYER_CAP : "");
    }
  }

  function wirePlayerControls() {
    ["fiba-search", "fiba-type", "fiba-mingp"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("input", applyPlayerFilters);
      if (el && el.tagName === "SELECT") el.addEventListener("change", applyPlayerFilters);
    });
    const reset = $("fiba-reset");
    if (reset) {
      reset.addEventListener("click", () => {
        if ($("fiba-search")) $("fiba-search").value = "";
        if ($("fiba-type")) $("fiba-type").value = "";
        if ($("fiba-mingp")) $("fiba-mingp").value = "3";
        applyPlayerFilters();
      });
    }
    Array.from(document.querySelectorAll("[data-sort]")).forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-sort");
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = key;
          state.sortDir = key === "player" ? "asc" : "desc";
        }
        applyPlayerFilters();
      });
    });
  }

  function fillTypeFilter(rows) {
    const sel = $("fiba-type");
    if (!sel) return;
    const types = Array.from(new Set(rows.map((r) => r.tournament_type).filter(present))).sort();
    types.forEach((t) => {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      sel.appendChild(o);
    });
  }

  /* ------------------------------------------------------------------- coverage */
  function renderCoverage(cov) {
    const el = $("fiba-coverage");
    if (!el) return;
    if (!cov) { el.textContent = ""; return; }
    const served = number(cov.served);
    const withheld = number(cov.withheld_unclassified);
    let txt = "";
    if (served !== null) txt += served.toLocaleString() + " player rows served";
    if (withheld !== null) txt += (txt ? ", " : "") + withheld.toLocaleString() + " withheld";
    if (cov.why) txt += (txt ? " — " : "") + cov.why;
    el.textContent = txt;
  }

  /* ----------------------------------------------------------------------- boot */
  function boot() {
    fetch(FILE + "?cb=" + Date.now(), { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("fetch " + FILE + " returned HTTP " + r.status);
        return r.json();
      })
      .then((data) => {
        state.payload = data;
        setFresh(data.generated_utc || data.as_of, data.generated_et);
        state.tournaments = data.tournament_results || [];
        state.players = data.player_tournament_stats || [];
        renderWorldCup(data.wc_2026 || null);
        renderCertification(data.wc_2026 || null);
        renderTournaments(state.tournaments);
        fillTypeFilter(state.players);
        wirePlayerControls();
        applyPlayerFilters();
        renderCoverage(data.player_tournament_stats_coverage || null);
      })
      .catch((err) => fail(String(err && err.message ? err.message : err)));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
