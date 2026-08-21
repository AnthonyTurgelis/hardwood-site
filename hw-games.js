/* Hardwood dense Games surface. Same-origin public artifacts only. */
(function(){
  "use strict";

  var FILES={
    games:"games.json",
    preview:"preview.json",
    leverage:"leverage.json",
    finals:"finals.json",
    archive:"report_archive.json",
    teams:"teams.json"
  };
  var state={games:[],filtered:[],results:[],viz:"margin-total",payloads:[]};

  function $(id){return document.getElementById(id);}
  function qa(selector,root){return Array.prototype.slice.call((root||document).querySelectorAll(selector));}
  function has(value){return value!==null&&value!==undefined&&value!=="";}
  function esc(value){return String(value==null?"":value).replace(/[&<>"']/g,function(char){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char];});}
  function safeHref(value){var text=String(value||"");return text&&!/^javascript:/i.test(text)?esc(text):"#";}
  function first(object,keys){for(var index=0;index<keys.length;index++){var value=object&&object[keys[index]];if(has(value))return value;}return null;}
  function number(value){if(value===true||value===false||value===null||value===undefined||value==="")return null;var parsed=Number(value);return Number.isFinite(parsed)?parsed:null;}
  function probability(value){var parsed=number(value);if(parsed===null)return null;if(parsed>1&&parsed<=100)parsed/=100;return parsed>=0&&parsed<=1?parsed:null;}
  function fixed(value,digits){var parsed=number(value);return parsed===null?"—":parsed.toFixed(digits==null?1:digits);}
  function signed(value,digits){var parsed=number(value);return parsed===null?"—":(parsed>0?"+":"")+parsed.toFixed(digits==null?1:digits);}
  function pct(value,digits){var parsed=probability(value);return parsed===null?"—":(parsed*100).toFixed(digits==null?0:digits)+"%";}
  function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
  function parseDate(value){if(!has(value))return null;var text=String(value);var parsed=/^\d{4}-\d{2}-\d{2}$/.test(text)?new Date(text+"T12:00:00"):new Date(text);return Number.isNaN(parsed.getTime())?null:parsed;}
  function dateKey(value){var parsed=parseDate(value);if(!parsed)return String(value||"");return parsed.getFullYear()+"-"+String(parsed.getMonth()+1).padStart(2,"0")+"-"+String(parsed.getDate()).padStart(2,"0");}
  function dateShort(value){var parsed=parseDate(value);return parsed?parsed.toLocaleDateString(undefined,{month:"short",day:"numeric"}):String(value||"TBD");}
  function dateLong(value){var parsed=parseDate(value);return parsed?parsed.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}):String(value||"Date TBD");}
  function ageText(value){var parsed=parseDate(value);if(!parsed)return "time not published";var seconds=Math.max(0,(Date.now()-parsed.getTime())/1000);if(seconds<90)return "just now";if(seconds<3600)return Math.floor(seconds/60)+"m ago";if(seconds<86400)return Math.floor(seconds/3600)+"h ago";return Math.floor(seconds/86400)+"d ago";}
  function rows(payload,keys){
    if(Array.isArray(payload))return payload;
    for(var index=0;index<keys.length;index++){
      var value=payload&&payload[keys[index]];
      if(Array.isArray(value))return value;
      if(value&&typeof value==="object")return Object.keys(value).map(function(key){return Object.assign({key:key},value[key]||{});});
    }
    return [];
  }
  function fetchJSON(path){return fetch(path,{cache:"no-store"}).then(function(response){if(!response.ok)throw new Error(path+" returned "+response.status);return response.json();}).catch(function(error){console.warn(error);return {};});}
  function cleanId(value){return String(value||"").replace(/[^A-Za-z0-9_.-]+/g,"-");}
  function matchupKey(date,away,home){return dateKey(date)+"|"+String(away||"").toUpperCase()+"@"+String(home||"").toUpperCase();}
  function matchupText(away,home){return String(away||"TBD")+" @ "+String(home||"TBD");}
  function rangeWidth(range){return range&&number(range[0])!==null&&number(range[1])!==null?Math.abs(number(range[1])-number(range[0])):null;}
  function outsCount(game){return (game.awayOut||[]).length+(game.homeOut||[]).length;}
  function movementMagnitude(game){var move=game.move||{};return Math.max(Math.abs(number(move.margin)||0),Math.abs(number(move.win)||0),Math.abs(number(move.total)||0));}
  function sortPlayers(players){return (players||[]).slice().sort(function(a,b){return (number(b.min)||-1)-(number(a.min)||-1);});}

  function teamMaps(payload){
    var byAbbr={},byName={};
    rows(payload,["teams","rows"]).forEach(function(team){
      var abbr=String(first(team,["team","team_abbr","abbr"])||"").toUpperCase();
      var name=String(first(team,["team_full","name","full_name"])||"");
      if(abbr){byAbbr[abbr]=name||abbr;byName[abbr]=abbr;}
      if(name)byName[name.toUpperCase()]=abbr;
    });
    return {byAbbr:byAbbr,byName:byName};
  }

  function previewMap(payload){
    var map={},source=payload&&payload.games;
    if(Array.isArray(source))source.forEach(function(game){var id=String(first(game,["game_id","id","key"])||"");if(id)map[id]=game;});
    else if(source&&typeof source==="object")Object.keys(source).forEach(function(key){map[String(key)]=source[key]||{};});
    return map;
  }

  function leverageMap(payload){var map={};rows(payload,["games","top","rows"]).forEach(function(game){var id=String(first(game,["game_id","id"])||"");if(id)map[id]=game;});return map;}
  function finalMap(payload){var map={};rows(payload,["games","rows"]).forEach(function(game){map[matchupKey(game.date,game.away,game.home)]=game;});return map;}

  function archiveMaps(payload){
    var reports={},predictions=[];
    (payload&&Array.isArray(payload.days)?payload.days:[]).forEach(function(day){
      var date=day.date;
      (day.reports||[]).forEach(function(report){reports[matchupKey(date,String(report.label||"").split(" @ ")[0],String(report.label||"").split(" @ ")[1])]=report.href;});
      (day.predictions||[]).forEach(function(prediction){predictions.push(Object.assign({date:date},prediction));});
    });
    return {reports:reports,predictions:predictions};
  }

  function callParts(call,home,away,maps){
    var text=String(call||"").trim(),upper=text.toUpperCase(),winner=null;
    [home,away].forEach(function(abbr){
      var code=String(abbr||"").toUpperCase(),full=String(maps.byAbbr[code]||"").toUpperCase();
      if(code&&(upper.indexOf(code+" ")===0||upper===code||full&&upper.indexOf(full)===0))winner=code;
    });
    var match=text.match(/by\s+([0-9]+(?:\.[0-9]+)?)/i),margin=match?number(match[1]):(/even|pick(?:'|’)em/i.test(text)?0:null);
    return {winner:winner,margin:margin===null?null:(winner===String(home||"").toUpperCase()?Math.abs(margin):winner===String(away||"").toUpperCase()?-Math.abs(margin):null)};
  }

  function normalizeGames(gamesPayload,previewPayload,leveragePayload,finalsPayload,archivePayload,teamsPayload){
    var previews=previewMap(previewPayload),leverages=leverageMap(leveragePayload),finals=finalMap(finalsPayload),archive=archiveMaps(archivePayload),maps=teamMaps(teamsPayload);
    var normalized=rows(gamesPayload,["games","rows","items"]).map(function(raw){
      var id=String(first(raw,["game_id","id","key"])||"");
      var preview=previews[id]||{},prediction=raw.predictions&&typeof raw.predictions==="object"?raw.predictions:{};
      var home=String(first(raw,["home","home_team","home_abbr"])||first(preview,["home","home_team","home_abbr"])||"TBD").toUpperCase();
      var away=String(first(raw,["away","away_team","away_abbr"])||first(preview,["away","away_team","away_abbr"])||"TBD").toUpperCase();
      var date=first(raw,["date","game_date","scheduled_at"])||first(preview,["date","game_date"]);
      var margin=number(first(raw,["pred_margin","predicted_margin","projected_margin"]));if(margin===null)margin=number(first(prediction,["predicted_margin","point_spread","projected_margin"]));
      var total=number(first(raw,["total","pred_total","predicted_total"]));if(total===null)total=number(first(prediction,["predicted_total","total","projected_total"]));
      var homeP=probability(first(raw,["p_home_win","home_win_probability","home_probability"]));if(homeP===null)homeP=probability(first(prediction,["home_win_probability","home_probability"]));
      var call=first(raw,["call","predicted_winner"])||first(prediction,["winner","predicted_winner","pick"]);
      if(!call&&margin!==null)call=(margin>=0?home:away)+" by "+Math.abs(margin).toFixed(1);
      var range80=[number(first(raw,["range80_lo"])),number(first(raw,["range80_hi"]))];
      if(range80[0]===null||range80[1]===null){var interval=first(prediction,["margin_interval","interval"]);if(Array.isArray(interval))range80=[number(interval[0]),number(interval[1])];else if(interval&&typeof interval==="object")range80=[number(first(interval,["low","lower","lo"])),number(first(interval,["high","upper","hi"]))];}
      var range90=[number(first(raw,["range90_lo"])),number(first(raw,["range90_hi"]))];
      var final=finals[matchupKey(date,away,home)]||null;
      var homeMargin=final?number(first(final,["home_margin","actual_margin"])):number(first(raw,["actual_margin","home_margin"]));
      var homeScore=final?number(final.home_score):number(first(raw,["home_score","actual_home_score"]));
      var awayScore=final?number(final.away_score):number(first(raw,["away_score","actual_away_score"]));
      if(homeMargin===null&&homeScore!==null&&awayScore!==null)homeMargin=homeScore-awayScore;
      var status=homeMargin!==null?"final":String(first(raw,["status","game_status"])||"").toLowerCase();
      if(status!=="final")status="upcoming";
      var rawAvail=raw.avail||{},previewSides=preview.sides||{};
      var homeSide=previewSides.home||{},awaySide=previewSides.away||{};
      var homeOut=(rawAvail.home&&rawAvail.home.out)||homeSide.out||[];
      var awayOut=(rawAvail.away&&rawAvail.away.out)||awaySide.out||[];
      var homeLimited=(rawAvail.home&&rawAvail.home.limited)||homeSide.limited||[];
      var awayLimited=(rawAvail.away&&rawAvail.away.limited)||awaySide.limited||[];
      var report=archive.reports[matchupKey(date,away,home)]||("game_report_v2.html?game_id="+encodeURIComponent(id));
      return {
        raw:raw,id:id,date:date,dateValue:parseDate(date),tip:first(raw,["tip_et","tip","time_et"])||first(preview,["tip_et","tip"]),
        home:home,away:away,homeFull:first(raw,["home_full"])||maps.byAbbr[home],awayFull:first(raw,["away_full"])||maps.byAbbr[away],
        margin:margin,total:total,homeP:homeP,call:String(call||"Call not published"),range80:range80,range90:range90,
        uncertainty:rangeWidth(range80),status:status,actualMargin:homeMargin,homeScore:homeScore,awayScore:awayScore,
        leverage:leverages[id]||null,move:raw.move||{},why:raw.why||{},tails:raw.tails||{},model:first(raw,["model_" + "version","source_model","source_version"])||first(prediction,["source_model","model_" + "version","source_version"])||"published model",
        homeOut:homeOut,awayOut:awayOut,homeLimited:homeLimited,awayLimited:awayLimited,
        homePlayers:sortPlayers(homeSide.players||[]),awayPlayers:sortPlayers(awaySide.players||[]),report:report
      };
    });
    return {games:normalized,archive:archive,finals:finals,maps:maps};
  }

  function archiveResults(archive,finals,maps){
    return archive.predictions.map(function(prediction){
      var parts=String(prediction.matchup||"").split(" @ "),away=String(parts[0]||"").toUpperCase(),home=String(parts[1]||"").toUpperCase();
      var final=finals[matchupKey(prediction.date,away,home)]||null,call=callParts(prediction.call,home,away,maps);
      var actual=final?number(final.home_margin):null,miss=actual!==null&&call.margin!==null?Math.abs(actual-call.margin):null;
      return {date:prediction.date,away:away,home:home,matchup:prediction.matchup,call:prediction.call,winPct:number(prediction.win_pct),range:prediction.range80,final:final,actual:actual,predictedWinner:call.winner,miss:miss,correct:final&&call.winner?String(final.winner||"").toUpperCase()===call.winner:null,report:archive.reports[matchupKey(prediction.date,away,home)]||null};
    }).filter(function(row){return row.final;}).sort(function(a,b){return (parseDate(b.date)||0)-(parseDate(a.date)||0);});
  }

  function rangeBar(range,point){
    var lo=number(range&&range[0]),hi=number(range&&range[1]),mid=number(point);if(lo===null||hi===null)return '<span class="hw-muted">—</span>';
    var axis=60,left=clamp((Math.min(lo,hi)+30)/axis*100,0,100),right=clamp((Math.max(lo,hi)+30)/axis*100,0,100),marker=mid===null?50:clamp((mid+30)/axis*100,0,100);
    return '<span class="hw-range-track" aria-label="Range '+esc(signed(lo))+' to '+esc(signed(hi))+'"><span style="left:'+left.toFixed(1)+'%;width:'+Math.max(1,right-left).toFixed(1)+'%"></span><i style="left:'+marker.toFixed(1)+'%"></i></span><small>'+esc(signed(lo))+' to '+esc(signed(hi))+'</small>';
  }

  function badge(text,kind){return '<span class="hw-badge '+(kind||'')+'">'+esc(text)+'</span>';}
  function gameContext(game){
    var pieces=[];
    if(game.leverage&&game.leverage.tier)pieces.push(badge(game.leverage.tier,game.leverage.pct_of_slate>=.9?"warn":""));
    if(outsCount(game))pieces.push(badge(outsCount(game)+" out",outsCount(game)>=4?"bad":""));
    if(!pieces.length)pieces.push(badge(game.status,game.status==="final"?"good":""));
    return pieces.join("");
  }

  function rotationRows(players){
    var visible=(players||[]).slice(0,5);if(!visible.length)return '<span class="hw-muted">No rotation projection published.</span>';
    return visible.map(function(player){return '<div class="hw-rotation-row"><span>'+esc(first(player,["name","player_name"])||"Unknown")+'</span><span>'+esc(fixed(first(player,["min","minutes"]),1))+'</span><span>'+esc(fixed(first(player,["pts","points"]),1))+'</span></div>';}).join("");
  }

  function availabilityLine(team,out,limited){
    var text=[];if(out&&out.length)text.push("Out: "+out.join(", "));if(limited&&limited.length)text.push("Limited: "+limited.join(", "));return '<li><b>'+esc(team)+'</b><span>'+esc(text.join(" · ")||"No listed restrictions")+'</span></li>';
  }

  // RENDER-TIME RECONCILIATION - the same refusal game.html makes, on the surface that carries
  // the most traffic. THE PRODUCT LAW: every call renders with the components that build it, and
  // those components must SUM EXACTLY to the call. The publish boundary already blocks a bake
  // whose annotations do not reconcile (game_annotation.assert_publishable, raised from
  // build_site.py and gameday_report.py and caught nowhere). This is the browser-side half, and
  // it exists because a payload can be truncated, edited in transit, or served from a stale cache
  // long after the bake proved it added up.
  //
  // OMIT, NEVER INVENT, AND NEVER THROW. A chain that does not reconcile is DROPPED, and the card
  // falls back to naming the model - the same fallback an absent chain has always taken. The
  // reader then sees the call without its breakdown: never an error, never a blank card, never a
  // page taken down over a data defect. The LOUD half of the law lives at the publish boundary on
  // purpose; a second blocker in the browser would trade a missing breakdown for a dead board,
  // which is strictly the worse failure.
  //
  // Deliberately NOT ported from game.html: its +/-4.38 home-court band clamp. That is a refusal
  // about DRAWING a waterfall bar whose step is implausibly large, not about the arithmetic; this
  // surface renders labelled text rows, and applying it here would omit chains that reconcile
  // perfectly.
  var CHAIN_TOL=1e-6,CHAIN_PUBLISHED_TOL=0.05,CHAIN_MAX_STEPS=6;
  function whyChain(why){
    var steps=why&&Array.isArray(why.steps)?why.steps:[];
    // Base + at least one adjustment + total. Positional, not label-matched: the baker owns the
    // wording and has to stay free to change it without silently emptying this block. The ceiling
    // is here so a runaway chain cannot render a partial set of rows that no longer sums.
    if(steps.length<3||steps.length>CHAIN_MAX_STEPS)return null;
    var values=[],index,value;
    for(index=0;index<steps.length;index++){
      value=number(steps[index].value);
      if(value===null)return null;                    // an unparseable leg is not a chain
      values.push(value);
    }
    var total=values[values.length-1],sum=0;
    for(index=0;index<values.length-1;index++)sum+=values[index];
    if(Math.abs(sum-total)>CHAIN_TOL)return null;     // the parts do not add up -> render nothing
    var published=number(why.published);
    if(published===null)return null;
    // The chain total and the published margin are the same quantity at two precisions, so they
    // must agree to within half a display step. A tolerance on the difference, deliberately not a
    // re-rounding comparison: the baker rounds half-away-from-zero and JS rounds half-toward
    // +Infinity, so an exact .x5 total would refuse a perfectly valid chain.
    if(Math.abs(total-published)>CHAIN_PUBLISHED_TOL+CHAIN_TOL)return null;
    return steps;
  }

  function whyLine(game){
    var steps=whyChain(game.why);
    if(!steps)return '<li><b>Model</b><span>'+esc(game.model)+'</span></li>';
    return steps.map(function(step){return '<li><b>'+esc(step.label||"Component")+'</b><span>'+esc(step.value||"")+(step.detail?' · '+esc(step.detail):'')+'</span></li>';}).join("");
  }

  function movementLines(game){
    var move=game.move||{},lines=[];
    if(has(move.since))lines.push('<li><b>Since</b><span>'+esc(dateLong(move.since))+'</span></li>');
    if(number(move.margin)!==null)lines.push('<li><b>Margin move</b><span>'+esc(signed(move.margin))+' points</span></li>');
    if(number(move.win)!==null)lines.push('<li><b>Win move</b><span>'+esc(signed(move.win))+' percentage points</span></li>');
    if(number(move.total)!==null)lines.push('<li><b>Total move</b><span>'+esc(signed(move.total))+' points</span></li>');
    if(game.leverage)lines.push('<li><b>Season stakes</b><span>'+esc(game.leverage.tier||"Published")+' · '+esc(fixed(game.leverage.leverage,1))+'</span></li>');
    return lines.join("")||'<li><b>Movement</b><span>No change history published.</span></li>';
  }

  function detailHtml(game){
    var awayProb=game.homeP===null?null:1-game.homeP;
    var finalScore=game.homeScore!==null&&game.awayScore!==null?fixed(game.awayScore,0)+"–"+fixed(game.homeScore,0):"—";
    var nail=number(game.tails&&game.tails.nail_pct),blow=number(game.tails&&game.tails.blow_pct);
    return '<div class="hw-game-expand-grid">'+
      '<section class="hw-game-detail-panel"><h3>Forecast and result</h3><div class="hw-game-detail-body"><div class="hw-game-metrics">'+
        '<div class="hw-game-metric"><span>Away win</span><strong>'+esc(pct(awayProb))+'</strong></div>'+
        '<div class="hw-game-metric"><span>Home win</span><strong>'+esc(pct(game.homeP))+'</strong></div>'+
        '<div class="hw-game-metric"><span>Home margin</span><strong>'+esc(signed(game.margin))+'</strong></div>'+
        '<div class="hw-game-metric"><span>Total</span><strong>'+esc(fixed(game.total,1))+'</strong></div>'+
        '<div class="hw-game-metric"><span>80% width</span><strong>'+esc(fixed(game.uncertainty,1))+'</strong></div>'+
        '<div class="hw-game-metric"><span>Final</span><strong>'+esc(finalScore)+'</strong></div>'+
      '</div><ul class="hw-detail-list" style="margin-top:6px">'+
        '<li><b>80% range</b><span>'+esc(game.range80[0]===null?"Not published":signed(game.range80[0])+" to "+signed(game.range80[1]))+'</span></li>'+
        '<li><b>90% range</b><span>'+esc(game.range90[0]===null?"Not published":signed(game.range90[0])+" to "+signed(game.range90[1]))+'</span></li>'+
        '<li><b>Close-game</b><span>'+esc(nail===null?"Not published":nail.toFixed(0)+"%")+'</span></li>'+
        '<li><b>Blowout</b><span>'+esc(blow===null?"Not published":blow.toFixed(0)+"%")+'</span></li>'+
      '</ul></div></section>'+
      '<section class="hw-game-detail-panel"><h3>Availability and projected rotation</h3><div class="hw-game-detail-body"><ul class="hw-detail-list">'+availabilityLine(game.away,game.awayOut,game.awayLimited)+availabilityLine(game.home,game.homeOut,game.homeLimited)+'</ul><div class="hw-rotation-sides"><div class="hw-rotation-side"><strong>'+esc(game.away)+' · min · pts</strong>'+rotationRows(game.awayPlayers)+'</div><div class="hw-rotation-side"><strong>'+esc(game.home)+' · min · pts</strong>'+rotationRows(game.homePlayers)+'</div></div></div></section>'+
      '<section class="hw-game-detail-panel"><h3>Movement, stakes, and model</h3><div class="hw-game-detail-body"><ul class="hw-detail-list">'+movementLines(game)+whyLine(game)+'</ul><div class="hw-game-actions"><a class="hw-button" href="'+safeHref(game.report)+'">Open report</a><a class="hw-button" href="daybyday.html">Day by day</a><a class="hw-button" href="availability.html">Availability board</a></div></div></section>'+
    '</div>';
  }

  function gameRow(game){
    var awayP=game.homeP===null?null:1-game.homeP,context=gameContext(game),id=cleanId(game.id||matchupText(game.away,game.home)+game.date);
    var mobile=["Margin "+signed(game.margin),"Total "+fixed(game.total,1),"Range "+(game.range80[0]===null?"—":signed(game.range80[0])+"…"+signed(game.range80[1])),outsCount(game)+" out"].join(" · ");
    return '<details class="hw-game-detail" id="game-'+esc(id)+'" data-game-id="'+esc(game.id)+'"><summary class="hw-ledger-row">'+
      '<span class="hw-ledger-date"><strong>'+esc(dateShort(game.date))+'</strong><small>'+esc(game.tip||game.status)+'</small></span>'+
      '<span class="hw-ledger-matchup"><strong>'+esc(matchupText(game.away,game.home))+'</strong><small>'+esc((game.awayFull||game.away)+" at "+(game.homeFull||game.home))+'</small></span>'+
      '<span class="hw-ledger-call">'+esc(game.call)+'</span>'+ 
      '<span class="hw-ledger-num">'+esc(pct(game.homeP))+'</span>'+ 
      '<span class="hw-ledger-num">'+esc(signed(game.margin))+'</span>'+ 
      '<span class="hw-range-cell">'+rangeBar(game.range80,game.margin)+'</span>'+ 
      '<span class="hw-ledger-num">'+esc(fixed(game.total,1))+'</span>'+ 
      '<span class="hw-ledger-context">'+context+'</span>'+ 
      '<span class="hw-ledger-chevron">⌄</span>'+ 
      '<span class="hw-game-mobile-meta">'+esc(mobile)+'</span>'+ 
    '</summary><div class="hw-game-expand">'+detailHtml(game)+'</div></details>';
  }

  function currentPool(games){var upcoming=games.filter(function(game){return game.status==="upcoming";});return upcoming.length?upcoming:games;}
  function extreme(list,score,descending){var valid=list.filter(function(item){return score(item)!==null;});valid.sort(function(a,b){return descending?score(b)-score(a):score(a)-score(b);});return valid[0]||null;}

  function renderStories(games){
    var pool=currentPool(games),closest=extreme(pool,function(game){return game.margin===null?null:Math.abs(game.margin);},false),favorite=extreme(pool,function(game){return game.margin===null?null:Math.abs(game.margin);},true),highest=extreme(pool,function(game){return game.total;},true),stakes=extreme(pool,function(game){return game.leverage?number(game.leverage.leverage):null;},true);
    var stories=[
      ["Published board",games.length+" games",pool.length+" upcoming"],
      ["Closest call",closest?matchupText(closest.away,closest.home):"—",closest?closest.call:"No call published"],
      ["Biggest favorite",favorite?favorite.call:"—",favorite?matchupText(favorite.away,favorite.home):"No call published"],
      ["Highest total",highest?fixed(highest.total,1):"—",highest?matchupText(highest.away,highest.home):"No total published"],
      ["Highest stakes",stakes?matchupText(stakes.away,stakes.home):"—",stakes?String(stakes.leverage.tier||"")+" · "+fixed(stakes.leverage.leverage,1):"No leverage read"]
    ];
    $("games-stories").innerHTML=stories.map(function(story){return '<article class="hw-story"><span class="hw-story-label">'+esc(story[0])+'</span><strong class="hw-story-value">'+esc(story[1])+'</strong><span class="hw-story-note">'+esc(story[2])+'</span></article>';}).join("");
  }

  function renderPulse(games){
    var pool=currentPool(games),closest=extreme(pool,function(game){return game.margin===null?null:Math.abs(game.margin);},false),uncertain=extreme(pool,function(game){return game.uncertainty;},true),short=extreme(pool,function(game){return outsCount(game);},true),move=extreme(pool,function(game){return movementMagnitude(game);},true),stakes=extreme(pool,function(game){return game.leverage?number(game.leverage.leverage):null;},true),items=[];
    if(closest)items.push(["Closest game",matchupText(closest.away,closest.home),closest.call]);
    if(uncertain)items.push(["Widest 80% range",matchupText(uncertain.away,uncertain.home),fixed(uncertain.uncertainty,1)+" pts"]);
    if(short&&outsCount(short)>0)items.push(["Most absences",matchupText(short.away,short.home),outsCount(short)+" out"]);
    if(move&&movementMagnitude(move)>0)items.push(["Largest move",matchupText(move.away,move.home),fixed(movementMagnitude(move),1)]);
    if(stakes)items.push(["Highest season leverage",matchupText(stakes.away,stakes.home),fixed(stakes.leverage.leverage,1)]);
    $("games-dense-pulse").innerHTML=items.length?items.map(function(item){return '<article class="hw-pulse"><span class="hw-pulse-tag">'+esc(item[0])+'</span><div class="hw-pulse-line"><strong>'+esc(item[1])+'</strong><span>'+esc(item[2])+'</span></div></article>';}).join(""):'<div class="hw-empty">No game stories match these filters.</div>';
  }

  function filteredGames(){
    var query=String($("games-dense-search").value||"").trim().toLowerCase(),team=$("games-dense-team").value,stateFilter=$("games-dense-state").value,windowFilter=$("games-dense-window").value,sort=$("games-dense-sort").value,now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()),next7=new Date(today.getTime()+7*86400000),recent7=new Date(today.getTime()-7*86400000);
    var list=state.games.filter(function(game){
      if(query&&[game.away,game.home,game.awayFull,game.homeFull,game.call].join(" ").toLowerCase().indexOf(query)<0)return false;
      if(team&&game.away!==team&&game.home!==team)return false;
      if(stateFilter&&game.status!==stateFilter)return false;
      if(windowFilter){var date=game.dateValue;if(!date)return false;if(windowFilter==="next7"&&(date<today||date>next7))return false;if(windowFilter==="recent7"&&(date<recent7||date>=today))return false;}
      return true;
    });
    var score={closest:function(game){return game.margin===null?Infinity:Math.abs(game.margin);},favorite:function(game){return game.margin===null?-Infinity:Math.abs(game.margin);},total:function(game){return game.total===null?-Infinity:game.total;},uncertainty:function(game){return game.uncertainty===null?-Infinity:game.uncertainty;},leverage:function(game){return game.leverage&&number(game.leverage.leverage)!==null?number(game.leverage.leverage):-Infinity;}};
    if(sort==="date")list.sort(function(a,b){if(a.status!==b.status)return a.status==="upcoming"?-1:1;var av=a.dateValue?a.dateValue.getTime():0,bv=b.dateValue?b.dateValue.getTime():0;return a.status==="upcoming"?av-bv:bv-av;});
    else list.sort(function(a,b){var av=score[sort](a),bv=score[sort](b);return sort==="closest"?av-bv:bv-av;});
    return list;
  }

  function renderBoard(){
    state.filtered=filteredGames();
    $("games-dense-count").textContent=state.filtered.length+" of "+state.games.length+" games";
    $("games-dense-list").innerHTML=state.filtered.length?state.filtered.map(gameRow).join(""):'<div class="hw-empty">No published games match these filters.</div>';
    renderPulse(state.filtered);renderViz();
  }

  function axisTicks(min,max,count){var out=[];for(var index=0;index<count;index++)out.push(min+(max-min)*index/(count-1));return out;}
  function extent(values,padding){var valid=values.map(number).filter(function(value){return value!==null;});if(!valid.length)return [0,1];var min=Math.min.apply(null,valid),max=Math.max.apply(null,valid),span=max-min||Math.max(1,Math.abs(max)||1);return [min-span*(padding||0),max+span*(padding||0)];}

  function renderViz(){
    var games=state.filtered.filter(function(game){return state.viz==="margin-total"?game.margin!==null&&game.total!==null:game.homeP!==null&&game.uncertainty!==null;});
    if(!games.length){$("games-dense-viz").innerHTML='<div class="hw-empty">No plotted games match these filters.</div>';$("games-dense-viz-legend").innerHTML="";return;}
    var width=1000,height=300,pad={left:55,right:22,top:20,bottom:40},innerW=width-pad.left-pad.right,innerH=height-pad.top-pad.bottom,xValues,yValues,xLabel,yLabel;
    if(state.viz==="margin-total"){
      var maxAbs=Math.max(5,Math.max.apply(null,games.map(function(game){return Math.abs(game.margin);}))*1.15);xValues=[-maxAbs,maxAbs];yValues=extent(games.map(function(game){return game.total;}),.12);xLabel="Projected home margin";yLabel="Projected total";
    }else{xValues=[50,100];yValues=extent(games.map(function(game){return game.uncertainty;}),.12);xLabel="Favorite win probability";yLabel="80% range width";}
    function x(value){return pad.left+(value-xValues[0])/(xValues[1]-xValues[0]||1)*innerW;}
    function y(value){return pad.top+innerH-(value-yValues[0])/(yValues[1]-yValues[0]||1)*innerH;}
    var xTicks=axisTicks(xValues[0],xValues[1],6),yTicks=axisTicks(yValues[0],yValues[1],5),svg='<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+esc(xLabel)+' by '+esc(yLabel)+'">';
    yTicks.forEach(function(tick){var py=y(tick);svg+='<line class="hw-gridline" x1="'+pad.left+'" y1="'+py+'" x2="'+(width-pad.right)+'" y2="'+py+'"></line><text class="hw-axis-label" x="'+(pad.left-8)+'" y="'+(py+3)+'" text-anchor="end">'+esc(fixed(tick,1))+'</text>';});
    xTicks.forEach(function(tick){var px=x(tick);svg+='<line class="hw-gridline" x1="'+px+'" y1="'+pad.top+'" x2="'+px+'" y2="'+(height-pad.bottom)+'"></line><text class="hw-axis-label" x="'+px+'" y="'+(height-pad.bottom+16)+'" text-anchor="middle">'+esc(fixed(tick,1))+'</text>';});
    svg+='<line class="hw-axis" x1="'+pad.left+'" y1="'+(height-pad.bottom)+'" x2="'+(width-pad.right)+'" y2="'+(height-pad.bottom)+'"></line><line class="hw-axis" x1="'+pad.left+'" y1="'+pad.top+'" x2="'+pad.left+'" y2="'+(height-pad.bottom)+'"></line><text class="hw-axis-label" x="'+(pad.left+innerW/2)+'" y="'+(height-6)+'" text-anchor="middle">'+esc(xLabel)+'</text><text class="hw-axis-label" transform="translate(12 '+(pad.top+innerH/2)+') rotate(-90)" text-anchor="middle">'+esc(yLabel)+'</text>';
    if(state.viz==="margin-total"&&xValues[0]<0&&xValues[1]>0)svg+='<line class="hw-diagonal" x1="'+x(0)+'" y1="'+pad.top+'" x2="'+x(0)+'" y2="'+(height-pad.bottom)+'"></line>';
    games.forEach(function(game,index){var xv=state.viz==="margin-total"?game.margin:Math.max(game.homeP,1-game.homeP)*100,yv=state.viz==="margin-total"?game.total:game.uncertainty,px=x(xv),py=y(yv),label=game.away+"@"+game.home,anchor=px>width-110?"end":"start",dx=anchor==="end"?-7:7;
      svg+='<g class="hw-games-point" tabindex="0" role="button" data-game-id="'+esc(game.id)+'" transform="translate('+px.toFixed(1)+' '+py.toFixed(1)+')"><title>'+esc(label+" · "+xLabel+" "+fixed(xv,1)+" · "+yLabel+" "+fixed(yv,1))+'</title><circle r="4.2"></circle>'+(games.length<=28||index<14?'<text x="'+dx+'" y="3" text-anchor="'+anchor+'">'+esc(label)+'</text>':'')+'</g>';});
    svg+='</svg>';$("games-dense-viz").innerHTML=svg;
    $("games-dense-viz-legend").innerHTML='<span><b>'+games.length+'</b> plotted games</span><span>Tap a point to open the report row</span><span>Missing values are not imputed</span>';
    qa(".hw-games-point",$("games-dense-viz")).forEach(function(point){function open(){openGame(point.getAttribute("data-game-id"));}point.addEventListener("click",open);point.addEventListener("keydown",function(event){if(event.key==="Enter"||event.key===" "){event.preventDefault();open();}});});
  }

  function openGame(gameId){var detail=qGame(gameId);if(!detail)return;detail.open=true;detail.scrollIntoView({behavior:"smooth",block:"center"});}
  function qGame(gameId){return qa(".hw-game-detail").find(function(detail){return detail.getAttribute("data-game-id")===String(gameId);})||null;}

  function renderResults(){
    var rowsHtml=state.results.slice(0,24).map(function(result){var final=result.final||{},score=number(final.away_score)!==null&&number(final.home_score)!==null?fixed(final.away_score,0)+"–"+fixed(final.home_score,0):String(final.final||"—"),winner=result.correct===null?"—":result.correct?"Correct":"Miss",winnerClass=result.correct===null?"":result.correct?"hw-result-good":"hw-result-bad";
      return '<tr><td>'+esc(dateShort(result.date))+'</td><td><strong>'+esc(result.matchup)+'</strong></td><td>'+esc(result.call||"—")+'</td><td>'+esc(score)+'</td><td class="num">'+esc(signed(result.actual))+'</td><td class="num">'+esc(fixed(result.miss,1))+'</td><td class="'+winnerClass+'">'+esc(winner)+'</td><td>'+(result.report?'<a class="hw-link" href="'+safeHref(result.report)+'">PDF</a>':'—')+'</td></tr>';
    }).join("");
    $("games-dense-results").innerHTML=rowsHtml||'<tr><td colspan="8"><div class="hw-empty">No archived calls have a matching final yet.</div></td></tr>';
  }

  function populateTeams(games){var teams={};games.forEach(function(game){teams[game.away]=true;teams[game.home]=true;});$("games-dense-team").innerHTML='<option value="">All teams</option>'+Object.keys(teams).sort().map(function(team){return '<option value="'+esc(team)+'">'+esc(team)+'</option>';}).join("");}
  function setFreshness(payloads){var stamps=[];payloads.forEach(function(payload){["generated_utc","generated","built_utc","as_of","updated_utc"].forEach(function(key){var parsed=parseDate(payload&&payload[key]);if(parsed)stamps.push(parsed);});});stamps.sort(function(a,b){return b-a;});var latest=stamps[0],target=$("games-dense-list")&&document.querySelector("[data-games-fresh]");if(!target)return;if(!latest){target.classList.add("warn");target.innerHTML='<span class="hw-fresh-dot"></span>Build time not published';return;}var hours=(Date.now()-latest.getTime())/36e5;target.classList.toggle("warn",hours>24);target.innerHTML='<span class="hw-fresh-dot"></span>Updated '+ageText(latest.toISOString());}

  function bind(){
    ["games-dense-search","games-dense-team","games-dense-state","games-dense-window","games-dense-sort"].forEach(function(id){var element=$(id);element.addEventListener(id==="games-dense-search"?"input":"change",renderBoard);});
    $("games-dense-reset").addEventListener("click",function(){$("games-dense-search").value="";$("games-dense-team").value="";$("games-dense-state").value="";$("games-dense-window").value="";$("games-dense-sort").value="date";renderBoard();});
    qa("[data-games-viz]").forEach(function(button){button.addEventListener("click",function(){state.viz=button.getAttribute("data-games-viz");qa("[data-games-viz]").forEach(function(other){var active=other===button;other.classList.toggle("active",active);other.setAttribute("aria-selected",String(active));});renderViz();});});
  }

  function boot(){
    bind();
    Promise.all(Object.keys(FILES).map(function(key){return fetchJSON(FILES[key]);})).then(function(payloadList){
      var payload={};Object.keys(FILES).forEach(function(key,index){payload[key]=payloadList[index];});state.payloads=payloadList;
      var normalized=normalizeGames(payload.games,payload.preview,payload.leverage,payload.finals,payload.archive,payload.teams);state.games=normalized.games;state.results=archiveResults(normalized.archive,normalized.finals,normalized.maps);
      populateTeams(state.games);setFreshness(payloadList);renderStories(state.games);renderBoard();renderResults();
    });
  }

  window.HardwoodGames={normalizeGames:normalizeGames,archiveResults:archiveResults,rangeWidth:rangeWidth,whyChain:whyChain,whyLine:whyLine};
  boot();
})();
