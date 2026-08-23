/* Dense game report: dated forecast + factual final, joined without recomputing. */
(function(){
  "use strict";

  var $=function(id){return document.getElementById(id);};
  var has=function(value){return value!==null&&value!==undefined&&value!=="";};
  var num=function(value){if(value===true||value===false||value===null||value===undefined||value==="")return null;var parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
  var esc=function(value){return String(value==null?"":value).replace(/[&<>"']/g,function(char){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char];});};
  var fixed=function(value,digits){var parsed=num(value);return parsed===null?"—":parsed.toFixed(digits==null?1:digits);};
  var signed=function(value,digits){var parsed=num(value);return parsed===null?"—":(parsed>0?"+":"")+parsed.toFixed(digits==null?1:digits);};
  var pct=function(value,digits){var parsed=num(value);if(parsed===null)return "—";if(parsed<=1)parsed*=100;return parsed.toFixed(digits==null?0:digits)+"%";};
  var dateObj=function(value){if(!has(value))return null;var text=String(value);var parsed=/^\d{4}-\d{2}-\d{2}$/.test(text)?new Date(text+"T12:00:00"):new Date(text);return Number.isNaN(parsed.getTime())?null:parsed;};
  var dateText=function(value){var parsed=dateObj(value);return parsed?parsed.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric",year:"numeric"}):String(value||"Date not published");};
  var dateTimeText=function(value){var parsed=dateObj(value);return parsed?parsed.toLocaleString(undefined,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}):String(value||"Not published");};
  var safeHref=function(value){var text=String(value||"");return text&&!/^javascript:/i.test(text)?esc(text):"#";};
  var safeId=function(value){return /^[A-Za-z0-9_.-]+$/.test(String(value||""))?String(value):null;};
  var gameId=function(){var params=new URLSearchParams(location.search);return safeId(params.get("game_id")||params.get("id"));};
  var fetchJSON=function(path){return fetch(path,{cache:"no-store"}).then(function(response){if(!response.ok)throw new Error(path+" returned "+response.status);return response.json();});};
  var rows=function(payload,keys){if(Array.isArray(payload))return payload;for(var index=0;index<keys.length;index++){var value=payload&&payload[keys[index]];if(Array.isArray(value))return value;}return [];};

  function normalizeTeam(value){return String(value||"").toUpperCase().trim();}
  function findFinal(payload,game){
    var targetAway=normalizeTeam(game.away),targetHome=normalizeTeam(game.home),targetDate=String(game.date||"");
    return rows(payload,["games","rows","items"]).find(function(row){
      return String(row.date||row.game_date||"")===targetDate&&normalizeTeam(row.away||row.away_team)===targetAway&&normalizeTeam(row.home||row.home_team)===targetHome;
    })||null;
  }
  function findArchive(payload,game){
    var matchup=normalizeTeam(game.away)+" @ "+normalizeTeam(game.home),targetDate=String(game.date||"");
    var day=rows(payload,["days","rows","items"]).find(function(candidate){return String(candidate.date||"")===targetDate;});
    if(!day)return null;
    var prediction=(day.predictions||[]).find(function(row){return normalizeTeam(row.matchup)===normalizeTeam(matchup);})||null;
    var report=(day.reports||[]).find(function(row){return normalizeTeam(row.label)===normalizeTeam(matchup);})||null;
    return prediction||report?{prediction:prediction,report:report}:null;
  }
  function actualHomeMargin(final){
    var direct=num(final&&final.home_margin);if(direct!==null)return direct;
    var home=num(final&&final.home_score),away=num(final&&final.away_score);return home!==null&&away!==null?home-away:null;
  }
  function finalWinner(final){
    if(!final)return null;if(final.winner)return normalizeTeam(final.winner);
    var home=num(final.home_score),away=num(final.away_score);if(home===null||away===null||home===away)return null;return home>away?normalizeTeam(final.home||final.home_team):normalizeTeam(final.away||final.away_team);
  }
  function predictedWinner(game){
    var hp=num(game.p_home_win);if(hp!==null){if(hp>1)hp/=100;return hp>=.5?normalizeTeam(game.home):normalizeTeam(game.away);}
    var margin=num(game.margin&&game.margin.point);return margin===null?null:margin>=0?normalizeTeam(game.home):normalizeTeam(game.away);
  }
  function publishedWinnerProbability(game){
    var hp=num(game.p_home_win);if(hp===null)return null;if(hp>1)hp/=100;
    var winner=predictedWinner(game);
    if(winner===normalizeTeam(game.home))return hp;
    if(winner===normalizeTeam(game.away))return 1-hp;
    return null;
  }
  function archiveStatus(game,archive){
    if(!archive||!archive.prediction)return {key:"missing",label:"No archived call",note:"No dated prediction row matched this game."};
    var callMatches=String(archive.prediction.call||"").trim()===String(game.call||"").trim();
    var archiveProbability=num(archive.prediction.win_pct);if(archiveProbability!==null&&archiveProbability>1)archiveProbability/=100;
    var winnerProbability=publishedWinnerProbability(game);
    var winMatches=archiveProbability===null||winnerProbability===null||Math.abs(archiveProbability-winnerProbability)<.025;
    var archiveRange=archive.prediction.range80||"";
    var margin=game.margin||{};
    var rangeMatches=!archiveRange||(has(margin.lo80)&&has(margin.hi80)&&archiveRange.indexOf(String(Math.abs(Math.round(margin.lo80))))>=0&&archiveRange.indexOf(String(Math.abs(Math.round(margin.hi80))))>=0);
    if(callMatches&&winMatches)return {key:"match",label:"Archive matched",note:rangeMatches?"Call, confidence, and range are attached to the dated archive.":"Call and confidence match; range wording differs."};
    return {key:"mismatch",label:"Archive differs",note:"The dated archive and game file do not match exactly; both remain visible."};
  }

  /* ---- optional support feeds: published bios, team quality, tempo ----
     Each feed is optional. A failed read never blanks the report and never
     invents a bio, a rank, or a pace number — the cell is simply omitted. */
  function normalizeName(value){
    return String(value==null?"":value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  }
  function buildBioLookup(meta){
    var map={};
    var players=meta&&meta.players?meta.players:null;
    if(players)Object.keys(players).forEach(function(key){
      var bio=players[key];if(!bio||!bio.name)return;
      var norm=normalizeName(bio.name);if(!norm)return;
      map[norm]=Object.prototype.hasOwnProperty.call(map,norm)?false:bio;
    });
    return function(name){var hit=map[normalizeName(name)];return hit?hit:null;};
  }
  function teamQualityHTML(feed,game){
    if(!feed)return "";
    var list=rows(feed,["teams","rows","items"]);
    var find=function(code,full){
      var target=normalizeTeam(code),targetFull=normalizeTeam(full||"");
      return list.find(function(row){return normalizeTeam(row.team)===target||(targetFull&&normalizeTeam(row.team_full)===targetFull);})||null;
    };
    var away=find(game.away,game.away_full),home=find(game.home,game.home_full);
    if(!away&&!home)return "";
    var line=function(row,code){
      if(!row)return "";
      var bits=[];
      if(num(row.rank)!==null)bits.push('<span class="hw-fp-rank">#'+esc(row.rank)+'</span>');
      if(num(row.strength)!==null)bits.push('<b>'+esc(signed(row.strength,1))+'</b>');
      return '<div class="hw-fp-line"><strong>'+esc(normalizeTeam(code))+'</strong>'+bits.join("")+'</div>';
    };
    return line(away,game.away)+line(home,game.home)+'<small class="hw-fp-note">League rank and published strength</small>';
  }
  function tempoHTML(feed,game){
    if(!feed)return "";
    var list=rows(feed,["teams","rows","items"]);
    var find=function(code){var target=normalizeTeam(code);return list.find(function(row){return normalizeTeam(row.team)===target;})||null;};
    var away=find(game.away),home=find(game.home);
    var games=feed.matchups&&Array.isArray(feed.matchups.games)?feed.matchups.games:[];
    var matchup=games.find(function(row){return normalizeTeam(row.home)===normalizeTeam(game.home)&&normalizeTeam(row.away)===normalizeTeam(game.away);})||null;
    if(!away&&!home&&!matchup)return "";
    var parts=[];
    if(matchup&&num(matchup.exp_pace)!==null)parts.push('<div class="hw-fp-line"><strong>Expected '+esc(fixed(matchup.exp_pace,1))+'</strong>'+(matchup.exp_tag_label?'<span>'+esc(matchup.exp_tag_label)+'</span>':'')+'</div>');
    [[away,game.away],[home,game.home]].forEach(function(pair){
      var row=pair[0];if(!row)return;
      var bits=[];
      if(num(row.pace)!==null)bits.push(fixed(row.pace,1));
      if(num(row.rank)!==null)bits.push("#"+row.rank);
      if(row.tier_label)bits.push(row.tier_label);
      var trend=num(row.pace_recent)!==null?"recent "+fixed(row.pace_recent,1)+(row.pace_trend?", "+row.pace_trend:""):(row.pace_trend||"");
      parts.push('<div class="hw-fp-line"><strong>'+esc(normalizeTeam(pair[1]))+'</strong><span>'+esc(bits.join(" · "))+'</span>'+(trend?'<small>'+esc(trend)+'</small>':'')+'</div>');
    });
    if(feed.as_of)parts.push('<small class="hw-fp-note">Tempo as of '+esc(feed.as_of)+'</small>');
    return parts.join("");
  }
  function whyHTML(game){
    var steps=game.why&&Array.isArray(game.why.steps)?game.why.steps:[];
    if(!steps.length)return "";
    var chips=steps.map(function(step){
      return '<span class="hw-fp-chip" title="'+esc(step.detail||"")+'">'+esc(step.label||"Step")+' <b>'+esc(step.value||"—")+'</b></span>';
    }).join("");
    var subs=[];
    steps.forEach(function(step){(step.sub||[]).forEach(function(sub){subs.push('<span>'+esc(sub.label||"Component")+' <b>'+esc(sub.value||"—")+'</b></span>');});});
    var subLine=subs.length?'<div class="hw-fp-line hw-fp-subline">'+subs.join("")+'</div>':'';
    return '<div class="hw-fp-chips">'+chips+'</div>'+subLine;
  }
  function availabilityCellHTML(game){
    var block=game&&game.availability;
    if(!block||(!Array.isArray(block.home)&&!Array.isArray(block.away)))return "";
    var side=function(code,list){
      var out=(list||[]).map(function(player){return esc(player.name||"Unnamed player")+" — "+esc(player.status||"status not published")+(player.return?" (back "+esc(player.return)+")":"");}).join("; ");
      return '<div class="hw-fp-line"><strong>'+esc(normalizeTeam(code))+'</strong><span>'+(out||"No listed absences")+'</span></div>';
    };
    return side(game.away,block.away)+side(game.home,block.home);
  }
  function keyPlayersHTML(game){
    var pick=function(list){
      return (list||[]).filter(function(player){return num(player.impact)!==null;}).sort(function(a,b){return num(b.impact)-num(a.impact);}).slice(0,2);
    };
    var side=function(code,list){
      var top=pick(list);if(!top.length)return "";
      return '<div class="hw-fp-line"><strong>'+esc(normalizeTeam(code))+'</strong><span>'+top.map(function(player){return esc(player.name||"?")+" "+esc(signed(player.impact,1));}).join(" · ")+'</span></div>';
    };
    var away=side(game.away,game.box&&game.box.away),home=side(game.home,game.box&&game.box.home);
    return away||home?away+home:"";
  }
  function renderFingerprint(game,teamsFeed,tempoFeed){
    var cell=function(label,html){return html?'<section class="hw-fp-cell"><h3>'+esc(label)+'</h3>'+html+'</section>':'';};
    var cells=[
      cell("Team quality",teamQualityHTML(teamsFeed,game)),
      cell("Why the call",whyHTML(game)),
      cell("Tempo",tempoHTML(tempoFeed,game)),
      cell("Availability",availabilityCellHTML(game)),
      cell("Key players",keyPlayersHTML(game))
    ].join("");
    $("gr-fingerprint").innerHTML=cells||'<div class="hw-empty compact">No supplemental matchup context is published for this game.</div>';
  }

  function story(label,value,note){return '<article class="hw-story"><span class="hw-story-label">'+esc(label)+'</span><strong class="hw-story-value">'+esc(value)+'</strong><span class="hw-story-note">'+esc(note)+'</span></article>';}
  function renderStories(game,final,archive){
    var margin=game.margin||{},total=game.total||{},actual=actualHomeMargin(final),miss=actual!==null&&num(margin.point)!==null?Math.abs(actual-num(margin.point)):null,winnerGrade=final&&predictedWinner(game)?finalWinner(final)===predictedWinner(game):null;
    $("gr-stories").innerHTML=[
      story("Published call",game.call||"Not published",game.date||"date not published"),
      story("Home win",pct(game.p_home_win,0),game.home||"home team"),
      story("Projected total",fixed(total.point,1),"combined points"),
      story("Final",final?(final.away_score+"–"+final.home_score):"Awaiting final",final?(winnerGrade===null?"winner not gradable":winnerGrade?"winner call correct":"winner call wrong"):"forecast remains open"),
      story("Margin miss",fixed(miss,1),miss===null?"not gradable":"absolute points")
    ].join("");
  }

  function forecastRow(label,value,note,klass){return '<div class="hw-report-forecast-row"><span>'+esc(label)+'</span><strong class="'+esc(klass||"")+'">'+esc(value)+'</strong><small>'+esc(note||"")+'</small></div>';}
  function renderForecast(game,final,archiveState){
    var margin=game.margin||{},total=game.total||{},actual=actualHomeMargin(final),miss=actual!==null&&num(margin.point)!==null?Math.abs(actual-num(margin.point)):null;
    $("gr-forecast-table").innerHTML=[
      forecastRow("Home margin",signed(margin.point,1),"positive favors "+(game.home_full||game.home),num(margin.point)>=0?"positive":"negative"),
      forecastRow("Home win chance",pct(game.p_home_win,1),game.home_full||game.home),
      forecastRow("Projected total",fixed(total.point,1),"combined points"),
      forecastRow("Actual home margin",signed(actual,1),miss===null?"final not available":"absolute miss "+fixed(miss,1))
    ].join("");
    $("gr-archive-state").textContent=archiveState.label;
    $("gr-archive-state").className="archive-"+archiveState.key;
  }

  function renderChain(game){
    var steps=game.why&&Array.isArray(game.why.steps)?game.why.steps:[];
    $("gr-model-asof").textContent=game.why&&game.why.as_of?"As of "+game.why.as_of:"As-of not published";
    $("gr-chain").innerHTML=steps.map(function(step,index){
      var subs=(step.sub||[]).map(function(sub){return '<div><span>'+esc(sub.label||"Component")+'</span><strong>'+esc(sub.value||"—")+'</strong><small>'+esc(sub.detail||"")+'</small></div>';}).join("");
      return '<article class="hw-report-chain-step"><span class="hw-report-step-index">'+(index+1)+'</span><div><h3>'+esc(step.label||"Step")+'</h3><p>'+esc(step.detail||"")+'</p>'+(subs?'<div class="hw-report-chain-sub">'+subs+'</div>':'')+'</div><strong>'+esc(step.value||"—")+'</strong></article>';
    }).join("")||'<div class="hw-empty">No component chain was published for this game.</div>';
    if(game.why&&game.why.omitted){$("gr-chain").insertAdjacentHTML("beforeend",'<div class="hw-report-omitted"><strong>Not separately weighted</strong><span>'+esc(game.why.omitted)+'</span></div>');}
  }

  function playerRow(player,bio){
    var basis=player.impact_provisional?"Provisional":player.prior_basis?"Career prior":player.college_basis?"College prior":player.thin_unknown?"Thin / unknown":"Current basis";
    var bioBits=[];
    if(bio&&has(bio.jersey))bioBits.push("#"+bio.jersey);
    if(bio&&has(bio.position))bioBits.push(bio.position);
    if(bio&&has(bio.height))bioBits.push(bio.height);
    var sub=bioBits.length?bioBits.join(" · "):basis;
    var face=bio&&has(bio.headshot_url)
      ?'<img class="hw-headshot" src="'+esc(bio.headshot_url)+'" alt="" loading="lazy">'
      :'<span class="hw-avatar">'+esc(String(player.name||"?").split(/\s+/).slice(0,2).map(function(part){return part.charAt(0);}).join(""))+'</span>';
    var impactClass=num(player.impact)!==null?(num(player.impact)>=0?"positive":"negative"):"";
    return '<tr><td><span class="hw-person">'+face+'<span class="hw-person-copy"><strong>'+esc(player.name||"Unknown player")+'</strong><small title="'+esc(basis)+'">'+esc(sub)+(player.gtd?' · GTD':'')+'</small></span></span></td><td class="num '+impactClass+'">'+esc(signed(player.impact,1))+'</td><td class="num">'+esc(fixed(player.min,1))+'</td><td class="num">'+esc(fixed(player.pts,1))+'</td><td class="num">'+esc(fixed(player.reb,1))+'</td><td class="num">'+esc(fixed(player.ast,1))+'</td><td class="num">'+esc(fixed(player.p3,1))+'</td></tr>';
  }
  function rotationTable(team,players,lookup){
    var list=(players||[]).slice().sort(function(a,b){return (num(b.min)||-1)-(num(a.min)||-1);}),minutes=list.reduce(function(sum,player){return sum+(num(player.min)||0);},0);
    return '<section class="hw-report-team-rotation"><div class="hw-report-rotation-head"><strong>'+esc(team)+'</strong><span>'+list.length+' players · '+fixed(minutes,1)+' minutes</span></div><div class="hw-table-wrap"><table class="hw-compact-table"><thead><tr><th>Player</th><th class="num">Impact</th><th class="num">Min</th><th class="num">PTS</th><th class="num">REB</th><th class="num">AST</th><th class="num">3PM</th></tr></thead><tbody>'+((list.length?list.map(function(player){return playerRow(player,lookup(player.name));}).join(""):'<tr><td colspan="7"><div class="hw-empty compact">No projected rotation published.</div></td></tr>'))+'</tbody></table></div></section>';
  }
  function renderRotations(game,lookup){
    var home=game.box&&game.box.home||[],away=game.box&&game.box.away||[],homeMinutes=home.reduce(function(sum,p){return sum+(num(p.min)||0);},0),awayMinutes=away.reduce(function(sum,p){return sum+(num(p.min)||0);},0);
    $("gr-minutes-check").textContent="Projected "+fixed(awayMinutes,1)+" / "+fixed(homeMinutes,1)+" min";
    $("gr-rotations").innerHTML=rotationTable(game.away_full||game.away,away,lookup)+rotationTable(game.home_full||game.home,home,lookup);
  }

  function auditMetric(label,value,note,klass){return '<div><span>'+esc(label)+'</span><strong class="'+esc(klass||"")+'">'+esc(value)+'</strong><small>'+esc(note||"")+'</small></div>';}
  function renderAudit(game,final){
    if(!final){$("gr-grade-state").textContent="Awaiting final";$("gr-audit").innerHTML='<div class="hw-empty compact">No factual final is available for this game. The dated forecast remains visible and ungraded.</div>';return;}
    /* Interval fields (margin.lo80/hi80/lo90/hi90) stay in the immutable artifact and are graded
       on the Accuracy surface; the reader-facing report renders no interval copy. */
    var actual=actualHomeMargin(final),point=num(game.margin&&game.margin.point),miss=actual!==null&&point!==null?Math.abs(actual-point):null,predWinner=predictedWinner(game),winner=finalWinner(final),correct=predWinner&&winner?predWinner===winner:null;
    $("gr-grade-state").textContent=correct===null?"Final joined":correct?"Winner correct":"Winner wrong";
    $("gr-grade-state").className=correct===null?"pending":correct?"correct":"wrong";
    $("gr-audit").innerHTML='<div class="hw-report-audit-score"><span>'+esc(game.away||"Away")+'</span><strong>'+esc(final.away_score)+'–'+esc(final.home_score)+'</strong><span>'+esc(game.home||"Home")+'</span></div><div class="hw-report-audit-grid">'+auditMetric("Actual home margin",signed(actual,1),"factual final")+auditMetric("Margin miss",fixed(miss,1),"absolute points")+auditMetric("Winner call",correct===null?"Not gradable":correct?"Correct":"Wrong",predWinner||"winner not published",correct===true?"positive":correct===false?"negative":"")+'</div>';
  }

  function renderContext(game){
    var context=game.context||{};
    $("gr-context").innerHTML=[[game.away_full||game.away,context.away],[game.home_full||game.home,context.home]].map(function(row){return '<article><strong>'+esc(row[0])+'</strong><p>'+esc(row[1]||"No setup note was published.")+'</p></article>';}).join("");
  }
  function renderFair(game){
    var fair=game.fair_value||{},marketAvailable=has(fair.market_spread)||has(fair.market_total);
    $("gr-fair").innerHTML='<div><span>Our spread</span><strong>'+esc(fair.our_spread||game.call||"Not published")+'</strong></div><div><span>Our total</span><strong>'+esc(fixed(has(fair.our_total)?fair.our_total:game.total&&game.total.point,1))+'</strong></div><p>'+esc(marketAvailable?"Market comparison is published separately and is not a model input.":"No market comparison is published for this report.")+'</p>';
  }
  function renderProvenance(game,id,archiveState){
    var rows=[
      ["Game ID",id],["Report built",game.generated_utc],["Model as of",game.why&&game.why.as_of],["Margin source",game.margin&&game.margin.point],["Total source",game.total&&game.total.point],["Win chance",game.p_home_win],["Archive status",archiveState.label],["Render rule",game.note]
    ];
    $("gr-provenance").innerHTML=rows.map(function(row){return '<div><dt>'+esc(row[0])+'</dt><dd>'+esc(has(row[1])?row[1]:"Not published")+'</dd></div>';}).join("");
  }
  function renderProducts(game,id,archive){
    var pdf=game.pdf||(archive&&archive.report&&archive.report.href),links=[];
    if(pdf)links.push('<a class="primary" href="'+safeHref(pdf)+'" target="_blank" rel="noopener"><strong>Original report PDF</strong><span>Dated pre-tip product ↗</span></a>');
    links.push('<a href="report_archive.html"><strong>Immutable archive</strong><span>All dated calls</span></a>');
    links.push('<a href="games.html"><strong>Games board</strong><span>Forecasts and results</span></a>');
    links.push('<a href="game.html?id='+encodeURIComponent(id)+'"><strong>Legacy deep report</strong><span>Older presentation</span></a>');
    $("gr-products").innerHTML=links.join("");
  }

  function render(game,final,archive,id,rosterMeta,teamsFeed,tempoFeed){
    var hp=num(game.p_home_win);if(hp!==null&&hp>1)hp/=100;var ap=hp===null?null:1-hp,archiveState=archiveStatus(game,archive);
    document.title=(game.away_full||game.away)+" at "+(game.home_full||game.home)+" — Hardwood";
    $("gr-away").textContent=game.away||"Away";$("gr-home").textContent=game.home||"Home";$("gr-away-full").textContent=game.away_full||game.away||"—";$("gr-home-full").textContent=game.home_full||game.home||"—";
    $("gr-away-p").textContent=ap===null?"Probability not published":pct(ap,0)+" win";$("gr-home-p").textContent=hp===null?"Probability not published":pct(hp,0)+" win";$("gr-away-label").textContent=(game.away||"Away")+(ap===null?"":" "+pct(ap,0));$("gr-home-label").textContent=(game.home||"Home")+(hp===null?"":" "+pct(hp,0));$("gr-prob-fill").style.width=(hp===null?50:Math.max(2,Math.min(98,hp*100)))+"%";
    $("gr-call").textContent=game.call||"Forecast not published";$("gr-date").textContent=dateText(game.date);$("gr-tip").textContent=game.tip?" · "+game.tip:"";$("gr-id").textContent="Game "+id;$("gr-built").textContent=game.generated_utc?"Built "+dateTimeText(game.generated_utc):"Build time not published";
    $("gr-status").textContent=final?"Forecast graded":"Published forecast";$("gr-score-note").textContent=final?"Pre-tip forecast · final joined below":"Pre-tip projection";
    renderStories(game,final,archive);renderFingerprint(game,teamsFeed,tempoFeed);renderForecast(game,final,archiveState);renderChain(game);renderRotations(game,buildBioLookup(rosterMeta));renderAudit(game,final);renderContext(game);renderFair(game);renderProvenance(game,id,archiveState);renderProducts(game,id,archive);
    $("report-loading").hidden=true;$("report-error").hidden=true;$("game-report").hidden=false;document.body.dataset.ready="true";
  }
  function fail(message){$("report-loading").hidden=true;$("game-report").hidden=true;$("report-error").hidden=false;$("report-error").innerHTML='<h1>Report unavailable</h1><p>'+esc(message)+'</p><a class="hw-button primary" href="games.html">Back to games</a>';}
  function boot(){
    var id=gameId();if(!id){fail("Open this page from a game row so the report has a valid game ID.");return;}
    Promise.all([
      fetchJSON("games/"+encodeURIComponent(id)+".json"),
      fetchJSON("finals.json").catch(function(){return {};}),
      fetchJSON("report_archive.json").catch(function(){return {};}),
      fetchJSON("roster_meta.json").catch(function(){return null;}),
      fetchJSON("teams.json").catch(function(){return null;}),
      fetchJSON("tempo.json").catch(function(){return null;})
    ]).then(function(payloads){
      var game=payloads[0],final=findFinal(payloads[1],game),archive=findArchive(payloads[2],game);
      render(game,final,archive,id,payloads[3],payloads[4],payloads[5]);
    }).catch(function(error){fail(error&&error.message?error.message:"The published game file could not be loaded.");});
  }
  window.hwGameReport={normalizeName:normalizeName,buildBioLookup:buildBioLookup,playerRow:playerRow,teamQualityHTML:teamQualityHTML,tempoHTML:tempoHTML,whyHTML:whyHTML,availabilityCellHTML:availabilityCellHTML,keyPlayersHTML:keyPlayersHTML};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
}());
