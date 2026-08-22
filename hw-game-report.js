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
    var rangeText=archive.prediction.range80||"";
    var margin=game.margin||{};
    var rangeMatches=!rangeText||(has(margin.lo80)&&has(margin.hi80)&&rangeText.indexOf(String(Math.abs(Math.round(margin.lo80))))>=0&&rangeText.indexOf(String(Math.abs(Math.round(margin.hi80))))>=0);
    if(callMatches&&winMatches)return {key:"match",label:"Archive matched",note:rangeMatches?"Call, confidence, and range are attached to the dated archive.":"Call and confidence match; range wording differs."};
    return {key:"mismatch",label:"Archive differs",note:"The dated archive and game file do not match exactly; both remain visible."};
  }

  function story(label,value,note){return '<article class="hw-story"><span class="hw-story-label">'+esc(label)+'</span><strong class="hw-story-value">'+esc(value)+'</strong><span class="hw-story-note">'+esc(note)+'</span></article>';}
  function renderStories(game,final,archive){
    var margin=game.margin||{},total=game.total||{},actual=actualHomeMargin(final),miss=actual!==null&&num(margin.point)!==null?Math.abs(actual-num(margin.point)):null,winnerGrade=final&&predictedWinner(game)?finalWinner(final)===predictedWinner(game):null;
    $("gr-stories").innerHTML=[
      story("Published call",game.call||"Not published",game.date||"date not published"),
      story("Home win",pct(game.p_home_win,0),game.home||"home team"),
      story("Projected total",fixed(total.point,1),has(total.lo)&&has(total.hi)?fixed(total.lo,1)+"–"+fixed(total.hi,1):"range not published"),
      story("80% margin",has(margin.lo80)&&has(margin.hi80)?signed(margin.lo80,1)+" to "+signed(margin.hi80,1):"—","home-margin range"),
      story("Final",final?(final.away_score+"–"+final.home_score):"Awaiting final",final?(winnerGrade===null?"winner not gradable":winnerGrade?"winner call correct":"winner call wrong"):"forecast remains open"),
      story("Margin miss",fixed(miss,1),miss===null?"not gradable":"absolute points")
    ].join("");
  }

  function rangeText(low,high){return num(low)===null||num(high)===null?"Not published":signed(low,1)+" to "+signed(high,1);}
  function forecastRow(label,value,note,klass){return '<div class="hw-report-forecast-row"><span>'+esc(label)+'</span><strong class="'+esc(klass||"")+'">'+esc(value)+'</strong><small>'+esc(note||"")+'</small></div>';}
  function renderForecast(game,final,archiveState){
    var margin=game.margin||{},total=game.total||{},actual=actualHomeMargin(final),miss=actual!==null&&num(margin.point)!==null?Math.abs(actual-num(margin.point)):null;
    $("gr-forecast-table").innerHTML=[
      forecastRow("Home margin",signed(margin.point,1),"positive favors "+(game.home_full||game.home),num(margin.point)>=0?"positive":"negative"),
      forecastRow("80% interval",rangeText(margin.lo80,margin.hi80),"calibrated home-margin range"),
      forecastRow("90% interval",rangeText(margin.lo90,margin.hi90),"wider calibrated range"),
      forecastRow("Home win chance",pct(game.p_home_win,1),game.home_full||game.home),
      forecastRow("Projected total",fixed(total.point,1),has(total.lo)&&has(total.hi)?fixed(total.lo,1)+" to "+fixed(total.hi,1):"range not published"),
      forecastRow("Actual home margin",signed(actual,1),miss===null?"final not available":"absolute miss "+fixed(miss,1))
    ].join("");
    $("gr-archive-state").textContent=archiveState.label;
    $("gr-archive-state").className="archive-"+archiveState.key;
    $("gr-margin-range").innerHTML=marginChart(margin,actual);
  }
  function marginChart(margin,actual){
    var values=[num(margin.lo90),num(margin.hi90),num(margin.lo80),num(margin.hi80),num(margin.point),num(actual)].filter(function(value){return value!==null;}),span=values.length?Math.max(1,Math.max.apply(null,values.map(Math.abs))):20;
    span=Math.ceil(span/5)*5;
    var position=function(value){return ((num(value)+span)/(span*2)*100);};
    var band=function(low,high,klass){if(num(low)===null||num(high)===null)return "";return '<i class="'+klass+'" style="left:'+position(low).toFixed(2)+'%;width:'+(position(high)-position(low)).toFixed(2)+'%"></i>';};
    var marker=function(value,klass,label){if(num(value)===null)return "";return '<b class="'+klass+'" style="left:'+position(value).toFixed(2)+'%"><span>'+esc(label)+'</span></b>';};
    return '<div class="range-track"></div>'+band(margin.lo90,margin.hi90,"range90")+band(margin.lo80,margin.hi80,"range80")+'<i class="range-zero" style="left:'+position(0)+'%"></i>'+marker(margin.point,"range-point",signed(margin.point,1))+marker(actual,"range-actual",signed(actual,1))+'<span class="range-label left">'+esc(signed(-span,0))+'</span><span class="range-label center">even</span><span class="range-label right">'+esc(signed(span,0))+'</span>';
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

  function playerRow(player){
    var basis=player.impact_provisional?"Provisional":player.prior_basis?"Career prior":player.college_basis?"College prior":player.thin_unknown?"Thin / unknown":"Current basis";
    return '<tr><td><span class="hw-person"><span class="hw-avatar">'+esc(String(player.name||"?").split(/\s+/).slice(0,2).map(function(part){return part.charAt(0);}).join(""))+'</span><span class="hw-person-copy"><strong>'+esc(player.name||"Unknown player")+'</strong><small>'+esc(basis)+(player.gtd?' · GTD':'')+'</small></span></span></td><td class="num">'+esc(fixed(player.min,1))+'</td><td class="num '+(num(player.impact)!==null&&num(player.impact)>=0?'positive':'negative')+'">'+esc(signed(player.impact,1))+'</td><td class="num">'+esc(fixed(player.pts,1))+'</td><td class="num">'+esc(fixed(player.reb,1))+'</td><td class="num">'+esc(fixed(player.ast,1))+'</td><td class="num">'+esc(fixed(player.p3,1))+'</td></tr>';
  }
  function rotationTable(team,players){
    var list=(players||[]).slice().sort(function(a,b){return (num(b.min)||-1)-(num(a.min)||-1);}),minutes=list.reduce(function(sum,player){return sum+(num(player.min)||0);},0);
    return '<section class="hw-report-team-rotation"><div class="hw-report-rotation-head"><strong>'+esc(team)+'</strong><span>'+list.length+' players · '+fixed(minutes,1)+' minutes</span></div><div class="hw-table-wrap"><table class="hw-compact-table"><thead><tr><th>Player</th><th class="num">Min</th><th class="num">Impact</th><th class="num">PTS</th><th class="num">REB</th><th class="num">AST</th><th class="num">3PM</th></tr></thead><tbody>'+((list.length?list.map(playerRow).join(""):'<tr><td colspan="7"><div class="hw-empty compact">No projected rotation published.</div></td></tr>'))+'</tbody></table></div></section>';
  }
  function renderRotations(game){
    var home=game.box&&game.box.home||[],away=game.box&&game.box.away||[],homeMinutes=home.reduce(function(sum,p){return sum+(num(p.min)||0);},0),awayMinutes=away.reduce(function(sum,p){return sum+(num(p.min)||0);},0);
    $("gr-minutes-check").textContent="Projected "+fixed(awayMinutes,1)+" / "+fixed(homeMinutes,1)+" min";
    $("gr-rotations").innerHTML=rotationTable(game.away_full||game.away,away)+rotationTable(game.home_full||game.home,home);
  }

  function auditMetric(label,value,note,klass){return '<div><span>'+esc(label)+'</span><strong class="'+esc(klass||"")+'">'+esc(value)+'</strong><small>'+esc(note||"")+'</small></div>';}
  function renderAudit(game,final){
    if(!final){$("gr-grade-state").textContent="Awaiting final";$("gr-audit").innerHTML='<div class="hw-empty compact">No factual final is available for this game. The dated forecast remains visible and ungraded.</div>';return;}
    var actual=actualHomeMargin(final),point=num(game.margin&&game.margin.point),miss=actual!==null&&point!==null?Math.abs(actual-point):null,predWinner=predictedWinner(game),winner=finalWinner(final),correct=predWinner&&winner?predWinner===winner:null,in80=actual!==null&&num(game.margin&&game.margin.lo80)!==null&&num(game.margin&&game.margin.hi80)!==null?actual>=num(game.margin.lo80)&&actual<=num(game.margin.hi80):null,in90=actual!==null&&num(game.margin&&game.margin.lo90)!==null&&num(game.margin&&game.margin.hi90)!==null?actual>=num(game.margin.lo90)&&actual<=num(game.margin.hi90):null;
    $("gr-grade-state").textContent=correct===null?"Final joined":correct?"Winner correct":"Winner wrong";
    $("gr-grade-state").className=correct===null?"pending":correct?"correct":"wrong";
    $("gr-audit").innerHTML='<div class="hw-report-audit-score"><span>'+esc(game.away||"Away")+'</span><strong>'+esc(final.away_score)+'–'+esc(final.home_score)+'</strong><span>'+esc(game.home||"Home")+'</span></div><div class="hw-report-audit-grid">'+auditMetric("Actual home margin",signed(actual,1),"factual final")+auditMetric("Margin miss",fixed(miss,1),"absolute points")+auditMetric("Winner call",correct===null?"Not gradable":correct?"Correct":"Wrong",predWinner||"winner not published",correct===true?"positive":correct===false?"negative":"")+auditMetric("80% interval",in80===null?"Not gradable":in80?"Covered":"Missed",rangeText(game.margin&&game.margin.lo80,game.margin&&game.margin.hi80),in80===true?"positive":in80===false?"negative":"")+auditMetric("90% interval",in90===null?"Not gradable":in90?"Covered":"Missed",rangeText(game.margin&&game.margin.lo90,game.margin&&game.margin.hi90),in90===true?"positive":in90===false?"negative":"")+'</div>';
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

  function render(game,final,archive,id){
    var hp=num(game.p_home_win);if(hp!==null&&hp>1)hp/=100;var ap=hp===null?null:1-hp,archiveState=archiveStatus(game,archive);
    document.title=(game.away_full||game.away)+" at "+(game.home_full||game.home)+" — Hardwood";
    $("gr-away").textContent=game.away||"Away";$("gr-home").textContent=game.home||"Home";$("gr-away-full").textContent=game.away_full||game.away||"—";$("gr-home-full").textContent=game.home_full||game.home||"—";
    $("gr-away-p").textContent=ap===null?"Probability not published":pct(ap,0)+" win";$("gr-home-p").textContent=hp===null?"Probability not published":pct(hp,0)+" win";$("gr-away-label").textContent=(game.away||"Away")+(ap===null?"":" "+pct(ap,0));$("gr-home-label").textContent=(game.home||"Home")+(hp===null?"":" "+pct(hp,0));$("gr-prob-fill").style.width=(hp===null?50:Math.max(2,Math.min(98,hp*100)))+"%";
    $("gr-call").textContent=game.call||"Forecast not published";$("gr-date").textContent=dateText(game.date);$("gr-tip").textContent=game.tip?" · "+game.tip:"";$("gr-id").textContent="Game "+id;$("gr-built").textContent=game.generated_utc?"Built "+dateTimeText(game.generated_utc):"Build time not published";
    $("gr-status").textContent=final?"Forecast graded":"Published forecast";$("gr-score-note").textContent=final?"Pre-tip forecast · final joined below":"Pre-tip projection";
    renderStories(game,final,archive);renderForecast(game,final,archiveState);renderChain(game);renderRotations(game);renderAudit(game,final);renderContext(game);renderFair(game);renderProvenance(game,id,archiveState);renderProducts(game,id,archive);
    $("report-loading").hidden=true;$("report-error").hidden=true;$("game-report").hidden=false;document.body.dataset.ready="true";
  }
  function fail(message){$("report-loading").hidden=true;$("game-report").hidden=true;$("report-error").hidden=false;$("report-error").innerHTML='<h1>Report unavailable</h1><p>'+esc(message)+'</p><a class="hw-button primary" href="games.html">Back to games</a>';}
  function boot(){
    var id=gameId();if(!id){fail("Open this page from a game row so the report has a valid game ID.");return;}
    Promise.all([fetchJSON("games/"+encodeURIComponent(id)+".json"),fetchJSON("finals.json").catch(function(){return {};}),fetchJSON("report_archive.json").catch(function(){return {};})]).then(function(payloads){var game=payloads[0],final=findFinal(payloads[1],game),archive=findArchive(payloads[2],game);render(game,final,archive,id);}).catch(function(error){fail(error&&error.message?error.message:"The published game file could not be loaded.");});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
}());
