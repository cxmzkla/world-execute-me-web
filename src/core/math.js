/* ══════════════════════════════════════════════════════════════════
   math.js —— 缓动 / 随机 / 哈希
   全片唯一的随机源：mulberry32(20251013)。
   同一个 t 必渲染同一帧，拖拽进度条不会看到"另一版"画面。
   ══════════════════════════════════════════════════════════════════ */

export const clamp = (v,a=0,b=1)=> v<a?a:v>b?b:v;
export const lerp  = (a,b,t)=> a+(b-a)*t;
export const sstep = (a,b,x)=>{ const t=clamp((x-a)/(b-a)); return t*t*(3-2*t); };
export const easeIO= t=> t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
/* 注意签名是 seg(t, 起点, 终点) —— 少传一个参数就会算出 NaN，
   而 NaN 一旦进了 uniform，会被 Bloom 抹成整屏黑。 */
export const seg   = (t,a,b)=> clamp((t-a)/(b-a));
export const frac  = x=> x-Math.floor(x);

export function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0;
  let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t;
  return ((t^t>>>14)>>>0)/4294967296; }; }

export const RND = mulberry32(20251013);
export const rnd = ()=>RND();
export const rr  = (a,b)=> a+(b-a)*RND();

/* 5 位 token id：只是"看起来像 token"的装饰，不参与任何演出逻辑 */
export function hash5(n){ let x=Math.imul(n^(n>>>15),2246822519); x=Math.imul(x^(x>>>13),3266489917);
  x^=x>>>16; return String(x>>>0).slice(-5).padStart(5,'0'); }

export function noise1(x){ const i=Math.floor(x), f=frac(x); const u=f*f*(3-2*f);
  const h=n=>{ let t=Math.sin(n*127.1)*43758.5453; return frac(t); };
  return lerp(h(i),h(i+1),u); }
