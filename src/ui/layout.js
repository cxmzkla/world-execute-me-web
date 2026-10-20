import { seg, lerp, easeIO } from '../core/math.js';
import { view } from '../core/view.js';
import { el } from './dom.js';

/* ══════════════════════════════════════════════════════════════════
   layout.js —— 面板宽度与左右换边
   这些不用 CSS transition：拖进度条时 transition 会"追帧"。
   宽度是 t 的函数，直接写 CSS 变量，跳转即到位。
   ══════════════════════════════════════════════════════════════════ */

let lastLayout = '';

export function updateLayout(t){
  let chatW = 0.26;

  /* 69.26 EXECUTION：左边那栏被"执行"掉了，塌成 0 宽 ——
     然后她一个人站在整个世界面前 */
  if(t >= 69.26 && t < 73.20){
    const k = seg(t,69.26,69.76);
    chatW = lerp(0.26, 0.0, easeIO(k));
    if(t > 73.0) chatW = lerp(0, 0.26, easeIO(seg(t,73.0,73.2)));
  }

  /* 117.27 ISOLATION：对话被擦空，但那个空栏反而撑到 55% ——
     空得越大，越像没有人 */
  if(t >= 117.27 && t < 131.22){
    chatW = t<117.8 ? lerp(0.26,0.55,easeIO(seg(t,117.27,117.8))) : 0.55;
  }

  /* 88.587 "Switch my gender"：左右换位。这句词唱的是"换个身份"，
     所以画面也换一次手 */
  const swap = (t >= 88.587 && t < 103.489);

  const key = chatW.toFixed(3) + (swap?'s':'n');
  if(key === lastLayout) return;
  lastLayout = key;

  view.chatWf = chatW;
  view.swap = swap;
  el.stage.style.setProperty('--chat-w', (chatW*100).toFixed(2)+'%');
  el.stage.style.setProperty('--chat-order', swap ? 1 : 0);
  el.stage.style.setProperty('--world-order', swap ? 0 : 1);
  el.stage.style.setProperty('--ops-order', 2);
  el.chat.style.opacity = chatW < 0.004 ? 0 : 1;
}

/* 供跳转后强制重排 */
export function invalidateLayout(){ lastLayout = ''; }
