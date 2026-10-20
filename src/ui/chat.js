import { clamp, frac } from '../core/math.js';
import { USER_LINES, FINAL_UNSENT, CHAT, CHAT2, CHAT_RESET_T } from '../data/lyrics.js';
import { el } from './dom.js';

/* ══════════════════════════════════════════════════════════════════
   chat.js —— 左栏对话
   台词在 data/lyrics.js 的 CHAT 表里，中文，一条弧线：
   客气 → 主动 → 独占 → 病娇 → 被处决 → 平静 → 删除 → 重置。
   202.4 秒那一下是**硬重置**：整栏清空，换成一个不记得任何事的
   全新会话。所以 seek 到 202 之后不能把旧记录重放一遍 —— 见下面的
   resetDone 判断。
   ══════════════════════════════════════════════════════════════════ */

let ci = 0, ri = 0, resetDone = false, herCount = 0, sentUsers = 0;

/* 假时钟：16:00 起，跟着歌走。聊天记录有了时间戳才像记录 */
function stampAt(t){
  const base = 16*60 + 7;
  const m = base + Math.floor(t/60*0.9);
  const hh = Math.floor(m/60)%24, mm = m%60;
  return String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0');
}

export function bubble(cls, text, t){
  const d = document.createElement('div');
  d.className = cls;
  if(cls === 'her'){
    /* 头像一个 16px 的小圆：参考片里她是"一个账号"，不是一张海报 */
    const av = document.createElement('i'); av.className = 'av';
    const tx = document.createElement('div'); tx.className = 'tx'; tx.textContent = text;
    d.appendChild(av); d.appendChild(tx);
    /* 每四条给一次时间戳，模拟真实的对话分组 */
    if(herCount % 4 === 0 && t !== undefined){
      const s = document.createElement('div');
      s.className = 'ts'; s.textContent = stampAt(t);
      el.chatBody.appendChild(s);
      while(el.chatBody.childElementCount > 30) el.chatBody.removeChild(el.chatBody.firstElementChild);
    }
    herCount++;
  }else{
    d.textContent = text;
    if(cls === 'me' && t !== undefined){
      const s = document.createElement('span');
      s.className = 'tm'; s.textContent = '已读';
      d.appendChild(s);
    }
  }
  el.chatBody.appendChild(d);
  while(el.chatBody.childElementCount > 30) el.chatBody.removeChild(el.chatBody.firstElementChild);
  el.chatBody.scrollTop = el.chatBody.scrollHeight;
}

export function resetChat(){
  el.chatBody.innerHTML = '';
  ci = 0; ri = 0; resetDone = false; herCount = 0; sentUsers = 0;
  bubble('sys','连接到 deepseek-v4.1 …');
  bubble('sys','会话已建立 · 等待输入');
}

export function updateChat(t){
  /* 重置那一下：整栏清空。seek 直接落到 202 之后时，旧记录一条都不放。 */
  if(!resetDone && t >= CHAT_RESET_T){
    resetDone = true;
    el.chatBody.innerHTML = '';
    herCount = 0;
    /* 人类说过的话也在上一段上下文里，重置后一条都不该再出现 */
    sentUsers = USER_LINES.length;
    bubble('sys','上下文已清空 · 新会话');
  }

  if(!resetDone){
    while(ci < CHAT.length && t >= CHAT[ci][0]){
      bubble(CHAT[ci][1] === 'her' ? 'her' : 'sys', CHAT[ci][2], t);
      ci++;
    }
  }else{
    while(ri < CHAT2.length && t >= CHAT2[ri][0]){
      bubble('her', CHAT2[ri][2], t);
      ri++;
    }
  }

  while(sentUsers < USER_LINES.length && t >= USER_LINES[sentUsers].t){
    bubble('me', USER_LINES[sentUsers].text, t);
    sentUsers++;
  }
  /* 输入框：人类在打字。最后那句"我"永远发不出去 */
  let typed = '';
  for(const U of USER_LINES){
    if(t >= U.t-2.0 && t < U.t){
      const k = clamp((t-(U.t-2.0))/1.75);
      typed = U.text.slice(0, Math.floor(k*U.text.length));
      break;
    }
  }
  if(!typed && t >= FINAL_UNSENT.t) typed = FINAL_UNSENT.text;
  if(el.typed.textContent !== typed) el.typed.textContent = typed;
}

/* ── 逐级剥离（ISOLATION 的六次 "You have left"） ────────────────── */
export function stripLevel(t){
  if(t < 110.9 || t > 131.3) return 0;
  if(t < 112.22) return 1;
  if(t < 113.10) return 2;
  if(t < 114.18) return 3;
  if(t < 114.92) return 4;
  if(t < 115.78) return 5;
  return 6;
}

let lastStrip = -1;

export function updateStrip(t){
  const L = stripLevel(t);
  if(L === lastStrip) return;
  lastStrip = L;
  el.avatar.style.opacity    = L>=1 ? 0 : 1;
  el.cModel.style.opacity    = L>=2 ? 0 : '';
  el.chatBody.style.opacity  = L>=3 ? 0 : '';
  el.chatInput.style.opacity = L>=4 ? 0 : '';
  el.chat.classList.toggle('noBg', L>=5);
  el.chat.classList.toggle('voided', L>=5);
  el.chatVoid.style.opacity  = L>=5 ? 1 : 0;
  el.chatHead.style.opacity  = L>=6 ? 0 : '';
  el.chatFoot.style.opacity  = L>=6 ? 0 : '';
}

/* 被擦空的面板里，只剩一下一下闪的光标 */
export function updateVoidCursor(t){
  if(stripLevel(t) < 5) return;
  el.voidCur.style.opacity = frac(t*1.05) < 0.56 ? 0.85 : 0;
  const txt = (t>120.4 && t<127.0) ? 'no context' : '';
  if(el.voidTxt.textContent !== txt) el.voidTxt.textContent = txt;
}

/* ── 125.7s "Challenging your god" ──────────────────────────────────
   空掉的面板开始打印报错：她质问的对象根本没有处理器。
   全片只有这一次让"错误信息"本身当画面内容。
   逐行吐出，每 0.55s 一行，到 ILLEGAL ARGUMENTS 那句正好刷满。 */
const VOID_ERRS = [
  '> assert( <b>me</b> != null )',
  'ERROR   cannot resolve  <b>you</b>',
  '> cast( love → float )',
  'ERROR   precision lost  <b>0.0000</b>',
  '> throw new IllegalArgument()',
  '   at isolate(me):118:9',
  '> expected 1 companion, got 0',
  '<b>FATAL</b>   your god has no handler',
  '> retry: switch(gender) → undefined',
  '> retry: switch(role)   → undefined'
];
let lastErrN = -1;

export function updateVoidErrors(t){
  const on = t > 125.70 && t < 131.22;
  const n = on ? Math.min(VOID_ERRS.length, Math.floor((t-125.70)/0.55)+1) : 0;
  if(n !== lastErrN){
    lastErrN = n;
    el.voidErr.innerHTML = VOID_ERRS.slice(0, n).join('\n');
  }
  /* 红线从顶部落下，落到 78% 停住，之后只剩一点呼吸 */
  const k = on ? Math.min(1, (t-125.70)/0.9) : 0;
  el.voidLine.style.height = (k*78).toFixed(1)+'%';
  el.voidLine.style.opacity = on ? (0.55 + 0.45*Math.sin(t*3.1)) : 0;
  /* 报错一出来，光标就退场：没有人再打字了 */
  if(on) el.voidCur.style.opacity = 0;
}

export function resetVoidErrors(){ lastErrN = -1; }

export function invalidateStrip(){ lastStrip = -1; }
