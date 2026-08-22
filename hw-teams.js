/* Dense Teams: same-origin public artifacts only. */
(function () {
  "use strict";

  const FILES = {
    teams: "teams.json",
    standings: "standings.json",
    finals: "finals.json",
    availability: "availability.json",
    players: "players.json",
    games: "games.json",
  };

  const state = {
    payloads: {},
    teams: [],
    filtered: [],
    selected: null,
    sortKey: "rank",
    sortDir: "asc",
    viz: "strength-title",
    recordMeta: { active: false, recordsAsOf: null, outlookAsOf: null, gameCount: null },
  };

  const $ = (id) => document.getElementById(id);
  const qa = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const present = (value) => value !== null && value !== undefined && value !== "";
  const number = (value) => {
    if (!present(value) || value === true || value === false) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const first = (row, keys) => {
    for (const key of keys) {
      if (row && present(row[key])) return row[key];
    }
    return null;
  };
  const escapeHTML = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
  const fixed = (value, digits = 1) => {
    const parsed = number(value);
    return parsed === null ? "—" : parsed.toFixed(digits);
  };
  const signed = (value, digits = 1) => {
    const parsed = number(value);
    return parsed === null ? "—" : `${parsed > 0 ? "+" : ""}${parsed.toFixed(digits)}`;
  };
  const probability = (value) => {
    let parsed = number(value);
    if (parsed === null) return null;
    if (parsed > 1 && parsed <= 100) parsed /= 100;
    return parsed >= 0 && parsed <= 1 ? parsed : null;
  };
  const percent = (value, digits = 0) => {
    const parsed = probability(value);
    return parsed === null ? "—" : `${(parsed * 100).toFixed(digits)}%`;
  };
  const rows = (payload, keys) => {
    if (Array.isArray(payload)) return payload;
    for (const key of keys) {
      const value = payload && payload[key];
      if (Array.isArray(value)) return value;
      if (value && typeof value === "object") {
        return Object.keys(value).map((name) => ({ key: name, ...value[name] }));
      }
    }
    return [];
  };
  const fetchJSON = (path) => fetch(path, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`${path} returned ${response.status}`);
      return response.json();
    })
    .catch((error) => {
      console.warn(error);
      return {};
    });
  const toDate = (value) => {
    if (!present(value)) return null;
    const text = String(value);
    const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00` : text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const dateText = (value) => {
    const parsed = toDate(value);
    return parsed
      ? parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : String(value || "Date not published");
  };
  const ageText = (value) => {
    const parsed = toDate(value);
    if (!parsed) return "time not published";
    const seconds = Math.max(0, (Date.now() - parsed.getTime()) / 1000);
    if (seconds < 90) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  function normalizeAvailability(payload) {
    const output = {};
    rows(payload, ["shorthanded", "teams", "rows", "items"]).forEach((row) => {
      const team = String(first(row, ["team", "team_abbr", "abbr", "key"]) || "").toUpperCase();
      if (!team) return;
      const names = first(row, ["names", "out_names", "players"]);
      const unsized = first(row, ["unsized", "unsized_names"]);
      output[team] = {
        out: number(first(row, ["out", "out_count", "n_out"])),
        minutes_out: number(first(row, ["minutes_out", "missing_minutes", "min_out"])),
        names: Array.isArray(names) ? names : [],
        unsized: Array.isArray(unsized) ? unsized : [],
        line: first(row, ["line", "summary", "note"]),
      };
    });
    return output;
  }

  function normalizePlayers(payload) {
    const output = {};
    const source = payload && payload.ratings ? payload.ratings : payload;
    rows(source, ["players", "rows", "items"]).forEach((row) => {
      const team = String(first(row, ["team", "team_abbr", "abbr"]) || "").toUpperCase();
      if (!team) return;
      if (!output[team]) output[team] = [];
      output[team].push({
        id: first(row, ["id", "player_id"]),
        name: first(row, ["name", "player_name"]) || "Player",
        impact: number(first(row, ["rating", "impact", "impact_rating"])),
        points: number(first(row, ["pts", "ppg"])),
        minutes: number(first(row, ["minutes", "proj_min", "min_avg"])),
        provisional: Boolean(first(row, ["impact_provisional", "thin", "provisional"])),
      });
    });
    Object.values(output).forEach((list) => list.sort((a, b) => (b.impact ?? -999) - (a.impact ?? -999)));
    return output;
  }

  function normalizeGames(payload) {
    return rows(payload, ["games", "rows", "items"]).map((row) => {
      const home = String(first(row, ["home", "home_team", "home_abbr"]) || "").toUpperCase();
      const away = String(first(row, ["away", "away_team", "away_abbr"]) || "").toUpperCase();
      const homeScore = number(first(row, ["home_score", "score_home"]));
      const awayScore = number(first(row, ["away_score", "score_away"]));
      const status = String(first(row, ["status", "game_status"]) || "").toLowerCase();
      return {
        home,
        away,
        date: first(row, ["date", "game_date", "tip_utc"]),
        tip: first(row, ["tip_et", "tip", "time"]),
        call: first(row, ["call", "predicted_winner"]),
        margin: number(first(row, ["pred_margin", "predicted_margin"])),
        pHome: probability(first(row, ["p_home_win", "home_win_probability"])),
        final: (homeScore !== null && awayScore !== null) || status.includes("final"),
      };
    }).filter((game) => game.home || game.away);
  }

  function finalRecordSnapshot(payload) {
    const byTeam = {};
    let gameCount = 0;
    let asOf = null;
    let maxDate = null;
    rows(payload, ["games", "rows", "items"]).forEach((game) => {
      const home = String(first(game, ["home", "home_team", "home_abbr"]) || "").toUpperCase();
      const away = String(first(game, ["away", "away_team", "away_abbr"]) || "").toUpperCase();
      const homeScore = number(first(game, ["home_score", "actual_home_score"]));
      const awayScore = number(first(game, ["away_score", "actual_away_score"]));
      if (!home || !away || homeScore === null || awayScore === null || homeScore === awayScore) return;
      if (!byTeam[home]) byTeam[home] = { wins: 0, losses: 0, gp: 0 };
      if (!byTeam[away]) byTeam[away] = { wins: 0, losses: 0, gp: 0 };
      byTeam[home].gp += 1;
      byTeam[away].gp += 1;
      if (homeScore > awayScore) {
        byTeam[home].wins += 1;
        byTeam[away].losses += 1;
      } else {
        byTeam[away].wins += 1;
        byTeam[home].losses += 1;
      }
      const rawDate = first(game, ["date", "game_date"]);
      const parsedDate = toDate(rawDate);
      if (parsedDate && (!maxDate || parsedDate.getTime() > maxDate.getTime())) {
        maxDate = parsedDate;
        asOf = String(rawDate);
      }
      gameCount += 1;
    });
    return { byTeam, gameCount, asOf };
  }

  function currentStandingRows(standingPayload, finalsPayload) {
    const source = rows(standingPayload, ["teams", "standings", "rows", "items"]);
    const progress = standingPayload && standingPayload.progress ? standingPayload.progress : {};
    const results = finalRecordSnapshot(finalsPayload);
    const claimedPlayed = number(progress.games_played);
    const useFinals = source.length > 0
      && results.gameCount >= (claimedPlayed === null ? 0 : claimedPlayed)
      && source.every((row) => Boolean(results.byTeam[String(first(row, ["team", "team_abbr", "abbr", "key"]) || "").toUpperCase()]));
    let patched = source.map((row, index) => {
      const code = String(first(row, ["team", "team_abbr", "abbr", "key"]) || "").toUpperCase();
      const current = useFinals ? results.byTeam[code] : null;
      return {
        ...row,
        team: code,
        wins: current ? current.wins : number(first(row, ["wins", "w"])),
        losses: current ? current.losses : number(first(row, ["losses", "l"])),
        _sourceIndex: index,
      };
    });
    if (useFinals) {
      const ordered = patched.slice().sort((a, b) => {
        const aGames = a.wins + a.losses;
        const bGames = b.wins + b.losses;
        const aPct = aGames > 0 ? a.wins / aGames : -1;
        const bPct = bGames > 0 ? b.wins / bGames : -1;
        return bPct - aPct || a._sourceIndex - b._sourceIndex;
      });
      const leader = ordered[0];
      patched = patched.map((row) => ({
        ...row,
        games_back: leader ? ((leader.wins - row.wins) + (row.losses - leader.losses)) / 2 : null,
      }));
    }
    state.recordMeta = {
      active: useFinals,
      recordsAsOf: useFinals ? results.asOf : (progress.standings_asof || null),
      outlookAsOf: progress.outlook_asof || first(standingPayload, ["generated_utc", "generated"]) || null,
      gameCount: useFinals ? results.gameCount : claimedPlayed,
    };
    return patched;
  }

  function normalizeTeams(teamPayload, standingPayload, finalsPayload, availabilityPayload, playerPayload, gamePayload) {
    const standingMap = {};
    currentStandingRows(standingPayload, finalsPayload).forEach((row) => {
      const code = String(first(row, ["team", "team_abbr", "abbr", "key"]) || "").toUpperCase();
      if (code) standingMap[code] = row;
    });

    const availability = normalizeAvailability(availabilityPayload);
    const players = normalizePlayers(playerPayload);
    const games = normalizeGames(gamePayload);
    const base = rows(teamPayload, ["teams", "rows", "items"]).slice();
    const existing = new Set(base.map((row) => String(first(row, ["team", "team_abbr", "abbr", "key"]) || "").toUpperCase()));
    Object.keys(standingMap).forEach((code) => {
      if (!existing.has(code)) base.push({ team: code });
    });

    const seen = new Set();
    const output = [];
    base.forEach((row, index) => {
      const team = String(first(row, ["team", "team_abbr", "abbr", "key"]) || "").toUpperCase();
      if (!team || seen.has(team)) return;
      seen.add(team);
      const standing = standingMap[team] || {};
      const trend = first(row, ["trend", "history"]) || {};
      let finishRange = first(standing, ["proj_range_90", "win_range_90", "range90"]);
      if (!Array.isArray(finishRange)) {
        finishRange = [first(standing, ["proj_lo", "range_lo"]), first(standing, ["proj_hi", "range_hi"])];
      }
      const playoffFromStanding = probability(first(standing, ["p_playoff", "playoff_probability"]));
      const titleFromStanding = probability(first(standing, ["p_title", "title_probability"]));
      output.push({
        team,
        name: first(row, ["team_full", "team_name", "name"]) || first(standing, ["team_full", "team_name", "name"]) || team,
        conference: first(standing, ["conference", "conf"]),
        rank: number(first(row, ["rank", "power_rank"])) || index + 1,
        wins: number(first(standing, ["wins", "w"])),
        losses: number(first(standing, ["losses", "l"])),
        gb: number(first(standing, ["games_back", "gb"])),
        strength: number(first(row, ["strength", "rating", "power"])),
        churn: number(first(row, ["churn", "movement", "strength_move"])),
        proj_median_wins: number(first(standing, ["proj_median_wins", "projected_wins", "proj_wins"])),
        proj_range_90: [number(finishRange[0]), number(finishRange[1])],
        p_playoff: playoffFromStanding !== null ? playoffFromStanding : probability(first(row, ["playoff_pct", "playoff"])),
        p_title: titleFromStanding !== null ? titleFromStanding : probability(first(row, ["title_pct", "title"])),
        trendStrength: Array.isArray(trend.strength) ? trend.strength.map(number).filter((value) => value !== null) : [],
        titleMove: number(first(trend, ["title_move", "move"])),
        moveDays: number(first(trend, ["move_days", "days"])),
        availability: availability[team] || null,
        players: players[team] || [],
        games: games.filter((game) => !game.final && (game.home === team || game.away === team))
          .sort((a, b) => (toDate(a.date)?.getTime() || Number.MAX_SAFE_INTEGER) - (toDate(b.date)?.getTime() || Number.MAX_SAFE_INTEGER)),
      });
    });
    return output;
  }

  function record(team) {
    return team.wins === null || team.losses === null ? "—" : `${team.wins}-${team.losses}`;
  }
  function unavailableMinutes(team) {
    return team.availability ? team.availability.minutes_out : null;
  }
  function availabilityState(team) {
    const availability = team.availability;
    if (!availability) return "unknown";
    const out = availability.out || 0;
    const minutes = availability.minutes_out || 0;
    if (out === 0 && minutes === 0) return "clear";
    if (out >= 4 || minutes >= 80) return "heavy";
    return "short";
  }
  function availabilityText(team) {
    const availability = team.availability;
    if (!availability) return "Not published";
    if (availability.line) return availability.line;
    if ((availability.out || 0) === 0 && (availability.minutes_out || 0) === 0) return "Rotation intact";
    const parts = [];
    if (availability.out !== null) parts.push(`${availability.out} out`);
    if (availability.minutes_out !== null) parts.push(`${fixed(availability.minutes_out, 0)} min missing`);
    return parts.join(" · ") || "Not published";
  }
  function outlookState(team) {
    if (team.p_playoff === null && team.p_title === null) return "unknown";
    if (team.p_title !== null && team.p_title >= 0.10) return "title";
    if (team.p_playoff !== null && team.p_playoff >= 0.50) return "playoff";
    if (team.p_playoff !== null && team.p_playoff >= 0.25) return "bubble";
    return "longshot";
  }
  function nextGameText(team) {
    const game = team.games[0];
    if (!game) return "Not published";
    const opponent = game.home === team.team ? game.away : game.home;
    return `${game.home === team.team ? "vs" : "@"} ${opponent} · ${dateText(game.date)}`;
  }

  function recordNote() {
    const meta = state.recordMeta || {};
    const records = meta.recordsAsOf ? dateText(meta.recordsAsOf) : "date not published";
    const outlook = meta.outlookAsOf ? dateText(meta.outlookAsOf) : "date not published";
    return meta.active
      ? `Records through ${records} use published finals; projected wins, playoff odds, and title odds remain the ${outlook} simulation.`
      : `Records ${records} · simulation ${outlook}. Current-record repair is withheld unless published finals fully cover the standings snapshot.`;
  }
  function renderRecordNote() {
    const note = $("teams-record-note");
    if (note) note.textContent = recordNote();
  }

  function story(label, value, note) {
    return `<article class="hw-story"><span class="hw-story-label">${escapeHTML(label)}</span><strong class="hw-story-value">${escapeHTML(value)}</strong><span class="hw-story-note">${escapeHTML(note)}</span></article>`;
  }
  function renderStories() {
    const strengthLeader = state.teams.filter((team) => team.strength !== null).sort((a, b) => b.strength - a.strength)[0];
    const titleLeader = state.teams.filter((team) => team.p_title !== null).sort((a, b) => b.p_title - a.p_title)[0];
    const mover = state.teams.filter((team) => team.churn !== null).sort((a, b) => Math.abs(b.churn) - Math.abs(a.churn))[0];
    const pressure = state.teams.filter((team) => unavailableMinutes(team) !== null).sort((a, b) => unavailableMinutes(b) - unavailableMinutes(a))[0];
    const projected = state.teams.filter((team) => team.proj_median_wins !== null).sort((a, b) => b.proj_median_wins - a.proj_median_wins)[0];
    $("teams-stories").innerHTML = [
      story("Strength leader", strengthLeader?.team || "Not published", strengthLeader ? signed(strengthLeader.strength, 1) : "No strength row"),
      story("Title leader", titleLeader?.team || "Not published", titleLeader ? percent(titleLeader.p_title, 1) : "No title row"),
      story("Largest movement", mover?.team || "Not published", mover ? signed(mover.churn, 1) : "No movement row"),
      story("Availability pressure", pressure?.team || "Not published", pressure ? `${fixed(unavailableMinutes(pressure), 0)} min missing` : "No sized pressure"),
      story("Projected wins leader", projected?.team || "Not published", projected ? fixed(projected.proj_median_wins, 1) : "No finish simulation"),
    ].join("");
  }

  function filterTeams() {
    const search = $("teams-search").value.trim().toLowerCase();
    const conference = $("teams-conference").value;
    const availability = $("teams-availability").value;
    const outlook = $("teams-outlook").value;
    state.filtered = state.teams.filter((team) => {
      if (search && `${team.team} ${team.name}`.toLowerCase().indexOf(search) < 0) return false;
      if (conference && team.conference !== conference) return false;
      if (availability && availabilityState(team) !== availability) return false;
      if (outlook && outlookState(team) !== outlook) return false;
      return true;
    });
    const direction = state.sortDir === "asc" ? 1 : -1;
    state.filtered.sort((a, b) => {
      const map = {
        rank: [a.rank, b.rank],
        wins: [a.wins, b.wins],
        gb: [a.gb, b.gb],
        strength: [a.strength, b.strength],
        churn: [a.churn, b.churn],
        projWins: [a.proj_median_wins, b.proj_median_wins],
        playoff: [a.p_playoff, b.p_playoff],
        title: [a.p_title, b.p_title],
        missing: [unavailableMinutes(a), unavailableMinutes(b)],
      };
      const pair = map[state.sortKey] || [a.rank, b.rank];
      if (pair[0] === null) return pair[1] === null ? a.name.localeCompare(b.name) : 1;
      if (pair[1] === null) return -1;
      return pair[0] === pair[1] ? a.name.localeCompare(b.name) : (pair[0] - pair[1]) * direction;
    });
  }

  function trendHTML(team) {
    if (team.trendStrength.length < 2) return '<span class="hw-team-trend flat">—</span>';
    const firstValue = team.trendStrength[0];
    const lastValue = team.trendStrength[team.trendStrength.length - 1];
    const change = lastValue - firstValue;
    return `<span class="hw-team-trend ${change >= 0 ? "up" : "down"}">${change >= 0 ? "▲" : "▼"} ${escapeHTML(Math.abs(change).toFixed(1))}</span>`;
  }

  function teamRow(team) {
    const selected = state.selected && state.selected.team === team.team;
    const finish = team.proj_range_90[0] === null || team.proj_range_90[1] === null
      ? "—"
      : `${fixed(team.proj_range_90[0], 0)}–${fixed(team.proj_range_90[1], 0)}`;
    return `<tr${selected ? ' class="selected"' : ""}>
      <td class="num">${escapeHTML(fixed(team.rank, 0))}</td>
      <td><button class="hw-team-select" type="button" data-select-team="${escapeHTML(team.team)}"><strong>${escapeHTML(team.name)}</strong><span>${escapeHTML(team.team)}</span></button></td>
      <td>${escapeHTML(team.conference || "—")}</td>
      <td class="num">${escapeHTML(signed(team.strength, 1))}</td>
      <td class="num">${escapeHTML(record(team))}</td>
      <td class="num">${escapeHTML(fixed(team.gb, 1))}</td>
      <td class="num">${escapeHTML(signed(team.churn, 1))}</td>
      <td class="num">${escapeHTML(fixed(team.proj_median_wins, 1))}</td>
      <td>${escapeHTML(finish)}</td>
      <td class="num">${escapeHTML(percent(team.p_playoff, 0))}</td>
      <td class="num">${escapeHTML(percent(team.p_title, 1))}</td>
      <td>${escapeHTML(availabilityText(team))}</td>
      <td>${escapeHTML(nextGameText(team))}</td>
      <td>${trendHTML(team)}</td>
    </tr>`;
  }

  function mobileTeam(team) {
    const selected = state.selected && state.selected.team === team.team;
    return `<button type="button" class="hw-mobile-team${selected ? " selected" : ""}" data-select-team="${escapeHTML(team.team)}">
      <span class="hw-mobile-team-top"><strong>${escapeHTML(team.name)}</strong><span>#${escapeHTML(fixed(team.rank, 0))} · ${escapeHTML(record(team))}</span></span>
      <span class="hw-mobile-team-metrics"><span>Strength<b>${escapeHTML(signed(team.strength, 1))}</b></span><span>Proj wins<b>${escapeHTML(fixed(team.proj_median_wins, 1))}</b></span><span>Playoff<b>${escapeHTML(percent(team.p_playoff, 0))}</b></span><span>Title<b>${escapeHTML(percent(team.p_title, 1))}</b></span></span>
      <span class="hw-mobile-team-bottom"><span>${escapeHTML(availabilityText(team))}</span><span>${trendHTML(team)}</span></span>
    </button>`;
  }

  function bindSelections() {
    qa("[data-select-team]").forEach((button) => button.addEventListener("click", () => selectTeam(button.dataset.selectTeam, true)));
  }
  function renderBoard() {
    filterTeams();
    $("teams-count").textContent = `${state.filtered.length} of ${state.teams.length} teams`;
    $("teams-context").textContent = `${state.sortKey} · ${state.sortDir}`;
    $("teams-body").innerHTML = state.filtered.map(teamRow).join("") || '<tr><td colspan="14"><div class="hw-empty">No teams match these filters.</div></td></tr>';
    $("teams-mobile").innerHTML = state.filtered.map(mobileTeam).join("") || '<div class="hw-empty">No teams match these filters.</div>';
    bindSelections();
  }

  function inspectorMetric(label, value, note) {
    return `<div class="hw-team-inspector-metric"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong><small>${escapeHTML(note || "")}</small></div>`;
  }
  function renderInspector(team) {
    if (!team) return;
    const finish = team.proj_range_90[0] === null || team.proj_range_90[1] === null
      ? "Not published"
      : `${fixed(team.proj_range_90[0], 0)}–${fixed(team.proj_range_90[1], 0)} wins`;
    const playerRows = team.players.slice(0, 7).map((player) => `<div class="hw-team-player"><div><strong>${escapeHTML(player.name)}</strong><small>${escapeHTML(player.provisional ? "Provisional" : "Firm")} · ${escapeHTML(fixed(player.points, 1))} PTS · ${escapeHTML(fixed(player.minutes, 1))} min</small></div><span>${escapeHTML(signed(player.impact, 1))}</span></div>`).join("");
    const gameRows = team.games.slice(0, 4).map((game) => {
      const opponent = game.home === team.team ? game.away : game.home;
      return `<div class="hw-team-game"><div><strong>${escapeHTML(game.home === team.team ? "vs" : "@")} ${escapeHTML(opponent)}</strong><small>${escapeHTML(dateText(game.date))} · ${escapeHTML(game.tip || "time not published")}</small></div><span>${escapeHTML(game.call || "call not published")}</span></div>`;
    }).join("");
    $("team-inspector").innerHTML = `<div class="hw-module-head"><h2>Team inspector</h2><span>${escapeHTML(team.team)}</span></div><div class="hw-team-inspector-body">
      <div class="hw-team-inspector-hero"><div><h3>${escapeHTML(team.name)}</h3><p>Power #${escapeHTML(fixed(team.rank, 0))} · ${escapeHTML(team.conference || "conference not published")}</p></div><strong>${escapeHTML(record(team))}</strong></div>
      <div class="hw-team-inspector-metrics">${inspectorMetric("Strength", signed(team.strength, 1), `move ${signed(team.churn, 1)}`)}${inspectorMetric("Projected wins", fixed(team.proj_median_wins, 1), `90% finish ${finish}`)}${inspectorMetric("Playoff", percent(team.p_playoff, 1), "simulated chance")}${inspectorMetric("Title", percent(team.p_title, 1), "simulated chance")}${inspectorMetric("Availability", unavailableMinutes(team) === null ? "—" : `${fixed(unavailableMinutes(team), 0)} min`, availabilityText(team))}${inspectorMetric("Title move", signed(team.titleMove, 1), team.moveDays ? `${fixed(team.moveDays, 0)} days` : "window not published")}</div>
      <section class="hw-team-inspector-section"><h3>Leading published players</h3>${playerRows || '<div class="hw-empty">No player rows were published for this team.</div>'}</section>
      <section class="hw-team-inspector-section"><h3>Next published games</h3>${gameRows || '<div class="hw-empty">No upcoming games were published for this team.</div>'}</section>
      <div class="hw-team-source"><span>Source</span><strong>Published team, standings, finals, availability, player, and game artifacts</strong><small>Current records may use complete finals; simulation quantities stay on the dated standings outlook.</small></div>
    </div>`;
  }

  function extent(values) {
    const valid = values.filter((value) => value !== null && Number.isFinite(value));
    if (!valid.length) return null;
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const padding = (max - min || 1) * 0.12;
    return [min - padding, max + padding];
  }
  function scatterSVG(teams, xFn, yFn, xLabel, yLabel, xFormat, yFormat) {
    const valid = teams.filter((team) => xFn(team) !== null && yFn(team) !== null);
    if (!valid.length) return '<div class="hw-empty">This visual needs published values on both axes.</div>';
    const width = 760;
    const height = 300;
    const margin = { left: 54, right: 20, top: 18, bottom: 42 };
    const xExtent = extent(valid.map(xFn));
    const yExtent = extent(valid.map(yFn));
    const sx = (value) => margin.left + ((value - xExtent[0]) / (xExtent[1] - xExtent[0])) * (width - margin.left - margin.right);
    const sy = (value) => height - margin.bottom - ((value - yExtent[0]) / (yExtent[1] - yExtent[0])) * (height - margin.top - margin.bottom);
    const selectedInPlot = state.selected && valid.some((team) => state.selected.team === team.team);
    const svg = [`<svg viewBox="0 0 ${width} ${height}" role="group" aria-label="${escapeHTML(`${xLabel} versus ${yLabel}`)}">`];
    for (let index = 0; index <= 5; index += 1) {
      const xValue = xExtent[0] + (index / 5) * (xExtent[1] - xExtent[0]);
      const yValue = yExtent[0] + (index / 5) * (yExtent[1] - yExtent[0]);
      const x = sx(xValue);
      const y = sy(yValue);
      svg.push(`<line class="grid" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line><line class="grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line><text class="axis-label" x="${x}" y="${height - 18}" text-anchor="middle">${escapeHTML(xFormat(xValue))}</text><text class="axis-label" x="46" y="${y + 3}" text-anchor="end">${escapeHTML(yFormat(yValue))}</text>`);
    }
    valid.forEach((team, index) => {
      const selected = state.selected && state.selected.team === team.team;
      const description = `${team.name}: ${xLabel} ${xFormat(xFn(team))}, ${yLabel} ${yFormat(yFn(team))}`;
      const focusable = selected || (!selectedInPlot && index === 0);
      svg.push(`<circle class="point${selected ? " selected" : ""}" tabindex="${focusable ? "0" : "-1"}" role="button" aria-controls="team-inspector" aria-pressed="${String(Boolean(selected))}" aria-label="${escapeHTML(`Select ${description}`)}" data-viz-team="${escapeHTML(team.team)}" cx="${sx(xFn(team)).toFixed(1)}" cy="${sy(yFn(team)).toFixed(1)}" r="${selected ? 5 : 3.8}"><title>${escapeHTML(description)}</title></circle><text class="team-label" x="${(sx(xFn(team)) + 6).toFixed(1)}" y="${(sy(yFn(team)) + 3).toFixed(1)}">${escapeHTML(team.team)}</text>`);
    });
    svg.push(`<text class="axis-label" x="${(margin.left + width - margin.right) / 2}" y="294" text-anchor="middle">${escapeHTML(xLabel)}</text><text class="axis-label" x="14" y="150" text-anchor="middle" transform="rotate(-90 14 150)">${escapeHTML(yLabel)}</text></svg>`);
    return svg.join("");
  }

  function bindVizPoints() {
    const points = qa("[data-viz-team]");
    points.forEach((point, index) => {
      point.addEventListener("click", () => selectTeam(point.dataset.vizTeam, true));
      point.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          selectTeam(point.dataset.vizTeam, true);
          return;
        }
        let next = index;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % points.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + points.length) % points.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = points.length - 1;
        else return;
        event.preventDefault();
        point.setAttribute("tabindex", "-1");
        points[next].setAttribute("tabindex", "0");
        points[next].focus();
      });
    });
  }

  function renderViz() {
    let html;
    let context;
    if (state.viz === "wins-finish") {
      html = scatterSVG(state.teams, (team) => team.wins, (team) => team.proj_median_wins, "Current wins", "Projected wins", (value) => fixed(value, 0), (value) => fixed(value, 1));
      context = "Current wins versus simulated finish";
    } else if (state.viz === "pressure-strength") {
      html = scatterSVG(state.teams, unavailableMinutes, (team) => team.strength, "Unavailable projected minutes", "Team strength", (value) => fixed(value, 0), (value) => signed(value, 1));
      context = "Availability pressure versus team strength";
    } else {
      html = scatterSVG(state.teams, (team) => team.strength, (team) => team.p_title === null ? null : team.p_title * 100, "Team strength", "Title chance", (value) => signed(value, 1), (value) => `${fixed(value, 1)}%`);
      context = "Strength versus simulated title chance";
    }
    $("team-viz-context").textContent = context;
    $("team-viz").innerHTML = html;
    bindVizPoints();
  }

  function renderWatch() {
    const movers = state.teams.filter((team) => team.churn !== null).sort((a, b) => Math.abs(b.churn) - Math.abs(a.churn)).slice(0, 8);
    $("teams-movers").innerHTML = movers.map((team) => `<button class="hw-team-watch-row" type="button" data-select-team="${escapeHTML(team.team)}"><div><strong>${escapeHTML(team.team)} · ${escapeHTML(team.name)}</strong><small>strength ${escapeHTML(signed(team.strength, 1))}</small></div><span class="${team.churn >= 0 ? "up" : "down"}">${escapeHTML(signed(team.churn, 1))}</span></button>`).join("") || '<div class="hw-empty">No movement was published.</div>';
    const pressure = state.teams.filter((team) => unavailableMinutes(team) !== null).sort((a, b) => unavailableMinutes(b) - unavailableMinutes(a)).slice(0, 8);
    $("teams-pressure").innerHTML = pressure.map((team) => `<button class="hw-team-watch-row" type="button" data-select-team="${escapeHTML(team.team)}"><div><strong>${escapeHTML(team.team)} · ${escapeHTML(team.name)}</strong><small>${escapeHTML(availabilityText(team))}</small></div><span>${escapeHTML(fixed(unavailableMinutes(team), 0))} min</span></button>`).join("") || '<div class="hw-empty">No sized availability pressure was published.</div>';
    bindSelections();
  }

  function selectTeam(code, scroll) {
    const team = state.teams.find((candidate) => candidate.team === code);
    if (!team) return;
    state.selected = team;
    renderBoard();
    renderInspector(team);
    renderViz();
    if (scroll && window.innerWidth < 980) $("team-inspector").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function bindControls() {
    ["teams-search", "teams-conference", "teams-availability", "teams-outlook"].forEach((id) => {
      const element = $(id);
      element.addEventListener(element.tagName === "INPUT" ? "input" : "change", renderBoard);
    });
    $("teams-reset").addEventListener("click", () => {
      ["teams-search", "teams-conference", "teams-availability", "teams-outlook"].forEach((id) => { $(id).value = ""; });
      state.sortKey = "rank";
      state.sortDir = "asc";
      renderBoard();
    });
    qa("[data-sort]").forEach((button) => button.addEventListener("click", () => {
      const key = button.dataset.sort;
      if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      else {
        state.sortKey = key;
        state.sortDir = key === "rank" || key === "gb" ? "asc" : "desc";
      }
      qa("[data-sort]").forEach((other) => other.removeAttribute("data-dir"));
      button.dataset.dir = state.sortDir;
      renderBoard();
    }));
    qa("[data-team-viz]").forEach((button) => button.addEventListener("click", () => {
      state.viz = button.dataset.teamViz;
      qa("[data-team-viz]").forEach((other) => other.classList.toggle("active", other === button));
      renderViz();
    }));
  }

  function populateConferenceFilter() {
    const conferences = [...new Set(state.teams.map((team) => team.conference).filter(Boolean))].sort();
    $("teams-conference").innerHTML = '<option value="">All conferences</option>' + conferences.map((conference) => `<option>${escapeHTML(conference)}</option>`).join("");
  }

  function setFreshness(payloads) {
    const stamps = [];
    let undated = 0;
    payloads.forEach((payload) => {
      const stamp = first(payload, ["generated_utc", "generated", "built_utc", "as_of", "as_of_date", "updated_utc"]);
      const parsed = toDate(stamp);
      if (parsed) stamps.push(parsed);
      else undated += 1;
    });
    stamps.sort((a, b) => a - b);
    const floor = stamps[0];
    qa("[data-fresh]").forEach((element) => {
      if (!floor) {
        element.innerHTML = '<span class="hw-fresh-dot"></span>Build time not published';
        element.classList.add("warn");
        return;
      }
      const hours = (Date.now() - floor.getTime()) / 36e5;
      element.innerHTML = `<span class="hw-fresh-dot"></span>Oldest source updated ${escapeHTML(ageText(floor.toISOString()))}${undated ? ` · ${undated} undated` : ""}`;
      element.classList.toggle("warn", hours > 24 || undated > 0);
    });
  }

  function boot() {
    bindControls();
    const keys = Object.keys(FILES);
    Promise.all(keys.map((key) => fetchJSON(FILES[key]))).then((payloads) => {
      keys.forEach((key, index) => { state.payloads[key] = payloads[index]; });
      state.teams = normalizeTeams(state.payloads.teams, state.payloads.standings, state.payloads.finals, state.payloads.availability, state.payloads.players, state.payloads.games);
      setFreshness(payloads);
      renderRecordNote();
      populateConferenceFilter();
      renderStories();
      renderWatch();
      renderBoard();
      renderViz();
      if (state.teams.length) {
        const paramTeam = new URLSearchParams(location.search).get("team");
        let initialTeam = null;
        if (paramTeam) {
          const match = state.teams.find(t => t.team.toLowerCase() === paramTeam.toLowerCase() || t.name.toLowerCase() === paramTeam.toLowerCase());
          if (match) initialTeam = match.team;
        }
        selectTeam(initialTeam || state.teams.slice().sort((a, b) => a.rank - b.rank)[0].team, false);
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}());
