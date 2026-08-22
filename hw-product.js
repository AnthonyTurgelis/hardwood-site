/* Hardwood product shell and core page renderers. Same-origin JSON only. */
(function(){
  "use strict";

  var NAV=[
    {key:"home",label:"Home",href:"index.html"},
    {key:"games",label:"Games",href:"games.html"},
    {key:"players",label:"Players",href:"players.html"},
    {key:"teams",label:"Teams",href:"teams.html"},
    {key:"standings",label:"Standings",href:"standings.html"},
    {key:"research",label:"Research",href:"deepdive.html"},
    {key:"accuracy",label:"Accuracy",href:"accuracy.html"}
  ];
  var TOOLS=[
    ["Availability","availability.html","Injuries and expected availability"],
    ["Compare players","compare.html","Side-by-side player comparison"],
    ["Player impact","player_impact.html","Impact leaderboard and components"],
    ["Situation explorer","situation.html","Score, time, and comeback states"],
    ["Data explorer","explorer.html","Browse the published data"],
    ["Game reports","report_archive.html","Pre-tip reports and disclosure archive"],
    ["Methodology","primer.html","Definitions and how to read the numbers"],
    ["Operations board","board.html","Internal build and queue view"]
  ];
  var FILE_GROUPS={
    "index.html":"home","":"home",
    "games.html":"games","daybyday.html":"games","game_report_v2.html":"games","report_archive.html":"games","availability.html":"games","preview.html":"games","opqt.html":"games",
    "players.html":"players","player.html":"players","player_impact.html":"players","impact.html":"players","compare.html":"players",
    "teams.html":"teams","team.html":"teams","coach.html":"teams","gm.html":"teams","scouting.html":"teams","tempo.html":"teams",
    "standings.html":"standings",
    "deepdive.html":"research","situation.html":"research","error-map.html":"research","about.html":"research","primer.html":"research","glossary.html":"research",
    "accuracy.html":"accuracy","ledger.html":"accuracy"
  };

  function $(id){return document.getElementById(id);}
  function q(sel,root){return (root||document).querySelector(sel);}
  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function has(v){return v!==null&&v!==undefined&&v!=="";}
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];});}
  function safeHref(v){var s=String(v||"");return s&&!/^javascript:/i.test(s)?esc(s):"#";}
  function first(obj,keys){for(var i=0;i<keys.length;i++){var v=obj&&obj[keys[i]];if(has(v))return v;}return null;}
  function number(v){if(v===true||v===false||v===null||v===undefined||v==="")return null;var n=Number(v);return Number.isFinite(n)?n:null;}
  function fixed(v,d){var n=number(v);return n===null?"—":n.toFixed(d==null?1:d);}
  function signed(v,d){var n=number(v);return n===null?"—":(n>0?"+":"")+n.toFixed(d==null?1:d);}
  function prob(v){var n=number(v);if(n===null)return null;if(n>1&&n<=100)n/=100;return n>=0&&n<=1?n:null;}
  function pct(v,d){var n=prob(v);return n===null?"—":(n*100).toFixed(d==null?0:d)+"%";}
  function pctRaw(v,d){var n=number(v);return n===null?"—":n.toFixed(d==null?0:d)+"%";}
  function initials(name){return String(name||"?").trim().split(/\s+/).slice(0,2).map(function(p){return p.charAt(0);}).join("").toUpperCase();}
  function toDate(v){if(!has(v))return null;var d=new Date(v);return isNaN(d.getTime())?null:d;}
  function dateText(v){var d=toDate(v);return d?d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}):String(v||"Date TBD");}
  function shortDate(v){var d=toDate(v);return d?d.toLocaleDateString(undefined,{month:"short",day:"numeric"}):String(v||"—");}
  function ageText(v){var d=toDate(v);if(!d)return "time not published";var s=Math.max(0,(Date.now()-d.getTime())/1000);if(s<90)return "just now";if(s<3600)return Math.floor(s/60)+"m ago";if(s<86400)return Math.floor(s/3600)+"h ago";return Math.floor(s/86400)+"d ago";}
  function rows(payload,keys){if(Array.isArray(payload))return payload;for(var i=0;i<keys.length;i++){var v=payload&&payload[keys[i]];if(Array.isArray(v))return v;if(v&&typeof v==="object"&&!Array.isArray(v))return Object.keys(v).map(function(k){return Object.assign({key:k},v[k]||{});});}return [];}
  function fetchJSON(path){return fetch(path,{cache:"no-store"}).then(function(r){if(!r.ok)throw new Error(path+" returned "+r.status);return r.json();}).catch(function(err){console.warn(err);return {};});}
  function currentFile(){var p=location.pathname.split("/").pop();return p||"index.html";}
  function pageGroup(){return document.body.dataset.section||FILE_GROUPS[currentFile()]||"";}
  function stampFrom(payload){return first(payload,["generated_utc","generated","built_utc","as_of","updated_utc"]);}

  function installShell(){
    if($("hw-product-shell"))return;
    document.body.classList.add("hw-product");
    var group=pageGroup();
    var header=document.createElement("header");
    header.className="hw-topbar";header.id="hw-product-shell";
    var nav=NAV.map(function(item){return '<a href="'+item.href+'"'+(item.key===group?' aria-current="page"':'')+'>'+item.label+'</a>';}).join("");
    var tools=TOOLS.map(function(item){return '<a href="'+item[1]+'"><span>'+item[0]+'</span><small>'+item[2]+'</small></a>';}).join("");
    header.innerHTML='<div class="hw-topbar-inner"><a class="hw-brand" href="index.html"><span class="hw-brand-mark">H</span><span>Hardwood</span></a><button class="hw-mobile-toggle" id="hw-mobile-toggle" type="button" aria-expanded="false" aria-controls="hw-primary">☰</button><nav class="hw-primary" id="hw-primary" aria-label="Primary">'+nav+'<details class="hw-tools"><summary>Tools</summary><div class="hw-tools-menu">'+tools+'</div></details></nav></div>';
    document.body.insertBefore(header,document.body.firstChild);
    var toggle=$("hw-mobile-toggle"),primary=$("hw-primary");
    if(toggle&&primary)toggle.addEventListener("click",function(){var open=primary.classList.toggle("open");toggle.setAttribute("aria-expanded",String(open));toggle.textContent=open?"×":"☰";});
    document.addEventListener("click",function(e){qa(".hw-tools[open]").forEach(function(d){if(!d.contains(e.target))d.removeAttribute("open");});});
    // RETIRE FIRST, AND THE ORDER IS LOad-BEARING. The footer check below RETURNS, and on a dense
    // page a baked footer is the normal case -- so retiring after it meant the duplicate nav and
    // wordmark were never removed on exactly the pages this fix exists for. It shipped that way
    // for one commit and the suite still passed, because the suite grepped for the CALL and not
    // for whether the call is reachable.
    retireDuplicateChrome();
    // THE STATIC FOOTER IS THE REGISTRY, SO IT WINS. site/nav.json carries 23 footer links on
    // main and chrome_inject bakes them in; the shell's own footer lists 9 and is hard-coded here.
    // Removing the registry footer to stop the duplication would strand the difference -- which is
    // exactly the "reachable from none of them" defect chrome_inject exists to prevent. So when a
    // baked footer is present the shell adds none, and the page ends with exactly one.
    if(qa("footer.hw-chrome-foot").length) return;
    var footer=document.createElement("footer");footer.className="hw-footer";
    footer.innerHTML='<div class="hw-footer-inner"><div><strong>Hardwood</strong>WNBA predictions, player intelligence, public grading, and research.</div><div class="hw-footer-links"><a href="games.html">Games</a><a href="players.html">Players</a><a href="teams.html">Teams</a><a href="standings.html">Standings</a><a href="accuracy.html">Accuracy</a><a href="deepdive.html">Research</a><a href="report_archive.html">Reports</a><a href="primer.html">Methodology</a><a href="board.html">Operations</a></div></div>';
    document.body.appendChild(footer);
  }

  // TWO SYSTEMS EACH OWN "THE NAV", AND ON NINE PAGES BOTH OF THEM FIRE.
  //
  // scripts/chrome_inject.py bakes one canonical static header, nav and footer into every page --
  // it exists because the site once had 31 distinct chrome blocks and no two pages shared a
  // header. installShell() then inserts the dense product's own topbar ABOVE that header and
  // appends its own footer BELOW that footer. Measured on the live site 2026-08-21: every dense
  // page rendered two navigation bars and the wordmark twice. Neither module referenced the other.
  //
  // The shell wins here because it is what the dense product is designed around -- mobile toggle,
  // Tools menu, section-aware aria-current. But it wins ONLY at runtime: the static block stays in
  // the HTML, so chrome_inject keeps its single registry and its byte-for-byte parity gate stays
  // green, the ~105 non-dense pages are untouched, and a reader with JS disabled still gets a nav
  // rather than a page with no way out.
  //
  // WHAT IS DELIBERATELY KEPT: the ethos line. It is page-specific published copy, not duplicated
  // chrome, and chrome_inject's own author refused to delete mastheads for exactly this reason --
  // losing published words to tidy a tab row trades one defect for a worse one.
  function retireDuplicateChrome(){
    qa("header.hw-chrome nav.hw-nav, header.hw-chrome .mark")
      .forEach(function(el){ if(el&&el.parentNode) el.parentNode.removeChild(el); });
    // A static header left holding nothing but whitespace still paints margin above the content.
    qa("header.hw-chrome").forEach(function(el){
      if(el&&!el.textContent.trim()&&!el.querySelector("img,svg")&&el.parentNode)
        el.parentNode.removeChild(el);
    });
  }

  function setFresh(payloads){
    var stamps=[];(payloads||[]).forEach(function(p){var s=stampFrom(p);var d=toDate(s);if(d)stamps.push(d);});
    stamps.sort(function(a,b){return b-a;});
    qa("[data-fresh]").forEach(function(el){
      var d=stamps[0];if(!d){el.classList.add("warn");el.innerHTML='<span class="hw-fresh-dot"></span>Build time not published';return;}
      var hours=(Date.now()-d.getTime())/36e5;el.classList.toggle("warn",hours>24);el.innerHTML='<span class="hw-fresh-dot"></span>Updated '+ageText(d.toISOString());
    });
  }

  function spark(values){
    var a=(values||[]).map(number).filter(function(v){return v!==null;});if(a.length<2)return "—";
    var min=Math.min.apply(null,a),max=Math.max.apply(null,a),span=max-min||1;
    var pts=a.map(function(v,i){return (i/(a.length-1)*74+1).toFixed(1)+","+(22-(v-min)/span*20+1).toFixed(1);}).join(" ");
    return '<svg class="hw-spark" viewBox="0 0 76 24" role="img" aria-label="Recent trend"><polyline points="'+pts+'"></polyline></svg>';
  }

  function normalizeGames(payload,preview){
    var list=rows(payload,["games","rows","items"]),previewRows=rows(preview,["games","rows","items"]),pmap={};
    previewRows.forEach(function(p){var id=String(first(p,["game_id","id","key"])||"");if(id)pmap[id]=p;});
    return list.map(function(g){
      var id=String(first(g,["game_id","id","key"])||"");var pv=pmap[id]||{};var pred=g.predictions&&typeof g.predictions==="object"?g.predictions:{};
      var home=first(g,["home","home_team","home_abbr"])||first(pv,["home","home_team","home_abbr"]);
      var away=first(g,["away","away_team","away_abbr"])||first(pv,["away","away_team","away_abbr"]);
      var margin=first(g,["pred_margin","predicted_margin","projected_margin"]);if(!has(margin))margin=first(pred,["predicted_margin","point_spread","projected_margin"]);
      var total=first(g,["total","pred_total","predicted_total"]);if(!has(total))total=first(pred,["predicted_total","total","projected_total"]);
      var hp=first(g,["p_home_win","home_win_probability","home_probability"]);if(!has(hp))hp=first(pred,["home_win_probability","home_probability"]);
      var call=first(g,["call","predicted_winner"]);if(!call)call=first(pred,["winner","predicted_winner","pick"]);
      var range=[first(g,["range80_lo"]),first(g,["range80_hi"])];if(!has(range[0])||!has(range[1])){var r=first(pred,["margin_interval","interval"]);if(Array.isArray(r))range=r;else if(r&&typeof r==="object")range=[first(r,["low","lower","lo"]),first(r,["high","upper","hi"])];}
      var actual=number(first(g,["actual_margin","home_margin"]));var homeScore=number(first(g,["home_score","actual_home_score"])),awayScore=number(first(g,["away_score","actual_away_score"]));if(actual===null&&homeScore!==null&&awayScore!==null)actual=homeScore-awayScore;
      var status=first(g,["status","game_status"]);if(!status)status=g.awaiting_final?"Upcoming":(actual!==null?"Final":"Scheduled");
      var model=first(g,["model_" + "version","source_model","source_version"])||first(pred,["source_model","model_" + "version","source_version"])||"published model";
      return {raw:g,id:id,date:first(g,["date","game_date","scheduled_at"]),tip:first(g,["tip_et","tip","time_et"]),home:String(home||"TBD"),away:String(away||"TBD"),homeFull:first(g,["home_full"]),awayFull:first(g,["away_full"]),margin:number(margin),total:number(total),homeP:prob(hp),call:call,status:String(status),range:[number(range[0]),number(range[1])],actual:actual,model:String(model),outs:(g.avail&&g.avail.home&&g.avail.away)?[].concat(g.avail.home.out||[],g.avail.away.out||[]):[],report:"game_report_v2.html?game_id="+encodeURIComponent(id)};
    });
  }

  function normalizePlayers(payload){
    var source=payload&&payload.ratings&&payload.ratings.players?payload.ratings.players:rows(payload,["players","ratings","rows","items"]);
    return source.map(function(p,i){return {raw:p,id:first(p,["id","player_id","nba_player_id"]),name:String(first(p,["name","player_name","canonical_name"])||"Unknown player"),team:String(first(p,["team","team_abbr"])||"—"),rank:number(first(p,["rank"]))||i+1,impact:number(first(p,["rating","impact","impact_rating"])),impactRank:number(first(p,["impact_rank"])),minutes:number(first(p,["minutes","predicted_minutes","min_avg"])),gp:number(first(p,["gp","games"])),pts:number(first(p,["pts","points"])),reb:number(first(p,["reb","rebounds"])),ast:number(first(p,["ast","assists"])),stl:number(first(p,["stl","steals"])),blk:number(first(p,["blk","blocks"])),basis:number(first(p,["n_basis","sample_games"])),provisional:Boolean(first(p,["impact_provisional","provisional","thin","small_basis"])),profile:first(p,["profile_url","player_url"])||("players/"+first(p,["id","player_id","nba_player_id"])+".html")};});
  }

  function normalizeTeams(payload,standings){
    var smap={};rows(standings,["teams","rows"]).forEach(function(s){smap[String(s.team||s.team_abbr)]=s;});
    return rows(payload,["teams","rows"]).map(function(t,i){var s=smap[String(t.team||t.team_abbr)]||{};return {raw:t,rank:number(t.rank)||i+1,team:String(t.team||t.team_abbr||"—"),name:String(t.team_full||t.name||t.team||"Unknown team"),strength:number(t.strength),churn:number(t.churn),title:number(t.title_pct),playoff:number(t.playoff_pct),titleDelta:number(t.title_delta),playoffDelta:number(t.playoff_delta),trend:t.trend||{},wins:number(s.wins),losses:number(s.losses),projWins:number(s.proj_median_wins),range:s.proj_range_90,pTitle:prob(s.p_title),pPlayoff:prob(s.p_playoff)};});
  }

  function normalizeStandings(payload){return rows(payload,["teams","rows"]).map(function(s,i){return {raw:s,rank:i+1,team:String(s.team||"—"),name:String(s.team_full||s.team||"Unknown team"),conf:s.conference,wins:number(s.wins),losses:number(s.losses),pct:number(s.win_pct),gb:number(s.games_back),proj:number(s.proj_median_wins),projDelta:number(s.proj_median_wins_delta_1d),range:s.proj_range_90,playoff:prob(s.p_playoff),playoffDelta:number(s.p_playoff_delta_1d),title:prob(s.p_title)};});}

  function gameCard(g){
    var hp=g.homeP,ap=hp===null?null:1-hp;var score="—";
    return '<article class="hw-card hw-game"><div class="hw-game-meta"><span>'+esc(dateText(g.date))+'</span><span>'+esc(g.tip||g.status)+'</span></div><div class="hw-matchup"><div class="hw-team"><strong>'+esc(g.away)+'</strong><span>'+(ap===null?'Away':pct(ap)+' win')+'</span></div><span class="hw-at">@</span><div class="hw-team"><strong>'+esc(g.home)+'</strong><span>'+(hp===null?'Home':pct(hp)+' win')+'</span></div></div><div><div class="hw-prob-labels"><span>'+esc(g.away)+'</span><span>'+esc(g.home)+'</span></div><div class="hw-prob"><span style="width:'+(hp===null?50:Math.max(2,Math.min(98,hp*100)))+'%"></span></div></div><div class="hw-game-stats"><div class="hw-game-stat"><strong>'+esc(signed(g.margin,1))+'</strong><span>home margin</span></div><div class="hw-game-stat"><strong>'+esc(fixed(g.total,1))+'</strong><span>total</span></div><div class="hw-game-stat"><strong>'+esc(g.range[0]===null?'—':signed(g.range[0],1)+' to '+signed(g.range[1],1))+'</strong><span>80% range</span></div></div><div class="hw-row-end"><span class="hw-model">'+esc(g.model)+'</span><a class="hw-button" href="'+safeHref(g.report)+'">Full report</a></div></article>';
  }

  function renderError(target,msg){if(target)target.innerHTML='<div class="hw-empty">'+esc(msg)+'</div>';}
  function latestGames(list,n){var a=list.slice().sort(function(x,y){return (toDate(y.date)||0)-(toDate(x.date)||0);});var today=Date.now()-36e5*30;var future=a.filter(function(g){var d=toDate(g.date);return d&&d.getTime()>=today;}).sort(function(x,y){return (toDate(x.date)||0)-(toDate(y.date)||0);});return (future.length?future:a).slice(0,n||3);}

  function renderHome(data){
    var games=normalizeGames(data.games,data.preview),players=normalizePlayers(data.players),standings=normalizeStandings(data.standings),dives=rows(data.dives,["dives","items"]),surfaces=rows(data.accuracy,["surfaces","metrics"]),cal=rows(data.accuracy,["calibration"]);
    var margin=surfaces.find(function(s){return /margin/i.test(s.surface||"")&&/error/i.test(s.surface||"");});var fav=surfaces.find(function(s){return /favorite/i.test(s.surface||"")||/win/i.test(s.surface||"");});var cov=cal.find(function(c){return number(c.target)===90;});
    $("home-kpis").innerHTML=[
      [margin?fixed(margin.value,1):"—","Margin MAE",margin&&margin.n?"n="+margin.n:"Current scorecard"],
      [fav?pctRaw(fav.value,1):"—","Clear-favorite wins",fav&&fav.n?"n="+fav.n:"Published calls"],
      [cov?pctRaw(cov.actual,1):"—","90% range coverage",cov&&cov.n?"n="+cov.n:"Calibration"],
      [players.length.toLocaleString(),"Players tracked",games.length.toLocaleString()+" games indexed"]
    ].map(function(k){return '<div class="hw-kpi"><span class="hw-kpi-label">'+esc(k[1])+'</span><strong class="hw-kpi-value">'+esc(k[0])+'</strong><span class="hw-kpi-note">'+esc(k[2])+'</span></div>';}).join("");
    $("home-games").innerHTML=latestGames(games,3).map(gameCard).join("")||'<div class="hw-card hw-empty">No game forecasts are currently published.</div>';
    var impact=players.slice().sort(function(a,b){return (b.impact==null?-999:b.impact)-(a.impact==null?-999:a.impact);}).slice(0,8);
    $("home-players").innerHTML=impact.map(function(p,i){return '<tr><td class="hw-rank">'+(i+1)+'</td><td><a class="hw-person" href="'+safeHref(p.profile)+'"><span class="hw-avatar">'+esc(initials(p.name))+'</span><span class="hw-person-copy"><strong>'+esc(p.name)+'</strong><small>'+esc(p.team)+'</small></span></a></td><td class="num '+(p.impact!==null&&p.impact>=0?'hw-positive':'hw-negative')+'">'+esc(signed(p.impact,2))+'</td><td class="num">'+esc(fixed(p.minutes,1))+'</td><td class="num">'+esc(fixed(p.pts,1))+'</td></tr>';}).join("")||'<tr><td colspan="5"><div class="hw-empty">Player leaderboard unavailable.</div></td></tr>';
    $("home-standings").innerHTML=standings.slice(0,8).map(function(s){return '<tr><td class="hw-rank">'+s.rank+'</td><td><strong>'+esc(s.team)+'</strong><div class="hw-muted">'+esc(s.name)+'</div></td><td class="num">'+esc(s.wins+'-'+s.losses)+'</td><td class="num">'+esc(fixed(s.proj,1))+'</td><td class="num">'+esc(pct(s.playoff))+'</td><td class="num">'+esc(pct(s.title,1))+'</td></tr>';}).join("")||'<tr><td colspan="6"><div class="hw-empty">Standings unavailable.</div></td></tr>';
    $("home-research").innerHTML=dives.slice(0,6).map(researchCard).join("")||'<div class="hw-card hw-empty">Research index unavailable.</div>';
    setFresh([data.games,data.players,data.standings,data.accuracy,data.dives]);
  }

  function researchCard(d){var href="deepdive.html#"+encodeURIComponent(d.slug||"");return '<article class="hw-card hw-research-card"><span class="hw-kicker">'+esc(d.source_table||"Research")+'</span><h3>'+esc(d.title||d.question||"Untitled analysis")+'</h3><p>'+esc(d.one_line||d.question||"")+'</p><div class="hw-research-meta">'+(number(d.n)!==null?'<span class="hw-badge">n='+esc(number(d.n).toLocaleString())+'</span>':'')+(number(d.n_delta)!==null?'<span class="hw-badge '+(d.n_delta>=0?'good':'warn')+'">'+esc(signed(d.n_delta,0))+' new</span>':'')+'</div><a class="hw-section-link" href="'+safeHref(href)+'">Open analysis →</a></article>';}

  function bindSort(tableId,getRows,render){qa(".hw-sort",$(tableId)).forEach(function(btn){btn.addEventListener("click",function(){var key=btn.dataset.key,dir=btn.dataset.dir==="desc"?"asc":"desc";qa(".hw-sort",$(tableId)).forEach(function(b){b.dataset.dir="";});btn.dataset.dir=dir;var data=getRows();data.sort(function(a,b){var av=a[key],bv=b[key];if(typeof av==="string"||typeof bv==="string")return String(av||"").localeCompare(String(bv||""))*(dir==="asc"?1:-1);av=number(av);bv=number(bv);if(av===null)av=dir==="asc"?Infinity:-Infinity;if(bv===null)bv=dir==="asc"?Infinity:-Infinity;return (av-bv)*(dir==="asc"?1:-1);});render(data);});});}

  function initGames(){Promise.all([fetchJSON("games.json"),fetchJSON("preview.json")]).then(function(v){var all=normalizeGames(v[0],v[1]);setFresh(v);var team=$("games-team"),status=$("games-status"),search=$("games-search"),count=$("games-count");var teams={};all.forEach(function(g){teams[g.home]=1;teams[g.away]=1;});team.innerHTML='<option value="">All teams</option>'+Object.keys(teams).sort().map(function(t){return '<option>'+esc(t)+'</option>';}).join("");
      $("games-featured").innerHTML=latestGames(all,3).map(gameCard).join("");
      function filtered(){var t=team.value,s=status.value,qv=search.value.trim().toLowerCase();return all.filter(function(g){return (!t||g.home===t||g.away===t)&&(!s||g.status.toLowerCase().indexOf(s)>=0)&&(!qv||(g.home+" "+g.away+" "+g.call).toLowerCase().indexOf(qv)>=0);});}
      function render(list){count.textContent=list.length+" game"+(list.length===1?"":"s");$("games-body").innerHTML=list.map(function(g){var range=g.range[0]===null?"—":signed(g.range[0],1)+" to "+signed(g.range[1],1);return '<tr><td>'+esc(shortDate(g.date))+'<div class="hw-muted">'+esc(g.tip||g.status)+'</div></td><td><strong>'+esc(g.away)+' @ '+esc(g.home)+'</strong></td><td>'+esc(g.call||"—")+'</td><td class="num">'+esc(pct(g.homeP))+'</td><td class="num">'+esc(signed(g.margin,1))+'</td><td class="num">'+esc(range)+'</td><td class="num">'+esc(fixed(g.total,1))+'</td><td>'+esc(g.outs.length?g.outs.slice(0,3).join(", ")+(g.outs.length>3?" +"+(g.outs.length-3):""):"—")+'</td><td><span class="hw-model">'+esc(g.model)+'</span></td><td><a class="hw-section-link" href="'+safeHref(g.report)+'">Report</a></td></tr>';}).join("")||'<tr><td colspan="10"><div class="hw-empty">No games match these filters.</div></td></tr>';}
      [team,status].forEach(function(el){el.addEventListener("change",function(){render(filtered());});});search.addEventListener("input",function(){render(filtered());});render(all.slice().sort(function(a,b){return (toDate(b.date)||0)-(toDate(a.date)||0);}));bindSort("games-table",filtered,render);
    });}

  function initPlayers(){fetchJSON("players.json").then(function(payload){var all=normalizePlayers(payload);setFresh([payload]);var search=$("players-search"),team=$("players-team"),count=$("players-count");var teams={};all.forEach(function(p){teams[p.team]=1;});team.innerHTML='<option value="">All teams</option>'+Object.keys(teams).sort().map(function(t){return '<option>'+esc(t)+'</option>';}).join("");
      function filtered(){var qv=search.value.trim().toLowerCase(),t=team.value;return all.filter(function(p){return (!t||p.team===t)&&(!qv||(p.name+" "+p.team).toLowerCase().indexOf(qv)>=0);});}
      function render(list){count.textContent=list.length+" player"+(list.length===1?"":"s");$("players-body").innerHTML=list.map(function(p,i){return '<tr><td class="hw-rank">'+(i+1)+'</td><td><a class="hw-person" href="'+safeHref(p.profile)+'"><span class="hw-avatar">'+esc(initials(p.name))+'</span><span class="hw-person-copy"><strong>'+esc(p.name)+'</strong><small>'+(p.provisional?'Provisional':'Established')+'</small></span></a></td><td>'+esc(p.team)+'</td><td class="num">'+esc(fixed(p.gp,0))+'</td><td class="num">'+esc(fixed(p.minutes,1))+'</td><td class="num">'+esc(fixed(p.pts,1))+'</td><td class="num">'+esc(fixed(p.reb,1))+'</td><td class="num">'+esc(fixed(p.ast,1))+'</td><td class="num '+(p.impact!==null&&p.impact>=0?'hw-positive':'hw-negative')+'">'+esc(signed(p.impact,2))+'</td><td class="num">'+esc(fixed(p.basis,0))+'</td></tr>';}).join("")||'<tr><td colspan="10"><div class="hw-empty">No players match these filters.</div></td></tr>';}
      [team].forEach(function(el){el.addEventListener("change",function(){render(filtered());});});search.addEventListener("input",function(){render(filtered());});var firstView=all.slice().sort(function(a,b){return (b.impact==null?-999:b.impact)-(a.impact==null?-999:a.impact);});render(firstView);bindSort("players-table",filtered,render);
    });}

  function initTeams(){Promise.all([fetchJSON("teams.json"),fetchJSON("standings.json")]).then(function(v){var all=normalizeTeams(v[0],v[1]);setFresh(v);var search=$("teams-search"),count=$("teams-count");function filtered(){var qv=search.value.trim().toLowerCase();return all.filter(function(t){return !qv||(t.team+" "+t.name).toLowerCase().indexOf(qv)>=0;});}
      function render(list){count.textContent=list.length+" teams";$("teams-body").innerHTML=list.map(function(t,i){var record=t.wins===null?"—":t.wins+"-"+t.losses;return '<tr><td class="hw-rank">'+(i+1)+'</td><td><strong>'+esc(t.team)+'</strong><div class="hw-muted">'+esc(t.name)+'</div></td><td class="num">'+esc(record)+'</td><td class="num '+(t.strength!==null&&t.strength>=0?'hw-positive':'hw-negative')+'">'+esc(signed(t.strength,1))+'</td><td class="num">'+esc(signed(t.churn,2))+'</td><td class="num">'+esc(fixed(t.projWins,1))+'</td><td class="num">'+esc(t.playoff!==null?pctRaw(t.playoff,1):pct(t.pPlayoff,1))+'</td><td class="num">'+esc(t.title===null?pct(t.pTitle,1):pctRaw(t.title,1))+'</td><td>'+spark(t.trend.strength)+'</td></tr>';}).join("")||'<tr><td colspan="9"><div class="hw-empty">No team data is published.</div></td></tr>';}
      search.addEventListener("input",function(){render(filtered());});render(all);bindSort("teams-table",filtered,render);
    });}

  function initStandings(){fetchJSON("standings.json").then(function(payload){var all=normalizeStandings(payload);setFresh([payload]);var p=payload.progress||{};$("standings-context").innerHTML='<div class="hw-kpi"><span class="hw-kpi-label">Season complete</span><strong class="hw-kpi-value">'+esc(number(p.pct_complete)!==null?p.pct_complete+"%":"—")+'</strong><span class="hw-kpi-note">'+esc((p.games_played||"—")+" of "+(p.games_total||"—")+" games")+'</span></div><div class="hw-kpi"><span class="hw-kpi-label">Standings as of</span><strong class="hw-kpi-value">'+esc(shortDate(p.standings_asof))+'</strong><span class="hw-kpi-note">Outlook '+esc(shortDate(p.outlook_asof))+'</span></div>';
      function render(list){$("standings-body").innerHTML=list.map(function(s,i){var range=Array.isArray(s.range)?fixed(s.range[0],1)+"–"+fixed(s.range[1],1):"—";return '<tr><td class="hw-rank">'+(i+1)+'</td><td><strong>'+esc(s.team)+'</strong><div class="hw-muted">'+esc(s.name)+'</div></td><td>'+esc(s.conf||"—")+'</td><td class="num">'+esc(s.wins+'-'+s.losses)+'</td><td class="num">'+esc(fixed(s.pct,3))+'</td><td class="num">'+esc(fixed(s.gb,1))+'</td><td class="num">'+esc(fixed(s.proj,1))+' <span class="hw-delta '+(s.projDelta>0?'up':s.projDelta<0?'down':'')+'">'+esc(s.projDelta?signed(s.projDelta,1):"")+'</span></td><td class="num">'+esc(range)+'</td><td class="num">'+esc(pct(s.playoff,1))+'</td><td class="num">'+esc(pct(s.title,1))+'</td></tr>';}).join("")||'<tr><td colspan="10"><div class="hw-empty">Standings are unavailable.</div></td></tr>';}
      render(all);bindSort("standings-table",function(){return all.slice();},render);
    });}

  function initAccuracy(){fetchJSON("accuracy.json").then(function(payload){setFresh([payload]);var surfaces=rows(payload,["surfaces","metrics"]),cal=rows(payload,["calibration"]),monthly=rows(payload,["monthly"]);$("accuracy-surfaces").innerHTML=surfaces.map(function(s){var val=number(s.value)===null?"Not tracked":(s.unit==="%"?pctRaw(s.value,1):fixed(s.value,2)+(s.unit?" "+s.unit:""));return '<article class="hw-card hw-card-body"><span class="hw-kicker">'+esc(s.kind||"Scorecard")+'</span><h3 style="margin:8px 0 3px;font-size:17px">'+esc(s.surface||"Metric")+'</h3><strong style="display:block;font-size:32px;letter-spacing:-.04em">'+esc(val)+'</strong><p class="hw-muted" style="margin:7px 0 0">'+esc(s.note||"")+'</p><div class="hw-research-meta">'+(s.n?'<span class="hw-badge">n='+esc(s.n)+'</span>':'')+(s.covers?'<span class="hw-badge">'+esc(s.covers)+'</span>':'')+'</div></article>';}).join("")||'<div class="hw-card hw-empty">Accuracy scorecard unavailable.</div>';
      $("accuracy-calibration").innerHTML=cal.map(function(c){var actual=number(c.actual),target=number(c.target);return '<div class="hw-cal-row"><div class="hw-cal-top"><strong>'+esc(c.surface||"Coverage")+'</strong><span>'+esc(pctRaw(actual,1))+' actual · '+esc(pctRaw(target,0))+' target</span></div><div class="hw-cal-bar"><span style="width:'+Math.max(0,Math.min(100,actual||0))+'%"></span><i class="hw-cal-target" style="left:'+Math.max(0,Math.min(100,target||0))+'%"></i></div><div class="hw-muted" style="margin-top:6px;font-size:11px">n='+esc(c.n||"—")+'</div></div>';}).join("")||'<div class="hw-empty">Calibration results unavailable.</div>';
      var vals=monthly.map(function(m){return number(m.value);}).filter(function(v){return v!==null;});var min=Math.min.apply(null,vals),max=Math.max.apply(null,vals),span=max-min||1;$("accuracy-monthly").innerHTML=monthly.map(function(m){var w=((number(m.value)-min)/span*70+25);return '<div style="display:grid;grid-template-columns:70px 1fr 55px;gap:9px;align-items:center;margin:8px 0"><span class="hw-muted">'+esc(m.month)+'</span><div class="hw-prob"><span style="margin-left:0;width:'+w+'%;background:var(--hw-blue)"></span></div><strong style="text-align:right">'+esc(fixed(m.value,2))+'</strong></div>';}).join("")||'<div class="hw-empty">Monthly history unavailable.</div>';
    });}

  function initResearch(){fetchJSON("deepdive_index.json").then(function(payload){setFresh([payload]);var all=rows(payload,["dives","items"]),search=$("research-search"),source=$("research-source"),count=$("research-count");var sources={};all.forEach(function(d){if(d.source_table)sources[d.source_table]=1;});source.innerHTML='<option value="">All sources</option>'+Object.keys(sources).sort().map(function(s){return '<option>'+esc(s)+'</option>';}).join("");function filtered(){var qv=search.value.trim().toLowerCase(),s=source.value;return all.filter(function(d){return (!s||d.source_table===s)&&(!qv||((d.title||"")+" "+(d.one_line||"")+" "+(d.question||"")).toLowerCase().indexOf(qv)>=0);});}function render(list){count.textContent=list.length+" analysis"+(list.length===1?"":"es");$("research-grid").innerHTML=list.map(researchCard).join("")||'<div class="hw-card hw-empty">No research matches these filters.</div>';}search.addEventListener("input",function(){render(filtered());});source.addEventListener("change",function(){render(filtered());});render(all);});}

  function init(){installShell();var page=document.body.dataset.page||"";if(page==="home")Promise.all([fetchJSON("games.json"),fetchJSON("preview.json"),fetchJSON("players.json"),fetchJSON("teams.json"),fetchJSON("standings.json"),fetchJSON("accuracy.json"),fetchJSON("deepdive_index.json")]).then(function(v){renderHome({games:v[0],preview:v[1],players:v[2],teams:v[3],standings:v[4],accuracy:v[5],dives:v[6]});});else if(page==="games")initGames();else if(page==="players")initPlayers();else if(page==="teams")initTeams();else if(page==="standings")initStandings();else if(page==="accuracy")initAccuracy();else if(page==="research")initResearch();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
