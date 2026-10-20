import { hash5 } from '../core/math.js';
import { LRC, isKW } from '../data/lyrics.js';
import { el } from './dom.js';

/* ══════════════════════════════════════════════════════════════════
   stdout.js —— 底部逐字符解码
   每个字是一个 <span>，出场时间 = 行内按"字符权重"分配：
   空格轻、标点重，所以读起来有呼吸感，不是匀速打字机。
   每个字上面还挂着一个 5 位 token id —— 装饰，但让它像一台仪器。
   ══════════════════════════════════════════════════════════════════ */

export let lineIdx = -1;
let toks = [], ptr = 0, lastText = '';
let tokCount = 0;
/* 中文不是逐字打的 —— 逐字打两行，观众要读两遍；
   整行晚 0.22 秒淡入，英文负责节奏，中文负责读懂。 */
let zhAt = 0, zhOn = false;

export const getTokCount = ()=> tokCount;

export function buildLine(i){
  const chars = el.chars;
  chars.innerHTML = '';
  toks = []; ptr = 0;
  if(i<0){
    chars.appendChild(el.cur);
    el.zh.textContent = ''; el.zh.classList.remove('on');
    zhAt = 0; zhOn = false;
    return;
  }
  const t0 = LRC[i][0];
  const t1 = (i+1<LRC.length) ? LRC[i+1][0] : t0+2.6;
  const text = LRC[i][1];
  const kw = isKW(text);
  const span = Math.max(0.42, t1-t0) * 0.84;
  const ws = [];
  let sum = 0;
  for(const ch of text){
    const w = ch===' ' ? 0.55 : ('.,;:'.includes(ch) ? 2.0 : 1.0);
    ws.push(w); sum += w;
  }
  let acc = 0;
  for(let k=0;k<text.length;k++){
    acc += ws[k];
    const tt = t0 + span*(acc/sum);
    const sp = document.createElement('span');
    sp.className = 'tok' + (kw ? ' kw' : '');
    const id = document.createElement('span');
    id.className = 'id';
    id.textContent = hash5(Math.round(tt*1000) + k*131 + text.charCodeAt(k)*7);
    sp.textContent = text[k];
    sp.appendChild(id);
    sp.dataset.t = tt;
    chars.appendChild(sp);
    toks.push({ el: sp, t: tt });
  }
  chars.appendChild(el.cur);
  el.ghost.textContent = lastText;
  lastText = text;

  el.zh.textContent = LRC[i][2] || '';
  el.zh.classList.remove('on');
  el.zh.style.animation = 'none';
  zhAt = t0 + 0.22;
  zhOn = false;
}

export function revealTo(t){
  while(ptr < toks.length && toks[ptr].t <= t){
    toks[ptr].el.classList.add('on');
    ptr++;
    tokCount += 1;
    if(ptr < toks.length) el.chars.insertBefore(el.cur, toks[ptr].el);
    else el.chars.appendChild(el.cur);
  }
  /* 光标闪烁：出新字时短暂实心 */
  const just = ptr>0 && (t - toks[ptr-1].t) < 0.09;
  el.cur.classList.toggle('solid', just);

  /* 中文：整行进来，不逐字 */
  if(!zhOn && t >= zhAt && el.zh.textContent){
    zhOn = true;
    el.zh.classList.add('on');
    void el.zh.offsetWidth;
    el.zh.style.animation = '';
  }else if(zhOn && t < zhAt){
    zhOn = false;
    el.zh.classList.remove('on');
  }
}

/* 跳转后全部重来 */
export function resetStdout(){
  lineIdx = -2;
  tokCount = 0;
  lastText = '';
  toks = []; ptr = 0;
  zhOn = false;
}
export function setLineIdx(v){ lineIdx = v; }
