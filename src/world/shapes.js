/* ══════════════════════════════════════════════════════════════════
   shapes.js —— 全部形状都是函数
   ──────────────────────────────────────────────────────────────────
   统一签名：(u, t, out) → 把 x,y 写进 out[0],out[1]
     u ∈ [0,1]   沿参数方向（不是屏幕坐标）
     t           全片时间；句内的"形变进度"由它算
   ──────────────────────────────────────────────────────────────────
   为什么全片只用一套采样点：
     位置插值能成立的前提，是两条曲线在同一个 u 上"指的是同一处"。
     圆和心形都是闭合参数曲线，u=0 落在同一个位置；直线卷成圆用
     (sin,1−cos) 的曲率映射，中点始终对应中点。所以它们之间可以直接
     做线性插值，读起来是"线在流动"，而不是"一张图换成另一张图"。
   ══════════════════════════════════════════════════════════════════ */
import { sstep } from '../core/math.js';

export const CW = 1.42;          // 曲线横向半宽（世界单位）
const P2 = Math.PI * 2;

/* ── 心 ────────────────────────────────────────────────────────────
   x = 16sin³θ
   y = 13cosθ − 5cos2θ − 2cos3θ − cos4θ
   这两行就是歌词里那句"我知道爱的代数表达式"。除以 16 归一化后
   y 落在 [−1.06, 0.31]，平移 0.30 让它居中到原点。 */
const HC = 0.345, HS = 0.845;
function heartPt(a, o){
  const s = Math.sin(a);
  const y = 13*Math.cos(a) - 5*Math.cos(2*a) - 2*Math.cos(3*a) - Math.cos(4*a);
  o[0] = s*s*s * 0.760;
  o[1] = (y/16 + HC) * HS;
}

/* ── 起点 ──────────────────────────────────────────────────────────
   θ=0 时 sin³θ=0、四个余弦全是 1 → (0, 5/16+HC)·HS。
   这是上边两个圆弧之间的凹口，也是这条参数曲线唯一合理的起笔处：
   从这里出发沿 θ 走一圈，右瓣 → 心尖 → 左瓣 → 回到凹口，一笔画完。 */
export const HEART_X0 = 0, HEART_Y0 = (5/16 + HC) * HS;

/* ── 弧长重排 ──────────────────────────────────────────────────────
   θ 在 0 和 π 两处速度为零（心形的两个尖），所以"θ 走多少"不等于
   "笔走了多远"：直接拿 θ/2π 当笔画进度，笔尖会在起点停住半秒才动。
   这里先按参数采样出累计弧长，再把 u 反查成 θ —— 于是 u 就是
   "已经画了整颗心的百分之几"，笔尖匀速。形状一个点都没变。 */
let ARC = null;
function arcTable(){
  if(ARC) return ARC;
  const N = 1201;
  const tx = new Float32Array(N), acc = new Float32Array(N);
  const o1 = [0, 0];
  let L = 0, px = 0, py = 0;
  heartPt(0, o1); px = o1[0]; py = o1[1];
  for(let i=1;i<N;i++){
    const a = i/(N-1)*P2;
    heartPt(a, o1);
    L += Math.hypot(o1[0]-px, o1[1]-py);
    px = o1[0]; py = o1[1];
    tx[i] = a; acc[i] = L;
  }
  ARC = { acc, tx, L, N };
  return ARC;
}
function arcToParam(u){
  if(u <= 0.0002) return 0;
  if(u >= 0.9998) return P2;
  const A = arcTable();
  const s = u * A.L;
  let lo = 0, hi = A.N-1;
  while(lo < hi-1){
    const m = (lo+hi)>>1;
    if(A.acc[m] <= s) lo = m; else hi = m;
  }
  const d = A.acc[hi] - A.acc[lo];
  const f = d > 1e-9 ? (s - A.acc[lo])/d : 0;
  return A.tx[lo] + (A.tx[hi]-A.tx[lo])*f;
}

/* 确定性抖动：不能用 Math.random，否则每帧都在跳 */
const jit = (u, k) => Math.sin(u*137.13 + k*41.7) * Math.cos(u*71.31 - k*17.3);

export const F = {};

/* ── 0. 空 ─────────────────────────────────────────────────────────
   不出图时也要写合法坐标：NaN 会顺着 position 传进渲染管线，
   加法混合一叠加就是整帧发黑。 */
F.none = (u,t,o)=>{ o[0] = CW*(2*u-1); o[1] = -9; };

/* ── 1. 直线：世界的地基 ───────────────────────────────────────── */
F.flat = (u,t,o)=>{ o[0] = CW*(2*u-1); o[1] = 0; };

/* ── 2. 执行之后，直线被注入波形 ──────────────────────────────────
   A 从 0 涨到 0.6：一条零线自己长出正弦。
   相位带 t 项，让波"往前流"——思考是持续在走的，不是静帧。 */
F.run = (u,t,o)=>{
  const q = 2*u-1;
  const A = 0.58*sstep(17.4, 25.2, t);
  o[0] = CW*q;
  o[1] = A*Math.sin(2*Math.PI*q + t*0.42);
};

/* ── 3. DIMENSION：先散成点集，再连成线 ──────────────────────────
   点的位置抖动按 t 收敛；"点"本身由 dash 参数表达（见 plot.js），
   所以这里只管位置：抖动归零 = 点排成一条线 = 一维。 */
F.dim = (u,t,o)=>{
  const q = 2*u-1;
  const A = 0.58*(1-sstep(29.9, 32.4, t));
  /* 抖动从 0 起：上一句结束时它必须严丝合缝地接上，
     否则硬切的那一帧会看到整条线"抖了一下"。 */
  const j = 0.115*sstep(29.72, 30.35, t)*(1-sstep(30.35, 32.8, t));
  o[0] = CW*q + j*jit(u,1)*1.1;
  o[1] = A*Math.sin(2*Math.PI*q + t*0.42) + j*jit(u,2);
};

/* ── 4. CIRCUMFERENCE：直线卷成圆 ────────────────────────────────
   插值的是"点"，但 w 走的是卷曲：两端先抬眼，最后合拢成闭合圆。
   中点 u=0.5 始终在最低处，所以观众看到的是"一根线被卷起来"，
   不是"一条线淡出、一个圆淡入"。 */
F.circle = (u,t,o)=>{
  const w = sstep(33.60, 36.30, t);
  const q = 2*u-1, a = Math.PI*q;
  const R = 0.760;
  const lx = CW*q, ly = 0;
  const cx = R*Math.sin(a), cy = -R*Math.cos(a);
  o[0] = lx + (cx-lx)*w;
  o[1] = ly + (cy-ly)*w;
};

/* ── 5. TANGENTS：圆展开成正弦，切点在曲线上滑 ───────────────────
   从圆到正弦是位置插值：几何上就是把 θ 与弧长拉直。
   切线由 plot.js 在 uTan 处按解析导数画，不在这里。 */
F.sine = (u,t,o)=>{
  const w = sstep(37.25, 39.15, t);
  const q = 2*u-1, a = Math.PI*q;
  const R = 0.760;
  const cx = R*Math.sin(a), cy = -R*Math.cos(a);
  const sx = CW*q, sy = 0.62*Math.sin(2*Math.PI*q);
  o[0] = cx + (sx-cx)*w;
  o[1] = cy + (sy-cy)*w;
};

/* ── 6. LIMITATIONS：双曲线，两支永远够不到渐近线 ────────────────
   u<0.5 画右支、u>0.5 画左支；采样区间避开顶点，否则两支在
   x=0 处粘成一个点，看起来像一条折线。 */
F.hyper = (u,t,o)=>{
  const right = u < 0.5;
  const v = right ? u*2 : (u-0.5)*2;                // 0..1
  const p = (v-0.5)*2.50;                           // −1.25..1.25
  const a = 0.555;
  o[0] = (right ? 1 : -1) * a*Math.cosh(p);
  o[1] = a*Math.sinh(p)*0.92;
};

/* ── 7. AC → DC：整流 ─────────────────────────────────────────────
   "Switch my current / to AC to DC" —— 把下半周期的峰翻上来。
   这是全片唯一一处"歌词说到什么，图形就真的做了什么"的电路。 */
F.rect = (u,t,o)=>{
  const w = sstep(44.70, 46.90, t);
  const q = 2*u-1;
  const ac = 0.62*Math.sin(2*Math.PI*q);
  const dc = 0.62*Math.abs(Math.sin(2*Math.PI*q));
  o[0] = CW*q;
  o[1] = ac + (dc-ac)*w;
};

/* ── 8. dizzy：利萨如，两个正交正弦的合成 ────────────────────────
   5:6 的比例让它几乎闭合又不完全闭合，读起来就是"晕"。 */
F.lissa = (u,t,o)=>{
  const th = u*P2;
  const k = 1 + 0.34*sstep(47.8, 49.6, t);          // 频率在句内往上冲
  o[0] = 0.90*Math.sin(3*th + t*0.5);
  o[1] = 0.74*Math.sin(4*th*k);
};

/* ── 9. A.D → B.C：时间反流 ──────────────────────────────────────
   同一个利萨如，但相位在倒着走：曲子唱"我们可以从公元去公元前"，
   曲线就把自己画回去。倒流会让它经过刚才已经画过的形状，很直观。 */
F.travel = (u,t,o)=>{
  const th = u*P2;
  const dir = 1 - 2*sstep(51.5, 53.4, t);           // +1 → −1
  o[0] = 0.90*Math.sin(3*th*dir + 1.2);
  o[1] = 0.74*Math.sin(4*th*dir + 0.7);
};

/* ── 10. unite：两条曲线合成一条 ─────────────────────────────────
   u<0.5 画 sin、u>0.5 画 cos，两条各自占满整个横轴；
   后半段两条的振幅与相位一起收拢，最后重合成一条 √2·sin(x+π/4)。
   ——"我们合为一体"在数学上就是两个函数变成同一个函数。 */
F.unite = (u,t,o)=>{
  const w = sstep(55.3, 58.6, t);
  const q = (u < 0.5 ? u*2 : (u-0.5)*2);            // 各自的 0..1
  const x = CW*(2*q-1);
  const ph = 2*Math.PI*(2*q-1);
  const s1 = 0.52*Math.sin(ph);
  const s2 = 0.52*Math.cos(ph);
  /* 合成目标：√2 sin(ph + π/4) */
  const sum = 0.735*Math.sin(ph + Math.PI/4);
  const a = u < 0.5 ? s1 : s2;
  o[0] = x;
  o[1] = a + (sum - a)*w;
};

/* ── 11. STIMULATIONS：高频调制 ──────────────────────────────────
   包里那层高频就是"刺激"：包络是慢的，载波是快的。 */
F.stim = (u,t,o)=>{
  const q = 2*u-1;
  /* 包络要在下一句开始前退回 0 —— 这样"刺激"结束时正好是一条干净的正弦，
     接上 SATISFACTION 的起点，两段之间不用交叉淡化。 */
  const env = sstep(59.3, 60.4, t) * (1 - sstep(62.20, 62.55, t));
  const car = Math.sin(2*Math.PI*q*9 + t*4.0);
  o[0] = CW*q;
  o[1] = 0.60*Math.sin(2*Math.PI*q) * (1 - env + env*car);
};

/* ── 12. SATISFACTION：收拢到唯一极值 ────────────────────────────
   其余部分按比例压平，只剩峰顶。满足 = 找到最大值，别处都不重要。 */
F.sat = (u,t,o)=>{
  const w = sstep(62.8, 65.6, t);
  const q = 2*u-1;
  const full = 0.60*Math.sin(2*Math.PI*q);
  /* 单峰：exp 型钟形，峰在 q=0.25 */
  const peak = 0.62*Math.exp(-Math.pow((q-0.25)/0.20, 2));
  o[0] = CW*q;
  o[1] = full*(1-w) + peak*w;
};

/* ── 13. make you happy：一条上扬的弧 ─────────────────────────── */
F.happy = (u,t,o)=>{
  const q = 2*u-1;
  o[0] = CW*q;
  o[1] = 0.52*Math.cos(Math.PI*q*0.86) - 0.10;
};

/* ── 14. SIMULATION：模拟 = 离散化 ───────────────────────────────
   正弦被量化成方波。世界被切成格子，"strange strange simulation"。 */
F.square = (u,t,o)=>{
  const w = sstep(69.6, 71.4, t);
  const q = 2*u-1;
  const soft = 0.62*Math.sin(2*Math.PI*q);
  const hard = 0.46*Math.tanh(7*Math.sin(2*Math.PI*q));
  o[0] = CW*q;
  o[1] = soft + (hard-soft)*w;
};

/* ── 15. eggplant ────────────────────────────────────────────────
   超椭圆 + 一个下垂的尖端 + 一弯蒂。这是原曲的梗，不能省。 */
F.eggplant = (u,t,o)=>{
  const th = u*P2;
  const n = 2.6;
  const sn = Math.sign(Math.cos(th)), ss = Math.sign(Math.sin(th));
  let x = 0.62*Math.pow(Math.abs(Math.cos(th)), 2/n)*sn;
  let y = 0.72*Math.pow(Math.abs(Math.sin(th)), 2/n)*ss;
  /* 下尖：底部 30% 往中间收，拉出一个蒂尖 */
  const low = Math.max(0, -y)/0.72;
  x *= 1 - 0.42*low*low;
  y -= 0.10*low*low;
  o[0] = x; o[1] = y - 0.04;
};

/* ── 16. tomato：圆 + 顶部五瓣萼 ─────────────────────────────────
   r = R(1 + 0.055·cos5θ) 只在顶上有效，就是番茄的那圈叶子。 */
F.tomato = (u,t,o)=>{
  const th = u*P2;
  const top = Math.max(0, Math.sin(th));
  const r = 0.66*(1 + 0.075*Math.cos(5*th)*Math.pow(top, 3));
  o[0] = r*Math.cos(th);
  o[1] = r*0.92*Math.sin(th) - 0.02;
};

/* ── 17. tabby cat：极坐标轮廓 + 两个耳峰 ────────────────────────
   傅里叶级数画猫要几十项才像；这个尺寸下用两个高斯耳峰 + 圆下巴
   已经足够认出来，而且依旧是一条"函数"。 */
F.cat = (u,t,o)=>{
  const th = u*P2;
  const ear = 6.0;
  const r = 0.60
    + 0.20*Math.pow(Math.exp(-Math.pow((th-1.02)/0.19, 2)), 0.6)
    + 0.20*Math.pow(Math.exp(-Math.pow((th-2.12)/0.19, 2)), 0.6)
    + 0.045*Math.cos(2*th + 0.4);
  o[0] = r*Math.cos(th);
  o[1] = r*0.86*Math.sin(th) - 0.03;
};

/* ── 18. EXISTENCE：介值定理 ────────────────────────────────────
   一条穿过 x 轴的曲线，两端符号相反 ⇒ 中间必有一点为零。
   这就是"你是我的存在证明"的严格写法。 */
F.proof = (u,t,o)=>{
  const w = sstep(85.3, 87.2, t);
  const q = 2*u-1;
  /* 起点 = 猫（逐字复刻 F.cat），终点 = 一条跨过 x 轴的曲线。
     跨过去这件事本身就是"存在性"：两端异号 ⇒ 中间必然有一点为零。 */
  const th = u*P2;
  const r = 0.60
    + 0.20*Math.pow(Math.exp(-Math.pow((th-1.02)/0.19, 2)), 0.6)
    + 0.20*Math.pow(Math.exp(-Math.pow((th-2.12)/0.19, 2)), 0.6)
    + 0.045*Math.cos(2*th + 0.4);
  const cx = r*Math.cos(th), cy = r*0.86*Math.sin(th) - 0.03;
  const fx = CW*q;
  const fy = 0.80*(q + 0.30)*Math.exp(-Math.pow(q*0.85, 2)) - 0.10;
  o[0] = cx + (fx-cx)*w;
  o[1] = cy + (fy-cy)*w;
};

/* ── 19. F → M：关于 y 轴镜像 ─────────────────────────────────── */
F.mirrorX = (u,t,o)=>{
  const w = sstep(88.7, 90.6, t);
  const q = 2*u-1;
  const x = CW*q;
  o[0] = x*(1-2*w);
  o[1] = 0.62*Math.sin(2*Math.PI*q + t*0.42);
};

/* ── 20. role switch：反函数，关于 y=x 翻 ────────────────────────
   把 (x,y) 与 (y,x) 互换，图像就是关于对角线镜像。
   曲线因此从"横向的波"变成"竖向的波"。 */
F.inverse = (u,t,o)=>{
  const w = sstep(95.5, 98.6, t);
  const q = 2*u-1;
  const x = CW*q, y = 0.62*Math.sin(2*Math.PI*q + 1.9);
  /* 反函数在视觉上要换轴：x'=y, y'=x，再缩放到取景窗比例 */
  const ix = y*1.55, iy = x*0.52;
  o[0] = x + (ix-x)*w;
  o[1] = y + (iy-y)*w;
};

/* ── 21. trance：对数螺旋 ────────────────────────────────────────
   r = a·e^{bθ}，θ 从 0 转到 5.5π。入迷就是一直转下去。 */
F.spiral = (u,t,o)=>{
  const w = sstep(99.5, 102.4, t);
  const q = 2*u-1;
  /* 起点必须和 F.inverse 的终态逐字一致：反函数的图像是 (y, x) 交换，
     所以这里也用 y*1.55 / x*0.52，少一个负号就会在接管那一帧翻个面。 */
  const x0 = CW*q, y0 = 0.62*Math.sin(2*Math.PI*q + 1.9);
  const sx0 = y0*1.55, sy0 = x0*0.52;
  const th = u*Math.PI*5.0;
  const R = 0.115*Math.exp(0.30*th);
  const sx = R*Math.cos(th)*0.92;
  const sy = R*Math.sin(th);
  o[0] = sx0 + (sx-sx0)*w;
  o[1] = sy0 + (sy-sy0)*w;
};

/* ── 22. VIBRATIONS：阻尼振荡 ───────────────────────────────────
   y = e^{-kx}·sin(ωx)：振动还在，但已经越来越弱。 */
F.damped = (u,t,o)=>{
  const w = sstep(103.7, 106.0, t);
  const th = u*Math.PI*5.0;
  const R0 = 0.115*Math.exp(0.30*th);
  const src = [R0*Math.cos(th)*0.92, R0*Math.sin(th)];
  const q = u;                                       // 0..1
  const x = CW*(2*q-1);
  const y = 0.60*Math.exp(-2.2*q)*Math.sin(q*Math.PI*7.5);
  o[0] = src[0] + (x-src[0])*w;
  o[1] = src[1] + (y-src[1])*w;
};

/* ── 23. COMPLETION：闭合 ───────────────────────────────────────
   两端被拉到一起，形成闭环。完成 = 首尾相接，没有缺口。 */
F.closed = (u,t,o)=>{
  const w = sstep(107.4, 110.0, t);
  const q = u;
  const x0 = CW*(2*q-1);
  const y0 = 0.60*Math.exp(-2.2*q)*Math.sin(q*Math.PI*7.5);
  const th = q*P2;
  const R = 0.72;
  const cx = R*Math.sin(th), cy = -R*Math.cos(th);
  o[0] = x0 + (cx-x0)*w;
  o[1] = y0 + (cy-y0)*w;
};

/* ── 24. ISOLATION：崩解成孤立点 ────────────────────────────────
   位置按 1→0 收拢到几条孤立的短线，dash 再把它们打断成点。
   她"被留在孤立里"——曲线也就散成点集。 */
F.isolate = (u,t,o)=>{
  const w = sstep(111.2, 116.0, t);
  const th = u*P2, R = 0.72;
  const cx = R*Math.sin(th), cy = -R*Math.cos(th);
  /* 目标：6 个孤立的短弧，半径越小越靠中心 */
  const k = Math.floor(u*6);
  const local = u*6 - k;
  const ang = (k/6)*P2 + local*0.30;
  const rr = 0.72*(1 - 0.135*k);
  const ix = rr*Math.sin(ang), iy = -rr*Math.cos(ang);
  o[0] = cx + (ix-cx)*w;
  o[1] = cy + (iy-cy)*w;
};

/* ── 25. FRAGMENTS → DISHEARTENED：碎成两半的心 ─────────────────
   左右两半各自往外移，中间裂开。这是"心碎"唯一诚实的画法。 */
F.broken = (u,t,o)=>{
  const w = sstep(118.6, 122.4, t);
  /* 起点：上一句的孤立点 */
  const k = Math.floor(u*6);
  const local = u*6 - k;
  const ang = (k/6)*P2 + local*0.30;
  const rr = 0.72*(1 - 0.135*k);
  const sx = rr*Math.sin(ang), sy = -rr*Math.cos(ang);

  /* 目标：心分两半。u<0.5 走左半（θ ∈ [π,2π]），u>0.5 走右半 */
  const half = u < 0.5 ? 0 : 1;
  const v = half ? (u-0.5)*2 : u*2;                  // 0..1
  const a = half ? (Math.PI + v*Math.PI) : (Math.PI + (1-v)*Math.PI);
  const hs = [0,0];
  heartPt(a, hs);
  const gap = 0.055 + 0.075*sstep(120.4, 124.4, t);
  hs[0] += (half ? gap : -gap);
  o[0] = sx + (hs[0]-sx)*w;
  o[1] = sy + (hs[1]-sy)*w;
};

/* ── 26. ILLEGAL ARGUMENTS：定义域之外 ──────────────────────────
   曲线上出现一段"不合法"的区间：那里不连线、只有红色标记。
   断开由 plot.js 的 uHole 处理（退化段 = 不可见）。 */
F.illegal = (u,t,o)=>{
  const q = 2*u-1;
  const A = 0.60;
  o[0] = CW*q;
  o[1] = A*Math.sin(2*Math.PI*q*1.5) * (1 - 0.55*sstep(125.9,127.4,t));
};

/* ── 27. EXECUTION ×12：心电图 ───────────────────────────────────
   每一次 EXECUTION 是一记 QRS：一个窄的正峰带一记负向回落。
   12 次连起来就是一条心电。 */
const ECG_T = [147.66,148.60,149.52,150.54,151.52,152.28,153.16,153.98,155.20,156.08,157.04,158.00];
F.ecg = (u,t,o)=>{
  const q = 2*u-1;
  let y = 0;
  for(let k=0;k<12;k++){
    const on = sstep(ECG_T[k], ECG_T[k]+0.10, t);
    if(on <= 0.001) continue;
    const pk = -0.92 + k*0.168;
    const d = q - pk;
    y += on * ( 0.62*Math.exp(-Math.pow(d/0.022, 2))
              - 0.26*Math.exp(-Math.pow(d/0.011, 2))
              + 0.10*Math.exp(-Math.pow((d-0.045)/0.030, 2)) );
  }
  o[0] = CW*q;
  o[1] = y + 0.012*Math.sin(q*90 + t*3);
};

/* ── 28. trapped：被关进格子 ────────────────────────────────────
   心电被压成阶梯。世界是"strange simulation"，也被量化成格子。
   起点的两条阶梯线夹住她（囚笼在 3D 里另有 OBJ.cage）。 */
F.cage = (u,t,o)=>{
  F.ecg(u,t,o);                       // 起点完全等于上一段的心电，交接无缝
  const w = sstep(173.8, 176.2, t);
  if(w > 0.001){
    const q = 2*u-1;
    const cell = 0.40*Math.tanh(9*Math.sin(3.4*Math.PI*q));
    o[1] = o[1] + (cell - o[1])*w;
  }
  /* 176.60 之后整条线朝"心形的起笔点"收拢成一点。
     这不是退场 —— 下一段就是从那个点起笔的，所以这里必须收成一个点，
     不然硬切的那一帧会从一条横贯全宽的阶梯直接跳成一颗孤零零的点。 */
  const k = sstep(176.60, 177.20, t);
  if(k > 0.001){
    o[0] += (HEART_X0 - o[0])*k;
    o[1] += (HEART_Y0 - o[1])*k;
  }
};

/* ── 29. heartTrace：从一个点起笔，一笔画成心 ────────────────────
   "I've studied how to properly LOVE" —— 学一件东西的过程，是把它
   一笔一笔画出来，而不是让它凭空出现。

   u 在这里不是参数，是**笔画进度**（已画弧长 / 全长）。
   uDraw 从 0 走到 1，笔尖就从凹口出发：右瓣 → 心尖 → 左瓣 → 回到凹口。
   终点和 F.heart 逐点重合，所以 183.646 那一刀交接看不出来。 */
F.heartTrace = (u,t,o)=>{
  heartPt(arcToParam(u), o);
};

/* ── 30. LOVE：就是心 ───────────────────────────────────────────
   脉动 = 心室收缩。整个形状乘一个缓动的 1+0.03·beat。 */
F.heart = (u,t,o)=>{
  heartPt(u*P2, o);
  /* 188.4 之后"被剖开"：左右两半沿中线各让一步。
     位移必须按 y 加权 —— 心尖和顶部凹口都落在 x=0，那里如果也让开，
     整颗心就从中间断成两条线，读起来是渲染坏了，不是裂开。 */
  const cr = sstep(188.4, 189.6, t) * (1 - sstep(200.5, 203.5, t));
  if(cr > 0.001){
    const sd = o[0] >= 0 ? 1 : -1;
    const band = Math.exp(-Math.pow((o[1] + 0.02)/0.42, 2));
    o[0] += sd*0.098*cr*band;
  }
};

/* ── 31. 溶解：心还在，但点开始飞走 ─────────────────────────────
   不是"淡出"，是逐点逃逸——所以观众看到的是她在散。 */
F.dissolve = (u,t,o)=>{
  const k = sstep(191.6, 205.6, t);
  heartPt(u*P2, o);
  if(k > 0.001){
    const e = Math.pow(k, 1.7) * (0.55 + 0.45*jit(u,5));
    o[0] += jit(u,7)*0.42*e;
    o[1] += jit(u,9)*0.34*e + 0.28*e*e;
  }
};

/* ── 32. 最后一击之后：只剩一条水平线 ─────────────────────────── */
F.endline = (u,t,o)=>{
  const k = sstep(206.2, 208.4, t);
  heartPt(u*P2, o);
  o[0] *= (1-k);
  o[1] *= (1-k);
  o[0] += CW*(2*u-1)*k;
};
