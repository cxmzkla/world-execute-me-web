/* ══════════════════════════════════════════════════════════════════
   plot.js —— 世界面板就是一张坐标纸
   ──────────────────────────────────────────────────────────────────
   三件东西：
     grid   数学网格（0.2 细 / 1.0 粗），给"这是坐标系"提供语境
     axes   XY 轴 + 箭头 + 刻度，从原点向外长
     curve  两条曲线（A 主 / B 副），顶点每帧由函数写入
   ──────────────────────────────────────────────────────────────────
   为什么用两条曲线而不是一条：
     拓扑不同的形状之间（心电 → 心）没法靠位置插值过渡。
     但"旧的淡出、新的一笔画进来"这个动作，本身就是这个片子想要的
     语法——运算正在推进。节目单保证"下一段的起始形态 = 上一段的
     终止形态"，所以交接处看不出接缝。
   ══════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { CW } from './shapes.js';

export const SEG = 1200;              // 采样段数（1280 宽下每段约 0.4px）
export const AX = 1.72, AY = 0.90;    // 轴端点

const VS = /* glsl */`
  attribute float aMid;
  attribute vec3  aC;
  uniform float uDraw, uOp, uDash, uGap, uDashMix, uTip, uTipAmp;
  varying float vA;
  varying vec3  vC;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    /* 一笔一笔画：未画到的段整段灭掉。用硬 step 而不是 smoothstep，
       因为 aMid 是段中点，平滑会在起点留半段亮光。 */
    float on = step(aMid, uDraw - 0.0016);
    /* 虚线按参数打断：uDash 决定齿数，uGap 决定断口占比。
       uGap 拉到 0.9 以上就是"点集"，曲线还没连起来。 */
    float g   = fract(aMid * uDash + 0.0009);
    float cut = step(g, 1.0 - uGap);
    float a = uOp * mix(1.0, cut, uDashMix) * on;
    /* 笔尖：画到哪儿哪儿亮一下，观众才看得见"这一笔在走" */
    a *= 1.0 + uTipAmp * exp(-pow((aMid - uTip) * 34.0, 2.0));
    vA = a;
    vC = aC;
  }
`;
const FS = /* glsl */`
  uniform vec3 uCol;
  varying float vA;
  varying vec3  vC;
  void main(){
    if(vA < 0.005) discard;
    gl_FragColor = vec4(uCol * vC * vA, 1.0);
  }
`;

function mkMat(col){
  return new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS,
    uniforms: {
      uDraw:{value:1}, uOp:{value:1}, uDash:{value:40}, uGap:{value:0.5},
      uDashMix:{value:0}, uTip:{value:-1}, uTipAmp:{value:0},
      uCol:{value: new THREE.Color(col)}
    },
    transparent:true, depthTest:false, depthWrite:false,
    blending: THREE.AdditiveBlending
  });
}

/* ── 静态线段收集器 ─────────────────────────────────────────────── */
function LB(){
  const p=[], m=[], c=[];
  return {
    seg(x1,y1,x2,y2, m1,m2, cc){
      p.push(x1,y1,0, x2,y2,0);
      m.push(m1,m2);
      c.push(cc,cc,cc, cc,cc,cc);
    },
    geo(){
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p,3));
      g.setAttribute('aMid',    new THREE.Float32BufferAttribute(m,1));
      g.setAttribute('aC',      new THREE.Float32BufferAttribute(c,3));
      return g;
    }
  };
}

/* ── 网格 ─────────────────────────────────────────────────────────
   细线 0.2 一格，粗线 1.0 一格。亮度差 3 倍，眼睛立刻读出量级。 */
function buildGrid(){
  const b = LB();
  const major = v => Math.abs(v - Math.round(v)) < 0.01;
  for(let i=-8; i<=8; i++){
    const x = i*0.2;
    if(Math.abs(x) < 0.001) continue;                 // 轴自己会画
    b.seg(x,-AY, x,AY, 0,1, major(x)?0.62:0.20);
  }
  for(let i=-4; i<=4; i++){
    const y = i*0.2;
    if(Math.abs(y) < 0.001) continue;
    b.seg(-AX,y, AX,y, 0,1, major(y)?0.62:0.20);
  }
  return b.geo();
}

/* ── 轴 ───────────────────────────────────────────────────────────
   aMid 用"距原点的归一化距离"，所以 uDraw 0→1 时四条半轴同时
   从原点往外长——四条轴一共 2.4 秒，正好是片头的开机自检。 */
function buildAxes(){
  const b = LB();
  const arm = (dx,dy,L)=>{
    const N = 26;
    for(let i=0;i<N;i++){
      const s0 = i/N, s1 = (i+1)/N;
      b.seg(dx*L*s0, dy*L*s0, dx*L*s1, dy*L*s1, s0, s1, 1);
    }
    /* 箭头 */
    const hx = dy*0.042, hy = dx*0.042;
    b.seg(dx*L, dy*L, dx*L - dx*0.070 + hx, dy*L - dy*0.070 + hy, 1,1, 1);
    b.seg(dx*L, dy*L, dx*L - dx*0.070 - hx, dy*L - dy*0.070 - hy, 1,1, 1);
  };
  arm( 1, 0, AX); arm(-1, 0, AX);
  arm( 0, 1, AY); arm( 0,-1, AY);

  /* 刻度：长度 = 距原点归一化，和轴同步出现 */
  for(let i=-8; i<=8; i++){
    if(!i) continue;
    const x = i*0.2;
    if(Math.abs(x) > AX-0.09) continue;
    const big = Math.abs(x - Math.round(x)) < 0.01;
    const h = big ? 0.038 : 0.018;
    const s = Math.abs(x)/AX;
    b.seg(x,0, x,h, s,s, big?0.95:0.62);
    b.seg(x,0, x,-h, s,s, big?0.95:0.62);
  }
  for(let i=-4; i<=4; i++){
    if(!i) continue;
    const y = i*0.2;
    const big = Math.abs(y - Math.round(y)) < 0.01;
    const h = big ? 0.038 : 0.018;
    const s = Math.abs(y)/AY;
    b.seg(0,y, h,y, s,s, big?0.95:0.62);
    b.seg(0,y, -h,y, s,s, big?0.95:0.62);
  }
  /* 原点：一个小小的空心方 */
  b.seg(-0.016,0, 0.016,0, 0,0, 1);
  b.seg(0,-0.016, 0,0.016, 0,0, 1);
  return b.geo();
}

/* ── 动态曲线 ───────────────────────────────────────────────────── */
function buildCurveGeo(){
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEG*6), 3));
  const mid = new Float32Array(SEG*2);
  for(let i=0;i<SEG;i++){ mid[i*2] = mid[i*2+1] = (i+0.5)/SEG; }
  g.setAttribute('aMid', new THREE.BufferAttribute(mid,1));
  g.setAttribute('aC',   new THREE.BufferAttribute(new Float32Array(SEG*6).fill(1), 3));
  return g;
}

export const plotG = new THREE.Group();
plotG.name = 'plot';

export const grid  = new THREE.LineSegments(buildGrid(), mkMat(0x9fd8e4));
export const axes  = new THREE.LineSegments(buildAxes(), mkMat(0xcfe6ee));
export const curveA = new THREE.LineSegments(buildCurveGeo(), mkMat(0xffffff));
export const curveB = new THREE.LineSegments(buildCurveGeo(), mkMat(0xffffff));
/* 第三条专用于"参照"：拟合那一段要同时画出目标函数（虚线），
   它既不是当前曲线也不是上一条，所以不能借用 A/B 两条通道。 */
export const curveR = new THREE.LineSegments(buildCurveGeo(), mkMat(0xffffff));
export const tanLine = new THREE.LineSegments(buildCurveGeo(), mkMat(0xffffff));
/* 切线只用一个短段，复用 SEG 段几何是浪费，单独建一个 2 段的 */
tanLine.geometry = (()=>{
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  g.setAttribute('aMid', new THREE.BufferAttribute(new Float32Array([0.5,0.5]),1));
  g.setAttribute('aC',   new THREE.BufferAttribute(new Float32Array([1,1,1,1,1,1]),3));
  return g;
})();

/* 起笔点：一个十字 + 一圈菱形。
   LOVE 那一段她先把自己收成一个点，笔从这个点亮起来的地方起走 —— 
   没有这个标记，观众只会看到"一条线突然从这里冒出来"。 */
export const plotDot = new THREE.LineSegments((()=>{
  const b = LB();
  const r = 0.026, d = 0.050;
  b.seg(-r,0, r,0, 0.5,0.5, 1);
  b.seg(0,-r, 0,r, 0.5,0.5, 1);
  b.seg(0,-d,  d,0, 0.5,0.5, 0.85);
  b.seg( d,0,  0,d, 0.5,0.5, 0.85);
  b.seg(0, d, -d,0, 0.5,0.5, 0.85);
  b.seg(-d,0,  0,-d,0.5,0.5, 0.85);
  return b.geo();
})(), mkMat(0xffffff));

grid.renderOrder = 1; axes.renderOrder = 2;
curveR.renderOrder = 3; curveB.renderOrder = 3;
curveA.renderOrder = 4; tanLine.renderOrder = 5;
plotDot.renderOrder = 6;
[grid, axes, curveA, curveB, curveR, tanLine, plotDot].forEach(o=>{
  o.frustumCulled = false;
  plotG.add(o);
});

/* ══════════════════════════════════════════════════════════════════
   每帧求值
   ══════════════════════════════════════════════════════════════════ */
const TMP = new Float32Array((SEG+1)*2);
const P1 = [0,0], P2 = [0,0];

function writeCurve(obj, fn, t){
  const pos = obj.geometry.attributes.position.array;
  for(let i=0;i<=SEG;i++){
    fn(i/SEG, t, P1);
    TMP[i*2] = P1[0]; TMP[i*2+1] = P1[1];
  }
  /* 跳跃断开：相邻采样点如果相距超过 0.75，就把这一段做成退化段
     （两顶点重合 → 线长为零 → 不渲染）。
     双曲线的两支、被劈成两半的心、溶解时飞散的点，全靠这一条；
     否则采样会把"这一支的末尾"和"那一支的开头"直接连起来，
     画面上就会出现一根横贯整个坐标系的斜线。 */
  const JUMP2 = 0.75*0.75;
  for(let i=0;i<SEG;i++){
    const x0 = TMP[i*2],   y0 = TMP[i*2+1];
    const x1 = TMP[i*2+2], y1 = TMP[i*2+3];
    const dx = x1-x0, dy = y1-y0;
    if(dx*dx + dy*dy > JUMP2){
      pos[i*6+0] = x0; pos[i*6+1] = y0;
      pos[i*6+3] = x0; pos[i*6+4] = y0;
    }else{
      pos[i*6+0] = x0; pos[i*6+1] = y0;
      pos[i*6+3] = x1; pos[i*6+4] = y1;
    }
  }
  obj.geometry.attributes.position.needsUpdate = true;
}

function applySt(obj, s, t){
  if(!s){ obj.visible = false; return; }
  obj.visible = s.op > 0.004;
  if(!obj.visible) return;
  const u = obj.material.uniforms;
  u.uDraw.value    = s.draw;
  u.uOp.value      = s.op;
  u.uDash.value    = s.dash;
  u.uGap.value     = s.gap;
  u.uDashMix.value = s.dashMix;
  u.uTip.value     = s.tip ?? -1;
  u.uTipAmp.value  = s.tipAmp ?? 0;
  u.uCol.value.setRGB(s.col[0], s.col[1], s.col[2]);
  writeCurve(obj, s.f, t);
}

export function updatePlot(t, st){
  /* 曲线 */
  applySt(curveA, st.a, t);
  applySt(curveB, st.b, t);
  applySt(curveR, st.r, t);

  /* 轴 / 网格 */
  const au = axes.material.uniforms;
  au.uDraw.value = st.ax.draw;
  au.uOp.value   = st.ax.op;
  au.uCol.value.setRGB(st.ax.col[0], st.ax.col[1], st.ax.col[2]);
  axes.visible = st.ax.op > 0.004;

  const gu = grid.material.uniforms;
  gu.uOp.value = st.grid.op;
  gu.uCol.value.setRGB(st.grid.col[0], st.grid.col[1], st.grid.col[2]);
  grid.visible = st.grid.op > 0.004;

  /* 起笔点 */
  const D = st.dot;
  plotDot.visible = !!(D && D.op > 0.004);
  if(plotDot.visible){
    plotDot.position.set(D.x, D.y, 0);
    plotDot.scale.setScalar(D.s || 1);
    const du = plotDot.material.uniforms;
    du.uOp.value = D.op;
    du.uDraw.value = 1;
    du.uDashMix.value = 0;
    du.uCol.value.setRGB(D.col[0], D.col[1], D.col[2]);
  }

  /* 切线 */
  const T = st.tan;
  tanLine.visible = !!(T && T.on > 0.004);
  if(tanLine.visible){
    /* 一定要用 T.fn（节目单里"这一句"的形状），不能用 st.a：
       A/B 是奇偶轮换的，轮到 B 的时候 st.a 其实是上一句。 */
    const f = T.fn || (st.a && st.a.f);
    const uu = T.u;
    /* 差分步长不能太小：1200 段的分辨率下，0.0035 的差分会被量化噪声
       主导，切线方向会随机跳。0.010 大约十段，既够局部又够稳。 */
    const e = 0.010;
    f(Math.max(0, uu-e), t, P1);
    f(Math.min(1, uu+e), t, P2);
    let dx = P2[0]-P1[0], dy = P2[1]-P1[1];
    const L = Math.hypot(dx,dy) || 1;
    dx /= L; dy /= L;
    f(uu, t, P1);
    const half = 0.30;
    const pos = tanLine.geometry.attributes.position.array;
    pos[0] = P1[0]-dx*half; pos[1] = P1[1]-dy*half;
    pos[3] = P1[0]+dx*half; pos[4] = P1[1]+dy*half;
    tanLine.geometry.attributes.position.needsUpdate = true;
    const tu = tanLine.material.uniforms;
    tu.uOp.value = T.on * 0.85;
    tu.uDraw.value = 1;
    tu.uDashMix.value = 0.55;
    tu.uDash.value = 9;
    tu.uGap.value = 0.45;
    tu.uCol.value.setRGB(T.col[0], T.col[1], T.col[2]);
  }
}

/* 供外部把"世界坐标 → 世界面板内百分比"用（标公式用） */
export const PLOT = { AX, AY, CW };
