const rhythms = {
  nsr: {name:'Normal sinus rhythm', mode:'nsr', note:'Physiological forward conduction only: SA node → atria → AV node → His-Purkinje → ventricles.'},
  af: {name:'Atrial fibrillation', mode:'af', note:'No organized P waves and no single forward SA-led atrial sweep. Atrial activity is chaotic; ventricular response is irregular.'},
  flutter: {name:'Atrial flutter', mode:'flutter', note:'Atrial macro-reentry is shown as a right-atrial flutter loop. There is no reverse conduction back into the SA node.'},
  sa1: {name:'First-degree SA block', mode:'sa1', note:'This is generally not identifiable on a surface ECG. Display remains sinus-like with a note of delayed SA exit; no backward conduction is shown.'},
  sa2: {name:'Second-degree SA block / SA exit block', mode:'sa2', note:'Intermittent failure of sinus impulse exit produces a dropped cycle and pause. No reverse conduction is shown.'},
  sa3: {name:'Third-degree SA block / sinus arrest', mode:'sa3', note:'Loss of sinus output produces a pause; a simplified escape ventricular beat may appear. No backward conduction is shown.'},
  av1: {name:'First-degree AV block', mode:'av1', note:'All atrial impulses conduct, but AV delay is prolonged. Forward conduction only.'},
  mobitz1: {name:'Second-degree AV block: Mobitz I', mode:'mobitz1', note:'Progressive AV delay with a dropped ventricular beat. Forward conduction only; the blocked beat stops at the AV node.'},
  mobitz2: {name:'Second-degree AV block: Mobitz II', mode:'mobitz2', note:'Fixed PR relationship in conducted beats with sudden dropped ventricular activation. The blocked beat stops at the AV node.'},
  av2to1: {name:'2:1 AV block', mode:'av2to1', note:'Every other atrial impulse is blocked at the AV node. No reverse conduction is shown.'},
  av3: {name:'Third-degree AV block', mode:'av3', note:'Complete AV dissociation. Atria and ventricles depolarize independently; no backward conduction is shown.'},
  rbbb: {name:'Right bundle branch block', mode:'rbbb', note:'Forward conduction reaches the bundle branches, but right ventricular activation is delayed.'},
  lbbb: {name:'Left bundle branch block', mode:'lbbb', note:'Forward conduction reaches the bundle branches, but left ventricular activation is delayed.'},
  lvh: {name:'Left ventricular hypertrophy', mode:'lvh', note:'QRS voltage is increased and LV wall thickening is highlighted. Forward conduction remains physiological.'}
};
const phaseCards = [
  {id:'p', name:'P wave', start:.08, end:.22, short:'Atrial depolarization', electrical:'Electrical activation spreads across the atria from the sinus node through atrial tissue and Bachmann bundle.', mechanical:'Atrial contraction follows and contributes the final component of ventricular filling.', pathology:'P-wave morphology helps identify atrial rhythm and atrial enlargement.'},
  {id:'pr', name:'PR segment', start:.22, end:.34, short:'AV nodal delay', electrical:'Conduction slows through the AV node before reaching the His bundle.', mechanical:'This delay allows ventricular filling before ventricular systole begins.', pathology:'A prolonged PR interval suggests AV nodal or His conduction delay.'},
  {id:'qrs', name:'QRS complex', start:.34, end:.48, short:'Ventricular depolarization', electrical:'Rapid conduction through His-Purkinje activates the ventricles.', mechanical:'Ventricular contraction begins immediately after depolarization.', pathology:'Wide QRS suggests delayed intraventricular conduction or ventricular origin.'},
  {id:'st', name:'ST segment', start:.48, end:.68, short:'Ventricular systole', electrical:'Most ventricular myocardium remains depolarized during the plateau phase.', mechanical:'The ventricles remain contracted during ejection.', pathology:'ST elevation or depression can reflect acute injury or ischemia in the right context.'},
  {id:'t', name:'T wave', start:.68, end:.88, short:'Ventricular repolarization', electrical:'The ventricles repolarize.', mechanical:'Ventricles relax and enter diastole.', pathology:'T-wave changes may be due to ischemia, electrolyte disturbance, or repolarization abnormality.'},
  {id:'tp', name:'TP segment', start:.88, end:1, short:'Electrical baseline', electrical:'The myocardium is electrically quiet between cycles.', mechanical:'Passive filling continues in diastole.', pathology:'The TP segment is the usual baseline reference.'}
];
let progress=.02, totalProgress=.02, playing=true, heartRate=75, rhythm='nsr', last=null;
const ecgBaseVisibleBeats=3.2, ecgCursorFrac=.72, ecgWidth=920; let ecgPaperSpeed=25, quizPaperSpeed=25, ecgPathCacheRhythm=null, ecgPathCacheSpeed=25, ecgPathCacheD='';
function ecgVisibleBeats(){return ecgBaseVisibleBeats*(25/ecgPaperSpeed);}
function ecgBeatWidth(){return ecgWidth/ecgVisibleBeats();}
let uploadedImageLoaded=false, uploadedImageName='', lastAnalysis=null, lastTimelinePhaseId=null;
const ecgLabelDefs=[{key:'P',phase:.15,y:58},{key:'PR',phase:.28,y:170},{key:'QRS',phase:.41,y:36},{key:'ST',phase:.58,y:170},{key:'T',phase:.78,y:50}];
const clamp01=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{const t=clamp01(v);return t*t*(3-2*t)};
const seg=(p,s,e)=>smooth((p-s)/(e-s));
const gate=(p,s,e)=>p>=s&&p<e?1:0;
const bell=(p,s,m,e)=>{if(p<=s||p>=e)return 0;return p<=m?smooth((p-s)/(m-s)):smooth(1-(p-m)/(e-m));};
const wrapSeg=(p,s,e)=>{if(s<=e)return smooth((p-s)/(e-s));const span=1-s+e;const val=p>=s?(p-s)/span:(p+1-s)/span;return smooth(val)};
const rgba=(r,g,b,a)=>`rgba(${r}, ${g}, ${b}, ${clamp01(a)})`;
function g(t,c,s,m){return m*Math.exp(-Math.pow((t-c)/s,2));}
function beatY(t,pC,qC,tC,opts={}){let y=0;const pAmp=opts.pAmp??18,rAmp=opts.rAmp??80,wide=opts.wide??1,tAmp=opts.tAmp??32;if(pC!==null)y-=g(t,pC,.030,pAmp);if(qC!==null){y+=g(t,qC-.038*wide,.016*wide,16);y-=g(t,qC,.014*wide,rAmp);y+=g(t,qC+.038*wide,.017*wide,30);}if(tC!==null)y-=g(t,tC,.065,Math.abs(tAmp));if(tAmp<0&&tC!==null)y+=g(t,tC,.065,Math.abs(tAmp)*2);return y;}
function flutterWave(t){return ((t*6)%1)*24 - 12;}
function ecgY(t){const mode=rhythms[rhythm].mode;let y=112;if(mode==='nsr'||mode==='sa1')return y+beatY(t,.15,.37,.75);if(mode==='av1')return y+beatY(t,.11,.46,.78);if(mode==='rbbb')return y+beatY(t,.15,.36,.76,{wide:1.9,rAmp:72})-g(t,.43,.010,34);if(mode==='lbbb')return y+beatY(t,.15,.40,.78,{wide:2.2,rAmp:70})-g(t,.46,.014,20);if(mode==='lvh')return y+beatY(t,.14,.36,.73,{rAmp:112,tAmp:-18});if(mode==='af'){y+=Math.sin(t*95)*4+Math.sin(t*161)*2;[.18,.43,.71,.91].forEach((q,i)=>{y+=beatY(t,null,q,q+.22,{rAmp:i===1?82:70});});return y;}if(mode==='flutter'){y+=flutterWave(t);[.31,.70].forEach(q=>{y+=beatY(t,null,q,q+.20,{rAmp:74});});return y;}if(mode==='sa2'){if(t<.58)return y+beatY(t,.12,.32,.58);return y;}if(mode==='sa3'){if(t>.78)return y+beatY(t,null,.86,null,{rAmp:52,wide:1.4});return y;}if(mode==='mobitz1')return y+beatY(t,.08,.23,.42,{rAmp:66})+beatY(t,.34,.54,.73,{rAmp:66})-g(t,.62,.030,16);if(mode==='mobitz2')return y+beatY(t,.10,.28,.49,{rAmp:68})-g(t,.48,.030,16)+beatY(t,.74,.90,null,{rAmp:68});if(mode==='av2to1')return y-g(t,.12,.030,17)+beatY(t,.38,.56,.76,{rAmp:70})-g(t,.68,.030,17);if(mode==='av3')return y-g(t,.12,.030,16)-g(t,.37,.030,16)-g(t,.62,.030,16)-g(t,.87,.030,16)+beatY(t,null,.32,.54,{rAmp:54,wide:1.7})+beatY(t,null,.82,null,{rAmp:52,wide:1.7});return y+beatY(t,.15,.37,.75);}
function phaseFromTotal(v){const m=v%1; return m<0?m+1:m;}
function rebuildEcgPathCache(){
  const pts=[];
  const minX=-ecgWidth, maxX=ecgWidth*2.4;
  for(let x=minX;x<=maxX;x+=2){
    const t=phaseFromTotal(x/ecgBeatWidth());
    pts.push(`${x.toFixed(1)},${ecgY(t).toFixed(1)}`);
  }
  ecgPathCacheD='M '+pts.join(' L ');
  ecgPathCacheRhythm=rhythm;
  ecgPathCacheSpeed=ecgPaperSpeed;
}
function makeContinuousPath(){
  if(ecgPathCacheRhythm!==rhythm || ecgPathCacheSpeed!==ecgPaperSpeed || !ecgPathCacheD) rebuildEcgPathCache();
  return ecgPathCacheD;
}
function markerXForPhase(phase){const delta=((phase-progress)+1)%1; const signed=delta>.5?delta-1:delta; return ecgWidth*(ecgCursorFrac + signed/ecgVisibleBeats()); }
function currentPhase(){const mode=rhythms[rhythm].mode;if(mode==='af')return {name:'Fibrillatory baseline',short:'Chaotic atrial activity',electrical:'Atrial activity is chaotic and does not follow a single physiological SA-node conduction sweep.',mechanical:'There is no effective coordinated atrial contraction; ventricular timing is irregular.',pathology:'No discrete P waves and irregularly irregular RR intervals are classic.'};if(mode==='flutter')return {name:'Flutter waves',short:'Atrial macro-reentry',electrical:'A macro-reentry circuit repeatedly depolarizes the atrium. Conduction to the ventricles occurs through the AV node.',mechanical:'Atrial contraction is rapid and inefficient; ventricular response depends on AV conduction ratio.',pathology:'Typical flutter often produces sawtooth F waves.'};if(mode==='sa3')return {name:'Sinus pause / escape',short:'Absent sinus output',electrical:'Normal sinus depolarization is absent during the pause; a slower escape focus may appear.',mechanical:'Atrial contraction is absent during the pause; a late ventricular escape beat may occur.',pathology:'Pauses may produce presyncope or syncope.'};return phaseCards.find(ph=>progress>=ph.start&&progress<ph.end)||phaseCards[0];}
function activityBell(times,width=.045){return Math.max(0,...times.map(t=>bell(progress,t-width,t,t+width)));}
const flowMirrors={
  condPurkinjeR:['condPurkinjeR2','condPurkinjeR3','condPurkinjeR4'],
  condPurkinjeL:['condPurkinjeL2','condPurkinjeL3','condPurkinjeL4']
};
function setFill(id, progressValue, active=true){
  const p=clamp01(progressValue);
  [id,...(flowMirrors[id]||[])].forEach(flowId=>{
    const el=document.getElementById(flowId);
    if(!el)return;
    el.setAttribute('stroke-dasharray',`${Math.max(p*100,.01)} ${100}`);
    el.setAttribute('stroke-dashoffset','0');
    el.style.opacity = active && p>0 ? 1 : 0;
  });
}
function setAtrialFill(progressValue,active=true){
  ['condAnterior','condMiddle','condPosterior','condBachmann'].forEach(id=>setFill(id,progressValue,active));
}
function setVentricularFill(rightProgress,leftProgress=rightProgress,active=true){
  ['condTreeR1','condTreeR2','condTreeR3','condTreeR4'].forEach(id=>setFill(id,rightProgress,active));
  ['condTreeL1','condTreeL2','condTreeL3','condTreeL4'].forEach(id=>setFill(id,leftProgress,active));
}
function clearFlows(){
  ['condAnterior','condMiddle','condPosterior','condBachmann','condHis','condRBB','condLBB','condPurkinjeR','condPurkinjeL','condTreeR1','condTreeR2','condTreeR3','condTreeR4','condTreeL1','condTreeL2','condTreeL3','condTreeL4'].forEach(id=>setFill(id,0,false));
}
const ventricularCascadeEnd={nsr:.58,lvh:.58,sa1:.70,sa2:.62,av1:.74,rbbb:.86,lbbb:.88};
function fillWindow(start,end,holdUntil=1){
  // The ventricular tree remains electrically joined behind its advancing front,
  // so AV node → His → bundle branches → Purkinje fibres reads as one continuous route.
  if(progress<start) return 0;
  const cascadeEnd=ventricularCascadeEnd[rhythms[rhythm].mode] ?? holdUntil;
  if(progress>=end) return start>=.34 && progress<cascadeEnd ? 1 : 0;
  return smooth((progress-start)/(end-start));
}
function beatFill(center,width=.055){
  if(progress<center-width || progress>center+width) return 0;
  return smooth((progress-(center-width))/(width*2));
}
function maxVal(vals){ return Math.max(0,...vals); }
function setOpacity(id,val){document.getElementById(id).style.opacity=val;}
function scaleAbout(cx,cy,s){return `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`;}
function updateEcg(){
  const path=makeContinuousPath();
  const ecgPath=document.getElementById('ecgPath');
  const ecgShadow=document.getElementById('ecgShadow');
  if(ecgPath.getAttribute('d')!==path){ecgPath.setAttribute('d',path);ecgShadow.setAttribute('d',path);}
  const x=ecgWidth*ecgCursorFrac,y=ecgY(progress);
  const tx=x-(2+progress)*ecgBeatWidth();
  ecgPath.setAttribute('transform',`translate(${tx.toFixed(2)},0)`);
  ecgShadow.setAttribute('transform',`translate(${tx.toFixed(2)},0)`);
  document.getElementById('cursorLine').setAttribute('x1',x);
  document.getElementById('cursorLine').setAttribute('x2',x);
  document.getElementById('cursorDot').setAttribute('cx',x);
  document.getElementById('cursorDot').setAttribute('cy',y);
  document.getElementById('traceClipRect').setAttribute('width',ecgWidth);
  const markers=[...document.getElementById('ecgMarkers').children];
  ecgLabelDefs.forEach((def,i)=>{const mx=markerXForPhase(def.phase);const el=markers[i]; if(!el) return; el.setAttribute('x',mx); el.setAttribute('y',def.y); el.style.opacity=(mx>35&&mx<ecgWidth-35)?1:0;});
}
function updateHeart(){
  const mode=rhythms[rhythm].mode;
  let atrial=bell(progress,.08,.17,.30), av=gate(progress,.22,.34), his=seg(progress,.34,.39), branch=seg(progress,.39,.44), purk=seg(progress,.44,.48), repol=seg(progress,.68,.88), atrC=bell(progress,.18,.25,.34), ventC=bell(progress,.41,.58,.84), filling=wrapSeg(progress,.88,.18), avInflow=wrapSeg(progress,.12,.42);
  let blockAV=0, blockR=0, blockL=0, flutterLoop=0, lvh=0;

  if(mode==='af'){
    atrial=0; av=activityBell([.18,.43,.71,.91],.035); his=av; branch=av; purk=av; atrC=.10; ventC=activityBell([.18,.43,.71,.91],.055); repol=activityBell([.38,.63,.89],.08);
  }
  if(mode==='flutter'){
    atrial=0; flutterLoop=.95; av=activityBell([.31,.70],.04); his=av; branch=av; purk=av; atrC=.15+Math.abs(Math.sin(progress*Math.PI*6))*.18; ventC=activityBell([.31,.70],.06); repol=activityBell([.52,.90],.08);
  }
  if(mode==='sa1'){
    atrial=bell(progress,.10,.19,.32); av=gate(progress,.24,.38); his=seg(progress,.38,.43); branch=seg(progress,.43,.48); purk=seg(progress,.48,.53); atrC=bell(progress,.20,.28,.36); ventC=bell(progress,.45,.60,.85);
  }
  if(mode==='sa2'){
    const active = progress < .56; atrial=active?bell(progress,.10,.19,.32):0; av=active?gate(progress,.24,.36):0; his=active?seg(progress,.36,.41):0; branch=active?seg(progress,.41,.46):0; purk=active?seg(progress,.46,.51):0; atrC=active?bell(progress,.20,.28,.36):0; ventC=active?bell(progress,.44,.58,.82):0; repol=active?seg(progress,.66,.84):0;
  }
  if(mode==='sa3'){
    atrial=0; av=0; his=activityBell([.86],.05); branch=his; purk=his; atrC=0; ventC=activityBell([.86],.08); repol=0;
  }
  if(mode==='av1'){
    atrial=bell(progress,.08,.17,.30); av=gate(progress,.24,.46); his=seg(progress,.46,.51); branch=seg(progress,.51,.57); purk=seg(progress,.57,.62); atrC=bell(progress,.18,.27,.36); ventC=bell(progress,.50,.63,.86);
  }
  if(mode==='mobitz1'){
    atrial=activityBell([.08,.34,.62],.05); av=activityBell([.21,.47],.06); his=activityBell([.23,.54],.05); branch=his; purk=his; atrC=activityBell([.18,.45,.66],.06); ventC=activityBell([.26,.56],.08); blockAV = progress>.60 && progress<.72 ? .95 : 0;
  }
  if(mode==='mobitz2'){
    atrial=activityBell([.10,.48,.74],.05); av=activityBell([.22,.86],.06); his=activityBell([.28,.90],.05); branch=his; purk=his; atrC=activityBell([.20,.58,.82],.06); ventC=activityBell([.31,.92],.08); blockAV = progress>.46 && progress<.56 ? .95 : 0;
  }
  if(mode==='av2to1'){
    atrial=activityBell([.12,.38,.68],.05); av=activityBell([.50],.06); his=activityBell([.56],.05); branch=his; purk=his; atrC=activityBell([.20,.46,.74],.06); ventC=activityBell([.58],.08); blockAV = (progress>.10&&progress<.18)||(progress>.66&&progress<.74) ? .9 : 0;
  }
  if(mode==='av3'){
    atrial=activityBell([.12,.37,.62,.87],.05); av=0; his=activityBell([.32,.82],.06); branch=his; purk=his; atrC=activityBell([.20,.45,.70,.92],.06); ventC=activityBell([.35,.85],.09); blockAV=.95;
  }
  if(mode==='rbbb'){
    blockR=.95; atrial=bell(progress,.08,.17,.30); av=gate(progress,.22,.34); his=seg(progress,.34,.39); branch=seg(progress,.39,.44); purk=seg(progress,.44,.55); atrC=bell(progress,.18,.26,.34); ventC=bell(progress,.45,.64,.88);
  }
  if(mode==='lbbb'){
    blockL=.95; atrial=bell(progress,.08,.17,.30); av=gate(progress,.22,.34); his=seg(progress,.34,.39); branch=seg(progress,.39,.44); purk=seg(progress,.48,.60); atrC=bell(progress,.18,.26,.34); ventC=bell(progress,.46,.66,.90);
  }
  if(mode==='lvh'){
    lvh=1; ventC=bell(progress,.41,.60,.88);
  }

  const raS=1-atrC*.08, laS=1-atrC*.08, rvS=1-ventC*.10, lvS=1-ventC*.10;
  document.getElementById('raGroup').setAttribute('transform',scaleAbout(216,223,raS));
  document.getElementById('laGroup').setAttribute('transform',scaleAbout(433,223,laS));
  document.getElementById('rvGroup').setAttribute('transform',scaleAbout(248,404,rvS));
  document.getElementById('lvGroup').setAttribute('transform',scaleAbout(378,412,lvS));

  const venousFill=.16+filling*.50,rightVentFill=.12+avInflow*.38,oxygenatedAtrialFill=.10+filling*.42,leftVentFill=.14+avInflow*.34;
  [['raWash',242-filling*24-atrC*8,70+filling*12,venousFill],['laWash',238-filling*24-atrC*8,64+filling*10,oxygenatedAtrialFill],['rvWash',470-avInflow*82-ventC*16,112+avInflow*18,rightVentFill],['lvWash',465-avInflow*76-ventC*16,108+avInflow*16,leftVentFill]].forEach(([id,cy,r,op])=>{const el=document.getElementById(id);el.setAttribute('cy',cy);el.setAttribute('r',r);el.style.opacity=op;});
  [['raSqueeze',20+atrC*18,atrC*.45],['laSqueeze',20+atrC*18,atrC*.45],['rvSqueeze',30+ventC*28,ventC*.42],['lvSqueeze',30+ventC*28,ventC*.42]].forEach(([id,r,op])=>{const el=document.getElementById(id);el.setAttribute('r',r);el.style.opacity=op;});

  // The Bachmann route crosses both atria, then curves back into the AV node.
  // The other two guide paths show direct internodal conduction; active yellow fills forward only.
  clearFlows();

  if(mode==='nsr' || mode==='lvh'){
    setAtrialFill(fillWindow(.08,.28));
    setVentricularFill(fillWindow(.34,.58,.58));
  } else if(mode==='sa1'){
    setAtrialFill(fillWindow(.10,.31));
    setVentricularFill(fillWindow(.38,.70,.70));
  } else if(mode==='sa2'){
    setAtrialFill(fillWindow(.10,.29));
    setVentricularFill(fillWindow(.34,.62,.62));
  } else if(mode==='sa3'){
    const e=beatFill(.86,.08);
    setVentricularFill(e);
  } else if(mode==='av1'){
    setAtrialFill(fillWindow(.08,.30));
    setVentricularFill(fillWindow(.46,.74,.74));
  } else if(mode==='mobitz1'){
    const a=maxVal([beatFill(.08),beatFill(.34),beatFill(.62)]);
    const v=maxVal([beatFill(.26),beatFill(.56)]);
    setAtrialFill(a);
    setVentricularFill(v);
  } else if(mode==='mobitz2'){
    const a=maxVal([beatFill(.10),beatFill(.48),beatFill(.74)]);
    const v=maxVal([beatFill(.31),beatFill(.92)]);
    setAtrialFill(a);
    setVentricularFill(v);
  } else if(mode==='av2to1'){
    const a=maxVal([beatFill(.12),beatFill(.38),beatFill(.68)]);
    const v=beatFill(.56,.08);
    setAtrialFill(a);
    setVentricularFill(v);
  } else if(mode==='av3'){
    const a=maxVal([beatFill(.12),beatFill(.37),beatFill(.62),beatFill(.87)]);
    const v=maxVal([beatFill(.32,.08),beatFill(.82,.08)]);
    setAtrialFill(a);
    setVentricularFill(v);
  } else if(mode==='rbbb'){
    setAtrialFill(fillWindow(.08,.28));
    setVentricularFill(fillWindow(.34,.86,.86),fillWindow(.34,.60,.60));
  } else if(mode==='lbbb'){
    setAtrialFill(fillWindow(.08,.28));
    setVentricularFill(fillWindow(.34,.60,.60),fillWindow(.34,.88,.88));
  } else if(mode==='af'){
    const v=maxVal([beatFill(.18,.07),beatFill(.43,.07),beatFill(.71,.07),beatFill(.91,.07)]);
    setVentricularFill(v);
  } else if(mode==='flutter'){
    const v=maxVal([beatFill(.31,.08),beatFill(.70,.08)]);
    setVentricularFill(v);
  }

  const saPulse=(mode==='af'||mode==='flutter')?0:bell(progress,.055,.08,.12);
  const saNodeEl=document.getElementById('saNode'), avNodeEl=document.getElementById('avNode');
  saNodeEl.style.setProperty('fill',rgba(203+52*saPulse,213+30*saPulse,225-119*saPulse,.30+saPulse*.70),'important');
  avNodeEl.style.setProperty('fill',rgba(203+52*av,213+30*av,225-119*av,.30+av*.70),'important');
  saNodeEl.style.opacity=.55+saPulse*.45;
  avNodeEl.style.opacity=.55+av*.45;
  document.getElementById('repolRing').setAttribute('r',60+repol*86); document.getElementById('repolRing').style.opacity=repol*.72;
  document.getElementById('repolFill').setAttribute('r',38+repol*24); document.getElementById('repolFill').style.opacity=repol*.45;
  setOpacity('rbbBlocked',blockR); setOpacity('lbbBlocked',blockL); setOpacity('avBlocked',blockAV); setOpacity('rbbBlockLabel',blockR); setOpacity('lbbBlockLabel',blockL); setOpacity('avBlockLabel',blockAV); setOpacity('flutterLoop',flutterLoop); setOpacity('lvhWall',lvh);
}
function setStatus(text,kind='info'){const el=document.getElementById('analyzeStatus'); el.textContent=text; el.className='status-pill'+(kind==='warn'?' warn':kind==='good'?' good':'');}
function drawWavePreview(points=[]){const canvas=document.getElementById('waveCanvas'); const ctx=canvas.getContext('2d'); const w=canvas.width,h=canvas.height; ctx.clearRect(0,0,w,h); ctx.fillStyle=themeStripBg(); ctx.fillRect(0,0,w,h); ctx.strokeStyle=themeGrid(); ctx.lineWidth=1; for(let i=1;i<5;i++){const y=i*h/5; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();}
 if(!points.length){ctx.fillStyle=cssVar('--muted','#94a3b8'); ctx.font='14px Inter, sans-serif'; ctx.fillText('Extracted waveform preview will appear here.', 18, h/2); return;} const min=Math.min(...points), max=Math.max(...points); const span=(max-min)||1; ctx.strokeStyle=themeColor(); ctx.lineWidth=2.5; ctx.beginPath(); points.forEach((v,i)=>{const x=i*(w/(points.length-1)); const y=h-12-((v-min)/span)*(h-24); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);}); ctx.stroke();}
function movingAverage(arr,win){const out=[]; const half=Math.floor(win/2); for(let i=0;i<arr.length;i++){let sum=0,c=0; for(let j=i-half;j<=i+half;j++){if(j>=0&&j<arr.length){sum+=arr[j]; c++;}} out.push(sum/c);} return out;}
function std(arr){if(!arr.length) return 0; const mean=arr.reduce((a,b)=>a+b,0)/arr.length; return Math.sqrt(arr.reduce((s,v)=>s+(v-mean)**2,0)/arr.length);}
function median(arr){if(!arr.length) return 0; const s=[...arr].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2;}
function extractWaveformFromImage(){const img=document.getElementById('ecgPreview'); if(!uploadedImageLoaded) return null; const work=document.getElementById('workCanvas'); const maxW=900; const scale=Math.min(1,maxW/img.naturalWidth); const w=Math.max(300,Math.round(img.naturalWidth*scale)); const h=Math.max(120,Math.round(img.naturalHeight*scale)); work.width=w; work.height=h; const ctx=work.getContext('2d'); ctx.drawImage(img,0,0,w,h); const data=ctx.getImageData(0,0,w,h).data; const darkness=new Float32Array(w*h); for(let i=0;i<w*h;i++){const r=data[i*4], g=data[i*4+1], b=data[i*4+2]; const gray=0.299*r+0.587*g+0.114*b; darkness[i]=255-gray;} let ys=[]; let prev=Math.floor(h/2); const maxJump=Math.max(18,Math.floor(h*0.12)); for(let x=0;x<w;x++){let bestY=prev, bestScore=-1e9; const yStart=x<5?0:Math.max(0,prev-maxJump), yEnd=x<5?h-1:Math.min(h-1,prev+maxJump); for(let y=yStart;y<=yEnd;y++){const idx=y*w+x; let score=darkness[idx]; if(y>0 && y<h-1) score=(score+darkness[(y-1)*w+x]+darkness[(y+1)*w+x])/3; score -= Math.abs(y-prev)*1.8; if(score>bestScore){bestScore=score; bestY=y;}} if(bestScore<28 && x>0) bestY=prev; ys.push(bestY); prev=bestY;} ys=movingAverage(ys,7); const base=movingAverage(ys,81); let signal=ys.map((y,i)=>base[i]-y); signal=movingAverage(signal,5); const med=median(signal); signal=signal.map(v=>v-med); const sigma=std(signal)||1; signal=signal.map(v=>v/sigma); return {signal,width:w,height:h};}
function detectRPeaks(signal, durationSec){const dt=durationSec/signal.length; const minDistance=Math.max(8,Math.round(0.22/dt)); const mu=signal.reduce((a,b)=>a+b,0)/signal.length; const sigma=std(signal)||1; const threshold=Math.max(mu+1.2*sigma, 1.2); const peaks=[]; for(let i=2;i<signal.length-2;i++){if(signal[i]>threshold && signal[i]>=signal[i-1] && signal[i]>signal[i+1]){ if(!peaks.length || i-peaks[peaks.length-1] > minDistance){peaks.push(i);} else if(signal[i]>signal[peaks[peaks.length-1]]){peaks[peaks.length-1]=i;} }} return {peaks, dt, threshold};}
function estimateQrsWidth(signal, peaks, dt){if(!peaks.length) return 0; const widths=[]; peaks.forEach(pk=>{const amp=Math.max(signal[pk],1); const thresh=amp*0.35; let l=pk, r=pk; while(l>1 && signal[l]>thresh) l--; while(r<signal.length-2 && signal[r]>thresh) r++; widths.push((r-l)*dt*1000);}); return median(widths);}
function estimateFlutterScore(signal, peaks){if(peaks.length<2) return 0; let score=[]; for(let i=0;i<peaks.length-1;i++){const a=peaks[i], b=peaks[i+1]; const seg=signal.slice(a,b); if(seg.length<10) continue; let extrema=0; for(let j=1;j<seg.length-1;j++){if((seg[j]>seg[j-1] && seg[j]>seg[j+1]) || (seg[j]<seg[j-1] && seg[j]<seg[j+1])) extrema++;} score.push(extrema/seg.length);} return score.length ? score.reduce((x,y)=>x+y,0)/score.length : 0;}
function classifyAnalysis(metrics){const {bpm, cv, qrsMs, flutterScore, lead}=metrics; let key='nsr', confidence=0.62, reason=[]; if(!Number.isFinite(bpm) || bpm<15 || bpm>220){return {key:'nsr', confidence:0.2, reason:['Unable to reliably estimate rate from this image.'], warning:true};}
 if(cv>0.16){ key='af'; confidence=0.74; reason.push('Irregular R-R intervals detected.'); if(qrsMs<120) reason.push('QRS appears relatively narrow.'); }
 else if(qrsMs>120){ key='rbbb'; confidence=0.58; reason.push('Wide QRS pattern detected.'); reason.push('Single-strip image cannot reliably separate RBBB from LBBB, so the demo uses the RBBB visualizer.'); }
 else if(bpm>=140 && cv<0.08 && flutterScore>0.11){ key='flutter'; confidence=0.66; reason.push('Regular fast rhythm with repeated baseline oscillation suggests flutter.'); }
 else { key='nsr'; confidence=0.72; reason.push('Rate and regularity are most compatible with sinus rhythm.'); if(lead!=='lead2') confidence -= 0.05; }
 return {key, confidence:Math.max(0.2, Math.min(0.95, confidence)), reason, warning:false};}
function analyzeUploadedEcg(){ if(!uploadedImageLoaded){ setStatus('Upload an ECG image first','warn'); return; } setStatus('Analyzing…','info'); try { const durationSec=Math.max(2, Number(document.getElementById('stripDuration').value)||10); const lead=document.getElementById('leadSelect').value; const extracted=extractWaveformFromImage(); if(!extracted){ setStatus('Could not read image','warn'); return; } const signal=extracted.signal; lastAnalysis={...(lastAnalysis||{}), signalPreview:signal.slice(0, Math.min(signal.length, 720))}; drawWavePreview(lastAnalysis.signalPreview); const {peaks, dt}=detectRPeaks(signal, durationSec); if(peaks.length<2){ document.getElementById('analysisReason').textContent='The MVP could not confidently identify enough QRS complexes. Try a cleaner single rhythm strip with higher contrast and minimal tilt.'; document.getElementById('detectedRhythm').textContent='Unable to classify'; document.getElementById('detectedBpm').textContent='—'; document.getElementById('detectedRegularity').textContent='Low signal'; document.getElementById('detectedConfidence').textContent='Low'; setStatus('Low-confidence result','warn'); return; } const rr=[]; for(let i=1;i<peaks.length;i++) rr.push((peaks[i]-peaks[i-1])*dt); const meanRr=rr.reduce((a,b)=>a+b,0)/rr.length; const bpm=60/meanRr; const cv=std(rr)/(meanRr||1); const qrsMs=estimateQrsWidth(signal, peaks, dt); const flutterScore=estimateFlutterScore(signal, peaks); const classified=classifyAnalysis({bpm,cv,qrsMs,flutterScore,lead}); lastAnalysis={bpm,cv,qrsMs,flutterScore,peaks:peaks.length,...classified}; rhythm=classified.key; ecgPathCacheRhythm=null; heartRate=Math.max(10, Math.min(200, Math.round(bpm))); document.getElementById('hr').value=heartRate; document.getElementById('rhythm').value=rhythm; progress=.02; totalProgress=Math.floor(totalProgress)+.02; playing=false; update(); document.getElementById('detectedRhythm').textContent=rhythms[classified.key].name; document.getElementById('detectedBpm').textContent=`${Math.round(bpm)} bpm`; document.getElementById('detectedRegularity').textContent=cv<0.08?'Regular':cv<0.16?'Mildly irregular':'Irregular'; document.getElementById('detectedConfidence').textContent=`${Math.round(classified.confidence*100)}%`; const extra=`Estimated QRS width: ${Math.round(qrsMs)} ms. Detected beats: ${peaks.length}.`; document.getElementById('analysisReason').textContent=[...classified.reason, extra, 'Educational use only — this browser-based image analysis is approximate.'].join(' '); setStatus(classified.warning?'Low-confidence result':'Visualizer updated','good'); } catch(err){ console.error(err); setStatus('Analysis failed','warn'); document.getElementById('analysisReason').textContent='Analysis failed on this image. Try a clearer single rhythm strip with good contrast.'; }}
function handleEcgFile(file){ if(!file) return; if(!file.type.startsWith('image/')){ setStatus('Use PNG, JPG, or WEBP for the MVP','warn'); return; } const reader=new FileReader(); reader.onload=e=>{ const img=document.getElementById('ecgPreview'); img.onload=()=>{ uploadedImageLoaded=true; uploadedImageName=file.name; document.getElementById('previewPlaceholder').style.display='none'; img.style.display='block'; drawWavePreview([]); setStatus('Image loaded','good'); }; img.src=e.target.result; }; reader.readAsDataURL(file); }
function update(){const def=rhythms[rhythm], phase=currentPhase(); updateEcg(); updateHeart(); document.getElementById('phasePill').textContent=phase.name; document.getElementById('rhythmTitle').textContent=def.name; document.getElementById('rhythmNote').textContent=def.note; document.getElementById('exTitle').textContent=phase.name; document.getElementById('electrical').textContent=phase.electrical; document.getElementById('mechanical').textContent=phase.mechanical; document.getElementById('pathology').textContent=phase.pathology; document.getElementById('heartCaption').textContent=phase.short||def.name; document.getElementById('hrValue').textContent=`${heartRate} bpm`; document.getElementById('cycleValue').textContent=`Cycle length: ${(60/heartRate).toFixed(2)} s`; document.getElementById('scrub').value=Math.round(progress*1000); document.getElementById('scrubPct').textContent=`${Math.round(progress*100)}%`; document.getElementById('play').textContent=playing?'Pause':'Play'; if(lastTimelinePhaseId!==phase.id){lastTimelinePhaseId=phase.id; [...document.querySelectorAll('.timeline-item')].forEach((el,i)=>{const ph=phaseCards[i]; el.classList.toggle('active', progress>=ph.start&&progress<ph.end);});}}
function jumpTo(v){const phase=clamp01(v); totalProgress=Math.floor(totalProgress)+phase; progress=phase; playing=false; update();}
function nudge(v){jumpTo(progress+v);} 
function step(dir){let idx=phaseCards.findIndex(ph=>progress>=ph.start&&progress<ph.end); if(idx<0)idx=0; idx=Math.min(Math.max(idx+dir,0),phaseCards.length-2); jumpTo((phaseCards[idx].start+phaseCards[idx].end)/2);}


const quizLeads12 = ['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
const posteriorLeadSet = ['V7','V8','V9'];
const leadProfiles = {
  I:{amp:.78,pol:1,st:.0,t:.80}, II:{amp:1.0,pol:1,st:.0,t:1.0}, III:{amp:.68,pol:1,st:.0,t:.78},
  aVR:{amp:.72,pol:-1,st:.0,t:-.7}, aVL:{amp:.50,pol:1,st:.0,t:.55}, aVF:{amp:.82,pol:1,st:.0,t:.9},
  V1:{amp:.55,pol:-.45,st:.0,t:.30}, V2:{amp:.72,pol:.35,st:.0,t:.45}, V3:{amp:.90,pol:.72,st:.0,t:.70},
  V4:{amp:1.12,pol:1,st:.0,t:.95}, V5:{amp:1.0,pol:1,st:.0,t:.95}, V6:{amp:.82,pol:1,st:.0,t:.85},
  V7:{amp:.62,pol:1,st:.0,t:.70}, V8:{amp:.55,pol:1,st:.0,t:.64}, V9:{amp:.48,pol:1,st:.0,t:.55}
};
const quizCaseBank = [
  {
    key:'af', visualRhythm:'af', answer:'Atrial fibrillation',
    profile:{age:[68,84], sex:['male','female'], risks:['hypertension','heart failure','sleep apnoea','previous stroke']},
    symptoms:['palpitations','shortness of breath','light-headedness'], duration:['3 hours','since this morning','2 days'],
    vitals:{hr:[115,155], bp:['128/78','146/88','102/64'], spo2:['96%','98%']},
    ecg:{p:'Absent organized P waves', pr:'Not measurable', qrs:'82–98 ms', qt:'Normal QTc', st:'No acute ST elevation', rhythm:'Irregularly irregular', axis:'Normal axis'},
    question:'What is the most likely rhythm?', options:['Atrial fibrillation','Atrial flutter with 2:1 block','Mobitz I AV block','Ventricular tachycardia'],
    keywords:['atrial fibrillation','af','afib'], explanation:'AF is suggested by absent organized P waves with an irregularly irregular ventricular rhythm.'
  },
  {
    key:'flutter', visualRhythm:'flutter', answer:'Atrial flutter with 2:1 AV conduction',
    profile:{age:[55,78], sex:['male','female'], risks:['COPD','recent surgery','hypertension','structural heart disease']},
    symptoms:['regular palpitations','mild dyspnoea','chest awareness'], duration:['6 hours','1 day','intermittently for 1 week'],
    vitals:{hr:[140,155], bp:['132/80','118/72','150/88'], spo2:['95%','97%']},
    ecg:{p:'Sawtooth flutter waves', pr:'Not applicable', qrs:'80–100 ms', qt:'Usually normal', st:'No diagnostic ST elevation', rhythm:'Regular narrow-complex tachycardia', axis:'Usually normal'},
    question:'What rhythm best explains the ECG?', options:['Atrial flutter with 2:1 AV conduction','Atrial fibrillation','Complete heart block','Sinus bradycardia'],
    keywords:['flutter','atrial flutter','2:1'], explanation:'Atrial flutter often shows sawtooth F waves and a regular ventricular response, commonly near 150 bpm with 2:1 conduction.'
  },
  {
    key:'av1', visualRhythm:'av1', answer:'First-degree AV block',
    profile:{age:[22,65], sex:['male','female'], risks:['athletic training','beta blocker use','inferior MI history','increased vagal tone']},
    symptoms:['incidental ECG finding','mild fatigue','no symptoms'], duration:['unknown','weeks','routine check'],
    vitals:{hr:[55,82], bp:['118/70','126/76','134/82'], spo2:['99%','98%']},
    ecg:{p:'Normal P waves before each QRS', pr:'240–320 ms', qrs:'<120 ms', qt:'Normal QTc', st:'No acute ST change', rhythm:'Regular sinus rhythm', axis:'Normal axis'},
    question:'What conduction abnormality is present?', options:['First-degree AV block','Mobitz II AV block','Complete heart block','Atrial fibrillation'],
    keywords:['first degree','1st degree','av block','prolonged pr'], explanation:'Every P wave conducts to the ventricles, but the PR interval is prolonged beyond 200 ms.'
  },
  {
    key:'mobitz1', visualRhythm:'mobitz1', answer:'Second-degree AV block Mobitz I / Wenckebach',
    profile:{age:[35,80], sex:['male','female'], risks:['increased vagal tone','inferior wall ischaemia','AV nodal blocker use']},
    symptoms:['dizziness','near-syncope','fatigue'], duration:['minutes','several hours','intermittent episodes'],
    vitals:{hr:[42,65], bp:['110/68','126/74','98/62'], spo2:['98%','97%']},
    ecg:{p:'P waves present', pr:'Progressively lengthens before dropped QRS', qrs:'Usually narrow', qt:'Usually normal', st:'No obligatory ST change', rhythm:'Grouped beating', axis:'Usually normal'},
    question:'Which AV block pattern is shown?', options:['Mobitz I / Wenckebach','Mobitz II','First-degree AV block','Atrial flutter'],
    keywords:['mobitz i','wenckebach','progressive pr'], explanation:'Mobitz I shows progressive PR prolongation followed by a non-conducted P wave.'
  },
  {
    key:'mobitz2', visualRhythm:'mobitz2', answer:'Second-degree AV block Mobitz II',
    profile:{age:[55,86], sex:['male','female'], risks:['anterior MI','His-Purkinje disease','degenerative conduction disease']},
    symptoms:['syncope','presyncope','marked fatigue'], duration:['sudden onset','several hours','today'],
    vitals:{hr:[32,52], bp:['94/60','108/66','118/70'], spo2:['97%','99%']},
    ecg:{p:'P waves present', pr:'Constant PR in conducted beats', qrs:'Often wide if infranodal', qt:'May be prolonged at slow rates', st:'Assess for ischaemia', rhythm:'Intermittent dropped QRS', axis:'Variable'},
    question:'What is the most concerning diagnosis?', options:['Mobitz II AV block','Mobitz I AV block','Sinus arrhythmia','Atrial fibrillation'],
    keywords:['mobitz ii','second degree type 2','dropped qrs'], explanation:'Mobitz II has constant PR intervals with sudden dropped QRS complexes and may progress to complete heart block.'
  },
  {
    key:'av3', visualRhythm:'av3', answer:'Third-degree AV block / complete heart block',
    profile:{age:[60,90], sex:['male','female'], risks:['degenerative conduction disease','inferior MI','Lyme disease','AV nodal blocker overdose']},
    symptoms:['syncope','severe dizziness','weakness'], duration:['1 hour','since waking','recurrent episodes'],
    vitals:{hr:[28,45], bp:['88/54','102/60','110/64'], spo2:['96%','98%']},
    ecg:{p:'P waves independent of QRS', pr:'No fixed PR relationship', qrs:'Narrow or wide escape rhythm', qt:'May appear prolonged due bradycardia', st:'Check for MI trigger', rhythm:'AV dissociation', axis:'Variable'},
    question:'What rhythm is present?', options:['Complete heart block','First-degree AV block','Atrial flutter','RBBB'],
    keywords:['complete heart block','third degree','3rd degree','av dissociation'], explanation:'Complete heart block shows AV dissociation: P waves and QRS complexes occur independently.'
  },
  {
    key:'rbbb', visualRhythm:'rbbb', answer:'Right bundle branch block',
    profile:{age:[45,82], sex:['male','female'], risks:['pulmonary embolism','right ventricular strain','structural heart disease','normal variant']},
    symptoms:['dyspnoea','chest discomfort','incidental finding'], duration:['acute','unknown','1 day'],
    vitals:{hr:[70,110], bp:['128/76','140/82','110/70'], spo2:['92%','96%','98%']},
    ecg:{p:'Sinus P waves usually present', pr:'Normal unless additional block', qrs:'≥120 ms', qt:'Interpret with wide QRS caution', st:'Secondary ST-T changes V1–V3', rhythm:'Usually sinus rhythm', axis:'May be normal or rightward'},
    question:'Which conduction abnormality fits best?', options:['Right bundle branch block','Left bundle branch block','LVH','Atrial fibrillation'],
    keywords:['rbbb','right bundle'], explanation:'RBBB produces delayed right ventricular activation with widened QRS and typical right precordial changes.'
  },
  {
    key:'lbbb', visualRhythm:'lbbb', answer:'Left bundle branch block',
    profile:{age:[58,88], sex:['male','female'], risks:['hypertension','aortic stenosis','cardiomyopathy','ischaemic heart disease']},
    symptoms:['dyspnoea','chest pressure','incidental abnormal ECG'], duration:['2 hours','unknown','several days'],
    vitals:{hr:[65,110], bp:['142/84','158/92','118/70'], spo2:['95%','98%']},
    ecg:{p:'Sinus P waves may be present', pr:'May be normal or prolonged', qrs:'≥120 ms', qt:'Difficult to interpret with wide QRS', st:'Discordant ST-T changes', rhythm:'Usually sinus rhythm', axis:'Often leftward'},
    question:'What ECG pattern is most likely?', options:['Left bundle branch block','Right bundle branch block','Atrial flutter','Mobitz I'],
    keywords:['lbbb','left bundle'], explanation:'LBBB delays left ventricular activation and widens the QRS with typical discordant ST-T changes.'
  },
  {
    key:'lvh', visualRhythm:'lvh', answer:'Left ventricular hypertrophy with strain pattern',
    profile:{age:[45,78], sex:['male','female'], risks:['longstanding hypertension','aortic stenosis','chronic kidney disease']},
    symptoms:['headache','exertional dyspnoea','incidental ECG abnormality'], duration:['months','years of hypertension','today at clinic'],
    vitals:{hr:[65,95], bp:['172/96','186/104','158/92'], spo2:['98%','99%']},
    ecg:{p:'May show left atrial enlargement', pr:'Normal or mildly prolonged', qrs:'High voltage', qt:'May be normal', st:'Lateral ST depression/T inversion strain', rhythm:'Sinus rhythm', axis:'May be left axis'},
    question:'Which ECG abnormality best fits?', options:['LVH with strain','RBBB','Atrial fibrillation','Complete heart block'],
    keywords:['lvh','hypertrophy','strain'], explanation:'High QRS voltage with lateral ST depression/T-wave inversion is compatible with LVH strain.'
  },
  {
    key:'posterior-mi', visualRhythm:'nsr', answer:'Posterior myocardial infarction',
    profile:{age:[50,82], sex:['male','female'], risks:['smoking','diabetes','hyperlipidaemia','previous CAD']},
    symptoms:['crushing chest pain','diaphoresis','nausea'], duration:['45 minutes','2 hours','since early morning'],
    vitals:{hr:[70,105], bp:['150/90','96/60','132/78'], spo2:['94%','97%']},
    ecg:{p:'Sinus P waves present', pr:'Normal', qrs:'Usually narrow', qt:'May be normal', st:'ST depression V1–V3; posterior V7–V9 ST elevation', rhythm:'Sinus rhythm', axis:'Usually normal'},
    question:'What extra leads are most useful to confirm the suspected diagnosis?', options:['Posterior leads V7–V9','Right-sided leads V3R–V4R only','No additional leads are useful','Lewis lead'],
    keywords:['posterior','v7','v8','v9'], explanation:'Posterior MI can present with anterior ST depression in V1–V3; posterior leads V7–V9 can show ST elevation.'
  }
];

let currentQuizCase=null;
let selectedMcqIndex=null;

function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function randInt(min,max){ return Math.floor(min + Math.random()*(max-min+1)); }
function rangePick(range){ return Array.isArray(range) ? randInt(range[0],range[1]) : range; }

function leadModifiedY(basePhase, lead, caseKey){
  const prof=leadProfiles[lead] || leadProfiles.II;
  let y = ecgY(basePhase);
  let baseline=112;
  let deviation = (y-baseline) * prof.amp * prof.pol;
  if(caseKey==='posterior-mi'){
    if(['V1','V2','V3'].includes(lead)) deviation += 16; // anterior ST depression visual approximation
    if(['V7','V8','V9'].includes(lead)) deviation -= 18; // posterior ST elevation visual approximation
  }
  if(caseKey==='lvh' && ['V5','V6','I','aVL'].includes(lead)) deviation *= 1.28;
  if(caseKey==='rbbb' && ['V1','V2'].includes(lead)) deviation -= 8*Math.exp(-Math.pow((basePhase-.44)/.025,2));
  if(caseKey==='lbbb' && ['V5','V6','I','aVL'].includes(lead)) deviation -= 10*Math.exp(-Math.pow((basePhase-.46)/.030,2));
  return baseline + deviation;
}

function drawLeadTrace(ctx, lead, x, y, w, h, label, caseKey){
  ctx.save();
  ctx.translate(x,y);
  ctx.fillStyle=themeStripBg();
  ctx.fillRect(0,0,w,h);
  ctx.strokeStyle=themeGrid();
  ctx.lineWidth=1.15;
  const mmPx = Math.max(8, 25*(quizPaperSpeed/25));
  for(let gx=0;gx<=w;gx+=mmPx){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,h);ctx.stroke();}
  for(let gy=0;gy<=h;gy+=20){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(w,gy);ctx.stroke();}
  ctx.strokeStyle=colorMixText(0.32);
  ctx.lineWidth=1.4;
  ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();
  ctx.fillStyle=themeColor();
  ctx.font='bold 15px Inter, sans-serif';
  ctx.fillText(label,10,20);
  ctx.strokeStyle=themeColor();
  ctx.lineWidth=2.8;
  ctx.beginPath();
  const beats=2.8*(25/quizPaperSpeed);
  const start=totalProgress-beats*.72;
  for(let px=0;px<=w;px+=1.5){
    const beatPos=start+(px/w)*beats;
    const ph=phaseFromTotal(beatPos);
    const raw=leadModifiedY(ph, lead, caseKey);
    const yy=(raw-112)*(h/150)+h/2;
    if(px===0) ctx.moveTo(px,yy); else ctx.lineTo(px,yy);
  }
  ctx.stroke();
  ctx.restore();
}

function getDisplayedQuizLeads(){
  const mode=document.getElementById('quizLeadDisplay')?.value || 'single';
  const posterior=document.getElementById('posteriorLeads')?.checked;
  const single=document.getElementById('quizLeadSelect')?.value || 'II';
  if(mode==='all12'){
    return posterior ? [...quizLeads12, ...posteriorLeadSet] : [...quizLeads12];
  }
  return [single];
}

function drawQuizRhythm(){
  const canvas=document.getElementById('quizEcgCanvas');
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle=themeStripBg();
  ctx.fillRect(0,0,W,H);
  const leads=getDisplayedQuizLeads();
  const caseKey=currentQuizCase?.key || rhythm;
  const title=currentQuizCase?.answer || rhythms[rhythm]?.name || 'Live rhythm';
  document.getElementById('quizRhythmTitle').textContent=title;
  document.getElementById('quizLeadMode').textContent=leads.length===1 ? `Lead ${leads[0]}` : `${leads.length} leads`;
  const qsn=document.getElementById('quizSpeedNote'); if(qsn) qsn.textContent=`Paper speed: ${quizPaperSpeed} mm/s`;
  const badges=document.getElementById('quizLeadBadges');
  if(badges) badges.innerHTML=leads.map(l=>`<span class="lead-badge">${l}</span>`).join('');
  if(leads.length===1){
    drawLeadTrace(ctx, leads[0], 18, 36, W-36, H-72, leads[0], caseKey);
  } else {
    const cols=3, rows=Math.ceil(leads.length/cols);
    const pad=0;
    const cellW=W/cols;
    const cellH=H/rows;
    leads.forEach((lead,i)=>{
      const c=i%cols, r=Math.floor(i/cols);
      drawLeadTrace(ctx, lead, c*cellW, r*cellH, cellW, cellH, lead, caseKey);
    });
    ctx.save();
    ctx.strokeStyle=colorMixText(0.18); ctx.lineWidth=1;
    for(let c=1;c<cols;c++){ctx.beginPath();ctx.moveTo(c*cellW,0);ctx.lineTo(c*cellW,H);ctx.stroke();}
    for(let r=1;r<rows;r++){ctx.beginPath();ctx.moveTo(0,r*cellH);ctx.lineTo(W,r*cellH);ctx.stroke();}
    ctx.restore();
  }
}

function buildCase(caseDef){
  const sex=pick(caseDef.profile.sex);
  const age=rangePick(caseDef.profile.age);
  const risk=pick(caseDef.profile.risks);
  const symptom=pick(caseDef.symptoms);
  const duration=pick(caseDef.duration);
  const hr=rangePick(caseDef.vitals.hr);
  const bp=pick(caseDef.vitals.bp);
  const spo2=pick(caseDef.vitals.spo2);
  return {
    ...caseDef,
    patient:`${age}-year-old ${sex}; risk factor: ${risk}`,
    symptoms:symptom,
    duration,
    vitals:`HR ${hr} bpm, BP ${bp}, SpO₂ ${spo2}`,
    rate:hr
  };
}

function renderQuizCase(c){
  currentQuizCase=c;
  selectedMcqIndex=null;
  rhythm=c.visualRhythm; ecgPathCacheRhythm=null;
  heartRate=Math.max(10,Math.min(200,c.rate || heartRate));
  document.getElementById('rhythm').value=rhythm;
  document.getElementById('hr').value=heartRate;
  document.getElementById('caseDiagnosisTitle').textContent='Case generated';
  document.getElementById('caseStory').textContent=`${c.patient}. Presents with ${c.symptoms}. Symptom duration: ${c.duration}.`;
  document.getElementById('casePatient').textContent=c.patient;
  document.getElementById('caseSymptoms').textContent=c.symptoms;
  document.getElementById('caseDuration').textContent=c.duration;
  document.getElementById('caseVitals').textContent=c.vitals;
  document.getElementById('mP').textContent=c.ecg.p;
  document.getElementById('mPR').textContent=c.ecg.pr;
  document.getElementById('mQRS').textContent=c.ecg.qrs;
  document.getElementById('mQT').textContent=c.ecg.qt;
  document.getElementById('mST').textContent=c.ecg.st;
  document.getElementById('mRhythm').textContent=c.ecg.rhythm;
  document.getElementById('mRate').textContent=`${c.rate} bpm`;
  document.getElementById('mAxis').textContent=c.ecg.axis;
  document.getElementById('questionText').textContent=c.question;
  const mcq=document.getElementById('mcqAnswers');
  mcq.innerHTML=c.options.map((o,i)=>`<button class="mcq-option" data-idx="${i}">${String.fromCharCode(65+i)}. ${o}</button>`).join('');
  mcq.querySelectorAll('.mcq-option').forEach(btn=>{
    btn.onclick=()=>{
      selectedMcqIndex=Number(btn.dataset.idx);
      mcq.querySelectorAll('.mcq-option').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
    };
  });
  document.getElementById('typedAnswer').value='';
  document.getElementById('quizFeedback').className='feedback-box';
  document.getElementById('quizFeedback').textContent='Answer the question, then check your answer.';
  totalProgress=Math.floor(totalProgress)+.02;
  progress=.02;
  playing=false;
  update();
  drawQuizRhythm();
}

function generateQuizCase(){
  let def=pick(quizCaseBank);
  const posterior=document.getElementById('posteriorLeads')?.checked;
  if(posterior && Math.random()<0.45) def=quizCaseBank.find(c=>c.key==='posterior-mi') || def;
  renderQuizCase(buildCase(def));
}

function updateAnswerMode(){
  const mode=document.getElementById('answerMode')?.value || 'mcq';
  document.getElementById('mcqAnswers').style.display=mode==='mcq'?'grid':'none';
  document.getElementById('typedAnswer').style.display=mode==='typed'?'block':'none';
}

function checkQuizAnswer(){
  const fb=document.getElementById('quizFeedback');
  if(!currentQuizCase){ fb.textContent='Generate a case first.'; fb.className='feedback-box incorrect'; return; }
  const mode=document.getElementById('answerMode').value;
  let correct=false;
  if(mode==='mcq'){
    if(selectedMcqIndex===null){ fb.textContent='Choose an MCQ option first.'; fb.className='feedback-box incorrect'; return; }
    correct=currentQuizCase.options[selectedMcqIndex]===currentQuizCase.answer;
  } else {
    const ans=document.getElementById('typedAnswer').value.toLowerCase();
    correct=currentQuizCase.keywords.some(k=>ans.includes(k.toLowerCase()));
  }
  fb.className='feedback-box '+(correct?'correct':'incorrect');
  fb.textContent=(correct?'Correct. ':'Not quite. ')+currentQuizCase.explanation+` Answer: ${currentQuizCase.answer}.`;
}

function revealQuizAnswer(){
  const fb=document.getElementById('quizFeedback');
  if(!currentQuizCase){ fb.textContent='Generate a case first.'; fb.className='feedback-box incorrect'; return; }
  fb.className='feedback-box';
  fb.textContent=`Answer: ${currentQuizCase.answer}. ${currentQuizCase.explanation}`;
}

function initQuizLab(){
  const qLeadDisplay=document.getElementById('quizLeadDisplay');
  const qLeadSelect=document.getElementById('quizLeadSelect');
  const posterior=document.getElementById('posteriorLeads');
  const answerMode=document.getElementById('answerMode');
  if(!qLeadDisplay) return;
  qLeadDisplay.onchange=()=>drawQuizRhythm();
  qLeadSelect.onchange=()=>drawQuizRhythm();
  posterior.onchange=()=>drawQuizRhythm();
  const qSpeed=document.getElementById('quizSpeedSelect');
  if(qSpeed) qSpeed.onchange=e=>{quizPaperSpeed=Number(e.target.value)||25; drawQuizRhythm();};
  answerMode.onchange=()=>updateAnswerMode();
  document.getElementById('generateCaseBtn').onclick=()=>generateQuizCase();
  document.getElementById('checkAnswerBtn').onclick=()=>checkQuizAnswer();
  document.getElementById('revealAnswerBtn').onclick=()=>revealQuizAnswer();
  updateAnswerMode();
  drawQuizRhythm();
}



function cssVar(name, fallback){
  const v=getComputedStyle(document.body).getPropertyValue(name).trim();
  return v || fallback;
}
function themeColor(){
  return cssVar('--accent', '#ef4444');
}
function themeGrid(){
  return cssVar('--gridStrong', 'rgba(239,68,68,.34)');
}
function themeStripBg(){
  const isWhite=(document.body.dataset.theme || '').endsWith('-white');
  return isWhite ? cssVar('--stripBgLight', '#fffafa') : cssVar('--stripBg', '#070707');
}
function colorMixText(alpha){
  return (document.body.dataset.theme||'').endsWith('-white') ? `rgba(20,20,20,${alpha})` : `rgba(255,255,255,${alpha})`;
}

function setSiteTheme(theme){
  document.body.dataset.theme = theme;
  try { localStorage.setItem('ecgVisualizerTheme', theme); } catch(e) {}
  const select=document.getElementById('themeSelect');
  if(select) select.value=theme;

  const themeOptions=[...document.querySelectorAll('[data-theme-choice]')];
  const activeOption=themeOptions.find(btn=>btn.dataset.themeChoice===theme);
  themeOptions.forEach(btn=>{
    const isActive = btn.dataset.themeChoice === theme;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  const currentDot=document.getElementById('themeCurrentDot');
  const currentLabel=document.getElementById('themeCurrentLabel');
  if(activeOption){
    const swatchA=activeOption.style.getPropertyValue('--swatch-a');
    const swatchB=activeOption.style.getPropertyValue('--swatch-b');
    if(currentDot){
      currentDot.style.setProperty('--swatch-a', swatchA);
      currentDot.style.setProperty('--swatch-b', swatchB);
    }
    if(currentLabel) currentLabel.textContent=activeOption.dataset.themeLabel || activeOption.title || theme;
  }
  try{ecgPathCacheRhythm=null; update(); drawQuizRhythm(); drawWavePreview(lastAnalysis?.signalPreview || []);}catch(e){}
}
function initThemePicker(){
  const saved=(()=>{try{return localStorage.getItem('ecgVisualizerTheme')}catch(e){return null}})();
  const picker=document.querySelector('.theme-picker');
  const toggle=document.getElementById('themeDropdownBtn');
  const menu=document.getElementById('themeMenu');
  const select=document.getElementById('themeSelect');

  const closeMenu=()=>{
    if(!picker || !toggle) return;
    picker.classList.remove('open');
    toggle.setAttribute('aria-expanded','false');
  };
  const openMenu=()=>{
    if(!picker || !toggle) return;
    picker.classList.add('open');
    toggle.setAttribute('aria-expanded','true');
  };

  setSiteTheme(saved || 'red-black');

  if(toggle){
    toggle.onclick=(event)=>{
      event.stopPropagation();
      picker.classList.contains('open') ? closeMenu() : openMenu();
    };
  }
  if(select) select.onchange=()=>setSiteTheme(select.value);
  document.querySelectorAll('[data-theme-choice]').forEach(btn=>{
    btn.onclick=(event)=>{
      event.stopPropagation();
      setSiteTheme(btn.dataset.themeChoice);
      closeMenu();
    };
  });
  if(menu){
    menu.onclick=(event)=>event.stopPropagation();
  }
  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', event=>{
    if(event.key==='Escape') closeMenu();
  });
}

function initModeTabs(){
  const tabs=[...document.querySelectorAll('.mode-tab')];
  tabs.forEach(tab=>{
    tab.onclick=()=>{
      tabs.forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      const target=document.getElementById(tab.dataset.target);
      if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
    };
  });
}

function initStaticHeartPreview(){
  const source=document.getElementById('heartVisual');
  const mount=document.getElementById('miniHeartMount');
  if(!source || !mount) return;
  const clone=source.cloneNode(true);
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach(el=>{
    el.dataset.mirrorId=el.id;
    el.removeAttribute('id');
  });
  mount.replaceChildren(...clone.childNodes);

}

function init(){
  initStaticHeartPreview();
  const select=document.getElementById('rhythm'); Object.entries(rhythms).forEach(([key,val])=>{const o=document.createElement('option');o.value=key;o.textContent=val.name;select.appendChild(o);});
  const markers=document.getElementById('ecgMarkers'); ecgLabelDefs.forEach(def=>{const t=document.createElementNS('http://www.w3.org/2000/svg','text');t.setAttribute('x',0);t.setAttribute('y',def.y);t.setAttribute('text-anchor','middle');t.setAttribute('class','ecg-label');t.textContent=def.key;markers.appendChild(t);});
  const hit=document.getElementById('hitboxes'); phaseCards.forEach(ph=>{const r=document.createElementNS('http://www.w3.org/2000/svg','rect');r.setAttribute('x',ph.start*920);r.setAttribute('y',0);r.setAttribute('width',(ph.end-ph.start)*920);r.setAttribute('height',220);r.setAttribute('fill','transparent');r.setAttribute('class','phase-hitbox');r.onclick=()=>jumpTo((ph.start+ph.end)/2);hit.appendChild(r);});
  const timeline=document.getElementById('timeline'); phaseCards.slice(0,5).forEach(ph=>{const b=document.createElement('button');b.className='timeline-item';b.innerHTML=`<span>${ph.name}</span><small>${ph.short}</small>`;b.onclick=()=>jumpTo((ph.start+ph.end)/2);timeline.appendChild(b);});
  document.getElementById('prev').onclick=()=>step(-1); document.getElementById('next').onclick=()=>step(1); document.getElementById('play').onclick=()=>{playing=!playing; update();}; document.getElementById('reset').onclick=()=>{progress=.02; totalProgress=.02; playing=false; update();}; document.getElementById('hr').oninput=e=>{heartRate=Number(e.target.value); update();}; const liveSpeed=document.getElementById('ecgSpeedSelect'); if(liveSpeed) liveSpeed.onchange=e=>{ecgPaperSpeed=Number(e.target.value)||25; ecgPathCacheD=''; const n=document.getElementById('ecgSpeedNote'); if(n) n.textContent=`Paper speed: ${ecgPaperSpeed} mm/s`; update();}; document.getElementById('rhythm').onchange=e=>{rhythm=e.target.value; ecgPathCacheRhythm=null; progress=.02; totalProgress=Math.floor(totalProgress)+.02; playing=false; update();}; document.getElementById('backSmall').onclick=()=>nudge(-.01); document.getElementById('backPhase').onclick=()=>nudge(-.05); document.getElementById('forwardPhase').onclick=()=>nudge(.05); document.getElementById('forwardSmall').onclick=()=>nudge(.01); document.getElementById('scrub').oninput=e=>jumpTo(Number(e.target.value)/1000);
  document.getElementById('ecgFile').onchange=e=>handleEcgFile(e.target.files[0]);
  document.getElementById('analyzeBtn').onclick=()=>analyzeUploadedEcg();
  drawWavePreview([]);
  initThemePicker();
  initModeTabs();
  initQuizLab();
  update(); requestAnimationFrame(loop);
}
function loop(t){if(!last)last=t; const delta=Math.min(t-last,50); last=t; if(playing){const cycleMs=60000/heartRate; totalProgress+=delta/cycleMs; progress=phaseFromTotal(totalProgress); update();} requestAnimationFrame(loop);} 
init();
