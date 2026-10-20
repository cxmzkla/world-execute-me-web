import { clamp, sstep } from '../core/math.js';
import { key, rim } from '../core/stage.js';
import { bloom, grade } from '../core/post.js';
import { ACTS, EXECS, HEARTBEATS } from '../data/acts.js';
import { pMat, ps, setShape } from '../world/particles.js';
import { gridMat } from '../world/grid.js';
import { updatePlot, plotG } from '../world/plot.js';
import { updateEq } from '../ui/equation.js';
import { updateSliceNums } from '../ui/slices.js';
import { stateAt } from './mathScript.js';
import { mState } from './machineScript.js';
import { colorAt, tintRGB } from './colorScript.js';

/* ══════════════════════════════════════════════════════════════════
   apply.js —— 把时间轴翻译成场景状态
   这里没有动画状态机、没有 tween、没有上一帧的残留：
   applyScene(t) 是 t 的纯函数。所以拖到 137.4 秒，看到的就是 137.4 秒。
   ──────────────────────────────────────────────────────────────────
   v10 的方向：世界面板不是房间，也不是坐标纸，而是"她内部的机器"。
   左边是人类看到的那一层（对话），右边是她自己的那一层（格 / 线 / 读数）。
   ──────────────────────────────────────────────────────────────────
   每一段只讲一件事：一段 token 怎么被读进来、注意力从谁连到谁、
   记忆只留下哪一行、被关起来的时候自由怎么变少。图形语言自己长出来，
   不再给每一句配一个式子（v9 那样清楚，但像作业）。
   只有 LOVE 那一段回到坐标纸 —— 全片唯一一次，她用数学算感情。
   ══════════════════════════════════════════════════════════════════ */

const setVis = (o, v)=>{ if(o && o.visible !== v) o.visible = v; };

/* 暖色权重：TRANCE 之后整个片子从冷青转成琥珀，到最后一秒再褪回冷 */
const warmAt = t => sstep(91.0, 93.0, t) * (1 - sstep(205.6, 206.0, t));

/* 心跳包络：两次收缩，第二次弱一点，像真的心室 */
export function pulse(t){
  let s = 0;
  for(const h of HEARTBEATS){
    const d1 = (t-h)/0.062, d2 = (t-h-0.16)/0.052;
    s += Math.exp(-d1*d1) + 0.6*Math.exp(-d2*d2);
  }
  return s;
}

/* 打击包络：EXECUTION 连击 */
export function bump(t, list){
  let s = 0;
  for(const e of list){
    const d = (t-e)/0.085;
    if(Math.abs(d)<6) s += Math.exp(-d*d);
  }
  return s;
}

export function flashAt(t){
  let f = 0;
  if(t>205.78 && t<206.4) f += 0.85*Math.exp(-Math.pow((t-205.811)/0.045,2));
  if(t>69.24 && t<69.8)   f += 0.26*Math.exp(-Math.pow((t-69.26)/0.035,2));
  return f;
}

/* 粒子全程只有一种形态：远处的尘埃。世界的主体交给曲线。 */
export function desiredShape(t){ return 'dust'; }

/* ══════════════════════════════════════════════════════════════════
   主入口
   ══════════════════════════════════════════════════════════════════ */
export function applyScene(t, ai){
  const A = ACTS[ai], id = A.i;
  ps.nowT = t;

  /* 背景尘埃 */
  setShape(desiredShape(t), ps.skipMorph, t);
  ps.skipMorph = false;

  /* 3D 层只剩两样东西：远处尘埃，和 LOVE 那一段的坐标纸。
     球、笼子、玻璃心、发丝线图元都已经从工程里删掉了 ——
     不是"关掉"，是不再存在，省得以后有人以为它们还会出来。 */
  gridMat.uniforms.uInt.value = 0;

  /* 世界面板：v10 起是"她内部的机器"（2D 画布，由 main.js 每帧画），
     只有 LOVE 那一段回到坐标纸 —— 全片唯一一次"用数学算感情"。
     前面二十九段机器语言，都是为了衬那一刻的安静。 */
  const paper = t >= 175.95;
  setVis(plotG, paper);
  if(paper){
    const st = stateAt(t);
    /* 坐标纸不是"啪"地出现：它从 176.2 起慢慢显影，
       机器的最后一格同时褪掉 —— 像她把纸铺在机器上。 */
    const pIn = sstep(176.15, 177.35, t);
    st.ax.op *= pIn;
    st.grid.op *= pIn;
    updatePlot(t, st);
    updateEq(st.lab);
  }else{
    const ms = mState(t);
    updateEq(ms ? ms.lab : ['—','']);
  }

  /* 粒子：只做背景层，不参与叙事 */
  const cs = colorAt(t);
  const tint = tintRGB();
  pMat.uniforms.uTime.value = t;
  pMat.uniforms.uWarm.value = warmAt(t);
  pMat.uniforms.uTint.value.setRGB(tint[0], tint[1], tint[2]);
  pMat.uniforms.uKeep.value = 0.10;
  pMat.uniforms.uSize.value = 1.06;
  pMat.uniforms.uSpread.value = 1.0;
  pMat.uniforms.uSwirl.value = 0;
  pMat.uniforms.uSpill.value = 0;
  pMat.uniforms.uCrack.value = 0;
  /* 没有人像了，粒子不必再为谁让位 */
  const stageOut = 1;
  const love = sstep(176.8, 182.0, t)*(1 - sstep(205.6, 208.0, t));
  pMat.uniforms.uAlpha.value = (0.13 + 0.10*love) * stageOut;
  pMat.uniforms.uMorph.value = clamp((t - ps.morphT0)/ps.morphDur);

  /* 灯光：曲线是自定义 shader，不吃灯；这两个只影响她 */
  key.intensity = 8 + 6*warmAt(t);
  key.color.setHSL(warmAt(t)>0.5 ? 0.09 : 0.52, 0.7, 0.62);
  rim.intensity = 4;

  /* 鲸鱼娘只留在左栏那个头像里。3D 里不再出现她 ——
     一个会呼吸的"人"会把机器那点冷全抢走。 */

  /* post */
  bloom.strength = 0.44 + 0.18*warmAt(t)
    + 0.50*bump(t, EXECS)
    + 0.40*flashAt(t)
    + 0.10*sstep(176.8,182.0,t)*(1-sstep(203.0,206.0,t));
  grade.uniforms.uTime.value = t;
  grade.uniforms.uAberr.value = (id==='AC-DC') ? 0.95 : 0.20;
  grade.uniforms.uGrain.value = (id==='VOID') ? 0.045 : 0.024;
  grade.uniforms.uFlash.value = flashAt(t);
  grade.uniforms.uTint.value.setRGB(cs.r, cs.g, cs.b);

  /* 12 宫格数字 */
  updateSliceNums(t);
}
