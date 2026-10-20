/* ══════════════════════════════════════════════════════════════════
   mathScript.js —— 一句歌词，一个数学变换
   ──────────────────────────────────────────────────────────────────
   全片的"思考过程"就是一条曲线在被反复改写。规则只有两条：

   1. 每一句必须"看得懂"：屏幕上给式子，图形是式子的图像。
   2. 相邻两句的交接必须严丝合缝：mode:'chain' 表示下一段的起点
      等于上一段的终点（同一形状、同一位置），硬切也看不出来；
      mode:'draw' 才允许"旧线淡出、新线一笔画进来"。
      —— 只有拓扑真的变了（单支→双支、曲线→心电）才配用 draw。

   形状本身在 world/shapes.js，这里只管编排。
   ══════════════════════════════════════════════════════════════════ */
import { F } from '../world/shapes.js';
import { HEART_Y0 } from '../world/shapes.js';
import { sstep } from '../core/math.js';
import { tintRGB } from './colorScript.js';

const fract = v => v - Math.floor(v);

/* ── 节目单 ───────────────────────────────────────────────────────
   t     起始
   f     形状
   op    不透明度
   mode  chain 无缝接管 / draw 画进来
   dm/dn/dg  虚线混合 / 齿数 / 断口（点集靠这三个）
   tip   'draw' 笔尖跟着绘制 / 'loop' 绕圈扫
   tan   切线：on 强度、u 位置
   lab   [主公式, 副注]                                              */
const CUE = [
  { t:  0.00, f:'none', op:0, mode:'chain', lab:['—',''] },
  { t:  4.80, f:'none', op:0, mode:'chain', lab:['ℝ²','coordinate plane'] },

  /* world.execute(me); —— 一条零线被注入波形 */
  { t: 16.00, f:'run', op:0.95, mode:'draw',
    lab:['y = A sin x','A : 0 → 0.58'] },

  /* If I'm a set of points → DIMENSION */
  { t: 29.709, f:'dim', op:0.95, mode:'chain',
    dm:t=>1-sstep(30.55,32.55,t), dn:58, dg:0.84,
    lab:['dim S = 1','points → line'] },

  /* If I'm a circle → CIRCUMFERENCE */
  { t: 33.412, f:'circle', op:0.95, mode:'chain', tip:'loop', tipPer:1.55,
    lab:['x² + y² = r²','C = 2πr'] },

  /* If I'm a sine wave → TANGENTS */
  { t: 37.067, f:'sine', op:0.95, mode:'chain',
    tan:{ on:1, u:t=>0.08 + 0.84*fract((t-37.55)/2.05) },
    lab:['y = sin x','y′ = cos x'] },

  /* If I approach infinity → LIMITATIONS */
  { t: 40.706, f:'hyper', op:0.92, mode:'draw',
    lab:['y = 1/x','lim f(x) = ±∞'] },

  /* Switch my current to AC to DC */
  { t: 44.452, f:'rect', op:0.92, mode:'draw',
    lab:['y = |sin x|','AC → DC'] },

  /* so dizzy so dizzy */
  { t: 47.672, f:'lissa', op:0.92, mode:'draw',
    lab:['(sin 3t, sin 4t)','Lissajous'] },

  /* To A.D to B.C */
  { t: 51.363, f:'travel', op:0.92, mode:'draw',
    lab:['t → −t','A.D ⇄ B.C'] },

  /* we can unite */
  { t: 55.083, f:'unite', op:0.92, mode:'draw',
    lab:['sin x + cos x','= √2 sin(x + π/4)'] },

  /* STIMULATIONS */
  { t: 59.223, f:'stim', op:0.92, mode:'draw',
    lab:['y = sin x · sin 9x','carrier × envelope'] },

  /* SATISFACTION */
  { t: 62.589, f:'sat', op:0.92, mode:'chain',
    lab:['f′(x) = 0','argmax f'] },

  /* make you happy */
  { t: 66.601, f:'happy', op:0.92, mode:'draw',
    lab:['y = cos x',''] },

  /* EXECUTION 之后：模拟 = 量化 */
  { t: 69.259, f:'square', op:0.95, mode:'draw',
    lab:['y = sgn(sin x)','quantize → simulation'] },

  /* eggplant */
  { t: 74.045, f:'eggplant', op:0.95, mode:'draw',
    lab:['superellipse  n = 2.6','NUTRIENTS'] },

  /* tomato */
  { t: 77.576, f:'tomato', op:0.95, mode:'draw',
    lab:['r = 1 + 0.08 cos 5θ','ANTIOXIDANTS'] },

  /* tabby cat */
  { t: 81.351, f:'cat', op:0.95, mode:'draw',
    lab:['Fourier contour','ENJOYMENT'] },

  /* Then you're the proof of my EXISTENCE */
  { t: 85.078, f:'proof', op:0.95, mode:'chain',
    lab:['∃x : f(x) = 0','intermediate value'] },

  /* Switch my gender to F to M */
  { t: 88.587, f:'mirrorX', op:0.95, mode:'draw',
    lab:['f(−x)','F → M'] },

  /* switch my role to S to M */
  { t: 95.465, f:'inverse', op:0.95, mode:'draw',
    lab:['f⁻¹(x)','role ⇄ switch'] },

  /* enter the trance */
  { t: 99.349, f:'spiral', op:0.95, mode:'chain',
    lab:['r = a · e^{bθ}','trance'] },

  /* VIBRATIONS */
  { t:103.489, f:'damped', op:0.95, mode:'chain',
    lab:['y = e^{−kx} · sin ωx','vibrations'] },

  /* COMPLETION */
  { t:107.220, f:'closed', op:0.95, mode:'chain',
    lab:['∮ f ds','closure'] },

  /* ISOLATION */
  { t:110.900, f:'isolate', op:0.90, mode:'chain',
    dm:t=>0.55+0.45*sstep(112,116,t), dn:44, dg:0.70,
    lab:['S = { p₁ … p₆ }','isolation'] },

  /* erase all the pointless FRAGMENTS */
  { t:118.333, f:'broken', op:0.90, mode:'chain',
    lab:['∫ f = ∅','erase fragments'] },

  /* Challenging your god / ILLEGAL ARGUMENTS */
  { t:124.890, f:'illegal', op:0.90, mode:'draw',
    lab:['x ∉ D','illegal arguments'] },

  /* 长间奏：全部退场 */
  { t:131.224, f:'none', op:0, mode:'draw',
    lab:['—','no input'] },

  /* 慢慢回来：一条零线 */
  { t:143.000, f:'flat', op:0.32, mode:'draw',
    lab:['y = 0','reset'] },

  /* EXECUTION ×12 —— 心电 */
  { t:147.660, f:'ecg', op:0.95, mode:'draw',
    lab:['f(t) — 12 beats','execution'] },

  /* EIN DOS TROIS NE FEM LIU */
  { t:161.584, f:'ecg', op:0.90, mode:'chain',
    lab:['Σ 1 … 6','EIN DOS TROIS'] },

  { t:169.824, f:'ecg', op:0.90, mode:'chain',
    lab:['f(t) — 12 beats',''] },

  /* Though we are trapped */
  { t:173.643, f:'cage', op:0.90, mode:'chain',
    lab:['x = const','trapped'] },

  /* I've studied how to properly LOVE —— 从一个点起笔，一笔画成心
     5.7 秒走完整颗心：178 秒左右出右瓣，180.5 到心尖，182.4 收在左瓣，
     183 合口。写完再交给 F.heart（同一个形状），交接看不出来。 */
  { t:177.246, f:'heartTrace', op:1.0, mode:'draw', dw:5.70, tip:true,
    lab:['x = 16 sin³t',
         'y = 13 cos t − 5 cos 2t − 2 cos 3t − cos 4t'] },

  /* LO-O-OVE（拟合收敛） */
  { t:183.646, f:'heart', op:1.0, mode:'chain',
    lab:['x = 16 sin³t','y = 13cos t − 5cos 2t − 2cos 3t − cos 4t'] },

  /* I know the algebraic expression of LOVE */
  { t:184.540, f:'heart', op:1.0, mode:'chain',
    lab:['(x² + y² − 1)³ = x² y³','algebraic expression'] },

  /* I am trapped in LOVE */
  { t:188.483, f:'heart', op:1.0, mode:'chain',
    lab:['implicit plot','trapped in ♥'] },

  /* 长尾：逐点飞散 */
  { t:191.356, f:'dissolve', op:1.0, mode:'chain',
    dm:t=>0.20+0.60*sstep(194,205.4,t), dn:78, dg:0.52,
    lab:['♥',''] },

  /* 最后一击 */
  { t:205.811, f:'endline', op:1.0, mode:'draw',
    lab:['—','EXECUTION'] },

  { t:209.200, f:'endline', op:0.85, mode:'chain',
    lab:['—',''] }
];

/* 参照线：只有"学习画心"这一段需要先画出目标。
   目标必须比笔尖早到 —— 先有一颗虚线的心（她知道要画成什么），
   再由实线一笔一笔盖上去（她真的画出来了）。顺序反了就没有"学"的意思了。 */
const REF = [
  { t:176.62, t1:184.35, in:1.15, f:'heart', op:0.46, dn:130, dg:0.58 }
];

/* ── 轴与网格 ─────────────────────────────────────────────────── */
function axisOp(t){
  const on   = sstep(4.40, 7.60, t);
  const dark = sstep(110.4, 114.0, t) * (1 - sstep(130.6, 136.2, t));
  const love = sstep(176.6, 179.4, t) * (1 - sstep(205.6, 209.2, t));
  return on * (0.52*(1 - 0.82*dark) + 0.18*love);
}

/* ── 单条求值 ─────────────────────────────────────────────────── */
function evalCue(j, t){
  const c = CUE[j], nxt = CUE[j+1];
  const t0 = c.t, t1 = nxt ? nxt.t : 1e9;

  let op = c.op;
  let draw = 1;
  if(c.mode === 'draw'){
    /* dw：允许某一段慢慢走笔（爱心那一笔要走 5.7 秒，一格一格画出来） */
    const dur = c.dw ?? 0.88;
    draw = sstep(t0-0.06, t0+dur, t);
    op  *= sstep(t0-0.06, t0+0.34, t) * (1 - sstep(t1-0.14, t1+0.50, t));
  }
  if(!(op > 0.004)) return null;

  let tip = draw, tipAmp = 1.7;
  if(c.tip === 'loop'){
    tip = fract((t - t0) / (c.tipPer || 1.6));
    tipAmp = 2.6;
  }else if(c.tip){
    tipAmp = 2.2;
  }
  /* 画完就把笔尖熄掉：不然线尾会一直挂着一颗亮点，像没写完 */
  if(draw >= 0.999) tip = -1;

  return {
    f: F[c.f], op, draw,
    dash: c.dn ?? 40, gap: c.dg ?? 0.5,
    dashMix: c.dm ? c.dm(t) : 0,
    tip: c.tip ? tip : -1,
    tipAmp: c.tip ? tipAmp : 0,
    col: null                                  /* 由 stateAt 统一填 */
  };
}

/* ══════════════════════════════════════════════════════════════════
   对外：一帧的全部状态
   ══════════════════════════════════════════════════════════════════ */
export function stateAt(t){
  let i = 0;
  while(i < CUE.length-1 && t >= CUE[i+1].t) i++;

  const tint = tintRGB();
  const col  = [tint[0], tint[1], tint[2]];
  const dim  = [tint[0]*0.62, tint[1]*0.62, tint[2]*0.62];

  const out = {
    a: null, b: null, r: null, tan: null, dot: null,
    ax:   { draw: sstep(4.40, 7.40, t), op: Math.min(1, axisOp(t)*1.60), col: dim },
    grid: { op: Math.min(1, axisOp(t)*1.45), col: dim },
    lab:  CUE[i].lab
  };

  /* 起笔点：她把自己收成一个点之后，就从这里开始画。
     t=0 的那个点是这条参数曲线唯一合理的起点（凹口），就画在它上面。 */
  if(t >= 176.92 && t < 183.95){
    const a0 = sstep(176.92, 177.26, t) * (1 - sstep(183.10, 183.80, t));
    const pl = 0.70 + 0.30*Math.sin((t-176.9)*5.0);
    out.dot = {
      x: 0, y: HEART_Y0,
      op: a0 * pl,
      s:  1 + 0.12*Math.sin((t-176.9)*5.0),
      col:[Math.min(1,tint[0]*1.18+0.18),
           Math.min(1,tint[1]*1.18+0.18),
           Math.min(1,tint[2]*1.18+0.18)]
    };
  }

  /* 当前条 + 上一条：两条永远落在不同的 lane 上 */
  for(let j = Math.max(0, i-1); j <= i; j++){
    /* chain 的条目一旦被下一条接管就必须立刻退场。
       它不淡出（因为形状相同、硬切看不出接缝），
       如果还留着，画面里就会同时有圆和正弦两条线 —— 那就看不懂了。 */
    if(j < i && CUE[j].mode !== 'draw') continue;
    const s = evalCue(j, t);
    if(!s) continue;
    s.col = col;
    if(j % 2 === 0) out.a = s; else out.b = s;
  }

  /* 切线 */
  const c = CUE[i];
  if(c.tan){
    out.tan = {
      on: c.tan.on * (out.a || out.b ? 1 : 0),
      u: typeof c.tan.u === 'function' ? c.tan.u(t) : c.tan.u,
      fn: F[c.f],
      col: [Math.min(1, tint[0]*1.25+0.10),
            Math.min(1, tint[1]*1.25+0.10),
            Math.min(1, tint[2]*1.25+0.10)]
    };
  }

  /* 参照线 */
  for(const r of REF){
    if(t >= r.t && t < r.t1){
      out.r = {
        f: F[r.f], op: r.op * sstep(r.t, r.t+(r.in ?? 0.6), t) * (1-sstep(r.t1-0.5, r.t1, t)),
        draw: 1, dash: r.dn, gap: r.dg, dashMix: 1,
        tip: -1, tipAmp: 0, col: dim
      };
    }
  }

  return out;
}

export { CUE };
