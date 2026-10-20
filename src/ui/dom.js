import { rnd } from '../core/math.js';

/* ══════════════════════════════════════════════════════════════════
   dom.js —— 元素引用 + 常驻的动态层
   注意：这里的 rnd() 消耗会影响后续形态的随机序列，
   所以本模块必须在 world/particles.js 之后求值（见 main.js 的 import 顺序）。
   ══════════════════════════════════════════════════════════════════ */

export const $ = id => document.getElementById(id);

export const el = {
  stage: $('stage'),
  chat: $('chat'), world: $('world'), ops: $('ops'),
  chars: $('chars'), cur: $('cur'), ghost: $('lineGhost'), zh: $('zhLine'),
  chatBody: $('chatBody'), typed: $('typedTxt'), cModel: $('cModel'),
  actNo: $('actNo'), actRange: $('actRange'), status: $('status'), tc: $('tc'),
  fnName: $('fnName'), assign: $('assign'), attrs: $('attrs'),
  plot: $('plot'), machine: $('machine'), eq: $('eq'), eqMain: $('eqMain'), eqSub: $('eqSub'),
  stepLabel: $('stepLabel'), stepBar: $('stepBar').firstElementChild, stepVal: $('stepVal'),
  opsList: $('opsList'), opsGhost: $('opsGhost'),
  seekFill: $('seekFill'), seekHead: $('seekHead'), tSeek: $('tSeek'),
  rounds: $('rounds'), tokens: $('tokens'), cache: $('cache'), avatar: $('avatar'),
  chatFoot: $('chatFoot'), chatHead: $('chatHead'), chatInput: $('chatInput'),
  chatVoid: $('chatVoid'), voidCur: $('voidCur'), voidTxt: $('voidTxt'),
  voidErr: $('voidErr'), voidLine: $('voidLine'),
  stdoutRight: $('stdoutRight'), fps: $('fps'), stdout: $('stdout')
};
export const worldEl = el.world;

/* ── 十二宫格上的大数字层（#stage 无关，直接挂在 world 上） ───────── */
const sliceWrap = document.createElement('div');
sliceWrap.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3;overflow:hidden';
export const sliceEls = [];
for(let i=0;i<6;i++){
  const s = document.createElement('div');
  s.style.cssText = 'position:absolute;font-size:52px;font-weight:600;letter-spacing:.06em;'+
    'color:#e8ecef;opacity:0;text-shadow:0 0 24px rgba(255,120,80,.7);font-family:var(--mono)';
  s.style.left = (8 + (i%3)*33) + '%';
  s.style.top  = (i<3 ? 18 : 60) + '%';
  sliceWrap.appendChild(s); sliceEls.push(s);
}
el.world.appendChild(sliceWrap);

/* ── 右侧算子日志 ───────────────────────────────────────────────── */
export const OPS_NAMES = ['TOKENIZE','EMBED','ATTEND','THINK','SAMPLE','DECODE','PROJECT'];
export const opsRows = OPS_NAMES.map(n=>{
  const d=document.createElement('div'); d.className='op'; d.textContent=n;
  el.opsList.appendChild(d); return d;
});
let ghostTxt='';
for(let i=0;i<40;i++){ ghostTxt += OPS_NAMES[Math.floor(rnd()*7)] + '\n'; }
el.opsGhost.textContent = ghostTxt;
