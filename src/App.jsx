import React,{useState,useEffect,useMemo,useRef} from "react";
import {LOGO,fmt,AREAS,STEPS,COINS,NOTES} from "./constants.js";
import {api} from "./api.js";
import "./styles.css";
const h=React.createElement;
function Icon({name,size=20}){
 const paths={
  overview:["M3 3h8v8H3z","M13 3h8v8h-8z","M3 13h8v8H3z","M13 13h8v8h-8z"],
  profile:["M20 21a8 8 0 0 0-16 0","M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],
  tasks:["M9 11l2 2 4-4","M5 4h14v17H5z","M9 4V2h6v2"],
  collections:["M4 6h16v15H4z","M4 10h16","M8 15h4"],
  ai:["M12 3l2.1 6.1L20 11l-5.9 2.1L12 19l-2.1-5.9L4 11l5.9-1.9L12 3z","M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z"],
  bell:["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9","M10 21h4"],
  logout:["M10 17l5-5-5-5","M15 12H3","M12 3h8v18h-8"]
 };
 return h("svg",{viewBox:"0 0 24 24",width:size,height:size,fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true"},...(paths[name]||[]).map((d,i)=>h("path",{d,key:i})));
}
/* ======= UI PARTS ======= */
function useF(rows,statusFilter){const[q,setQ]=useState(""),[st,setSt]=useState(""),[city,setCity]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState("");
 const out=rows.filter(r=>Object.values(r).filter(v=>typeof v!=="object").join(" ").toLowerCase().includes(q.trim().toLowerCase())&&(!st||r.status===st)&&(!city||r.city===city)&&(!from||r.date>=from)&&(!to||r.date<=to));
 const opt=(k)=>[...new Set(rows.map(r=>r[k]).filter(Boolean))];
 const ui=h("div",null,h("label",null,"Search records"),h("input",{placeholder:"Search IDs, locations, names...",value:q,onChange:e=>setQ(e.target.value)}),
 h("div",{className:"fl",style:{marginTop:12}},
  statusFilter&&h("div",null,h("label",null,"Status"),h("select",{value:st,onChange:e=>setSt(e.target.value)},h("option",{value:""},"All statuses"),opt("status").map(s=>h("option",{key:s},s)))),
  h("div",null,h("label",null,"City"),h("select",{value:city,onChange:e=>setCity(e.target.value)},h("option",{value:""},"All cities"),opt("city").map(s=>h("option",{key:s},s)))),
  h("div",null,h("label",null,"From"),h("input",{type:"date",value:from,onChange:e=>setFrom(e.target.value)})),
  h("div",null,h("label",null,"To"),h("input",{type:"date",value:to,onChange:e=>setTo(e.target.value)}))));
 return[out,ui]}
function Table({cols,rows,size=5}){const[s,setS]=useState({k:cols[1]?1:0,d:-1}),[p,setP]=useState(0);
 const sorted=useMemo(()=>[...rows].sort((a,b)=>{const c=cols[s.k],x=(c.v||c.g)(a),y=(c.v||c.g)(b);return(x>y?1:x<y?-1:0)*s.d}),[rows,s]);
 const pages=Math.max(1,Math.ceil(rows.length/size)),pp=Math.min(p,pages-1),vis=sorted.slice(pp*size,pp*size+size);
 return h("div",null,h("div",{className:"tw"},h("table",null,h("thead",null,h("tr",null,cols.map((c,i)=>h("th",{key:c.l,onClick:()=>setS({k:i,d:s.k===i?-s.d:1})},c.l+(s.k===i?(s.d>0?"  (ascending)":"  (descending)"):"  (sort)"))))),
 h("tbody",null,vis.map(r=>h("tr",{key:r.id},cols.map(c=>h("td",{key:c.l},c.g(r)))))))),
 h("div",{className:"pg"},h("span",{className:"mut"},rows.length?`Showing ${pp*size+1} to ${pp*size+vis.length} of ${rows.length}`:"No records match these filters."),
  h("button",{className:"btn",disabled:pp<=0,onClick:()=>setP(pp-1)},"Previous"),"Page "+(pp+1)+" / "+pages,h("button",{className:"btn",disabled:pp>=pages-1,onClick:()=>setP(pp+1)},"Next")))}
const Bdg=s=>h("span",{className:"badge"+(/Pending|Progress/.test(s)?" w":"")},s);
const colsC=[{l:"Collection ID",g:c=>c.id},{l:"Date",g:c=>c.date},{l:"Box ID",g:c=>c.box},{l:"Amount",g:c=>fmt(c.amt),v:c=>c.amt},{l:"Status",g:c=>Bdg(c.status)}];
const Head=(t,s,zone="")=>[h("div",{key:1,className:"mut",style:{fontWeight:700}},zone),h("h1",{key:2},t),h("p",{key:3,className:"mut"},s)];
const Stat=(l,v,s)=>h("div",{className:"card stat",key:l},h("span",null,l),h("b",null,v),h("span",null,s));

function Login({run,toast}){const[e,setE]=useState(""),[p,setP]=useState(""),[s,setS]=useState(false),[err,setErr]=useState(""),[b,setB]=useState(false);
 const go=async ev=>{ev.preventDefault();setB(true);try{await run(()=>api.login(e.trim(),p))}catch(x){setErr(x.message)}setB(false)};
 return h("div",{className:"login"},h("form",{className:"card",onSubmit:go,style:{width:"100%",maxWidth:440}},
 h("img",{src:LOGO,alt:"Saylani",style:{height:40}}),h("p",{className:"mut"},"Saylani Sadqa Operations"),h("h1",null,"Sign in"),h("p",{className:"mut"},"Enter your email and password to open the rider workspace."),
 h("label",null,"Email"),h("input",{type:"email",autoComplete:"username",value:e,onChange:x=>setE(x.target.value)}),
 h("label",null,"Password"),h("div",{style:{display:"flex",gap:8}},h("input",{type:s?"text":"password",autoComplete:"current-password",value:p,onChange:x=>setP(x.target.value)}),h("button",{type:"button",className:"btn",onClick:()=>setS(!s)},s?"Hide":"Show")),
 err&&h("div",{className:"err"},err),h("p",null,h("button",{className:"pri",style:{width:"100%"},disabled:b},b?"Signing in...":"Sign in")),
 h("p",{className:"mut",style:{fontSize:13}},"Sign in with your assigned Saylani Rider account.")))}

function Overview({S,go}){const T=S.tasks,open=T.filter(t=>t.status!=="Completed").length,done=T.length-open,P=2*Math.PI*60,[r,ui]=useF(T,true);
 return h("div",{className:"col"},...Head("Salaam, "+S.profile.full_name,"Your assigned tasks, box visits, and collection history in one place.",S.profile.assigned_zone),
 h("div",{className:"stats"},Stat("My open tasks",open,"Assigned or in progress"),Stat("Tasks completed",done,Math.round(done/(T.length||1)*100)+"% of all assigned tasks"),Stat("Active boxes",S.summary.activeBoxes,"Currently assigned to you"),Stat("Recorded collections",fmt(S.cols.reduce((a,c)=>a+c.amt,0)),S.cols.length+" collection records")),
 h("div",{className:"two"},
  h("div",{className:"card"},h("h2",null,"My task status"),h("p",{className:"mut"},T.length+" tasks assigned to you."),
   h("svg",{className:"ring",width:190,height:190,viewBox:"0 0 160 160"},h("circle",{cx:80,cy:80,r:60,fill:"none",stroke:"#2a6a33",strokeWidth:20}),h("circle",{cx:80,cy:80,r:60,fill:"none",stroke:"#8cc152",strokeWidth:20,strokeDasharray:`${done/T.length*P} ${P}`,transform:"rotate(-90 80 80)"}),h("text",{x:80,y:82,textAnchor:"middle",fontSize:28,fontWeight:700,fill:"currentColor"},T.length),h("text",{x:80,y:100,textAnchor:"middle",fontSize:10,fill:"currentColor"},"records")),
   h("div",{className:"pill"},"In progress",h("i",null,open)),h("div",{className:"pill"},"Completed",h("i",null,done))),
  h("div",{className:"card"},h("h2",null,"Next steps"),h("p",{className:"mut"},"Your rider workspace is personal to your account."),
   h("div",{className:"pill lk",onClick:()=>go("tasks")},h("span",null,"Review my tasks"),h("i",null,">")),h("div",{className:"pill lk",onClick:()=>go("cols")},h("span",null,"View my collections"),h("i",null,">")),
   h("div",{className:"pill",style:{background:"var(--soft)",display:"block"}},h("div",{className:"mut",style:{fontSize:12}},"Your assignment"),S.profile.assigned_zone,h("div",{className:"mut",style:{fontWeight:400,fontSize:14}},"Rider status: "+S.profile.employment_status)))),
 h("div",{className:"card"},h("h2",null,"My assigned tasks"),h("p",{className:"mut"},"Tasks assigned to your rider account. "+r.length+" records"),ui,
  h(Table,{rows:r,cols:[{l:"Task ID",g:t=>t.id},{l:"Date",g:t=>t.date},{l:"Task type",g:t=>t.type},{l:"Box ID",g:t=>t.box},{l:"Status",g:t=>Bdg(t.status)}]})))}

function TaskCard({t,run,toast,conditionEnabled}){
 const[open,setOpen]=useState(false),[q,setQ]=useState({}),[ok,setOk]=useState(false),[why,setWhy]=useState(""),[busy,setBusy]=useState(false);
 const[conditionOpen,setConditionOpen]=useState(false),[conditionStatus,setConditionStatus]=useState(t.boxCondition||""),[conditionNote,setConditionNote]=useState(t.boxConditionNote||"");
 const coll=t.type==="Scheduled Collection",done=t.status==="Completed",cancelled=t.status==="Cancelled";
 const n=(p,L)=>L.reduce((a,d)=>a+d*(+q[p+d]||0),0),coins=n("c",COINS),notes=n("n",NOTES),tot=coins+notes;
 const labels=coll?STEPS:["Assigned","On the way","Arrived","Completed"],stage=coll?Math.min(t.stage,4):(done?3:Math.min(t.stage,2));
 const act=async(f,m)=>{setBusy(true);try{await run(f);toast(m)}catch(e){toast(e.message)}finally{setBusy(false)}};
 const Den=(k,d,l)=>h("div",{className:"den",key:k},h("b",null,l),h("input",{type:"number",min:0,inputMode:"numeric",placeholder:"0",value:q[k]||"",onChange:e=>setQ({...q,[k]:Math.max(0,Math.floor(+e.target.value||0))||""})}),h("div",{className:"mut",style:{fontSize:12,marginTop:4}},fmt(d*(+q[k]||0))));
 const canProgress=!done&&!cancelled&&(t.status==="Skipped"?t.stage<=(coll?3:2):t.stage<(coll?3:2));
 const progressTarget=t.status==="Skipped"?t.stage:t.stage+1;
 const progressLabel=t.status==="Skipped"?`Resume ${labels[progressTarget]?.toLowerCase()||"task"}`:progressTarget===1?"Mark On the way":progressTarget===2?"Mark Arrived":"Start cash count";
 const canComplete=!done&&!cancelled&&!coll&&t.stage>=2;
 return h("div",{className:"card task-card"},
  h("div",{className:"mut",style:{fontSize:13}},t.id+" - "+t.date),h("h2",null,t.type+" - "+t.box),h("div",{className:"mut"},t.loc),
  done&&(t.amt?h("p",null,"Collected "+fmt(t.amt)+" - "+t.note):t.note&&h("p",null,t.note)),
  Bdg(done?"Completed":cancelled?"Cancelled":t.status==="Skipped"?"Skipped":STEPS[Math.min(t.stage,STEPS.length-1)]),
  h("section",{className:"timeline"},h("h3",null,"Task timeline"),h("div",{className:"steps"},labels.map((label,index)=>h("div",{key:label,className:"timeline-step"},h("div",{className:"dot"+(done||index<stage?" on":index===stage?" cu":"")},done||index<stage?"OK":index+1),h("span",null,label)))),
   canProgress&&h("button",{className:"pri timeline-action",disabled:busy,onClick:()=>act(()=>api.advance(t.id,progressTarget),progressLabel)},progressLabel)),
  h("section",{className:"condition-panel"},h("div",{className:"condition-heading"},h("div",null,h("b",null,"Box condition"),h("div",{className:"mut"},conditionEnabled?(t.boxCondition?"Reported as "+t.boxCondition:"Not reported yet"):"Waiting for database setup")),
   conditionEnabled&&!cancelled&&h("button",{className:"btn",onClick:()=>{if(!conditionOpen){setConditionStatus(t.boxCondition||"");setConditionNote(t.boxConditionNote||"")}setConditionOpen(!conditionOpen)}},conditionOpen?"Close":t.boxCondition?"Update report":"Report condition")),
   !conditionEnabled&&h("p",{className:"mut",style:{fontSize:13,marginBottom:0}},"Apply the box-condition database migration to enable reports."),
   conditionEnabled&&conditionOpen&&!cancelled&&h("div",null,h("label",null,"Condition"),h("select",{value:conditionStatus,onChange:e=>setConditionStatus(e.target.value)},h("option",{value:""},"Choose box condition"),h("option",{value:"Fresh"},"Fresh"),h("option",{value:"Damaged"},"Damaged")),
    h("label",null,conditionStatus==="Damaged"?"Damage details (required)":"Notes (optional)"),h("input",{maxLength:500,placeholder:conditionStatus==="Damaged"?"Describe the damage":"Add a condition note",value:conditionNote,onChange:e=>setConditionNote(e.target.value)}),
    h("button",{className:"pri",disabled:busy||!conditionStatus||(conditionStatus==="Damaged"&&!conditionNote.trim()),onClick:()=>act(()=>api.condition(t.id,conditionStatus,conditionNote.trim()),"Box condition saved")},busy?"Saving...":"Save box condition"))),
  !done&&((coll&&t.stage===3&&t.status==="In Progress")||(!coll&&t.stage>=2))&&h("div",{className:"task-actions"},
   coll&&h("div",null,h("h3",null,"Coins - enter quantity"),h("div",{className:"grid"},COINS.map(d=>Den("c"+d,d,"Rs "+d))),h("h3",null,"Notes - enter quantity"),h("div",{className:"grid"},NOTES.map(d=>Den("n"+d,d,"Rs "+d.toLocaleString()))),
    h("div",{className:"tot"},h("div",null,"Calculated total",h("div",{style:{fontSize:12,opacity:.85}},"Coins "+fmt(coins)+" - Notes "+fmt(notes))),h("b",null,fmt(tot))),
    h("label",{style:{display:"flex",gap:10,fontWeight:400}},h("input",{type:"checkbox",style:{width:22,flex:"none"},checked:ok,onChange:e=>setOk(e.target.checked)}),"I have checked the coin and note quantities and confirm this cash count."),
    h("button",{className:"pri",disabled:!ok||!tot||busy,onClick:()=>act(()=>api.submit(t.id,Object.fromEntries([...COINS.map(d=>["coin_"+d,+q["c"+d]||0]),...NOTES.map(d=>["note_"+d,+q["n"+d]||0])])),"Collection submitted")},"Confirm & submit collection")),
   !coll&&h("div",null,h("label",null,"Visit note / reason for skipping"),h("input",{placeholder:"Location issue, shop closed, or visit note",value:why,onChange:e=>setWhy(e.target.value)}),
    h("button",{className:"btn",disabled:busy,onClick:()=>act(()=>api.complete(t.id,why.trim()),"Visit completed")},"Mark visit complete")),
   h("div",null,h("label",null,"Reason for skipping (optional)"),h("input",{placeholder:"Add a reason if the visit cannot continue",value:why,onChange:e=>setWhy(e.target.value)}),
    h("button",{className:"btn",disabled:!why.trim()||busy,onClick:()=>act(()=>api.skip(t.id,why.trim()),"Task skipped")},"Skip task"))),
  h("p",null,h("a",{href:"#",onClick:e=>{e.preventDefault();setOpen(!open)},style:{color:"var(--mut)"}},(open?"Hide":"Show")+" visit history")),
  open&&h("div",{className:"mut timeline-history"},t.log.length?t.log.map((event,i)=>h("div",{key:i},event[0]+" - "+event[1])):"No visit activity recorded yet."))
}
function Tasks({S,run,toast}){const[f,setF]=useState("all"),L=S.tasks.filter(t=>f==="all"||(f==="open")===(t.status!=="Completed"));
 return h("div",{className:"col"},...Head("My Tasks","Update assigned field tasks and submit collections for review."),
 h("div",{className:"tabs"},[["all","All"],["open","Open"],["done","Completed"]].map(([k,l])=>h("button",{key:k,className:"btn"+(f===k?" a":""),onClick:()=>setF(k)},l))),
 h("div",{className:"tasks"},L.map(t=>h(TaskCard,{key:t.id,t,run,toast,conditionEnabled:S.features?.boxConditionReports===true}))),!L.length&&h("p",{className:"mut"},"No tasks in this view."))}

function Cols({S}){const[a,ua]=useF(S.cols,true),[b,ub]=useF(S.logs,false);
 return h("div",{className:"col"},...Head("My Collections","Review collection submissions and field visit logs linked to your rider account."),
 h("div",{className:"card"},h("h2",null,"Cash count receipts"),S.cols.length?h("div",{className:"two"},S.cols.slice(0,6).map(c=>h("div",{className:"pill",key:c.id},c.box+"  -  "+c.date,h("i",null,fmt(c.amt))))):h("p",{className:"mut"},"No receipts yet. Submit a collection from Tasks.")),
 h("div",{className:"two"},
 h("div",{className:"card"},h("h2",null,"My collection records"),h("p",{className:"mut"},"Latest collection entries recorded for your rider account. "+a.length+" records"),ua,h(Table,{rows:a,cols:colsC})),
 h("div",{className:"card"},h("h2",null,"My field visit logs"),h("p",{className:"mut"},"Latest cash count and visit records linked to your rider account. "+b.length+" records"),ub,h(Table,{rows:b,cols:[{l:"Field record",g:c=>c.id},{l:"Date",g:c=>c.date},{l:"Box ID",g:c=>c.box}]}))))}

function Profile({S}){const monthKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`,currentMonth=monthKey(new Date()),[m,setM]=useState(currentMonth),C=S.cols.filter(c=>c.date.startsWith(m)),V=C.filter(c=>c.status==="Verified"),by={};C.forEach(c=>{const area=c.area||AREAS[c.box]||c.box;by[area]=(by[area]||0)+c.amt});
 const months=Array.from({length:12},(_,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);return monthKey(d)});
 const mx=Math.max(1,...Object.values(by)),open=S.tasks.filter(t=>t.status!=="Completed").length,visits=S.tasks.filter(t=>t.status==="Completed"&&t.date.startsWith(m)&&t.type!=="Scheduled Collection").length+new Set(C.map(c=>c.box)).size,sum=l=>l.reduce((a,c)=>a+c.amt,0),[r,ui]=useF(C,false);
 return h("div",{className:"col"},...Head("My Rider Profile","Your contact details, assignments and personal collection history.",S.profile.assigned_zone),
 h("div",{style:{maxWidth:260}},h("label",null,"Collection month"),h("select",{value:m,onChange:e=>setM(e.target.value)},months.map(month=>h("option",{key:month,value:month},new Date(`${month}-01T00:00:00`).toLocaleDateString("en",{month:"long",year:"numeric"}))))),
 h("div",{className:"stats"},Stat("My assigned boxes",S.summary.activeBoxes,"Assigned to you"),Stat("My verified collections",fmt(sum(V)),V.length+" verified  -  "+m),Stat("My month collection",fmt(sum(C)),C.length+" individual records  -  "+m),Stat("My boxes visited",visits,"Collection boxes + completed verification and follow-up visits")),
 h("div",{className:"two"},
  h("div",{className:"card"},h("h2",null,"My collections by area"),Object.keys(by).length?Object.entries(by).map(([k,v])=>h("div",{className:"row",key:k},h("div",{className:"l"},k),h("div",{className:"bw"},h("div",{className:"bar",style:{width:v/mx*100+"%"}})),h("span",null,fmt(v)))):h("p",{className:"mut"},"No collections in this month.")),
  h("div",{className:"card"},h("h2",null,S.profile.full_name),h("div",{className:"mut"},S.profile.assigned_zone),
   [["Rider ID",S.profile.rider_id],["Email",S.profile.email],["Phone",S.profile.phone||"Not set"],["City",S.profile.city_name||"Not set"],["Employment",S.profile.employment_status],["Assigned boxes",S.summary.activeBoxes],["Open tasks (all time)",open],["Completed tasks (all time)",S.tasks.length-open]].map(([k,v])=>h("div",{key:k,style:{margin:"10px 0"}},h("div",{className:"mut",style:{fontSize:13}},k),h("b",null,v))))),
 h("div",{className:"card"},h("h2",null,"My collection history"),h("p",{className:"mut"},"Recorded date, location, amount and verification."),ui,h(Table,{rows:r,cols:colsC})))}

function AI({S}){const[m,setM]=useState([["bot","Ask me about your collections, tasks, boxes or pending verifications."]]),[v,setV]=useState("");
 const ans=q=>{q=q.toLowerCase();const T=S.tasks,open=T.filter(t=>t.status!=="Completed"),tot=S.cols.reduce((a,c)=>a+c.amt,0),pend=S.cols.filter(c=>c.status==="Pending");
  if(/pend|verif/.test(q))return pend.length?`${pend.length} collection(s) pending verification, worth ${fmt(pend.reduce((a,c)=>a+c.amt,0))}.`:"Nothing is pending verification.";
  if(/collect|cash|amount|total/.test(q))return `You have recorded ${fmt(tot)} across ${S.cols.length} collections.`;
  if(/task|open|todo/.test(q))return open.length?`You have ${open.length} open task(s): ${open.map(t=>t.id+" ("+STEPS[t.stage]+")").join(", ")}.`:"You have no open tasks.";
  if(/box/.test(q))return `You have ${S.summary.activeBoxes} active box(es) assigned. Collections so far came from `+([...new Set(S.cols.map(c=>c.box))].join(" and ")||"no boxes yet")+".";
  return "I can answer about collections, tasks, boxes and pending verification."};
 const send=()=>{if(!v.trim())return;setM([...m,["me",v],["bot",ans(v)]]);setV("")};
 return h("div",{className:"col"},...Head("Saylani AI","Ask about your tasks and collections."),
 h("div",{className:"card"},h("div",{className:"chat"},m.map((x,i)=>h("div",{key:i,className:x[0]},x[1]))),
 h("div",{style:{display:"flex",gap:8,marginTop:12}},h("input",{placeholder:"e.g. How much did I collect?",value:v,onChange:e=>setV(e.target.value),onKeyDown:e=>e.key==="Enter"&&send()}),h("button",{className:"pri",onClick:send},"Ask"))))}

function App(){const[S,setS]=useState({session:false}),[tab,setTab]=useState("home"),[tm,setTm]=useState(""),[bell,setBell]=useState(false),[syncLabel,setSyncLabel]=useState("Connecting..."),[syncing,setSyncing]=useState(false),refreshSeq=useRef(0);
 const sync=async()=>{const seq=++refreshSeq.current;setSyncing(true);try{const state=await api.state();if(seq===refreshSeq.current){setS(state);setSyncLabel(`Synced ${new Date().toLocaleTimeString("en-PK",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}`)}}catch{if(seq===refreshSeq.current)setSyncLabel("Connection issue")}finally{if(seq===refreshSeq.current)setSyncing(false)}};
 const run=async f=>{const state=await f();refreshSeq.current++;setS(state);setSyncLabel(`Synced ${new Date().toLocaleTimeString("en-PK",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}`);return state},toast=m=>{setTm(m);setTimeout(()=>setTm(""),3200)},go=t=>{setTab(t);scrollTo(0,0)};
 useEffect(()=>{let live=true;const refresh=async()=>{const seq=++refreshSeq.current;setSyncing(true);try{const state=await api.state();if(live&&seq===refreshSeq.current){setS(state);setSyncLabel(`Synced ${new Date().toLocaleTimeString("en-PK",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}`)}}catch{if(live&&seq===refreshSeq.current)setSyncLabel("Connection issue")}finally{if(live&&seq===refreshSeq.current)setSyncing(false)}};refresh();if(!S.session)return()=>{live=false};const timer=setInterval(refresh,10000),onFocus=()=>refresh(),onVisibility=()=>{if(document.visibilityState==="visible")refresh()};window.addEventListener("focus",onFocus);document.addEventListener("visibilitychange",onVisibility);return()=>{live=false;clearInterval(timer);window.removeEventListener("focus",onFocus);document.removeEventListener("visibilitychange",onVisibility)}},[S.session]);
 if(!S.session)return h("div",null,h(Login,{run,toast}),tm&&h("div",{className:"toast"},tm));
 const un=S.notifs.filter(n=>!n.read).length;
 const V={home:h(Overview,{S,go}),profile:h(Profile,{S}),tasks:h(Tasks,{S,run,toast}),cols:h(Cols,{S}),ai:h(AI,{S})}[tab];
 return h("div",null,h("div",{className:"top"},h("img",{src:LOGO,alt:"Saylani",style:{height:38}}),
  h("div",{className:"r"},h("span",{className:"mut sync-label","aria-live":"polite"},syncLabel),h("button",{className:"btn",disabled:syncing,onClick:sync},syncing?"Syncing...":"Refresh"),h("button",{className:"btn bell","aria-label":"Notifications",title:"Notifications",onClick:()=>{setBell(!bell);if(!bell&&un)run(api.readAll)}},h(Icon,{name:"bell"}),un>0&&h("i",null,un)),
   bell&&h("div",{className:"pop"},S.notifs.length?S.notifs.map(n=>h("div",{key:n.id,className:n.read?"":"un"},n.text,h("small",null,n.time))):h("div",null,"No notifications.")),
   h("button",{className:"btn logout",onClick:()=>run(api.logout)},h(Icon,{name:"logout",size:18}),h("span",null,"Sign out")))),
  h("main",{onClick:()=>bell&&setBell(false)},V),
  h("nav",null,[["home","overview","Overview"],["profile","profile","Profile"],["tasks","tasks","Tasks"],["cols","collections","Collections"],["ai","ai","Saylani AI"]].map(([key,icon,label])=>h("button",{key,className:tab===key?"a":"",onClick:()=>go(key),"aria-current":tab===key?"page":undefined},h(Icon,{name:icon,size:24}),h("span",null,label)))),
  tm&&h("div",{className:"toast"},tm))}
function Root(){const[ph,setPh]=useState(0);useEffect(()=>{const a=setTimeout(()=>setPh(1),1700),b=setTimeout(()=>setPh(2),2200);return()=>{clearTimeout(a);clearTimeout(b)}},[]);
 return h(React.Fragment,null,h(App),ph<2&&h("div",{className:"splash"+(ph?" o":"")},h("img",{src:LOGO,alt:"Saylani"}),h("p",null,"Saylani Sadqa Operations"),h("div",{className:"sp"})))}
export default Root;
