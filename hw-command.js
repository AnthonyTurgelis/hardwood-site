/* Hardwood league command center — dense league coverage, same-origin data only. */
(function(){
  "use strict";

  var FILES={
    games:"games.json",
    preview:"preview.json",
    players:"players.json",
    teams:"teams.json",
    standings:"standings.json",
    availability:"availability.json",
    accuracy:"accuracy.json",
    research:"deepdive.json"
  };
  var state={payloads:{},games:[],players:[],teams:[],standings:[],availability:[],research:[],viz:"teams"};
  var NAV=[
    ["Home","index.html","home"],
    ["Games","games.html","games"],
    ["Players","players.html","players"],
    ["Teams","teams.html","teams"],
    ["Standings","standings.html","standings"],
    ["Availability","availability.html","availability"],
    ["Research","deepdive.html","research"],
    ["Accuracy","accuracy.html","accuracy"]
  ];
  var TOOLS=[
    ["Game reports","report_archive.html"],
    ["Compare players","compare.html"],
    ["Player impact","player_impact.html"],
    ["Situation explorer","situation.html"],
    ["Data explorer","explorer.html"],
    ["Methodology","primer.html"],
    ["Operations","board.html"]
  ];

  function $(id){return document.getElementById(id);}
  function qa(selector,root){return Array.prototype.slice.call((root||document).querySelectorAll(selector));}
  function has(value){return value!==null&&value!==undefined&&value!=="";}
  function number(value){if(value===true||value===false||!has(value))return null;var n=Number(value);return Number.isFinite(n)?n:null;}
  function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
  function first(object,keys){for(var i=0;i<keys.length;i++){var value=object&&object[keys[i]];if(has(value))return value;}return null;}
  function esc(value){return String(value==null?"":value).replace(/[&<>"']/g,function(char){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char];});}
  function safeHref(value){var href=String(value||"");return href&&!/^javascript:/i.test(href)?esc(href):"#";}
  function fixed(value,digits){var n=number(value);return n===null?"—":n.toFixed(digits==null?1:digits);}
  function signed(value,digits){var n=number(value);return n===null?"—":(n>0?"+":"")+n.toFixed(digits==null?1:digits);}
  function probability(value){var n=number(value);if(n===null)return null;if(n>1&&n<=100)n/=100;return n>=0&&n<=1?n:null;}
  function pct(value,digits){var n=probability(value);return n===null?"—":(n*100).toFixed(digits==null?0:digits)+"%";}
  function pctRaw(value,digits){var n=number(value);return n===null?"—":n.toFixed(digits==null?0:digits)+"%";}
  function dateObject(value){if(!has(value))return null;var d=new Date(value);return Number.isNaN(d.getTime())?null:d;}
  function shortDate(value){var d=dateObject(value);return d?d.toLocaleDateString(undefined,{month:"short",day:"numeric"}):String(value||"—");}
  function ageText(value){var d=dateObject(value);if(!d)return "time not published";var seconds=Math.max(0,(Date.now()-d.getTime())/1000);if(seconds<90)return "just now";if(seconds<3600)return Math.floor(seconds/60)+"m ago";if(seconds<86400)return Math.floor(seconds/3600)+"h ago";return Math.floor(seconds/86400)+"d ago";}
  function rows(payload,keys){
    if(Array.isArray(payload))return payload;
    for(var i=0;i<keys.length;i++){
      var value=payload&&payload[keys[i]];
      if(Array.isArray(value))return value;
      if(value&&typeof value==="object")return Object.keys(value).map(function(key){return Object.assign({key:key},value[key]||{});});
    }
    return [];
  }
  function truncText(value,max){var text=String(value||"").replace(/\s+/g," ").trim();return text.length>max?text.slice(0,max-1).trim()+"…":text;}
  function fetchJSON(path){return fetch(path,{cache:"no-store"}).then(function(response){if(!response.ok)throw new Error(path+" returned "+response.status);return response.json();}).catch(function(error){console.warn(error);return {};});}

  function installShell(){
    if($("hw-product-shell"))return;
    var header=document.createElement("header");
    header.className="hw-topbar";
    header.id="hw-product-shell";
    var nav=NAV.map(function(item){return '<a href="'+item[1]+'"'+(item[2]==="home"?' aria-current="page"':'')+'>'+item[0]+'</a>';}).join("");
    var tools=TOOLS.map(function(item){return '<a href="'+item[1]+'"><span>'+item[0]+'</span></a>';}).join("");
    header.innerHTML='<div class="hw-topbar-inner"><a class="hw-brand" href="index.html"><span class="hw-brand-mark">H</span><span>Hardwood</span></a><button class="hw-mobile-toggle" id="hw-mobile-toggle" type="button" aria-expanded="false" aria-controls="hw-primary">☰</button><nav class="hw-primary" id="hw-primary" aria-label="Primary navigation">'+nav+'<details class="hw-tools"><summary>More</summary><div class="hw-tools-menu">'+tools+'</div></details></nav></div>';
    document.body.insertBefore(header,document.body.firstChild);
    var toggle=$("hw-mobile-toggle"),primary=$("hw-primary");
    if(toggle&&primary)toggle.addEventListener("click",function(){var open=primary.classList.toggle("open");toggle.setAttribute("aria-expanded",String(open));toggle.textContent=open?"×":"☰";});
    document.addEventListener("click",function(event){qa(".hw-tools[open]").forEach(function(details){if(!details.contains(event.target))details.removeAttribute("open");});});
    var footer=document.createElement("footer");
    footer.className="hw-footer";
    footer.innerHTML='<div class="hw-footer-inner"><div><strong>Hardwood</strong>Dense WNBA league intelligence, forecasts, public grading, and research.</div><div class="hw-footer-links"><a href="games.html">Games</a><a href="players.html">Players</a><a href="teams.html">Teams</a><a href="standings.html">Standings</a><a href="availability.html">Availability</a><a href="accuracy.html">Accuracy</a><a href="deepdive.html">Research</a><a href="board.html">Operations</a></div></div>';
    document.body.appendChild(footer);
  }

  function setFresh(payloads){
    var dates=[];
    payloads.forEach(function(payload){var stamp=first(payload,["generated_utc","generated","built_utc","as_of","updated_utc"]);var d=dateObject(stamp);if(d)dates.push(d);});
    dates.sort(function(a,b){return b-a;});
    qa("[data-fresh]").forEach(function(element){
      if(!dates.length){element.classList.add("warn");element.innerHTML='<span class="hw-fresh-dot"></span>Build time not published';return;}
      var hours=(Date.now()-dates[0].getTime())/36e5;
      element.classList.toggle("warn",hours>24);
      element.innerHTML='<span class="hw-fresh-dot"></span>Updated '+ageText(dates[0].toISOString());
    });
  }

  function normalizeGames(gamesPayload,previewPayload){
    var previewMap={};
    rows(previewPayload,["games","rows","items"]).forEach(function(game){var id=String(first(game,["game_id","id","key"])||"");if(id)previewMap[id]=game;});
    return rows(gamesPayload,["games","rows","items"]).map(function(game){
      var id=String(first(game,["game_id","id","key"])||"");
      var preview=previewMap[id]||{};
      var predictions=game.predictions&&typeof game.predictions==="object"?game.predictions:{};
      var margin=first(game,["pred_margin","predicted_margin","projected_margin"]);if(!has(margin))margin=first(predictions,["predicted_margin","point_spread","projected_margin"]);
      var total=first(game,["total","pred_total","predicted_total"]);if(!has(total))total=first(predictions,["predicted_total","total","projected_total"]);
      var homeP=first(game,["p_home_win","home_win_probability","home_probability"]);if(!has(homeP))homeP=first(predictions,["home_win_probability","home_probability"]);
      var rangeLow=first(game,["range80_lo"]),rangeHigh=first(game,["range80_hi"]);
      var interval=first(predictions,["margin_interval","interval"]);
      if((!has(rangeLow)||!has(rangeHigh))&&Array.isArray(interval)){rangeLow=interval[0];rangeHigh=interval[1];}
      if((!has(rangeLow)||!has(rangeHigh))&&interval&&typeof interval==="object"){rangeLow=first(interval,["low","lower","lo"]);rangeHigh=first(interval,["high","upper","hi"]);}
      var actual=number(first(game,["actual_margin","home_margin"]));
      var homeScore=number(first(game,["home_score","actual_home_score"])),awayScore=number(first(game,["away_score","actual_away_score"]));
      if(actual===null&&homeScore!==null&&awayScore!==null)actual=homeScore-awayScore;
      var status=String(first(game,["status","game_status"])||(game.awaiting_final?"Upcoming":(actual!==null?"Final":"Scheduled")));
      return {
        raw:game,
        id:id,
        date:first(game,["date","game_date","scheduled_at"])||first(preview,["date","game_date"]),
        tip:first(game,["tip_et","tip","time_et"])||first(preview,["tip_et","tip"]),
        home:String(first(game,["home","home_team","home_abbr"])||first(preview,["home","home_team","home_abbr"])||"TBD"),
        away:String(first(game,["away","away_team","away_abbr"])||first(preview,["away","away_team","away_abbr"])||"TBD"),
        call:first(game,["call","predicted_winner"])||first(predictions,["winner","predicted_winner","pick"]),
        margin:number(margin),
        total:number(total),
        homeP:probability(homeP),
        low:number(rangeLow),
        high:number(rangeHigh),
        actual:actual,
        status:status,
        report:"game_report_v2.html?game_id="+encodeURIComponent(id),
        model:String(first(game,["model_" + "version","source_model","source_version"])||first(predictions,["source_model","model_" + "version","source_version"])||"published model")
      };
    });
  }

  function normalizePlayers(payload){
    var source=payload&&payload.ratings&&Array.isArray(payload.ratings.players)?payload.ratings.players:rows(payload,["players","ratings","rows","items"]);
    return source.map(function(player,index){
      return {
        raw:player,
        id:first(player,["id","player_id","nba_player_id"]),
        name:String(first(player,["name","player_name","canonical_name"])||"Unknown player"),
        team:String(first(player,["team","team_abbr"])||"—"),
        rank:number(first(player,["rank"]))||index+1,
        impact:number(first(player,["rating","impact","impact_rating"])),
        minutes:number(first(player,["minutes","predicted_minutes","min_avg"])),
        pts:number(first(player,["pts","points"])),
        reb:number(first(player,["reb","rebounds"])),
        ast:number(first(player,["ast","assists"])),
        gp:number(first(player,["gp","games"])),
        basis:number(first(player,["n_basis","sample_games"])),
        provisional:Boolean(first(player,["impact_provisional","provisional","thin","small_basis"])),
        profile:"players/"+encodeURIComponent(first(player,["id","player_id","nba_player_id"])||"")+".html"
      };
    });
  }

  function normalizeStandings(payload){
    return rows(payload,["teams","rows"]).map(function(team,index){
      return {
        raw:team,
        rank:index+1,
        team:String(first(team,["team","team_abbr"])||"—"),
        name:String(first(team,["team_full","name","team"])||"Unknown team"),
        conference:first(team,["conference"]),
        wins:number(team.wins),
        losses:number(team.losses),
        gb:number(team.games_back),
        proj:number(team.proj_median_wins),
        range:Array.isArray(team.proj_range_90)?team.proj_range_90:null,
        playoff:probability(team.p_playoff),
        title:probability(team.p_title)
      };
    });
  }

  function normalizeTeams(payload,standings){
    var standingMap={};
    standings.forEach(function(team){standingMap[team.team]=team;});
    return rows(payload,["teams","rows"]).map(function(team,index){
      var standing=standingMap[String(first(team,["team","team_abbr"])||"")]||{};
      var strengthSeries=team.trend&&Array.isArray(team.trend.strength)?team.trend.strength:[];
      var titleSeries=team.trend&&Array.isArray(team.trend.title)?team.trend.title:[];
      var strengthMove=strengthSeries.length>1?number(strengthSeries[strengthSeries.length-1])-number(strengthSeries[0]):null;
      var titleMove=titleSeries.length>1?number(titleSeries[titleSeries.length-1])-number(titleSeries[0]):number(first(team,["title_delta"]));
      return {
        raw:team,
        rank:number(team.rank)||index+1,
        team:String(first(team,["team","team_abbr"])||"—"),
        name:String(first(team,["team_full","name","team"])||"Unknown team"),
        strength:number(team.strength),
        churn:number(team.churn),
        playoff:probability(has(team.playoff_pct)?number(team.playoff_pct)/100:standing.playoff),
        title:probability(has(team.title_pct)?number(team.title_pct)/100:standing.title),
        strengthMove:strengthMove,
        titleMove:titleMove,
        trendStrength:strengthSeries,
        trendTitle:titleSeries,
        standing:standing
      };
    });
  }

  function normalizeAvailability(payload){
    return rows(payload,["shorthanded","teams","rows"]).map(function(team){
      return {
        raw:team,
        team:String(team.team||"—"),
        tonight:Boolean(team.tonight),
        out:number(team.out)||0,
        minutes:number(team.minutes_out),
        names:Array.isArray(team.names)?team.names:[],
        unsized:Array.isArray(team.unsized)?team.unsized:[],
        line:team.line
      };
    });
  }

  function normalizeResearch(payload){
    return rows(payload,["items","research","rows"]).map(function(item){
      var content=Array.isArray(item.content)?item.content:[];
      var paragraphs=content.filter(function(line){return line&&!/^#|^```/.test(String(line).trim());});
      var combined=paragraphs.join(" ");
      var lower=combined.toLowerCase();
      var verdict="Finding";
      if(/no-promote|did not help|turned out to be noise|\bis a null\b|\bwas noise\b|tied a flat|worse than/.test(lower))verdict="No promote";
      else if(/promot|sharpen|improv|beat the baseline|production/.test(lower))verdict="Positive";
      return {title:String(item.title||"Untitled research"),asOf:item.as_of,summary:truncText(paragraphs[0]||paragraphs[1]||"",150),verdict:verdict};
    });
  }

  function accuracyMargin(payload){
    var surfaces=rows(payload,["surfaces","metrics","rows"]);
    return surfaces.find(function(surface){return /game margin/i.test(String(surface.surface||surface.label||""));})||null;
  }

  function calibrationRows(payload){
    var values=[];
    rows(payload,["calibration"]).forEach(function(row){values.push(row);});
    if(payload&&payload.backtest)rows(payload.backtest,["calibration"]).forEach(function(row){values.push(row);});
    var seen={};
    return values.map(function(row){return {label:String(row.surface||row.label||"Calibration"),target:number(row.target),actual:number(row.actual),n:number(row.n)};}).filter(function(row){
      if(row.target===null||row.actual===null)return false;
      var key=row.target+"|"+row.actual;if(seen[key])return false;seen[key]=true;return true;
    });
  }

  function renderStories(){
    var upcoming=state.games.filter(function(game){return !/final|played|complete/i.test(game.status)&&game.actual===null;});
    var strongest=state.teams.slice().sort(function(a,b){return (b.strength==null?-999:b.strength)-(a.strength==null?-999:a.strength);})[0];
    var titleFavorite=state.standings.slice().sort(function(a,b){return (b.title==null?-1:b.title)-(a.title==null?-1:a.title);})[0]||state.teams.slice().sort(function(a,b){return (b.title==null?-1:b.title)-(a.title==null?-1:a.title);})[0];
    var impactLeader=state.players.slice().filter(function(player){return player.impact!==null;}).sort(function(a,b){return b.impact-a.impact;})[0];
    var margin=accuracyMargin(state.payloads.accuracy);
    var stories=[
      ["Games on board",String(upcoming.length||state.games.length),upcoming.length?"Current or upcoming forecasts":"Published game ledger"],
      ["Strongest team",strongest?strongest.team:"—",strongest?fixed(strongest.strength,1)+" strength":"No team rating"],
      ["Title favorite",titleFavorite?titleFavorite.team:"—",titleFavorite?pct(titleFavorite.title,1)+" title odds":"No season outlook"],
      ["Impact leader",impactLeader?impactLeader.name:"—",impactLeader?signed(impactLeader.impact,2)+" impact · "+impactLeader.team:"No player rating"],
      ["Margin MAE",margin?fixed(margin.value,1):"—",margin&&margin.n?"n="+margin.n+" games":"Public model audit"]
    ];
    $("command-stories").innerHTML=stories.map(function(story){return '<article class="hw-story"><span class="hw-story-label">'+esc(story[0])+'</span><strong class="hw-story-value">'+esc(story[1])+'</strong><span class="hw-story-note">'+esc(story[2])+'</span></article>';}).join("");
  }

  function gameSortValue(game){var d=dateObject(game.date);return d?d.getTime():0;}
  function gameRangeHTML(game){
    if(game.low===null||game.high===null)return "—";
    var domainLow=-30,domainHigh=30,span=domainHigh-domainLow;
    var left=clamp((Math.min(game.low,game.high)-domainLow)/span*100,0,100);
    var right=clamp((Math.max(game.low,game.high)-domainLow)/span*100,0,100);
    var point=game.margin===null?50:clamp((game.margin-domainLow)/span*100,0,100);
    return '<span class="hw-sub">'+esc(signed(game.low,0)+' to '+signed(game.high,0))+'</span><span class="hw-game-range" aria-hidden="true"><span style="left:'+left.toFixed(1)+'%;width:'+Math.max(1,right-left).toFixed(1)+'%"></span><i style="left:'+point.toFixed(1)+'%"></i></span>';
  }

  function renderGames(){
    var upcoming=state.games.filter(function(game){return !/final|played|complete/i.test(game.status)&&game.actual===null;}).sort(function(a,b){return gameSortValue(a)-gameSortValue(b);});
    var recent=state.games.slice().sort(function(a,b){return gameSortValue(b)-gameSortValue(a);});
    var games=(upcoming.length?upcoming:recent).slice(0,10);
    $("command-games").innerHTML=games.length?games.map(function(game){
      var homeP=game.homeP;
      var favored=game.margin===null?game.call:(game.margin>=0?game.home:game.away);
      var tip=[shortDate(game.date),game.tip].filter(Boolean).join(" ");
      return '<div class="hw-game-row"><span>'+esc(tip||game.status)+'</span><span><strong>'+esc(game.away+' @ '+game.home)+'</strong><span class="hw-sub">'+esc(game.status)+'</span></span><span><strong>'+esc(favored||"—")+'</strong><span class="hw-sub">'+esc(game.call||"")+'</span></span><span class="num">'+esc(pct(homeP,0))+'<span class="hw-sub">home</span></span><span class="num">'+esc(signed(game.margin,1))+'</span><span>'+gameRangeHTML(game)+'</span><span><a class="hw-link" href="'+safeHref(game.report)+'">Open →</a></span></div>';
    }).join(""):'<div class="hw-empty">No game forecasts are currently published.</div>';
  }

  function pulseItem(tag,title,note,href){return '<article class="hw-pulse"><strong><span class="hw-pulse-tag">'+esc(tag)+'</span>'+esc(title)+'</strong><p>'+esc(note)+(href?' · <a class="hw-link" href="'+safeHref(href)+'">Open</a>':'')+'</p></article>';}
  function renderPulse(){
    var items=[];
    var strengthMover=state.teams.slice().filter(function(team){return team.strengthMove!==null;}).sort(function(a,b){return b.strengthMove-a.strengthMove;})[0];
    if(strengthMover)items.push(pulseItem("Trend",strengthMover.team+" has the largest strength rise",signed(strengthMover.strengthMove,1)+" across the published trend window","teams.html"));
    var titleMover=state.teams.slice().filter(function(team){return team.titleMove!==null;}).sort(function(a,b){return b.titleMove-a.titleMove;})[0];
    if(titleMover)items.push(pulseItem("Outlook",titleMover.team+" made the largest title-odds move",signed(titleMover.titleMove,1)+" percentage points across the published trend window","standings.html"));
    var bubble=state.standings.slice().filter(function(team){return team.playoff!==null&&team.playoff>0&&team.playoff<1;}).sort(function(a,b){return Math.abs(a.playoff-.5)-Math.abs(b.playoff-.5);})[0];
    if(bubble)items.push(pulseItem("Bubble",bubble.team+" is nearest the playoff coin flip",pct(bubble.playoff,0)+" playoff probability; projected "+fixed(bubble.proj,1)+" wins","standings.html"));
    var widest=state.games.slice().filter(function(game){return game.low!==null&&game.high!==null;}).sort(function(a,b){return (b.high-b.low)-(a.high-a.low);})[0];
    if(widest)items.push(pulseItem("Uncertainty",widest.away+" @ "+widest.home+" has the widest published 80% range",fixed(widest.high-widest.low,1)+" points wide around a "+signed(widest.margin,1)+" call",widest.report));
    var impactLead=state.payloads.availability&&state.payloads.availability.impact_lead;
    if(impactLead&&impactLead.line)items.push(pulseItem("Availability","Largest current absence",truncText(impactLead.line,180),"availability.html"));
    var calibration=calibrationRows(state.payloads.accuracy);
    if(calibration.length){var worst=calibration.slice().sort(function(a,b){return Math.abs(b.actual-b.target)-Math.abs(a.actual-a.target);})[0];items.push(pulseItem("Model",worst.label,fixed(worst.actual,1)+"% actual versus "+fixed(worst.target,1)+"% target","accuracy.html"));}
    $("command-pulse").innerHTML=items.length?items.slice(0,6).join(""):'<div class="hw-empty">No league pulse could be derived from the current artifacts.</div>';
  }

  function renderStandings(){
    $("command-standings").innerHTML=state.standings.length?state.standings.map(function(team,index){
      var playoffLine=index===8?' style="border-top:2px solid var(--dense-accent)"':'';
      return '<tr'+playoffLine+'><td class="rank">'+(index+1)+'</td><td><span class="hw-name">'+esc(team.team)+'</span><span class="hw-sub">'+esc(team.name)+'</span></td><td class="num">'+esc(fixed(team.wins,0)+'-'+fixed(team.losses,0))+'</td><td class="num">'+esc(fixed(team.gb,1))+'</td><td class="num">'+esc(fixed(team.proj,1))+'</td><td class="num">'+esc(pct(team.playoff,0))+'</td><td class="num">'+esc(pct(team.title,1))+'</td></tr>';
    }).join(""):'<tr><td colspan="7"><div class="hw-empty">Standings are unavailable.</div></td></tr>';
  }

  function renderTeams(){
    var ordered=state.teams.slice().sort(function(a,b){return (b.strength==null?-999:b.strength)-(a.strength==null?-999:a.strength);});
    $("command-teams").innerHTML=ordered.length?ordered.map(function(team,index){
      var moveClass=team.strengthMove>0?"hw-positive":team.strengthMove<0?"hw-negative":"";
      return '<tr><td class="rank">'+(index+1)+'</td><td><span class="hw-name">'+esc(team.team)+'</span><span class="hw-sub">'+esc(team.name)+'</span></td><td class="num">'+esc(fixed(team.strength,1))+'</td><td class="num '+moveClass+'">'+esc(signed(team.strengthMove,1))+'</td><td class="num">'+esc(signed(team.churn,2))+'</td><td class="num">'+esc(pct(team.playoff,0))+'</td><td class="num">'+esc(pct(team.title,1))+'</td></tr>';
    }).join(""):'<tr><td colspan="7"><div class="hw-empty">Team ratings are unavailable.</div></td></tr>';
  }

  function renderPlayers(){
    var ordered=state.players.slice().filter(function(player){return player.impact!==null;}).sort(function(a,b){return b.impact-a.impact;}).slice(0,15);
    $("command-players").innerHTML=ordered.length?ordered.map(function(player,index){
      return '<tr><td class="rank">'+(index+1)+'</td><td><a class="hw-name" href="'+safeHref(player.profile)+'">'+esc(player.name)+'</a><span class="hw-sub">'+esc(player.team+(player.provisional?" · provisional":""))+'</span></td><td class="num '+(player.impact>=0?"hw-positive":"hw-negative")+'">'+esc(signed(player.impact,2))+'</td><td class="num">'+esc(fixed(player.minutes,1))+'</td><td class="num">'+esc(fixed(player.pts,1))+'</td><td class="num">'+esc(fixed(player.basis,0))+'</td></tr>';
    }).join(""):'<tr><td colspan="6"><div class="hw-empty">Player ratings are unavailable.</div></td></tr>';
  }

  function renderAvailability(){
    var ordered=state.availability.slice().sort(function(a,b){return Number(b.tonight)-Number(a.tonight)||(b.minutes==null?-1:b.minutes)-(a.minutes==null?-1:a.minutes);}).slice(0,12);
    $("command-availability").innerHTML=ordered.length?ordered.map(function(team){
      var names=team.names.slice(0,3).join(", ");if(team.unsized.length)names+=(names?"; ":"")+team.unsized.length+" unsized";
      return '<tr><td><span class="hw-name">'+esc(team.team)+'</span><span class="hw-sub">'+(team.tonight?"plays today":"next slate")+'</span></td><td class="num">'+esc(fixed(team.out,0))+'</td><td class="num">'+esc(team.minutes===null?"—":fixed(team.minutes,0))+'</td><td title="'+esc(team.line||names)+'">'+esc(truncText(names||team.line,42))+'</td></tr>';
    }).join(""):'<tr><td colspan="4"><div class="hw-empty">Availability summary is unavailable.</div></td></tr>';
  }

  function renderResearch(){
    $("command-research").innerHTML=state.research.length?state.research.slice(0,6).map(function(item){return pulseItem(item.verdict,item.title,item.summary,"deepdive.html");}).join(""):'<div class="hw-empty">Research library is unavailable.</div>';
  }

  function svgText(x,y,text,anchor,css){return '<text x="'+x+'" y="'+y+'" text-anchor="'+(anchor||"middle")+'" class="'+(css||"hw-axis-label")+'">'+esc(text)+'</text>';}
  function scatterSVG(points,options){
    var width=920,height=300,margin={left:52,right:24,top:20,bottom:44};
    var clean=points.filter(function(point){return point.x!==null&&point.y!==null;});
    if(!clean.length)return '<div class="hw-empty">This visual has no populated points.</div>';
    var xs=clean.map(function(point){return point.x;}),ys=clean.map(function(point){return point.y;});
    var xMin=has(options.xMin)?options.xMin:Math.min.apply(null,xs),xMax=has(options.xMax)?options.xMax:Math.max.apply(null,xs);
    var yMin=has(options.yMin)?options.yMin:Math.min.apply(null,ys),yMax=has(options.yMax)?options.yMax:Math.max.apply(null,ys);
    if(xMin===xMax){xMin-=1;xMax+=1;}if(yMin===yMax){yMin-=1;yMax+=1;}
    var xPad=(xMax-xMin)*.08,yPad=(yMax-yMin)*.1;xMin-=xPad;xMax+=xPad;yMin=Math.max(options.nonNegativeY?0:-Infinity,yMin-yPad);yMax+=yPad;
    function sx(value){return margin.left+(value-xMin)/(xMax-xMin)*(width-margin.left-margin.right);}
    function sy(value){return height-margin.bottom-(value-yMin)/(yMax-yMin)*(height-margin.top-margin.bottom);}
    var output=['<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+esc(options.aria)+'">'];
    for(var i=0;i<=5;i++){
      var x=margin.left+i/5*(width-margin.left-margin.right),y=margin.top+i/5*(height-margin.top-margin.bottom);
      output.push('<line x1="'+x+'" y1="'+margin.top+'" x2="'+x+'" y2="'+(height-margin.bottom)+'" class="hw-gridline"></line>');
      output.push('<line x1="'+margin.left+'" y1="'+y+'" x2="'+(width-margin.right)+'" y2="'+y+'" class="hw-gridline"></line>');
      output.push(svgText(x,height-24,options.xFormat(xMin+i/5*(xMax-xMin)),"middle"));
      output.push(svgText(45,sy(yMin+(5-i)/5*(yMax-yMin))+3,options.yFormat(yMin+(5-i)/5*(yMax-yMin)),"end"));
    }
    output.push('<line x1="'+margin.left+'" y1="'+(height-margin.bottom)+'" x2="'+(width-margin.right)+'" y2="'+(height-margin.bottom)+'" class="hw-axis"></line>');
    output.push('<line x1="'+margin.left+'" y1="'+margin.top+'" x2="'+margin.left+'" y2="'+(height-margin.bottom)+'" class="hw-axis"></line>');
    output.push(svgText((margin.left+width-margin.right)/2,height-7,options.xLabel,"middle"));
    output.push('<text x="13" y="'+((margin.top+height-margin.bottom)/2)+'" transform="rotate(-90 13 '+((margin.top+height-margin.bottom)/2)+')" text-anchor="middle" class="hw-axis-label">'+esc(options.yLabel)+'</text>');
    clean.forEach(function(point,index){
      var hot=options.hot&&options.hot(point,index);
      output.push('<g><circle cx="'+sx(point.x).toFixed(1)+'" cy="'+sy(point.y).toFixed(1)+'" r="'+(hot?5:4)+'" class="hw-point'+(hot?' hot':'')+'"><title>'+esc(point.label+": "+options.xLabel+" "+options.xFormat(point.x)+", "+options.yLabel+" "+options.yFormat(point.y))+'</title></circle>');
      if(point.showLabel)output.push('<text x="'+(sx(point.x)+6).toFixed(1)+'" y="'+(sy(point.y)-6).toFixed(1)+'" class="hw-point-label">'+esc(point.shortLabel||point.label)+'</text>');
      output.push('</g>');
    });
    output.push('</svg>');
    return output.join("");
  }

  function calibrationSVG(){
    var values=calibrationRows(state.payloads.accuracy);
    if(!values.length)return '<div class="hw-empty">Calibration points are not published.</div>';
    var points=values.map(function(row){return {x:row.target,y:row.actual,label:row.label,shortLabel:fixed(row.target,0)+"%",showLabel:true};});
    var svg=scatterSVG(points,{xMin:0,xMax:100,yMin:0,yMax:100,nonNegativeY:true,xLabel:"Stated probability",yLabel:"Observed frequency",aria:"Prediction calibration plot",xFormat:function(value){return fixed(value,0)+"%";},yFormat:function(value){return fixed(value,0)+"%";},hot:function(point){return Math.abs(point.y-point.x)>3;}});
    return svg.replace('</svg>','<line x1="52" y1="256" x2="896" y2="20" class="hw-diagonal"></line></svg>');
  }

  function renderViz(mode){
    state.viz=mode;
    qa(".hw-visual-tab").forEach(function(button){var active=button.dataset.viz===mode;button.classList.toggle("active",active);button.setAttribute("aria-selected",String(active));});
    var html,legend,note;
    if(mode==="players"){
      var ordered=state.players.slice().filter(function(player){return player.impact!==null&&player.minutes!==null;}).sort(function(a,b){return b.impact-a.impact;});
      var labelIds={};ordered.slice(0,12).forEach(function(player){labelIds[String(player.id)]=true;});
      html=scatterSVG(ordered.map(function(player){return {x:player.minutes,y:player.impact,label:player.name,shortLabel:player.name.split(" ").slice(-1)[0],showLabel:Boolean(labelIds[String(player.id)])};}),{xLabel:"Projected minutes",yLabel:"Impact rating",aria:"Player impact versus projected minutes",xFormat:function(value){return fixed(value,0);},yFormat:function(value){return signed(value,1);},hot:function(point){return point.y>=2;}});
      legend='<span><b>Each point:</b> one rated player</span><span><b>Labels:</b> top 12 by impact</span><span><b>Orange:</b> impact ≥ +2.0</span>';
      note='Minutes and impact answer different questions: role size and per-minute/team impact remain separate.';
    }else if(mode==="calibration"){
      html=calibrationSVG();
      legend='<span><b>Diagonal:</b> perfect calibration</span><span><b>Orange:</b> more than 3 percentage points from target</span>';
      note='A calibrated 80% range should contain roughly 80% of actual results. Sample size remains in the accuracy artifact.';
    }else{
      var teams=state.teams.slice().filter(function(team){return team.strength!==null&&team.title!==null;});
      var leader=teams.slice().sort(function(a,b){return b.title-a.title;})[0];
      html=scatterSVG(teams.map(function(team){return {x:team.strength,y:team.title*100,label:team.name,shortLabel:team.team,showLabel:true};}),{nonNegativeY:true,xLabel:"Team strength",yLabel:"Title probability",aria:"Team strength versus championship probability",xFormat:function(value){return signed(value,1);},yFormat:function(value){return fixed(value,0)+"%";},hot:function(point){return leader&&point.label===leader.name;}});
      legend='<span><b>Each point:</b> one team</span><span><b>Orange:</b> current title-odds leader</span><span><b>X:</b> team quality · <b>Y:</b> simulated championship chance</span>';
      note='Strength and title odds need not rank teams identically because record, remaining schedule, and playoff path also matter.';
    }
    $("command-viz").innerHTML=html;
    $("command-viz-legend").innerHTML=legend;
    $("command-viz-note").textContent=note;
  }

  function bind(){qa(".hw-visual-tab").forEach(function(button){button.addEventListener("click",function(){renderViz(button.dataset.viz);});});}

  function renderAll(){
    setFresh(Object.keys(state.payloads).map(function(key){return state.payloads[key];}));
    renderStories();renderGames();renderPulse();renderStandings();renderTeams();renderPlayers();renderAvailability();renderResearch();renderViz(state.viz);
  }

  function boot(){
    installShell();bind();
    var keys=Object.keys(FILES);
    Promise.all(keys.map(function(key){return fetchJSON(FILES[key]);})).then(function(payloads){
      keys.forEach(function(key,index){state.payloads[key]=payloads[index];});
      state.games=normalizeGames(state.payloads.games,state.payloads.preview);
      state.players=normalizePlayers(state.payloads.players);
      state.standings=normalizeStandings(state.payloads.standings);
      state.teams=normalizeTeams(state.payloads.teams,state.standings);
      state.availability=normalizeAvailability(state.payloads.availability);
      state.research=normalizeResearch(state.payloads.research);
      renderAll();
    }).catch(function(error){
      console.error(error);
      qa(".hw-empty").forEach(function(element){element.textContent="The command center could not load the published artifacts.";});
    });
  }

  boot();
})();
