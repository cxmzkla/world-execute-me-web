import { clamp } from '../core/math.js';
import { COUNT6, COUNT6_TXT } from '../data/acts.js';
import { sliceEls } from './dom.js';

/* ══════════════════════════════════════════════════════════════════
   slices.js —— 十二宫格
   147.66 → 158.0 的十二次 EXECUTION，每次把世界多切一刀：
   1 格 → 12 格。render() 用 scissor/viewport 真的渲 12 次，
   而不是把一张图切成 12 块贴上去。
   ══════════════════════════════════════════════════════════════════ */

let sliceN = 1;
export const getSliceN = ()=> sliceN;
export const resetSlices = ()=>{ sliceN = 1; };

const SEG = (a,b,x)=> clamp((x-a)/(b-a));

/* 倒计时的六个数字（EIN DOS TROIS NE FEM LIU） */
export function updateSliceNums(t){
  const on = t>147.6 && t<161.6;
  sliceN = on ? 1 + Math.floor(clamp(SEG(147.66,158.0,t))*11.999) : 1;
  if(!sliceEls) return;
  for(let i=0;i<6;i++){
    const t0 = COUNT6[i];
    const vis = t>=t0 && t<t0+0.55;
    const el = sliceEls[i];
    el.style.opacity = vis ? (1-SEG(t0,t0+0.55,t))*0.95 : 0;
    el.textContent = COUNT6_TXT[i];
  }
}
