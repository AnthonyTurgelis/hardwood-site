/* FIBA international surface: same-origin public artifacts only.
   Reads fiba.json for the foundation, and fiba_dossier.json for the modernized dossier layout. */
(function () {
  "use strict";

  const FOUNDATION_FILE = "fiba.json";
  const DOSSIER_FILE = "fiba_dossier.json";

  const state = {
    payload: null,
    dossierPayload: null,
    players: [],
    playersFiltered: [],
    tournaments: [],
    sortKey: "ppg",
    sortDir: "desc",
    minGp: 3,

    // Dossier State
    dossierPlayers: [],
    dossierFiltered: [],
    dossierSortKey: "dossier_lines", // Default sort should not be impact across bases
    dossierSortDir: "desc"
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

    let isStale = false;
    let text = "Freshness unknown";

    if (!iso) {
      isStale = true;
    } else {
      const age = (Date.now() - new Date(iso).getTime()) / 1000;
      isStale = !(age >= 0) || age > 6 * 3600;
      text = et || iso;
      if (isStale) {
        text = "Stale — " + text;
      }
    }

    if (isStale) {
      el.classList.add("is-stale");
    } else {
      el.classList.remove("is-stale");
    }

    if (el.firstChild && el.firstChild.className === "hw-fresh-dot") {
      el.childNodes[1].textContent = " " + text;
    } else {
      el.textContent = " " + text;
    }
  }

  function fail(msg) {
    const b = $("fiba-players-body");
    if (b) b.innerHTML = '<tr><td colspan="9" style="color:var(--hw-red)">Error: ' + esc(msg) + "</td></tr>";
  }

  function failDossier(msg) {
    const s = $("dossier-section");
    if (s) s.style.display = "block";
    const b = $("dossier-players-body");
    if (b) b.innerHTML = '<tr><td colspan="5">Dossier unavailable: ' + esc(msg) + '</td></tr>';
    const c = $("team-strip");
    if (c) c.innerHTML = '<p class="hw-muted" style="font-style:italic;">Team talent strip unavailable without dossier data.</p>';
  }

  const kv = (label, val) => `<dt>${esc(label)}</dt><dd>${present(val) ? esc(val) : "—"}</dd>`;

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
      // Changed label to be honest to source/qualifying states per PASSPORT ruling
      note.textContent = rows.length + " pool/qualifying rows, " + contested + " contested"
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

  /* ---------------------------------------------------------------- player table (foundation) */
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
      if (av === null) return 1;
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
        // we only care about keys without dossier_ prefix
        if (!key || key.startsWith("dossier_")) return;
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

  function renderFoundationCoverage(cov) {
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

  /* ---------------------------------------------------------------- dossier layer */
  function extractImpact(p) {
    if (p.is_measured_wnba && p.rating !== undefined && p.rating !== null) {
      return number(p.rating);
    }
    if (p.tier_anchor !== undefined && p.tier_anchor !== null) {
      return number(p.tier_anchor);
    }
    return null;
  }

  function getLinesCount(p) {
    let count = 0;
    if (p.fiba_tournament_history) count += p.fiba_tournament_history.length;
    if (p.fiba_tournament_boxes) count += p.fiba_tournament_boxes.length;
    if (p.intl_club_leagues) count += p.intl_club_leagues.length;
    if (p.ncaa_career_lines) count += p.ncaa_career_lines.length;
    return count;
  }

  /* ------------------------------------------------------------ dossier team strip */
  function renderTeamStrip(players) {
    const host = $("team-strip");
    if (!host) return;
    if (!players || !players.length) {
       host.innerHTML = '<p class="hw-muted" style="font-style:italic;">Team talent strip unavailable without dossier data.</p>';
       return;
    }

    // Per requirements: no synthetic ranking. Do not average measured WNBA ratings with tier anchors by assumption.
    // Instead we will just render a simple summary card for the teams in the dossier that doesn't invent a cross-scale metric.

    const teams = {};
    players.forEach(p => {
      const team = p.team_abbr || p.team;
      if (!team) return;
      if (!teams[team]) teams[team] = { name: team, players: [] };
      teams[team].players.push(p);
    });

    const teamStats = Object.values(teams).map(t => {
      const measuredCount = t.players.filter(p => p.is_measured_wnba).length;
      const rosterCount = t.players.length;

      return { ...t, measuredCount, rosterCount };
    });

    // Sort alphabetically since we don't have a common impact scale
    teamStats.sort((a, b) => String(a.name).localeCompare(String(b.name)));

    host.innerHTML = teamStats.map((t) => {
      return `
        <div class="hw-team-card">
          <div style="font-weight:700; font-size:1.1rem; margin:0.2rem 0;">${esc(t.name)}</div>
          <div style="font-size:0.75rem; opacity:0.7; margin-top:0.4rem; display:flex; flex-direction:column; gap:0.2rem;">
            <span>${t.measuredCount} Measured / ${t.rosterCount} in Dossier</span>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ---------------------------------------------------------------- dossier player table */
  function applyDossierFilters() {
    const q = ($("dossier-search") && $("dossier-search").value || "").trim().toLowerCase();
    const teamFilter = ($("dossier-team-filter") && $("dossier-team-filter").value) || "";

    state.dossierFiltered = state.dossierPlayers.filter((p) => {
      if (teamFilter && (p.team_abbr || p.team) !== teamFilter) return false;
      if (q) {
        const hay = (String(p.player_name || "") + " " + String(p.team_abbr || p.team || "")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    const key = state.dossierSortKey;
    const dir = state.dossierSortDir === "asc" ? 1 : -1;

    state.dossierFiltered.sort((a, b) => {
      if (key === "dossier_player_name") {
        return String(a.player_name || "").localeCompare(String(b.player_name || "")) * dir;
      } else if (key === "dossier_team_abbr") {
        return String(a.team_abbr || a.team || "").localeCompare(String(b.team_abbr || b.team || "")) * dir;
      } else if (key === "dossier_basis") {
        const aBasis = a.is_measured_wnba ? 1 : 0;
        const bBasis = b.is_measured_wnba ? 1 : 0;
        if (aBasis !== bBasis) return (aBasis - bBasis) * dir;
        return String(a.provenance_tier || "").localeCompare(String(b.provenance_tier || "")) * dir;
      } else if (key === "dossier_impact") {
        // We must sort by basis first so we never rank tier anchors against WNBA ratings
        const aBasis = a.is_measured_wnba ? 1 : 0;
        const bBasis = b.is_measured_wnba ? 1 : 0;

        if (aBasis !== bBasis) {
           return (aBasis - bBasis) * dir; // Measured > Tier
        }

        // Within same basis, compare impact values safely
        const av = extractImpact(a);
        const bv = extractImpact(b);
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (av - bv) * dir;
      } else if (key === "dossier_lines") {
        return (getLinesCount(a) - getLinesCount(b)) * dir;
      }
      return 0;
    });

    renderDossierPlayers();
  }

  function renderDossierPlayers() {
    const body = $("dossier-players-body");
    if (!body) return;
    const rows = state.dossierFiltered;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5">No players match these filters.</td></tr>';
      return;
    }

    body.innerHTML = rows.map((p) => {
      let rosterClass = "hw-roster-pool";
      const isCertified = p.roster_status && p.roster_status.toLowerCase().includes("certified");
      const honestStatusText = isCertified ? "Dossier Pool" : (p.roster_status || "Pool");
      const rosterHtml = `<span class="hw-roster-status ${rosterClass}">${esc(honestStatusText)}</span>`;

      let basisHtml = "";
      if (p.is_measured_wnba) {
        basisHtml = `<span class="hw-chip" style="background:var(--gold,#e9b44c); color:#000;">Measured WNBA</span>`;
      } else if (p.provenance_tier) {
        basisHtml = `<span class="hw-chip" style="background:rgba(255,255,255,0.15); color:inherit;">${esc(p.provenance_tier)}</span>`;
      }

      // Rank is calculated *only* within those who share the same scale
      let impactHtml = "—";
      const imp = extractImpact(p);
      if (imp !== null) {
        let rank = 1;
        let totalWithImpact = 0;
        state.dossierPlayers.forEach(op => {
          const oImp = extractImpact(op);
          if (oImp !== null && op.is_measured_wnba === p.is_measured_wnba) {
            totalWithImpact++;
            if (oImp > imp) rank++;
          }
        });
        const pct = totalWithImpact > 0 ? ((totalWithImpact - rank + 1) / totalWithImpact) * 100 : 0;
        impactHtml = `
          <div style="display:flex; align-items:center; gap:0.5rem; justify-content:flex-end;">
            <span class="hw-num">${rank}/${totalWithImpact}</span>
            <div style="width:40px; height:4px; background:rgba(255,255,255,0.1); border-radius:2px;"><div style="height:100%; background:var(--gold,#e9b44c); border-radius:2px; width: ${pct}%"></div></div>
          </div>
        `;
      }

      const linesCount = getLinesCount(p);
      const rowId = esc(p.player_id || p.player_name);

      return `
        <tr data-id="${rowId}">
          <td>
             <button type="button" class="hw-button" style="background:none; border:none; padding:0; color:inherit; font:inherit; cursor:pointer;" onclick="selectDossierPlayer('${rowId}')" aria-label="View ${esc(p.player_name)}">
                 <span class="player-name" style="text-decoration:underline; font-weight:600;">${esc(p.player_name || "—")}</span>
             </button>${rosterHtml}
          </td>
          <td>${esc(p.team_abbr || p.team || "—")}</td>
          <td>${impactHtml}</td>
          <td>${basisHtml}</td>
          <td class="hw-num">${linesCount}</td>
        </tr>
      `;
    }).join("");
  }

  function wireDossierControls() {
    ["dossier-search", "dossier-team-filter"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("input", applyDossierFilters);
      if (el && el.tagName === "SELECT") el.addEventListener("change", applyDossierFilters);
    });

    const reset = $("dossier-reset");
    if (reset) {
      reset.addEventListener("click", () => {
        if ($("dossier-search")) $("dossier-search").value = "";
        if ($("dossier-team-filter")) $("dossier-team-filter").value = "";
        applyDossierFilters();
      });
    }

    Array.from(document.querySelectorAll("[data-sort]")).forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-sort");
        if (!key || !key.startsWith("dossier_")) return;

        if (state.dossierSortKey === key) {
          state.dossierSortDir = state.dossierSortDir === "asc" ? "desc" : "asc";
        } else {
          state.dossierSortKey = key;
          state.dossierSortDir = (key === "dossier_impact" || key === "dossier_lines") ? "desc" : "asc";
        }
        applyDossierFilters();
      });
    });
  }

  function fillDossierTeamFilter(players) {
    const sel = $("dossier-team-filter");
    if (!sel) return;
    const teams = Array.from(new Set(players.map((p) => p.team_abbr || p.team).filter(present))).sort();
    teams.forEach((t) => {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      sel.appendChild(o);
    });
  }

  /* ---------------------------------------------------------------- dossier inspector */
  window.selectDossierPlayer = function(id) {
    const tbody = $("dossier-players-body");
    if (tbody) {
      Array.from(tbody.querySelectorAll("tr")).forEach(row => {
          if (row.getAttribute("data-id") === id) {
              row.setAttribute("aria-selected", "true");
          } else {
              row.setAttribute("aria-selected", "false");
          }
      });
    }

    const p = state.dossierPlayers.find(x => (x.player_id || x.player_name) === id);
    if (!p) return;

    const insp = $("inspector");
    if (!insp) return;

    let html = `<div>`;
    html += `<h2 style="margin:0 0 0.25rem; font-size:1.25rem;">${esc(p.player_name)}</h2>`;

    if (p.provenance_note) {
      html += `<div style="background:rgba(255,255,255,0.05); padding:0.5rem; border-left:2px solid rgba(255,255,255,0.5); font-size:0.8rem; margin-bottom:1rem;">${esc(p.provenance_note)}</div>`;
    }

    html += `</div>`;

    if (p.unheld_league_note) {
      html += `<div style="background:rgba(233,180,76,0.1); border-left:2px solid var(--gold,#e9b44c); color:var(--gold,#e9b44c); padding:0.5rem; font-size:0.8rem; margin-bottom:1rem; font-weight:600;">League not held: ${esc(p.unheld_league_note)}</div>`;
    }

    const hasHistory = p.fiba_tournament_history && p.fiba_tournament_history.length > 0;
    const hasBoxes = p.fiba_tournament_boxes && p.fiba_tournament_boxes.length > 0;
    const hasIntl = p.intl_club_leagues && p.intl_club_leagues.length > 0;
    const hasNcaa = p.ncaa_career_lines && p.ncaa_career_lines.length > 0;

    if (!hasHistory && !hasBoxes && !hasIntl && !hasNcaa) {
      insp.innerHTML = html + `<div class="hw-muted" style="font-style:italic;">This player has no external league data available.</div>`;
      return;
    }

    if (hasHistory) {
      html += `
        <div style="margin-bottom:1.5rem;">
          <h3 style="margin:0 0 0.5rem; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.05em; opacity:0.7; border-bottom:1px solid rgba(128,128,128,0.25); padding-bottom:0.25rem;">FIBA Tournament History</h3>
          <table style="width:100%; border-collapse:collapse; font-size:0.8rem; text-align:right;">
            <thead>
              <tr><th style="text-align:left; opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">Competition</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">Season</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">Team</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">GP</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">MPG</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">PPG</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">RPG</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">APG</th></tr>
            </thead>
            <tbody>
              ${p.fiba_tournament_history.map(r => `<tr>
                <td style="text-align:left; padding:0.25rem;">${esc(r.competition)}</td><td style="padding:0.25rem;">${esc(r.season)}</td><td style="padding:0.25rem;">${esc(r.team)}</td>
                <td class="hw-num" style="padding:0.25rem;">${r.gp}</td><td class="hw-num" style="padding:0.25rem;">${fmt(r.mpg)}</td><td class="hw-num" style="padding:0.25rem;">${fmt(r.ppg)}</td><td class="hw-num" style="padding:0.25rem;">${fmt(r.rpg)}</td><td class="hw-num" style="padding:0.25rem;">${fmt(r.apg)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    if (hasBoxes) {
      html += `
        <div style="margin-bottom:1.5rem;">
          <h3 style="margin:0 0 0.5rem; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.05em; opacity:0.7; border-bottom:1px solid rgba(128,128,128,0.25); padding-bottom:0.25rem;">This Tournament Boxes</h3>
          <table style="width:100%; border-collapse:collapse; font-size:0.8rem; text-align:right;">
            <thead>
              <tr><th style="text-align:left; opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">Type</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">Opponent</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">Min</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">PTS</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">REB</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">AST</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">EFF</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">+/-</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">Start</th></tr>
            </thead>
            <tbody>
              ${p.fiba_tournament_boxes.map(r => {
                return `<tr>
                  <td style="text-align:left; padding:0.25rem;">${esc(r.competition_type)}</td><td style="padding:0.25rem;">${esc(r.opponent)}</td><td class="hw-num" style="padding:0.25rem;">${fmt(r.minutes)}</td>
                  <td class="hw-num" style="padding:0.25rem;">${r.pts}</td><td class="hw-num" style="padding:0.25rem;">${r.reb}</td><td class="hw-num" style="padding:0.25rem;">${r.ast}</td><td class="hw-num" style="padding:0.25rem;">${r.eff}</td><td class="hw-num" style="padding:0.25rem;">${r.plus_minus}</td>
                  <td style="padding:0.25rem;">${r.starter ? 'Y' : 'N'}</td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    if (hasIntl) {
      html += `
        <div style="margin-bottom:1.5rem;">
          <h3 style="margin:0 0 0.5rem; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.05em; opacity:0.7; border-bottom:1px solid rgba(128,128,128,0.25); padding-bottom:0.25rem;">International Clubs</h3>
          <table style="width:100%; border-collapse:collapse; font-size:0.8rem; text-align:right;">
            <thead>
              <tr><th style="text-align:left; opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">Competition</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">Season</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">Team</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">GP</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">MPG</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">PPG</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">RPG</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">APG</th></tr>
            </thead>
            <tbody>
              ${p.intl_club_leagues.map(r => `<tr>
                <td style="text-align:left; padding:0.25rem;">${esc(r.competition)}</td><td style="padding:0.25rem;">${esc(r.season)}</td><td style="padding:0.25rem;">${esc(r.team)}</td>
                <td class="hw-num" style="padding:0.25rem;">${r.gp}</td><td class="hw-num" style="padding:0.25rem;">${fmt(r.mpg)}</td><td class="hw-num" style="padding:0.25rem;">${fmt(r.ppg)}</td><td class="hw-num" style="padding:0.25rem;">${fmt(r.rpg)}</td><td class="hw-num" style="padding:0.25rem;">${fmt(r.apg)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    if (hasNcaa) {
      html += `
        <div style="margin-bottom:1.5rem;">
          <h3 style="margin:0 0 0.5rem; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.05em; opacity:0.7; border-bottom:1px solid rgba(128,128,128,0.25); padding-bottom:0.25rem;">NCAA</h3>
          <table style="width:100%; border-collapse:collapse; font-size:0.8rem; text-align:right;">
            <thead>
              <tr><th style="text-align:left; opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">Season</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">Team</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">GP</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">PPG</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">RPG</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">APG</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">FG%</th><th style="opacity:0.7; font-weight:normal; font-size:0.7rem; padding:0.25rem;">FT%</th></tr>
            </thead>
            <tbody>
              ${p.ncaa_career_lines.map(r => `<tr>
                <td class="hw-num" style="text-align:left; padding:0.25rem;">${r.season}</td><td style="padding:0.25rem;">${esc(r.team)}</td>
                <td class="hw-num" style="padding:0.25rem;">${r.gp}</td><td class="hw-num" style="padding:0.25rem;">${fmt(r.ppg)}</td><td class="hw-num" style="padding:0.25rem;">${fmt(r.rpg)}</td><td class="hw-num" style="padding:0.25rem;">${fmt(r.apg)}</td>
                <td class="hw-num" style="padding:0.25rem;">${fmt(r.fg_pct !== null && r.fg_pct !== undefined ? r.fg_pct * 100 : null)}%</td><td class="hw-num" style="padding:0.25rem;">${fmt(r.ft_pct !== null && r.ft_pct !== undefined ? r.ft_pct * 100 : null)}%</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    insp.innerHTML = html;
  };

  /* ----------------------------------------------------------------------- boot */
  function boot() {
    // 1. Fetch foundation
    fetch(FOUNDATION_FILE + "?cb=" + Date.now(), { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("fetch " + FOUNDATION_FILE + " returned HTTP " + r.status);
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
        renderFoundationCoverage(data.player_tournament_stats_coverage || null);

        // 2. Fetch Dossier progressively
        return fetch(DOSSIER_FILE + "?cb=" + Date.now(), { cache: "no-store" });
      })
      .then((r) => {
        if (!r.ok) throw new Error("fetch " + DOSSIER_FILE + " returned HTTP " + r.status);
        return r.json();
      })
      .then((data) => {
        // Show dossier section
        const s = $("dossier-section");
        if (s) s.style.display = "block";

        state.dossierPayload = data;
        state.dossierPlayers = data.players || [];

        renderTeamStrip(state.dossierPlayers);
        fillDossierTeamFilter(state.dossierPlayers);
        wireDossierControls();
        applyDossierFilters();

        // Render explicit dossier coverage if available, or nothing.
        // Do not pass data.summary_counts blindly to renderCoverage which expects served/why/withheld
        const el = $("dossier-coverage");
        if (el) {
             if (data.summary_counts) {
                 const sc = data.summary_counts;
                 const parts = [];
                 if (state.dossierPlayers.length > 0) parts.push(`${state.dossierPlayers.length} dossier players`);
                 if (sc.players_with_fiba_history > 0) parts.push(`${sc.players_with_fiba_history} FIBA history`);
                 if (sc.players_with_intl_club_lines > 0) parts.push(`${sc.players_with_intl_club_lines} club lines`);
                 if (sc.players_with_ncaa_lines > 0) parts.push(`${sc.players_with_ncaa_lines} NCAA`);
                 if (sc.measured_wnba > 0) parts.push(`${sc.measured_wnba} measured WNBA`);
                 el.textContent = parts.join(" · ");
             } else {
                 el.textContent = "";
             }
        }
      })
      .catch((err) => {
         // This catch block handles failures in EITHER fetch.
         if (!state.payload) {
             // Foundation failed
             const b = $("fiba-wc");
             if (b) b.innerHTML = '<tr><td style="color:var(--hw-red)">Error: Foundation artifact ' + FOUNDATION_FILE + ' unavailable: ' + esc(String(err)) + '</td></tr>';
         } else {
             // Foundation succeeded but dossier failed
             failDossier(String(err));
         }
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
