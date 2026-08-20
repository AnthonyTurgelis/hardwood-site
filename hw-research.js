/* Dense Research: the complete published WNBA evidence ledger, same-origin only. */
(function(){
  "use strict";

  var FILES={index:"deepdive_index.json",ledger:"deepdive.json"};
  var state={records:[],filtered:[],selected:null,sourceCache:{},viz:"sample",sort:"sample",payloads:{}};
  var $=function(id){return document.getElementById(id);};
  var qa=function(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));};
  var has=function(value){return value!==null&&value!==undefined&&value!=="";};
  var num=function(value){if(value===true||value===false||value===null||value===undefined||value==="")return null;var parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
  var esc=function(value){return String(value==null?"":value).replace(/[&<>"']/g,function(char){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char];});};
  var fixed=function(value,digits){var parsed=num(value);return parsed===null?"—":parsed.toFixed(digits==null?1:digits);};
  var signed=function(value,digits){var parsed=num(value);return parsed===null?"—":(parsed>0?"+":"")+parsed.toFixed(digits==null?1:digits);};
  var human=function(value){return String(value||"").replace(/[_-]+/g," ").replace(/\b\w/g,function(c){return c.toUpperCase();});};
  var normalize=function(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();};
  var truncate=function(value,max){var text=String(value||"").replace(/\s+/g," ").trim();return text.length>max?text.slice(0,max-1).trim()+"…":text;};
  var safeHref=function(value){var text=String(value||"");return text&&!/^javascript:/i.test(text)?esc(text):"#";};
  var dateObj=function(value){if(!has(value))return null;var parsed=new Date(value);return Number.isNaN(parsed.getTime())?null:parsed;};
  var dateText=function(value){var parsed=dateObj(value);return parsed?parsed.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}):String(value||"—");};
  var ageText=function(value){var parsed=dateObj(value);if(!parsed)return "time not published";var seconds=Math.max(0,(Date.now()-parsed.getTime())/1000);if(seconds<90)return "just now";if(seconds<3600)return Math.floor(seconds/60)+"m ago";if(seconds<86400)return Math.floor(seconds/3600)+"h ago";return Math.floor(seconds/86400)+"d ago";};
  var fetchJSON=function(path){return fetch(path,{cache:"no-store"}).then(function(response){if(!response.ok)throw new Error(path+" returned "+response.status);return response.json();});};
  var rows=function(payload,keys){if(Array.isArray(payload))return payload;for(var index=0;index<keys.length;index++){var value=payload&&payload[keys[index]];if(Array.isArray(value))return value;}return [];};

  function stripMarkdown(value){
    return String(value||"")
      .replace(/```[\s\S]*?```/g," ")
      .replace(/^#{1,6}\s*/gm,"")
      .replace(/\*\*([^*]+)\*\*/g,"$1")
      .replace(/\*([^*]+)\*/g,"$1")
      .replace(/`([^`]+)`/g,"$1")
      .replace(/\[([^\]]+)\]\([^\)]+\)/g,"$1")
      .replace(/^[-*+]\s+/gm,"")
      .replace(/\s+/g," ")
      .trim();
  }

  function narrativeParagraphs(item){
    var content=Array.isArray(item&&item.content)?item.content:[];
    return content.map(function(line){return String(line||"").trim();}).filter(function(line){
      return line&&!/^#{1,6}\s/.test(line)&&!/^```/.test(line)&&!/^Record:/i.test(line)&&stripMarkdown(line).length>18;
    }).map(stripMarkdown);
  }

  function decisionFor(text,indexed){
    var lower=String(text||"").toLowerCase();
    if(/\bno-promote\b|\bdo-not-wire\b|\bdo not wire\b|\bstill null\b|\bnull\b|\bnoise\b|\bdid not help\b|\bdoes not help\b|\bno margin lift\b|\btied a flat\b|\bindistinguishable from a flat\b|\bworse than\b|\bgate fail\b|\bfailed the gate\b/.test(lower))return {key:"no-promote",label:"No promote"};
    if(/verify-not-rebuild|already (?:the )?(?:best|right|learned)|nothing to change|kept the current|kept current|incumbent.*best|came up empty.*good way/.test(lower))return {key:"verified",label:"Verified incumbent"};
    if(/\brecommendation\b|\bshould incorporate\b|\bshould add\b|\bshould build\b|\bnext step\b/.test(lower))return {key:"recommended",label:"Recommended"};
    if(/\bpromote\b|\bimproved\b|\bsharpened\b|\bbeat the baseline\b|\bgenuine signal\b|\bproduction\b/.test(lower))return {key:"positive",label:"Positive result"};
    return indexed?{key:"published",label:"Published dive"}:{key:"finding",label:"Finding"};
  }

  function conclusionFrom(paragraphs){
    if(!paragraphs.length)return "No conclusion paragraph was published.";
    var scored=paragraphs.map(function(paragraph,index){
      var lower=paragraph.toLowerCase(),score=0;
      if(/no-promote|do-not-wire|noise|null|did not help|does not help|recommendation|we kept|we did not|so we|finding|result|proved|verified|improved|worse/.test(lower))score+=8;
      if(index>0)score+=2;
      if(paragraph.length>70&&paragraph.length<650)score+=2;
      return {paragraph:paragraph,score:score};
    }).sort(function(a,b){return b.score-a.score;});
    return scored[0].paragraph;
  }

  function mergeResearch(indexPayload,ledgerPayload){
    var ledgerItems=rows(ledgerPayload,["items","research","rows"]),ledgerByTitle={},used={};
    ledgerItems.forEach(function(item,index){ledgerByTitle[normalize(item.title)]=Object.assign({_ledgerIndex:index},item);});
    var records=rows(indexPayload,["dives","items","rows"]).map(function(dive,index){
      var key=normalize(dive.title),ledger=ledgerByTitle[key]||null,paragraphs=narrativeParagraphs(ledger||{}),searchText=[dive.title,dive.question,dive.one_line,dive.source_table,paragraphs.join(" ")].join(" ");
      if(ledger)used[ledger._ledgerIndex]=true;
      var decision=decisionFor(searchText,true),history=Array.isArray(dive.n_history)?dive.n_history.filter(function(row){return Array.isArray(row)&&row.length>=2&&num(row[1])!==null;}):[];
      return {
        id:"dive:"+String(dive.slug||index),slug:String(dive.slug||index),kind:"dive",kindLabel:"Published dive",title:String(dive.title||"Untitled analysis"),question:String(dive.question||dive.title||"Question not published"),summary:String(dive.one_line||conclusionFrom(paragraphs)),conclusion:String(dive.one_line||conclusionFrom(paragraphs)),paragraphs:paragraphs.length?paragraphs:(dive.one_line?[String(dive.one_line)]:[]),decision:decision,source:String(dive.source_table||"Source not published"),sourceJson:dive.source_json||null,n:num(dive.n),nDelta:num(dive.n_delta),nPrev:num(dive.n_prev),nHistory:history,asOf:dive.one_line_changed||((ledger&&ledger.as_of)||indexPayload.generated_utc),ledgerAsOf:ledger&&ledger.as_of,search:normalize(searchText)
      };
    });
    ledgerItems.forEach(function(item,index){
      if(used[index])return;
      var paragraphs=narrativeParagraphs(item),searchText=[item.title,paragraphs.join(" ")].join(" "),decision=decisionFor(searchText,false);
      records.push({id:"test:"+index,slug:null,kind:"test",kindLabel:"Research test",title:String(item.title||"Untitled research"),question:String(item.title||"Question not published"),summary:paragraphs[0]||"Summary not published",conclusion:conclusionFrom(paragraphs),paragraphs:paragraphs,decision:decision,source:"Research ledger",sourceJson:null,n:null,nDelta:null,nPrev:null,nHistory:[],asOf:item.as_of||ledgerPayload.generated_utc,ledgerAsOf:item.as_of,search:normalize(searchText)});
    });
    return records;
  }

  function sampleBand(record){if(record.n===null)return "unknown";if(record.n>=1000)return "large";if(record.n>=250)return "mid";return "small";}
  function filters(){return {q:normalize($("research-search").value),source:$("research-source").value,verdict:$("research-verdict").value,sample:$("research-sample").value,kind:$("research-kind").value,sort:$("research-sort").value};}
  function compareRecords(a,b,sort){
    if(sort==="movement"){var am=a.nDelta===null?-1:Math.abs(a.nDelta),bm=b.nDelta===null?-1:Math.abs(b.nDelta);return bm-am||a.title.localeCompare(b.title);}
    if(sort==="newest"){var ad=dateObj(a.asOf),bd=dateObj(b.asOf);return (bd?bd.getTime():0)-(ad?ad.getTime():0)||a.title.localeCompare(b.title);}
    if(sort==="decision")return a.decision.label.localeCompare(b.decision.label)||((b.n||-1)-(a.n||-1));
    if(sort==="title")return a.title.localeCompare(b.title);
    return (b.n===null?-1:b.n)-(a.n===null?-1:a.n)||a.title.localeCompare(b.title);
  }
  function applyFilters(){
    var f=filters();state.sort=f.sort;
    state.filtered=state.records.filter(function(record){
      if(f.q&&record.search.indexOf(f.q)<0)return false;
      if(f.source&&record.source!==f.source)return false;
      if(f.verdict&&record.decision.key!==f.verdict)return false;
      if(f.sample&&sampleBand(record)!==f.sample)return false;
      if(f.kind&&record.kind!==f.kind)return false;
      return true;
    }).sort(function(a,b){return compareRecords(a,b,f.sort);});
  }

  function badge(record){return '<span class="hw-research-verdict '+esc(record.decision.key)+'">'+esc(record.decision.label)+'</span>';}
  function deltaText(record){if(record.nDelta===null)return "—";return (record.nDelta>0?"▲ ":record.nDelta<0?"▼ ":"")+Math.abs(record.nDelta).toLocaleString();}
  function deltaClass(record){return record.nDelta===null?"flat":record.nDelta>0?"up":record.nDelta<0?"down":"flat";}
  function tableRow(record){
    var selected=state.selected&&state.selected.id===record.id;
    return '<tr'+(selected?' class="selected"':'')+' data-research-row="'+esc(record.id)+'"><td><span class="hw-research-kind">'+esc(record.kindLabel)+'</span></td><td><button class="hw-research-select-row" type="button" data-select-research="'+esc(record.id)+'"><strong>'+esc(record.title)+'</strong><small>'+esc(truncate(record.question,110))+'</small></button></td><td>'+badge(record)+'</td><td>'+esc(record.source)+'</td><td class="num">'+(record.n===null?'—':esc(record.n.toLocaleString()))+'</td><td class="num"><span class="hw-research-delta '+deltaClass(record)+'">'+esc(deltaText(record))+'</span></td><td>'+esc(dateText(record.asOf))+'</td><td><span class="hw-research-finding">'+esc(truncate(record.conclusion,150))+'</span></td></tr>';
  }
  function mobileRow(record){
    var selected=state.selected&&state.selected.id===record.id;
    return '<button type="button" class="hw-mobile-research-row'+(selected?' selected':'')+'" data-select-research="'+esc(record.id)+'"><span class="hw-mobile-research-top"><strong>'+esc(record.title)+'</strong>'+badge(record)+'</span><span class="hw-mobile-research-meta">'+esc(record.kindLabel)+' · '+esc(record.source)+' · '+(record.n===null?'sample not published':record.n.toLocaleString()+' observations')+'</span><span class="hw-mobile-research-finding">'+esc(truncate(record.conclusion,180))+'</span><span class="hw-mobile-research-bottom"><span>'+esc(dateText(record.asOf))+'</span><span class="hw-research-delta '+deltaClass(record)+'">'+esc(deltaText(record))+'</span></span></button>';
  }
  function renderBoard(){
    applyFilters();
    $("research-count").textContent=state.filtered.length+" of "+state.records.length+" records";
    $("research-context").textContent=state.sort+" · "+(filters().source||"all sources");
    $("research-body").innerHTML=state.filtered.map(tableRow).join("")||'<tr><td colspan="8"><div class="hw-empty">No published research matches these filters.</div></td></tr>';
    $("research-mobile").innerHTML=state.filtered.map(mobileRow).join("")||'<div class="hw-empty">No published research matches these filters.</div>';
    qa("[data-select-research]").forEach(function(button){button.addEventListener("click",function(){selectRecord(button.getAttribute("data-select-research"),true);});});
  }

  function story(label,value,note){return '<article class="hw-story"><span class="hw-story-label">'+esc(label)+'</span><strong class="hw-story-value">'+esc(value)+'</strong><span class="hw-story-note">'+esc(note)+'</span></article>';}
  function renderStories(){
    var dives=state.records.filter(function(record){return record.kind==="dive";}),tests=state.records.filter(function(record){return record.kind==="test";}),negative=state.records.filter(function(record){return record.decision.key==="no-promote";}),largest=dives.filter(function(record){return record.n!==null;}).sort(function(a,b){return b.n-a.n;})[0],movement=dives.filter(function(record){return record.nDelta!==null;}).sort(function(a,b){return Math.abs(b.nDelta)-Math.abs(a.nDelta);})[0],sources={};dives.forEach(function(record){sources[record.source]=true;});
    $("research-stories").innerHTML=[story("Published dives",String(dives.length),Object.keys(sources).length+" evidence sources"),story("Research tests",String(tests.length),"model and data questions"),story("No-promote findings",String(negative.length),"negative results stay visible"),story("Largest sample",largest?largest.n.toLocaleString():"—",largest?largest.title:"sample not published"),story("Largest sample move",movement?deltaText(movement):"—",movement?movement.title:"no movement published"),story("Library total",String(state.records.length),"dives plus research ledger")].join("");
  }

  function historyChart(record){
    var history=record.nHistory||[];
    if(history.length<2)return '<div class="hw-empty compact">Sample history needs at least two published snapshots.</div>';
    var width=520,height=128,left=44,right=12,top=14,bottom=27,values=history.map(function(row){return num(row[1]);}),min=Math.min.apply(null,values),max=Math.max.apply(null,values),span=max-min||1;
    var sx=function(index){return left+index/(history.length-1)*(width-left-right);},sy=function(value){return height-bottom-(value-min)/span*(height-top-bottom);};
    var points=history.map(function(row,index){return sx(index).toFixed(1)+","+sy(num(row[1])).toFixed(1);}).join(" "),labels=[0,Math.floor((history.length-1)/2),history.length-1].filter(function(value,index,array){return array.indexOf(value)===index;});
    var out=['<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Sample history for '+esc(record.title)+'"><line class="axis" x1="'+left+'" y1="'+(height-bottom)+'" x2="'+(width-right)+'" y2="'+(height-bottom)+'"></line><polyline class="history-line" points="'+points+'"></polyline>'];
    history.forEach(function(row,index){out.push('<circle class="history-point" cx="'+sx(index).toFixed(1)+'" cy="'+sy(num(row[1])).toFixed(1)+'" r="3"><title>'+esc(dateText(row[0])+': '+Number(row[1]).toLocaleString())+'</title></circle>');});
    labels.forEach(function(index){out.push('<text class="axis-label" x="'+sx(index).toFixed(1)+'" y="'+(height-8)+'" text-anchor="middle">'+esc(dateText(history[index][0]).replace(/, \d{4}/,""))+'</text>');});
    out.push('<text class="axis-label" x="'+(left-6)+'" y="'+(sy(max)+3)+'" text-anchor="end">'+esc(max.toLocaleString())+'</text><text class="axis-label" x="'+(left-6)+'" y="'+(sy(min)+3)+'" text-anchor="end">'+esc(min.toLocaleString())+'</text></svg>');return out.join("");
  }

  function inspectorMetric(label,value,note){return '<div class="hw-research-inspector-metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note||"")+'</small></div>';}
  function paragraphsHTML(record){
    var paragraphs=(record.paragraphs||[]).slice(0,7);
    if(!paragraphs.length)return '<div class="hw-empty compact">No narrative paragraphs were published for this row.</div>';
    return paragraphs.map(function(paragraph){return '<p>'+esc(paragraph)+'</p>';}).join("");
  }
  function renderInspector(record){
    if(!record)return;
    var sourceAction=record.sourceJson?'<a href="'+safeHref(record.sourceJson)+'" target="_blank" rel="noopener">Open source JSON</a>':'<span>Source file not published</span>';
    $("research-inspector").innerHTML='<div class="hw-module-head"><h2>Evidence inspector</h2><span>'+esc(record.kindLabel)+'</span></div><div class="hw-research-inspector-body"><div class="hw-research-inspector-hero"><div>'+badge(record)+'<h3>'+esc(record.title)+'</h3><p>'+esc(record.question)+'</p></div><strong>'+(record.n===null?'—':esc(record.n.toLocaleString()))+'<small>sample</small></strong></div><div class="hw-research-inspector-metrics">'+inspectorMetric("Evidence source",record.source,record.sourceJson||"no separate JSON")+inspectorMetric("Sample",record.n===null?"Not published":record.n.toLocaleString(),record.nPrev===null?"prior sample not published":"prior "+record.nPrev.toLocaleString())+inspectorMetric("Sample move",deltaText(record),record.nHistory.length+" snapshots")+inspectorMetric("Updated",dateText(record.asOf),ageText(record.asOf))+inspectorMetric("Surface",record.kindLabel,record.slug||"research ledger")+inspectorMetric("Decision",record.decision.label,"source-language classification")+'</div><section class="hw-research-inspector-section"><h3>Published finding</h3><p class="lead">'+esc(record.conclusion)+'</p></section><section class="hw-research-inspector-section"><div class="hw-research-section-head"><h3>Sample history</h3><span>'+esc(record.nHistory.length+" published snapshots")+'</span></div><div class="hw-research-history">'+historyChart(record)+'</div></section><section class="hw-research-inspector-section"><h3>Research record</h3><div class="hw-research-paragraphs">'+paragraphsHTML(record)+'</div></section><section class="hw-research-inspector-section"><div class="hw-research-section-head"><h3>Structured evidence</h3>'+sourceAction+'</div><div id="research-source-detail"><div class="hw-empty compact">'+(record.sourceJson?'Loading the published source file…':'No separate structured source file is linked to this ledger row.')+'</div></div></section><div class="hw-research-actions"><a href="deepdive.html?dive='+encodeURIComponent(record.slug||record.id)+'">Share this view</a>'+sourceAction+'</div></div>';
    if(record.sourceJson)loadSource(record);
  }

  function valueFormat(key,value){
    if(typeof value==="boolean")return value?"Yes":"No";
    var parsed=num(value);if(parsed===null)return String(value==null?"—":value);
    var lower=String(key||"").toLowerCase();
    if(parsed>=0&&parsed<=1&&/(pct|prob|chance|share|rate|winpct)/.test(lower))return (parsed*100).toFixed(1)+"%";
    if(Number.isInteger(parsed))return parsed.toLocaleString();
    return parsed.toFixed(Math.abs(parsed)>=10?1:2);
  }
  function flattenScalars(object,prefix,depth,out){
    out=out||[];if(!object||typeof object!=="object"||depth>2)return out;
    Object.keys(object).forEach(function(key){
      if(/^(generated_|slug$|question$|index_row$|provenance$|content$|note$|detail$|method$|caveats$|sources$)/.test(key))return;
      var value=object[key],label=prefix?prefix+" · "+human(key):human(key);
      if(value===null||typeof value==="string"||typeof value==="number"||typeof value==="boolean"){
        if(typeof value==="string"&&value.length>90)return;
        out.push({key:key,label:label,value:value});
      }else if(!Array.isArray(value)&&typeof value==="object")flattenScalars(value,label,depth+1,out);
    });
    return out;
  }
  function metricCards(payload){
    var entries=[];
    if(payload&&payload.headline&&typeof payload.headline==="object"&&!Array.isArray(payload.headline))entries=flattenScalars(payload.headline,"Headline",0,[]);
    if(entries.length<5)entries=entries.concat(flattenScalars(payload,"",0,[]));
    var seen={};entries=entries.filter(function(entry){var key=entry.label.toLowerCase();if(seen[key])return false;seen[key]=true;return entry.value!==null&&entry.value!=="";}).slice(0,18);
    if(!entries.length)return "";
    return '<div class="hw-source-metrics">'+entries.map(function(entry){return '<div><span>'+esc(entry.label)+'</span><strong>'+esc(valueFormat(entry.key,entry.value))+'</strong></div>';}).join("")+'</div>';
  }

  function comebackHeatmap(payload){
    var checkpoints=Array.isArray(payload&&payload.checkpoints)?payload.checkpoints:[];
    if(!checkpoints.length||!checkpoints[0].bands)return "";
    var bandKeys=Array.isArray(payload.bands)?payload.bands.map(function(band){return band.key;}):Object.keys(checkpoints[0].bands);
    return '<div class="hw-source-block"><h4>Comeback win rate by deficit and time</h4><div class="hw-source-table-wrap"><table class="hw-source-table heatmap"><thead><tr><th>Checkpoint</th>'+bandKeys.map(function(key){return '<th>'+esc(key)+'</th>';}).join("")+'</tr></thead><tbody>'+checkpoints.map(function(checkpoint){return '<tr><th>'+esc(checkpoint.label||checkpoint.key)+'</th>'+bandKeys.map(function(key){var cell=checkpoint.bands&&checkpoint.bands[key]||{},rate=num(cell.winpct),heat=rate===null?0:Math.max(0,Math.min(100,rate*2));return '<td style="--heat:'+heat.toFixed(0)+'%"><strong>'+esc(rate===null?'—':rate.toFixed(1)+'%')+'</strong><small>n '+esc(num(cell.n)===null?'—':Number(cell.n).toLocaleString())+'</small></td>';}).join("")+'</tr>';}).join("")+'</tbody></table></div></div>';
  }

  function seasonTrend(payload){
    var series=payload&&payload.trend&&Array.isArray(payload.trend.by_season)?payload.trend.by_season:[];
    if(series.length<2)return "";
    var key=series.some(function(row){return num(row.margin)!==null;})?"margin":"winpct",values=series.map(function(row){return num(row[key]);}).filter(function(value){return value!==null;});
    if(values.length<2)return "";
    var width=560,height=170,left=46,right=16,top=16,bottom=32,min=Math.min.apply(null,values),max=Math.max.apply(null,values),span=max-min||1,sx=function(index){return left+index/(series.length-1)*(width-left-right);},sy=function(value){return height-bottom-(value-min)/span*(height-top-bottom);};
    var valid=series.map(function(row,index){return {row:row,index:index,value:num(row[key])};}).filter(function(point){return point.value!==null;}),points=valid.map(function(point){return sx(point.index).toFixed(1)+","+sy(point.value).toFixed(1);}).join(" "),out=['<div class="hw-source-block"><h4>'+esc(human(key)+' by season')+'</h4><svg class="hw-source-chart" viewBox="0 0 '+width+' '+height+'" role="img"><line class="axis" x1="'+left+'" y1="'+(height-bottom)+'" x2="'+(width-right)+'" y2="'+(height-bottom)+'"></line><polyline class="trend-line" points="'+points+'"></polyline>'];
    valid.forEach(function(point){out.push('<circle class="trend-point" cx="'+sx(point.index).toFixed(1)+'" cy="'+sy(point.value).toFixed(1)+'" r="3"><title>'+esc(point.row.season+': '+valueFormat(key,point.value)+(point.row.n?' · n '+point.row.n:''))+'</title></circle>');});
    [0,Math.floor((series.length-1)/2),series.length-1].forEach(function(index){out.push('<text class="axis-label" x="'+sx(index).toFixed(1)+'" y="'+(height-10)+'" text-anchor="middle">'+esc(series[index].season)+'</text>');});out.push('</svg></div>');return out.join("");
  }

  function collectArrays(object,path,depth,out){
    out=out||[];if(!object||typeof object!=="object"||depth>2)return out;
    Object.keys(object).forEach(function(key){var value=object[key],next=path?path+" · "+human(key):human(key);if(Array.isArray(value)&&value.length>=2&&value.every(function(row){return row&&typeof row==="object"&&!Array.isArray(row);}))out.push({label:next,rows:value});else if(value&&typeof value==="object"&&!Array.isArray(value))collectArrays(value,next,depth+1,out);});return out;
  }
  function genericTable(payload){
    var candidates=collectArrays(payload,"",0,[]).filter(function(candidate){return !/history|caveat|source/i.test(candidate.label);}).map(function(candidate){var keys={};candidate.rows.slice(0,20).forEach(function(row){Object.keys(row).forEach(function(key){var value=row[key];if(value===null||typeof value==="string"||typeof value==="number"||typeof value==="boolean")keys[key]=true;});});candidate.keys=Object.keys(keys).slice(0,7);candidate.score=Math.min(candidate.rows.length,20)*candidate.keys.length;return candidate;}).filter(function(candidate){return candidate.keys.length>=2;}).sort(function(a,b){return b.score-a.score;});
    var best=candidates[0];if(!best)return "";
    return '<div class="hw-source-block"><h4>'+esc(best.label)+'</h4><div class="hw-source-table-wrap"><table class="hw-source-table"><thead><tr>'+best.keys.map(function(key){return '<th>'+esc(human(key))+'</th>';}).join("")+'</tr></thead><tbody>'+best.rows.slice(0,15).map(function(row){return '<tr>'+best.keys.map(function(key){return '<td>'+esc(has(row[key])?valueFormat(key,row[key]):'—')+'</td>';}).join("")+'</tr>';}).join("")+'</tbody></table></div></div>';
  }
  function provenanceBlock(payload){
    var provenance=payload&&payload.provenance;if(!provenance||typeof provenance!=="object")return "";
    var sources=Array.isArray(provenance.sources)?provenance.sources:[],caveats=Array.isArray(provenance.caveats)?provenance.caveats:[];
    return '<div class="hw-source-block"><h4>Provenance and caveats</h4><dl class="hw-source-provenance">'+(provenance.method?'<div><dt>Method</dt><dd>'+esc(provenance.method)+'</dd></div>':'')+(provenance.script?'<div><dt>Script</dt><dd>'+esc(provenance.script)+'</dd></div>':'')+(sources.length?'<div><dt>Sources</dt><dd>'+sources.map(esc).join(' · ')+'</dd></div>':'')+'</dl>'+(caveats.length?'<ul class="hw-source-caveats">'+caveats.slice(0,8).map(function(item){return '<li>'+esc(item)+'</li>';}).join("")+'</ul>':'')+'</div>';
  }
  function sourceDetail(payload){
    var headline=payload&&payload.headline,headlineText=typeof headline==="string"?'<p class="hw-source-headline">'+esc(headline)+'</p>':"";
    return headlineText+metricCards(payload)+comebackHeatmap(payload)+seasonTrend(payload)+genericTable(payload)+provenanceBlock(payload)||'<div class="hw-empty compact">The source file loaded, but no compact scalar or table view could be rendered without inventing a schema.</div>';
  }
  function loadSource(record){
    var path=record.sourceJson;
    if(!state.sourceCache[path])state.sourceCache[path]=fetchJSON(path).catch(function(error){return {_load_error:error.message};});
    state.sourceCache[path].then(function(payload){if(!state.selected||state.selected.id!==record.id)return;var target=$("research-source-detail");if(!target)return;if(payload&&payload._load_error)target.innerHTML='<div class="hw-empty compact">The published source file could not be loaded: '+esc(payload._load_error)+'</div>';else target.innerHTML=sourceDetail(payload);});
  }

  function selectRecord(id,scroll){
    var record=state.records.find(function(candidate){return candidate.id===id;});if(!record)return;state.selected=record;renderBoard();renderInspector(record);renderViz();
    if(record.slug&&history&&history.replaceState){var params=new URLSearchParams(location.search);params.set("dive",record.slug);history.replaceState(null,"","?"+params.toString());}
    if(scroll&&window.innerWidth<980)$("research-inspector").scrollIntoView({behavior:"smooth",block:"start"});
  }

  function extent(values,includeZero){var valid=values.filter(function(value){return num(value)!==null;});if(!valid.length)return [0,1];var min=Math.min.apply(null,valid),max=Math.max.apply(null,valid);if(includeZero){min=Math.min(min,0);max=Math.max(max,0);}if(min===max){min-=1;max+=1;}var pad=(max-min)*.1;return [min-pad,max+pad];}
  function scale(value,domain,range){return range[0]+(value-domain[0])/(domain[1]-domain[0])*(range[1]-range[0]);}
  function sampleScatter(records){
    var points=records.filter(function(record){return record.n!==null&&record.n>0&&record.nDelta!==null;}).map(function(record){return {record:record,x:Math.log10(record.n),y:record.nDelta};});
    if(!points.length)return '<div class="hw-empty">No dives publish both a current sample and sample movement.</div>';
    var width=820,height=285,left=62,right=22,top=18,bottom=42,xd=extent(points.map(function(point){return point.x;}),false),yd=extent(points.map(function(point){return point.y;}),true),sx=function(value){return scale(value,xd,[left,width-right]);},sy=function(value){return scale(value,yd,[height-bottom,top]);},out=['<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Research sample size versus sample movement">'];
    [0,.25,.5,.75,1].forEach(function(q){var xv=xd[0]+q*(xd[1]-xd[0]),yv=yd[0]+q*(yd[1]-yd[0]),x=sx(xv),y=sy(yv);out.push('<line class="grid" x1="'+x+'" y1="'+top+'" x2="'+x+'" y2="'+(height-bottom)+'"></line><line class="grid" x1="'+left+'" y1="'+y+'" x2="'+(width-right)+'" y2="'+y+'"></line><text class="axis-label" x="'+x+'" y="'+(height-15)+'" text-anchor="middle">'+esc(Math.round(Math.pow(10,xv)).toLocaleString())+'</text><text class="axis-label" x="'+(left-7)+'" y="'+(y+3)+'" text-anchor="end">'+esc(signed(yv,0))+'</text>');});
    if(yd[0]<0&&yd[1]>0){var zero=sy(0);out.push('<line class="zero" x1="'+left+'" y1="'+zero+'" x2="'+(width-right)+'" y2="'+zero+'"></line>');}
    points.forEach(function(point){var selected=state.selected&&state.selected.id===point.record.id,klass=point.y>0?"up":point.y<0?"down":"flat",radius=Math.max(3,Math.min(7,3+Math.log10(point.record.n)/2));out.push('<g class="research-point '+klass+(selected?' selected':'')+'" data-viz-record="'+esc(point.record.id)+'"><circle cx="'+sx(point.x).toFixed(1)+'" cy="'+sy(point.y).toFixed(1)+'" r="'+radius.toFixed(1)+'"><title>'+esc(point.record.title+' · n '+point.record.n.toLocaleString()+' · Δ '+signed(point.record.nDelta,0))+'</title></circle><text x="'+(sx(point.x)+7).toFixed(1)+'" y="'+(sy(point.y)+3).toFixed(1)+'">'+esc(point.record.slug||truncate(point.record.title,12))+'</text></g>');});
    out.push('<text class="axis-label" x="'+((left+width-right)/2)+'" y="'+(height-2)+'" text-anchor="middle">Published sample (log scale)</text><text class="axis-label" x="14" y="'+((top+height-bottom)/2)+'" transform="rotate(-90 14 '+((top+height-bottom)/2)+')" text-anchor="middle">Sample movement</text></svg>');return out.join("");
  }
  function barView(records,key,label){
    var counts={};records.forEach(function(record){var value=key(record)||"Not published";counts[value]=(counts[value]||0)+1;});var entries=Object.keys(counts).map(function(name){return {name:name,count:counts[name]};}).sort(function(a,b){return b.count-a.count||a.name.localeCompare(b.name);}),max=entries.length?entries[0].count:1;
    return '<div class="hw-research-bars">'+entries.map(function(entry){return '<div class="hw-research-bar"><span>'+esc(entry.name)+'</span><div><i style="width:'+(entry.count/max*100).toFixed(1)+'%"></i></div><strong>'+entry.count+'</strong></div>';}).join("")+'</div><div class="hw-data-note">'+esc(label)+'</div>';
  }
  function renderViz(){
    var html,context;
    if(state.viz==="outcomes"){html=barView(state.records,function(record){return record.decision.label;},"Counts repeat explicit source-language decisions; they are not re-graded here.");context="Decision mix across the complete research ledger";}
    else if(state.viz==="sources"){html=barView(state.records,function(record){return record.source;},"Evidence-source coverage across published dives and research records.");context="Research coverage by evidence source";}
    else{html=sampleScatter(state.records);context="Published sample size versus sample movement";}
    $("research-viz-context").textContent=context;$("research-viz").innerHTML=html;
    qa("[data-viz-record]").forEach(function(node){node.addEventListener("click",function(){selectRecord(node.getAttribute("data-viz-record"),true);});});
    qa("[data-research-viz]").forEach(function(button){var active=button.getAttribute("data-research-viz")===state.viz;button.classList.toggle("active",active);button.setAttribute("aria-selected",active?"true":"false");});
  }

  function watchRow(record,value,note){return '<button type="button" class="hw-research-watch-row" data-select-research="'+esc(record.id)+'"><div><strong>'+esc(record.title)+'</strong><small>'+esc(note)+'</small></div><span>'+esc(value)+'</span></button>';}
  function renderWatch(){
    var movers=state.records.filter(function(record){return record.nDelta!==null;}).sort(function(a,b){return Math.abs(b.nDelta)-Math.abs(a.nDelta);}).slice(0,9),negative=state.records.filter(function(record){return record.decision.key==="no-promote";}).sort(function(a,b){return (dateObj(b.asOf)||0)-(dateObj(a.asOf)||0);}).slice(0,9);
    $("research-sample-moves").innerHTML=movers.map(function(record){return watchRow(record,deltaText(record),(record.n===null?'sample not published':'n '+record.n.toLocaleString())+' · '+record.source);}).join("")||'<div class="hw-empty compact">No sample movement was published.</div>';
    $("research-no-promote").innerHTML=negative.map(function(record){return watchRow(record,"No promote",truncate(record.conclusion,95));}).join("")||'<div class="hw-empty compact">No explicit no-promote result was published.</div>';
    qa(".hw-research-watch-row[data-select-research]").forEach(function(button){button.addEventListener("click",function(){selectRecord(button.getAttribute("data-select-research"),true);});});
  }

  function populateFilters(){
    var sources={},decisions={};state.records.forEach(function(record){sources[record.source]=true;decisions[record.decision.key]=record.decision.label;});
    $("research-source").innerHTML='<option value="">All sources</option>'+Object.keys(sources).sort().map(function(source){return '<option value="'+esc(source)+'">'+esc(source)+'</option>';}).join("");
    $("research-verdict").innerHTML='<option value="">All decisions</option>'+Object.keys(decisions).sort(function(a,b){return decisions[a].localeCompare(decisions[b]);}).map(function(key){return '<option value="'+esc(key)+'">'+esc(decisions[key])+'</option>';}).join("");
  }
  function setFreshness(indexPayload,ledgerPayload){
    var stamps=[indexPayload&&indexPayload.generated_utc,ledgerPayload&&ledgerPayload.generated_utc].map(dateObj).filter(Boolean).sort(function(a,b){return b-a;}),newest=stamps[0];qa("[data-fresh]").forEach(function(element){element.innerHTML='<span class="hw-fresh-dot"></span>'+(newest?'Updated '+ageText(newest.toISOString()):'Build time not published');element.classList.toggle("warn",!newest);});
  }
  function bind(){
    ["research-source","research-verdict","research-sample","research-kind","research-sort"].forEach(function(id){$(id).addEventListener("change",function(){renderBoard();});});
    $("research-search").addEventListener("input",renderBoard);
    $("research-reset").addEventListener("click",function(){["research-search","research-source","research-verdict","research-sample","research-kind"].forEach(function(id){$(id).value="";});$("research-sort").value="sample";renderBoard();});
    qa("[data-research-viz]").forEach(function(button){button.addEventListener("click",function(){state.viz=button.getAttribute("data-research-viz");renderViz();});});
  }
  function initialRecord(){
    var requested=new URLSearchParams(location.search).get("dive");if(requested){var found=state.records.find(function(record){return record.slug===requested||record.id===requested;});if(found)return found;}
    return state.records.find(function(record){return record.kind==="dive"&&record.n!==null;})||state.records[0]||null;
  }
  function boot(){
    Promise.all([fetchJSON(FILES.index),fetchJSON(FILES.ledger)]).then(function(payloads){state.payloads={index:payloads[0],ledger:payloads[1]};state.records=mergeResearch(payloads[0],payloads[1]);populateFilters();setFreshness(payloads[0],payloads[1]);bind();renderStories();renderWatch();state.selected=initialRecord();renderBoard();renderInspector(state.selected);renderViz();}).catch(function(error){console.error(error);$("research-body").innerHTML='<tr><td colspan="8"><div class="hw-empty">The research board could not load its published artifacts.</div></td></tr>';$("research-mobile").innerHTML='<div class="hw-empty">The research board could not load its published artifacts.</div>';});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
}());
