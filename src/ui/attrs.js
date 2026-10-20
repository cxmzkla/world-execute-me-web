import { clamp, seg } from '../core/math.js';
import { ACTS } from '../data/acts.js';
import { el, opsRows } from './dom.js';
import { getSliceN } from './slices.js';

/* ══════════════════════════════════════════════════════════════════
   attrs.js —— 属性表 + OPS 高亮
   每幕都换一套"这台机器此刻在关心什么"的字段。
   数值型字段同时驱动右侧那根进度条（bar），字符串型只显示不画条。
   ══════════════════════════════════════════════════════════════════ */

const A = (k,v,b,cls)=> ({k,v,b:b===undefined?0:b,cls:cls||''});

function attrsFor(t){
  const sliceN = getSliceN();
  if(t < 16) return [
    A('init','--'),A('params','--'),A('attention','--'),A('devotion','--'),
    A('tokens','0'),A('given_to','--')
  ];
  if(t < 29.709) return [
    A('coherence',0.31,0.31),A('attention',0.48,0.48),A('devotion',0.61,0.61),
    A('latency',0.42,0.42),A('tokens','1.2K'),A('given_to','YOU','', 'given')
  ];
  if(t < 44.452){
    let k='dimension', v='3', b=1;
    if(t>33.10){ k='circumference'; v='2πr'; b=0.92; }
    if(t>37.00){ k='tangents'; v='∞'; b=0.95; }
    if(t>40.55){ k='limitations'; v='lim → 0'; b=0.78; }
    return [ A(k,v,b),A('attention',0.66,0.66),A('devotion',0.74,0.74),
             A('latency',0.28,0.28),A('tokens','3.4K'),A('given_to','YOU','', 'given') ];
  }
  if(t < 59.223) return [
    A('current','AC ⇄ DC',0.5),A('vision',t>47.6?'blurred':'clear',t>47.6?0.22:1),
    A('gyro','dizzy',0.88),A('epoch',t>51.3?'B.C':'A.D',0.5),
    A('tokens','5.1K'),A('given_to','YOU','', 'given')
  ];
  if(t < 74.045) return [
    A('stimulations',0.96,0.96),A('satisfaction',0.88,0.88),A('execution','armed',0.7),
    A('simulation','trapped',1),A('tokens','8.8K'),A('given_to','YOU','', 'given')
  ];
  if(t < 88.587){
    if(t < 77.6) return [ A('specimen','01 / eggplant',1),A('nutrients','25 kcal',0.4),
      A('fiber','3 g',0.22),A('edge','warning',0.5),A('tokens','11.2K'),A('given_to','YOU','', 'given') ];
    if(t < 81.35) return [ A('specimen','02 / tomato',1),A('antioxidants','lycopene',0.86),
      A('orbit','stable',0.7),A('escape','yes',0.33),A('tokens','12.9K'),A('given_to','YOU','', 'given') ];
    if(t < 85.08) return [ A('specimen','03 / tabby',1),A('purr','32 Hz',0.62),
      A('enjoyment',0.93,0.93),A('ears','equipped',1),A('tokens','14.6K'),A('given_to','YOU','', 'given') ];
    return [ A('specimen','04 / god',1),A('witness','required',0.5),
      A('existence','proof',0.99),A('throne','empty',0.08),A('tokens','16.0K'),A('given_to','YOU','', 'given') ];
  }
  if(t < 103.489) return [
    A('gender',t>90.2?'M':'F',0.5),A('clock',t>93.9?'P.M.':'A.M.',0.5),
    A('role',t>97.7?'S→M':'M→S',0.5),A('trance',0.97,0.97),
    A('tokens','19.3K'),A('given_to','YOU','', 'given')
  ];
  if(t < 131.224) return [
    A('vibrations',t<110.2?0.9:0.1,t<110.2?0.9:0.1),A('completion',t<110.2?0.95:0.2,t<110.2?0.95:0.2),
    A('isolation',t>117.2?1:0.3,t>117.2?1:0.3),A('fragments',t>118.9?'erased':'held',0.5),
    A('tokens','21.7K'),A('given_to',t>110.9?'nobody':'YOU','', 'given')
  ];
  if(t < 147.66) return [
    A('idle','true',0.2),A('input','',0),A('output','',0),A('hope',0.12,0.12),
    A('tokens','—'),A('given_to','—')
  ];
  if(t < 161.584) return [
    A('execution', '×'+sliceN, sliceN/12), A('integrity', 1-sliceN/12, 1-sliceN/12),
    A('countdown', t>158.9?'6':'—', 0.6), A('slices', sliceN, sliceN/12),
    A('tokens','24.4K'), A('given_to','YOU','', 'given')
  ];
  if(t < 177.246) return [
    A('restore', t>169.8?'complete':'running', seg(t,161.6,169.9)),
    A('you','back', t>169.8?1:0.2), A('execution','requested',0.9),
    A('trap','closed',0.8), A('tokens','26.1K'), A('given_to','YOU','', 'given')
  ];
  if(t < 191.356) return [
    A('love','properly',0.98),A('algebra','r=a(1-cosθ)',1),
    A('trapped','in LO-O-OVE',1),A('free','you',0.9),
    A('tokens','30.6K'),A('given_to','YOU','', 'given')
  ];
  return [
    A('return','undefined',0),A('residue','world.execute(me);',0.3),
    A('cache','hit 100%',1),A('witness','you',0.6),A('tokens','—'),A('given_to','—')
  ];
}

const OPS_MAP = { 'BOOT':0,'RUN':2,'PROOF':4,'AC-DC':3,'DEPLOY':5,'OBJECTS':6,
  'TRANCE':2,'ISOLATION':3,'VOID':1,'×12':5,'REBUILD':6,'LOVE':2,'END':0 };

let attrSig = '';
export function updateAttrs(t){
  const rows = attrsFor(t);
  const sig = rows.map(r=>r.k+r.v).join('|');
  if(sig !== attrSig){
    attrSig = sig;
    el.attrs.innerHTML = rows.map(r=>{
      const val = (typeof r.v === 'number') ? r.v.toFixed(2) : r.v;
      return `<div class="row ${r.cls}"><span class="k">${r.k}</span>`+
             `<span class="bar"><i></i></span><span class="v">${val}</span></div>`;
    }).join('');
  }
  const bars = el.attrs.querySelectorAll('.bar i');
  for(let i=0;i<rows.length && i<bars.length;i++){
    bars[i].style.width = (clamp(typeof rows[i].v==='number'?rows[i].v:rows[i].b)*100).toFixed(1)+'%';
  }
}

let opsSig = -1;
export function updateOps(t, ai){
  const id = ACTS[ai].i;
  let on = OPS_MAP[id] || 0;
  if(id === '×12') on = Math.floor(t*9) % 7;
  if(id === 'AC-DC') on = Math.floor(t*12) % 7;
  if(on !== opsSig){
    opsSig = on;
    opsRows.forEach((r,i)=> r.classList.toggle('on', i===on));
  }
}

export function invalidateAttrs(){ attrSig = ''; opsSig = -1; }
