import { DUR } from '../core/config.js';
import { clamp } from '../core/math.js';
import { clock } from '../core/clock.js';
import { ACTS } from '../data/acts.js';
import { lineAt } from '../data/lyrics.js';
import { el } from './dom.js';
import { updateLayout } from './layout.js';
import { updateAttrs, updateOps } from './attrs.js';
import { updateChat, updateStrip, updateVoidCursor, updateVoidErrors } from './chat.js';
import { buildLine, revealTo, lineIdx, setLineIdx, getTokCount } from './stdout.js';
import { updateTypeMoment } from './typeMoment.js';
import { colorAt } from '../scene/colorScript.js';

/* ══════════════════════════════════════════════════════════════════
   hud.js —— 一帧内所有 DOM 的更新入口
   先布局，再剥离，再内容，最后是仪表（时间码、步进、token 数）。
   ══════════════════════════════════════════════════════════════════ */

export const fmt = s => {
  s = Math.max(0,s);
  const m = Math.floor(s/60), ss = Math.floor(s%60), d = Math.floor((s%1)*10);
  return String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0')+'.'+d;
};

let lastAct = -1, lastCache = '';
let lastAccent = '';

/* 逐幕色温：把当前主色写进 --cy，整个 HUD 的青会跟着幕次走 */
function applyAccent(t){
  const c = colorAt(t);
  const hex = '#'+[c.r,c.g,c.b].map(v=>{
    const s = Math.round(Math.max(0,Math.min(1,v))*255/8)*8;
    return (s.toString(16).length<2?'0':'')+s.toString(16);
  }).join('');
  if(hex === lastAccent) return;
  lastAccent = hex;
  const rs = document.documentElement.style;
  rs.setProperty('--cy', hex);
  rs.setProperty('--cy2', '#'+[c.r*0.30,c.g*0.30,c.b*0.42].map(v=>{
    const s = Math.round(Math.max(0,Math.min(1,v))*255);
    return (s.toString(16).length<2?'0':'')+s.toString(16);
  }).join(''));
}

export function updateUI(t, ai){
  const A0 = ACTS[ai];
  const tokCount = getTokCount();

  applyAccent(t);
  updateLayout(t);
  updateStrip(t);
  updateVoidCursor(t);
  updateVoidErrors(t);
  updateTypeMoment(t);

  /* 顶栏 */
  if(ai !== lastAct){
    lastAct = ai;
    el.actNo.textContent = String(ai+1).padStart(2,'0')+' / '+A0.i;
    el.actRange.textContent = fmt(A0.t0)+' → '+fmt(A0.t1);
    el.fnName.textContent = A0.fn;
    el.assign.innerHTML = '<em>me</em><em>:=</em><b>'+A0.as+'</b>';
    el.assign.dataset.v = A0.as;
  }

  const st = (t>205.8) ? 'EXECUTED'
    : !clock.playing ? 'PAUSED'
    : (A0.i==='×12' ? 'EXECUTING' : A0.i==='VOID' ? 'IDLE' : A0.i==='BOOT' ? 'BOOT' : 'DECODING');
  if(el.status.textContent !== st){
    el.status.textContent = st;
    el.status.classList.toggle('warn', st==='EXECUTED');
  }
  el.tc.innerHTML = '<b>'+fmt(t)+'</b> / 03:32';

  /* stdout */
  const li = lineAt(t);
  if(li !== lineIdx){ setLineIdx(li); buildLine(li); }
  revealTo(t);

  /* 侧栏 */
  updateAttrs(t);
  updateOps(t, ai);
  updateChat(t);

  /* step */
  const u = clamp((t-A0.t0)/(A0.t1-A0.t0));
  el.stepLabel.textContent = 'step '+String(Math.round(u*30)).padStart(2,'0')+'/30';
  el.stepBar.style.width = (u*100).toFixed(1)+'%';
  el.stepVal.textContent = (u).toFixed(3);

  /* tokens / rounds / cache */
  el.tokens.textContent = (tokCount/1000).toFixed(1)+'K tok';
  el.rounds.textContent = Math.max(1,Math.ceil((t+0.1)/16))+' 轮 '+Math.min(30,Math.round(u*30+Math.floor(t/16)))+' 步';
  let cache = t>205.95 ? '缓存命中 100%' : '缓存命中 0%';
  if(A0.i==='OBJECTS' && t>76) cache = '缓存命中 12%';
  if(cache !== lastCache){ lastCache = cache; el.cache.textContent = cache;
    el.cache.classList.toggle('hit', cache.includes('100')); }

  /* 她只说了两个字的那两秒：底部字幕让位，整块画面留给这两个字 */
  const whisper = (t > 169.80 && t < 171.86);
  if(el.stdout) el.stdout.style.visibility = whisper ? 'hidden' : '';

  /* 进度 */
  const p = (t/DUR)*100;
  el.seekFill.style.width = p+'%';
  el.seekHead.style.left = p+'%';
  el.tSeek.textContent = fmt(t);
}

export function invalidateHud(){ lastAct = -1; lastCache = ''; }
