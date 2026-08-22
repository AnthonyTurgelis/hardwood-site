/* Dense Players: same-origin, source-preserving player intelligence workspace. */
(function(){
  "use strict";

  var $=function(id){return document.getElementById(id);};
  var qa=function(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));};
  var has=function(v){return v!==null&&v!==undefined&&v!=="";};
  var num=function(v){if(v===true||v===false||v===null||v===undefined||v==="")return null;var n=Number(v);return Number.isFinite(n)?n:null;};
  var esc=function(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];});};
  var fixed=function(v,d){var n=num(v);return n===null?"—":n.toFixed(d==null?1:d);};
  var signed=function(v,d){var n=num(v);return n===null?"—":(n>0?"+":"")+n.toFixed(d==null?1:d);};
  var pct=function(v,d){var n=num(v);if(n===null)return "—";if(n<=1)n*=100;return n.toFixed(d==null?0:d)+"%";};
  var initials=function(name){return String(name||"?").trim().split(/\s+/).slice(0,2).map(function(x){return x.charAt(0);}).join("").toUpperCase();};
  var norm=function(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();};
  var safeHref=function(v){var s=String(v||"");return s&&!/^javascript:/i.test(s)?esc(s):"#";};
  var parseStamp=function(v){if(!has(v))return null;var text=String(v);var d=new Date(/^\d{4}-\d{2}-\d{2}$/.test(text)?text+"T12:00:00":text);return isNaN(d.getTime())?null:d;};
  var dataRootRaw=new URLSearchParams(location.search).get("dataRoot")||"";
  var dataRoot=dataRootRaw?dataRootRaw.replace(/\/+$/,"")+"/":"";
  var fetchJSON=function(path){return fetch(dataRoot+path,{cache:"no-store"}).then(function(r){if(!r.ok)throw new Error(path+" returned "+r.status);return r.json();}).catch(function(err){console.warn(err);return {};});};
  var dateValue=function(payload){return payload&&((payload.generated_utc)||(payload.generated_at)||(payload.as_of)||(payload.date));};
  var ageText=function(v){var d=parseStamp(v);if(!d)return "time not published";var s=Math.max(0,(Date.now()-d.getTime())/1000);if(s<90)return "just now";if(s<3600)return Math.floor(s/60)+"m ago";if(s<86400)return Math.floor(s/3600)+"h ago";return Math.floor(s/86400)+"d ago";};
  var state={players:[],filtered:[],selected:null,sort:{key:"impact",dir:"desc"},viz:"impact-minutes",sources:{}};
  var SORT_KEYS=["rank","gp","minutes","pts","reb","ast","impact","impactRank","seasonRate","seasonVolume","basis","trend"];
  var SORT_LABELS={rank:"Score #",gp:"GP",minutes:"Proj min",pts:"PTS",reb:"REB",ast:"AST",impact:"Impact",impactRank:"Impact #",seasonRate:"Season rate",seasonVolume:"Season total",basis:"Basis",trend:"Trend"};
  var VIZ_KEYS=["impact-minutes","season","ranks"];
  var SOURCE_LABELS={players:"player board",availability:"availability",season:"season impact",impact:"per-100 impact"};

  function param(name){return new URL(location.href).searchParams.get(name);}
  function replaceParam(name,value){var url=new URL(location.href);if(value===null||value===undefined||value==="")url.searchParams.delete(name);else url.searchParams.set(name,String(value));var query=url.searchParams.toString();history.replaceState(history.state,"",url.pathname+(query?"?"+query:"")+url.hash);}
  function validSelectValue(id,value){var el=$(id);return el&&Array.prototype.some.call(el.options,function(option){return option.value===value;});}
  function defaultSortDir(key){return key==="rank"||key==="impactRank"?"asc":"desc";}
  function editableTarget(target){return target&&target.closest&&Boolean(target.closest("input, textarea, select, [contenteditable='true']"));}

  function sourcePlayers(payload){return payload&&payload.ratings&&Array.isArray(payload.ratings.players)?payload.ratings.players:(Array.isArray(payload&&payload.players)?payload.players:[]);}
  function rows(payload,key){return Array.isArray(payload&&payload[key])?payload[key]:[];}
  function availabilityMap(payload){
    var out={};
    function put(name,status,team,playPct,extra){
      var key=norm(name);if(!key)return;
      var raw=String(status||"unknown").toLowerCase();
      var current=raw.indexOf("question")>=0||raw.indexOf("day")>=0||raw.indexOf("limited")>=0||raw.indexOf("gtd")>=0?"limited":raw.indexOf("out")>=0||raw.indexOf("suspend")>=0?"out":raw.indexOf("avail")>=0||raw.indexOf("healthy")>=0||raw.indexOf("active")>=0?"available":"unknown";
      extra=extra||{};
      out[key]={status:current,team:String(team||""),playPct:num(playPct),returnDate:extra.returnDate||null,note:extra.note||"",updated:extra.updated||"",stale:Boolean(extra.stale),expectedBack:extra.expectedBack||null};
    }
    rows(payload,"groups").forEach(function(group){
      (group.players||[]).forEach(function(p){put(p.player||p.name,group.status||group.label,p.team||group.team,p.play_pct,{returnDate:p.return||null,note:p.note||"",updated:p.updated||"",stale:p.stale,expectedBack:p.exp_back||null});});
    });
    rows(payload,"players").forEach(function(p){put(p.player||p.name,p.status||p.status_norm,p.team||p.team_abbr,p.play_pct||p.play_prob,{returnDate:p.return||p.expected_return||null,note:p.note||"",updated:p.updated||p.updated_utc||"",stale:p.stale,expectedBack:p.exp_back||null});});
    (Array.isArray(payload&&payload.shorthanded)?payload.shorthanded:[]).forEach(function(team){
      (team.names||[]).forEach(function(name){put(name,"out",team.team,null,{note:team.line||""});});
      (team.unsized||[]).forEach(function(name){put(name,"out",team.team,null,{note:team.line||""});});
      (team.questionable_names||team.questionable||[]).forEach(function(name){put(name,"limited",team.team,null,{note:team.line||""});});
    });
    return out;
  }
  function byIdAndName(list,idKey){
    var ids={},names={};
    (list||[]).forEach(function(r){
      var id=r&&r[idKey];if(has(id))ids[String(id)]=r;
      var n=norm(r&&r.name);if(n)names[n]=r;
    });
    return {ids:ids,names:names,get:function(id,name){return (has(id)&&ids[String(id)])||names[norm(name)]||null;}};
  }
  function statusFrom(base,si,av){
    if(av)return av.status;
    if(si&&si.currently_out)return "out";
    var pp=num(si&&si.play_prob);
    if(pp!==null){if(pp<0.4)return "out";if(pp<0.85)return "limited";return "available";}
    if(base&&base.status)return String(base.status).toLowerCase();
    return "unknown";
  }
  function profileHref(id){return has(id)?"player.html?id="+encodeURIComponent(String(id)):"players.html";}
  function mergeSources(basePayload,availabilityPayload,seasonPayload,impactPayload){
    var season=byIdAndName(rows(seasonPayload,"players"),"player_id");
    var impact=byIdAndName(rows(impactPayload,"players"),"player_id");
    var avail=availabilityMap(availabilityPayload);
    var splitInformative=impactPayload&&impactPayload.off_def_split_informative===true;
    return sourcePlayers(basePayload).map(function(p,i){
      var id=p.id||p.player_id||null,name=String(p.name||p.player_name||"Unknown player"),si=season.get(id,name),ip=impact.get(id,name),av=avail[norm(name)]||null;
      var trend=p.impact_trend&&num(p.impact_trend.delta)!==null?{delta:num(p.impact_trend.delta),days:num(p.impact_trend.days)}:null;
      var status=statusFrom(p,si,av);
      var impactValue=num(p.rating);
      var impactRank=num(p.impact_rank);
      return {
        raw:p,id:id,name:name,team:String(p.team||p.team_abbr||(si&&si.team)||(ip&&ip.team)||"—"),
        rank:num(p.rank)||i+1,gp:num(p.gp),teamGp:num(p.team_gp),dnp:num(p.dnp),
        minutes:num(p.minutes),minutesDate:p.minutes_date||null,minutesCtx:Boolean(p.minutes_ctx),
        pts:num(p.pts),reb:num(p.reb),ast:num(p.ast),stl:num(p.stl),blk:num(p.blk),minAvg:num(p.min_avg),
        impact:impactValue,impactRank:impactRank,basis:num(p.n_basis),provisional:Boolean(p.impact_provisional),
        thin:Boolean(p.thin),smallBasis:Boolean(p.small_basis),rateBasis:p.rate_basis||null,
        careerBasis:Boolean(p.career_basis),careerGp:num(p.career_gp),careerMin:num(p.career_min),careerSeasons:num(p.career_seasons),unreadMin:num(p.unread_min),seasonMinRead:num(p.season_min_read),
        teamScoringRank:num(p.team_scoring_rank),teamSize:num(p.team_size),why:p.why||"",whyImpact:p.why_impact||"",trend:trend,
        status:status,availability:av,
        seasonRate:num(si&&si.season_impact_rate),seasonVolume:num(si&&si.season_impact_volume),seasonRank:num(si&&si.rank_rate),seasonImpactRating:num(si&&si.impact_rating),seasonShare:num(si&&si.min_share_pct),seasonProjMin:num(si&&si.proj_min_next),seasonPlayProb:num(si&&si.play_prob),resultsThin:Boolean(si&&si.results_thin),
        impact100:num(ip&&ip.impact),impact100Rank:num(ip&&ip.rank),impact100Games:num(ip&&ip.games),impact100Stints:num(ip&&ip.stints),impact100Off:splitInformative?num(ip&&ip.off):null,impact100Def:splitInformative?num(ip&&ip.def):null,splitInformative:splitInformative,
        profile:profileHref(id)
      };
    });
  }

  function statusLabel(p){return p.status==="out"?"Out":p.status==="limited"?"Limited":p.status==="available"?"Available":"Unknown";}
  function statusClass(p){return p.status==="out"?"out":p.status==="limited"?"limited":p.status==="available"?"available":"unknown";}
  function basisLabel(p){
    if(p.provisional)return "Provisional";
    if(p.thin||p.smallBasis||p.rateBasis==="rough"||p.rateBasis==="light")return p.careerBasis?"Career-backed":"Thin / light";
    if(p.careerBasis)return "Firm + career";
    return "Firm";
  }
  function basisClass(p){return p.provisional||p.thin||p.smallBasis?"limited":"available";}
  function trendHTML(p){if(!p.trend)return '<span class="hw-trend flat">—</span>';var up=p.trend.delta>0;return '<span class="hw-trend '+(up?'up':'down')+'">'+(up?'▲ ':'▼ ')+esc(Math.abs(p.trend.delta).toFixed(1))+(p.trend.days?' / '+esc(p.trend.days)+'d':'')+'</span>';}
  function sortValue(p,key){
    var map={rank:p.rank,gp:p.gp,minutes:p.minutes,pts:p.pts,reb:p.reb,ast:p.ast,impact:p.impact,impactRank:p.impactRank,seasonRate:p.seasonRate,seasonVolume:p.seasonVolume,basis:p.basis,trend:p.trend?p.trend.delta:null};
    return map[key];
  }
  function compare(a,b){var key=state.sort.key,dir=state.sort.dir==="asc"?1:-1,av=sortValue(a,key),bv=sortValue(b,key);if(av===null||av===undefined)return bv===null||bv===undefined?a.name.localeCompare(b.name):1;if(bv===null||bv===undefined)return -1;if(typeof av==="string")return av.localeCompare(bv)*dir;if(av===bv)return a.name.localeCompare(b.name);return (av-bv)*dir;}
  function currentFilters(){return {q:$("players-search").value.trim().toLowerCase(),team:$("players-team").value,status:$("players-status").value,basis:$("players-basis").value};}
  function matchesBasis(p,value){if(!value)return true;if(value==="firm")return !p.provisional&&!p.thin&&!p.smallBasis;if(value==="provisional")return p.provisional;if(value==="career")return p.careerBasis;if(value==="thin")return p.thin||p.smallBasis||p.rateBasis==="rough"||p.rateBasis==="light";return true;}
  function filterPlayers(){var f=currentFilters();state.filtered=state.players.filter(function(p){return (!f.team||p.team===f.team)&&(!f.status||p.status===f.status)&&matchesBasis(p,f.basis)&&(!f.q||(p.name+" "+p.team+" "+statusLabel(p)+" "+basisLabel(p)).toLowerCase().indexOf(f.q)>=0);}).sort(compare);}

  function rowHTML(p){
    var selected=state.selected&&String(state.selected.id)===String(p.id);
    return '<tr'+(selected?' class="selected"':'')+' data-player-id="'+esc(p.id)+'">'
      +'<td class="num hw-rank">'+esc(fixed(p.rank,0))+'</td>'
      +'<td><button class="hw-player-select" type="button" aria-controls="player-inspector" aria-pressed="'+String(Boolean(selected))+'" data-select-player="'+esc(p.id)+'"><span class="hw-player-namecell"><span class="hw-player-avatar">'+esc(initials(p.name))+'</span><span><strong class="hw-name">'+esc(p.name)+'</strong><span class="hw-sub">'+esc(p.whyImpact||p.why||"")+'</span></span></span></button></td>'
      +'<td>'+esc(p.team)+'</td><td><span class="hw-status-pill '+statusClass(p)+'">'+esc(statusLabel(p))+'</span></td>'
      +'<td class="num">'+esc(fixed(p.gp,0))+'</td><td class="num">'+esc(fixed(p.minutes,1))+'</td><td class="num">'+esc(fixed(p.pts,1))+'</td><td class="num">'+esc(fixed(p.reb,1))+'</td><td class="num">'+esc(fixed(p.ast,1))+'</td>'
      +'<td class="num '+(p.impact!==null&&p.impact>=0?'hw-positive':'hw-negative')+'">'+esc(signed(p.impact,1))+'</td><td class="num">'+esc(fixed(p.impactRank,0))+'</td>'
      +'<td class="num">'+esc(signed(p.seasonRate,2))+'</td><td class="num">'+esc(signed(p.seasonVolume,1))+'</td>'
      +'<td class="num"><span class="hw-basis-pill '+basisClass(p)+'">'+esc(fixed(p.basis,0))+'</span></td><td>'+trendHTML(p)+'</td></tr>';
  }
  function mobileHTML(p){var selected=state.selected&&String(state.selected.id)===String(p.id);return '<button type="button" class="hw-mobile-player'+(selected?' selected':'')+'" aria-controls="player-inspector" aria-pressed="'+String(Boolean(selected))+'" data-select-player="'+esc(p.id)+'"><span class="hw-mobile-player-top"><strong>'+esc(p.name)+'</strong><span>'+esc(p.team)+' · #'+esc(fixed(p.rank,0))+'</span></span><span class="hw-mobile-player-metrics"><span>PTS<b>'+esc(fixed(p.pts,1))+'</b></span><span>Impact<b>'+esc(signed(p.impact,1))+'</b></span><span>Proj min<b>'+esc(fixed(p.minutes,1))+'</b></span><span>Season total<b>'+esc(signed(p.seasonVolume,1))+'</b></span></span><span class="hw-mobile-player-bottom"><span>'+esc(statusLabel(p))+' · '+esc(basisLabel(p))+'</span><span>'+trendHTML(p)+'</span></span></button>';}
  function syncSortControls(){var sort=$("players-sort"),dir=$("players-sort-dir");if(sort)sort.value=state.sort.key;if(dir)dir.value=state.sort.dir;qa("[data-sort]").forEach(function(btn){var key=btn.getAttribute("data-sort"),active=key===state.sort.key,th=btn.closest("th");btn.removeAttribute("data-dir");if(active)btn.setAttribute("data-dir",state.sort.dir);if(th)th.setAttribute("aria-sort",active?(state.sort.dir==="asc"?"ascending":"descending"):"none");});}
  function renderTable(){
    filterPlayers();
    $("players-count").textContent=state.filtered.length+" of "+state.players.length+" players";
    $("players-context").textContent=(SORT_LABELS[state.sort.key]||state.sort.key)+" · "+(state.sort.dir==="asc"?"ascending":"descending");
    $("players-body").innerHTML=state.filtered.map(rowHTML).join("")||'<tr><td colspan="15"><div class="hw-empty">No published players match these filters.</div></td></tr>';
    $("players-mobile").innerHTML=state.filtered.map(mobileHTML).join("")||'<div class="hw-empty">No published players match these filters.</div>';
    qa("[data-select-player]").forEach(function(btn){btn.addEventListener("click",function(){selectPlayer(btn.getAttribute("data-select-player"));});});
    syncSortControls();
    var exportButton=$("players-export");if(exportButton)exportButton.setAttribute("aria-label",state.filtered.length?"Download filtered players CSV; "+state.filtered.length+" rows in current view":"No filtered player rows available to export");
  }
  function findPlayer(id){return state.players.find(function(p){return String(p.id)===String(id);})||null;}
  function line(label,value){return '<div class="hw-player-inspector-line"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>';}
  function metric(label,value,note){return '<div class="hw-player-inspector-metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note||"")+'</small></div>';}
  function availabilityCopy(p){
    var a=p.availability;
    if(!a){if(p.status==="available")return "The current season-impact feed expects her to be available.";if(p.status==="out")return "The current season-impact feed lists her as out.";return "No player-level availability note was published for this row.";}
    var bits=[];if(a.playPct!==null)bits.push("status category clears "+a.playPct.toFixed(0)+"% of the time");if(a.returnDate)bits.push("listed return "+a.returnDate);if(a.updated)bits.push("updated "+a.updated);if(a.stale)bits.push("marked stale by the source");return bits.join(" · ")||"Availability state published without an explanatory note.";
  }
  function renderInspector(p){
    if(!p){$("player-inspector").innerHTML='<div class="hw-module-head"><h2>Player inspector</h2><span>Select a row</span></div><div class="hw-empty">Choose any player to see impact, production, role, availability, ranking divergence, movement, and basis together.</div>';return;}
    var gap=(p.rank!==null&&p.impactRank!==null)?p.rank-p.impactRank:null;
    var gapText=gap===null?"Not jointly ranked":gap>0?"Impact rank is "+gap+" places better than scoring rank":gap<0?"Scoring rank is "+Math.abs(gap)+" places better than impact rank":"Same rank on both axes";
    var career=p.careerBasis?(fixed(p.careerGp,0)+" career games · "+fixed(p.careerSeasons,0)+" seasons · "+fixed(p.careerMin,0)+" minutes held"):"No earlier-career fallback claimed by this source";
    var impactStudy=p.impact100===null?"No separate per-100 impact row":"#"+fixed(p.impact100Rank,0)+" · "+signed(p.impact100,2)+" points/100 · "+fixed(p.impact100Games,0)+" games · "+fixed(p.impact100Stints,0)+" stints";
    var impactSplit=p.splitInformative?"Off "+signed(p.impact100Off,2)+" · Def "+signed(p.impact100Def,2):"Offense/defense split withheld because the source says it is not informative.";
    var note=p.availability&&p.availability.note?p.availability.note:"";
    var basisPct=Math.max(0,Math.min(100,(p.basis||0)/25*100));
    $("player-inspector").innerHTML='<div class="hw-module-head"><h2>Player inspector</h2><span>'+esc(p.team)+'</span></div><div class="hw-player-inspector-body">'
      +'<div class="hw-player-inspector-hero"><span class="hw-player-avatar">'+esc(initials(p.name))+'</span><div><h3>'+esc(p.name)+'</h3><p>#'+esc(fixed(p.rank,0))+' by scoring · #'+esc(fixed(p.impactRank,0))+' by board impact</p></div><span class="hw-status-pill '+statusClass(p)+'">'+esc(statusLabel(p))+'</span></div>'
      +'<div class="hw-player-inspector-metrics">'+metric("Points / game",fixed(p.pts,1),"scoring rank #"+fixed(p.rank,0))+metric("Board impact",signed(p.impact,1),"impact rank #"+fixed(p.impactRank,0))+metric("Projected minutes",fixed(p.minutes,1),p.minutesDate||"date not published")+metric("Season rate",signed(p.seasonRate,3),"rank #"+fixed(p.seasonRank,0))+metric("Season total",signed(p.seasonVolume,2),"descriptive, not forecast")+metric("Tracked basis",fixed(p.basis,0),basisLabel(p))+'</div>'
      +'<section class="hw-player-inspector-section"><h3>Why the rankings differ</h3><p class="hw-player-inspector-copy">'+esc(gapText)+'. '+esc(p.whyImpact||p.why||"No explanation line was published.")+'</p>'+line("Recent impact movement",p.trend?(signed(p.trend.delta,1)+" over "+fixed(p.trend.days,0)+" days"):"No material trend published")+'</section>'
      +'<section class="hw-player-inspector-section"><h3>Production and role</h3>'+line("Box score",fixed(p.pts,1)+" PTS · "+fixed(p.reb,1)+" REB · "+fixed(p.ast,1)+" AST")+line("Other box stats",fixed(p.stl,1)+" STL · "+fixed(p.blk,1)+" BLK")+line("Games / DNP",fixed(p.gp,0)+" / "+fixed(p.dnp,0))+line("Team scoring role",p.teamScoringRank===null?"Not published":"#"+fixed(p.teamScoringRank,0)+" of "+fixed(p.teamSize,0))+line("Season minutes read",fixed(p.seasonMinRead,0))+'</section>'
      +'<section class="hw-player-inspector-section"><h3>Availability</h3>'+line("Current state",statusLabel(p))+line("Source detail",availabilityCopy(p))+(note?'<p class="hw-player-inspector-copy">'+esc(note)+'</p>':'')+'</section>'
      +'<section class="hw-player-inspector-section"><h3>Sample and career context</h3>'+line("Basis label",basisLabel(p))+'<div class="hw-basis-meter"><span style="width:'+basisPct.toFixed(0)+'%"></span></div>'+line("Career context",career)+line("Unread prior minutes",fixed(p.unreadMin,0))+line("Rate basis",p.rateBasis||"not published")+'</section>'
      +'<section class="hw-player-inspector-section"><h3>Separate per-100 impact study</h3>'+line("Published row",impactStudy)+'<p class="hw-player-inspector-copy">'+esc(impactSplit)+'</p></section>'
      +'<div class="hw-player-inspector-actions"><a href="'+safeHref(p.profile)+'">Open profile</a><a href="compare.html?players='+encodeURIComponent(p.name)+'">Compare</a><a href="impact.html">Season impact board</a></div></div>';
  }
  function selectPlayer(id,writeState){var p=findPlayer(id);if(!p)return;state.selected=p;if(writeState!==false)replaceParam("player",p.id);renderTable();renderInspector(p);renderViz();}

  function story(label,value,note){return '<article class="hw-story"><span class="hw-story-label">'+esc(label)+'</span><strong class="hw-story-value">'+esc(value)+'</strong><span class="hw-story-note">'+esc(note)+'</span></article>';}
  function maxBy(list,key,guard){var valid=list.filter(function(p){return num(p[key])!==null&&(!guard||guard(p));});return valid.sort(function(a,b){return b[key]-a[key];})[0]||null;}
  function renderStories(){
    var scoring=maxBy(state.players,"pts"),impact=maxBy(state.players,"impact",function(p){return !p.provisional;}),rate=maxBy(state.players,"seasonRate"),volume=maxBy(state.players,"seasonVolume");
    var divergence=state.players.filter(function(p){return p.rank!==null&&p.impactRank!==null&&!p.provisional;}).sort(function(a,b){return (b.rank-b.impactRank)-(a.rank-a.impactRank);})[0]||null;
    var out=state.players.filter(function(p){return p.status==="out";}),outMin=out.reduce(function(sum,p){return sum+(p.minutes||0);},0),knownOut=out.filter(function(p){return p.minutes!==null;}).length;
    $("players-stories").innerHTML=[
      story("Scoring leader",scoring?scoring.name:"Not published",scoring?fixed(scoring.pts,1)+" points per game":"No scoring row"),
      story("Impact leader",impact?impact.name:"Not published",impact?signed(impact.impact,1)+" board impact":"No firm impact row"),
      story("Season rate leader",rate?rate.name:"Not published",rate?signed(rate.seasonRate,3)+" per team game":"No season-impact feed"),
      story("Season total leader",volume?volume.name:"Not published",volume?signed(volume.seasonVolume,2)+" accumulated":"No season-impact feed"),
      story("Largest rank rise",divergence?divergence.name:"Not published",divergence?(divergence.rank-divergence.impactRank)+" places above scoring rank":"No joint ranking"),
      story("Unavailable role",out.length+" out",knownOut+" sized · "+fixed(outMin,0)+" projected minutes")
    ].join("");
  }
  function renderWatches(){
    var outs=state.players.filter(function(p){return p.status==="out";}).sort(function(a,b){return (b.minutes||-1)-(a.minutes||-1);}).slice(0,10);
    $("players-out").innerHTML=outs.map(function(p){return '<div class="hw-player-watch-row"><div><strong>'+esc(p.name)+' · '+esc(p.team)+'</strong><span>'+esc(p.availability&&p.availability.returnDate?"Return "+p.availability.returnDate:"No return date published")+'</span></div><b>'+esc(fixed(p.minutes,1))+' min</b></div>';}).join("")||'<div class="hw-empty">No out players in the joined player board.</div>';
    var below=state.sources.players&&state.sources.players.ratings&&Array.isArray(state.sources.players.ratings.below_gate)?state.sources.players.ratings.below_gate:[];
    $("players-below-gate").innerHTML=below.slice(0,10).map(function(p){return '<div class="hw-player-watch-row"><div><strong>'+esc(p.name)+' · '+esc(p.team||"—")+'</strong><span>'+esc(fixed(p.gp,0))+' current games · '+esc(fixed(p.career_gp,0))+' career games</span></div><b>'+esc(fixed(p.pts,1))+' PTS</b></div>';}).join("")||'<div class="hw-empty">No career-backed player is currently listed below the ranking gate.</div>';
  }

  function extent(values){var clean=values.filter(function(v){return num(v)!==null;});if(!clean.length)return [0,1];var lo=Math.min.apply(null,clean),hi=Math.max.apply(null,clean);if(lo===hi){lo-=1;hi+=1;}var pad=(hi-lo)*0.08;return [lo-pad,hi+pad];}
  function scale(v,dom,ran){return ran[0]+(v-dom[0])/(dom[1]-dom[0])*(ran[1]-ran[0]);}
  function svgText(x,y,text,anchor,cls){return '<text x="'+x+'" y="'+y+'" text-anchor="'+(anchor||"start")+'" class="'+(cls||"hw-svg-label")+'">'+esc(text)+'</text>';}
  function renderScatter(points,opts){
    if(!points.length)return '<div class="hw-empty">No players carry both fields needed for this visual.</div>';
    var W=860,H=310,L=58,R=18,T=18,B=38,xd=extent(points.map(function(p){return p.x;})),yd=extent(points.map(function(p){return p.y;}));
    if(opts.rank){xd=[Math.min.apply(null,points.map(function(p){return p.x;}))-1,Math.max.apply(null,points.map(function(p){return p.x;}))+1];yd=[Math.min.apply(null,points.map(function(p){return p.y;}))-1,Math.max.apply(null,points.map(function(p){return p.y;}))+1];}
    var sx=function(v){return scale(v,xd,[L,W-R]);},sy=function(v){return scale(v,yd,[H-B,T]);};
    var selectedInPlot=state.selected&&points.some(function(pt){return String(pt.p.id)===String(state.selected.id);});
    var out=['<svg viewBox="0 0 '+W+' '+H+'" role="group" aria-label="'+esc(opts.aria)+'">'];
    [0,.25,.5,.75,1].forEach(function(q){var xv=xd[0]+(xd[1]-xd[0])*q,yv=yd[0]+(yd[1]-yd[0])*q,x=sx(xv),y=sy(yv);out.push('<line x1="'+x+'" x2="'+x+'" y1="'+T+'" y2="'+(H-B)+'" class="hw-svg-grid"/>');out.push('<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'" class="hw-svg-grid"/>');out.push(svgText(x,H-14,opts.xfmt(xv),"middle"));out.push(svgText(8,y+3,opts.yfmt(yv),"start"));});
    if(opts.zero&&xd[0]<0&&xd[1]>0){var zx=sx(0);out.push('<line x1="'+zx+'" x2="'+zx+'" y1="'+T+'" y2="'+(H-B)+'" class="hw-zero-line"/>');}
    if(opts.rank){var m0=Math.max(xd[0],yd[0]),m1=Math.min(xd[1],yd[1]);out.push('<line x1="'+sx(m0)+'" y1="'+sy(m0)+'" x2="'+sx(m1)+'" y2="'+sy(m1)+'" class="hw-rank-diagonal"/>');}
    points.forEach(function(pt,index){var selected=state.selected&&String(state.selected.id)===String(pt.p.id),r=Math.max(2.6,Math.min(6.5,2.7+(pt.size||0)/10)),description=pt.p.name+' · '+opts.xtip(pt.x)+' · '+opts.ytip(pt.y),focusable=selected||(!selectedInPlot&&index===0);out.push('<g class="hw-player-point" tabindex="'+(focusable?'0':'-1')+'" role="button" aria-controls="player-inspector" aria-pressed="'+String(Boolean(selected))+'" aria-label="'+esc('Select '+description)+'" data-viz-player="'+esc(pt.p.id)+'"><title>'+esc(description)+'</title><circle class="hw-point'+(selected?' selected':'')+'" cx="'+sx(pt.x).toFixed(1)+'" cy="'+sy(pt.y).toFixed(1)+'" r="'+r.toFixed(1)+'"></circle></g>');});
    out.push(svgText((L+W-R)/2,H-1,opts.xlabel,"middle","hw-svg-axis"));out.push('<text x="12" y="'+((T+H-B)/2)+'" transform="rotate(-90 12 '+((T+H-B)/2)+')" text-anchor="middle" class="hw-svg-axis">'+esc(opts.ylabel)+'</text></svg>');return out.join("");
  }
  function bindVizPoints(){var points=qa("[data-viz-player]");points.forEach(function(node,index){node.addEventListener("click",function(){selectPlayer(node.getAttribute("data-viz-player"));});node.addEventListener("keydown",function(event){if(event.key==="Enter"||event.key===" "){event.preventDefault();selectPlayer(node.getAttribute("data-viz-player"));return;}var next=index;if(event.key==="ArrowRight"||event.key==="ArrowDown")next=(index+1)%points.length;else if(event.key==="ArrowLeft"||event.key==="ArrowUp")next=(index-1+points.length)%points.length;else if(event.key==="Home")next=0;else if(event.key==="End")next=points.length-1;else return;event.preventDefault();node.setAttribute("tabindex","-1");points[next].setAttribute("tabindex","0");points[next].focus();});});}
  function renderViz(){
    var mode=state.viz,points=[],opts;
    if(mode==="season"){
      points=state.players.filter(function(p){return p.seasonRate!==null&&p.seasonVolume!==null;}).map(function(p){return {p:p,x:p.seasonRate,y:p.seasonVolume,size:p.gp||0};});
      opts={aria:"Season impact rate versus accumulated total",xlabel:"Season impact rate",ylabel:"Season impact total",xfmt:function(v){return signed(v,2);},yfmt:function(v){return signed(v,1);},xtip:function(v){return signed(v,3)+" rate";},ytip:function(v){return signed(v,2)+" total";},zero:true};$("player-viz-context").textContent="Season impact rate versus accumulated total";
    }else if(mode==="ranks"){
      points=state.players.filter(function(p){return p.rank!==null&&p.impactRank!==null&&!p.provisional;}).map(function(p){return {p:p,x:p.rank,y:p.impactRank,size:p.gp||0};});
      opts={aria:"Scoring rank versus impact rank",xlabel:"Scoring rank (lower is better)",ylabel:"Impact rank (lower is better)",xfmt:function(v){return "#"+Math.round(v);},yfmt:function(v){return "#"+Math.round(v);},xtip:function(v){return "scoring #"+Math.round(v);},ytip:function(v){return "impact #"+Math.round(v);},rank:true};$("player-viz-context").textContent="Impact rank versus scoring rank · diagonal means the ranks agree";
    }else{
      points=state.players.filter(function(p){return p.impact!==null&&p.minutes!==null;}).map(function(p){return {p:p,x:p.impact,y:p.minutes,size:p.pts||0};});
      opts={aria:"Player impact versus projected minutes",xlabel:"Board impact",ylabel:"Projected minutes",xfmt:function(v){return signed(v,1);},yfmt:function(v){return fixed(v,0);},xtip:function(v){return signed(v,1)+" impact";},ytip:function(v){return fixed(v,1)+" projected minutes";},zero:true};$("player-viz-context").textContent="Impact versus projected minutes";
    }
    $("player-viz").innerHTML=renderScatter(points,opts);
    bindVizPoints();
    qa("[data-player-viz]").forEach(function(btn){var active=btn.getAttribute("data-player-viz")===state.viz;btn.classList.toggle("active",active);btn.setAttribute("aria-pressed",String(active));});
  }

  function setFresh(sources){var readings=[],undated=[];Object.keys(sources).forEach(function(key){var raw=dateValue(sources[key]),d=parseStamp(raw);if(d)readings.push({key:key,raw:raw,date:d});else undated.push(key);});readings.sort(function(a,b){return a.date-b.date;});var floor=readings[0]||null,hours=floor?(Date.now()-floor.date.getTime())/36e5:null,label=floor?"Oldest source updated "+ageText(floor.raw)+" · "+SOURCE_LABELS[floor.key]:"Update time unavailable";if(undated.length)label+=" · "+undated.length+" undated";var detail=readings.map(function(item){return SOURCE_LABELS[item.key]+": "+String(item.raw);});if(undated.length)detail.push("Undated: "+undated.map(function(key){return SOURCE_LABELS[key];}).join(", "));qa("[data-fresh]").forEach(function(el){el.innerHTML='<span class="hw-fresh-dot"></span>'+esc(label);el.classList.toggle("warn",!floor||hours>24||undated.length>0);el.title=detail.join(" · ");});}

  function cellText(cell){return String(cell&&((cell.innerText)||(cell.textContent))||"").replace(/\s+/g," ").trim();}
  function csvCell(value){var text=String(value==null?"":value);return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;}
  function renderedPlayerRows(){var table=$("players-table");if(!table)return [];var header=qa("thead th",table).map(cellText),body=qa("tbody tr",table).filter(function(row){return !row.querySelector(".hw-empty");}).map(function(row){return Array.prototype.slice.call(row.children).filter(function(cell){return /^(TD|TH)$/.test(cell.tagName);}).map(cellText);});return header.length?[header].concat(body):[];}
  function exportPlayersCsv(){var button=$("players-export");if(!button||typeof Blob!=="function"||!window.URL||typeof window.URL.createObjectURL!=="function")return;var output=renderedPlayerRows(),count=Math.max(0,output.length-1);if(!count){button.setAttribute("aria-label","No filtered player rows available to export");return;}var csv=output.map(function(row){return row.map(csvCell).join(",");}).join("\r\n"),blob=new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}),href=window.URL.createObjectURL(blob),link=document.createElement("a"),now=new Date(),stamp=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0");link.href=href;link.download="hardwood-players-"+stamp+".csv";link.hidden=true;document.body.appendChild(link);link.click();link.remove();window.setTimeout(function(){window.URL.revokeObjectURL(href);},0);button.setAttribute("aria-label","Download filtered players CSV; "+count+" rows in current view");}

  function populateTeams(){var teams={};state.players.forEach(function(p){if(p.team&&p.team!=="—")teams[p.team]=1;});$("players-team").innerHTML='<option value="">All teams</option>'+Object.keys(teams).sort().map(function(t){return '<option value="'+esc(t)+'">'+esc(t)+'</option>';}).join("");}
  function hydrateState(){var q=param("q"),team=param("team"),status=param("status"),basis=param("basis"),sort=param("sort"),dir=param("dir"),viz=param("viz"),player=param("player");if(q!==null)$("players-search").value=q;if(team&&validSelectValue("players-team",team))$("players-team").value=team;else if(team)replaceParam("team","");if(status&&validSelectValue("players-status",status))$("players-status").value=status;else if(status)replaceParam("status","");if(basis&&validSelectValue("players-basis",basis))$("players-basis").value=basis;else if(basis)replaceParam("basis","");if(sort&&SORT_KEYS.indexOf(sort)>=0)state.sort.key=sort;else if(sort)replaceParam("sort","");if(dir==="asc"||dir==="desc")state.sort.dir=dir;else if(dir)replaceParam("dir","");if(viz&&VIZ_KEYS.indexOf(viz)>=0)state.viz=viz;else if(viz)replaceParam("viz","");var selected=player?findPlayer(player):null;if(player&&!selected)replaceParam("player","");state.selected=selected||state.players.find(function(p){return p.impact!==null&&!p.provisional;})||state.players[0]||null;}
  function writeSortState(){var isDefault=state.sort.key==="impact"&&state.sort.dir==="desc";replaceParam("sort",isDefault?"":state.sort.key);replaceParam("dir",isDefault?"":state.sort.dir);}
  function bind(){
    var search=$("players-search");search.setAttribute("aria-keyshortcuts","/");if(!search.title)search.title="Press / to focus search; Esc clears search";
    [{id:"players-team",param:"team"},{id:"players-status",param:"status"},{id:"players-basis",param:"basis"}].forEach(function(spec){$(spec.id).addEventListener("change",function(){renderTable();replaceParam(spec.param,$(spec.id).value);});});
    search.addEventListener("input",function(){renderTable();replaceParam("q",search.value.trim());});
    $("players-reset").addEventListener("click",function(){$("players-search").value="";$("players-team").value="";$("players-status").value="";$("players-basis").value="";state.sort={key:"impact",dir:"desc"};["q","team","status","basis","sort","dir"].forEach(function(key){replaceParam(key,"");});renderTable();});
    $("players-export").addEventListener("click",exportPlayersCsv);
    $("players-sort").addEventListener("change",function(){state.sort.key=$("players-sort").value;state.sort.dir=defaultSortDir(state.sort.key);renderTable();writeSortState();});
    $("players-sort-dir").addEventListener("change",function(){state.sort.dir=$("players-sort-dir").value;renderTable();writeSortState();});
    qa("[data-sort]").forEach(function(btn){btn.addEventListener("click",function(){var key=btn.getAttribute("data-sort");if(state.sort.key===key)state.sort.dir=state.sort.dir==="asc"?"desc":"asc";else state.sort={key:key,dir:defaultSortDir(key)};renderTable();writeSortState();});});
    qa("[data-player-viz]").forEach(function(btn){btn.addEventListener("click",function(){state.viz=btn.getAttribute("data-player-viz");replaceParam("viz",state.viz==="impact-minutes"?"":state.viz);renderViz();});});
    document.addEventListener("keydown",function(event){if(event.key==="/"&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!editableTarget(event.target)){event.preventDefault();search.focus();if(search.select)search.select();return;}if(event.key==="Escape"&&document.activeElement===search&&search.value){event.preventDefault();search.value="";renderTable();replaceParam("q","");}});
  }
  function init(){
    Promise.all([fetchJSON("players.json"),fetchJSON("availability.json"),fetchJSON("season_impact.json"),fetchJSON("player_impact.json")]).then(function(v){state.sources={players:v[0],availability:v[1],season:v[2],impact:v[3]};state.players=mergeSources(v[0],v[1],v[2],v[3]);populateTeams();renderStories();renderWatches();setFresh(state.sources);bind();
    var paramId = new URLSearchParams(location.search).get("player_id") || new URLSearchParams(location.search).get("player");
    var initialSelected = null;
    if (paramId) {
      initialSelected = state.players.find(function(p){return String(p.id) === paramId || p.name.toLowerCase() === paramId.toLowerCase();});
    }
    state.selected = initialSelected || state.players.find(function(p){return p.impact!==null&&!p.provisional;})||state.players[0]||null;
    renderTable();renderInspector(state.selected);renderViz();}).catch(function(err){console.error(err);$("players-body").innerHTML='<tr><td colspan="15"><div class="hw-empty">The player workspace could not load its published artifacts.</div></td></tr>';});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
