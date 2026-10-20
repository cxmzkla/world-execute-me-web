import * as THREE from 'three';
import { MAXP } from '../core/config.js';
import { rnd, rr, clamp, lerp } from '../core/math.js';
import { heartRadius } from './heartField.js';
import { scene } from '../core/stage.js';

/* ══════════════════════════════════════════════════════════════════
   particles.js —— 全局单例粒子池（up to 130k）
   一种形态 = 一组预算好的 position/color 数组；
   换形态只把新数组灌进同一块 buffer，再用 drawRange 截断。
   形变由 uMorph 驱动：aPrev → position 的插值，按"时间"推进，
   所以低帧率下也不会出现心形要好几秒才成形的情况。
   ══════════════════════════════════════════════════════════════════ */

const pGeo = new THREE.BufferGeometry();
const aPos  = new Float32Array(MAXP*3);
const aPrev = new Float32Array(MAXP*3);
const aCol  = new Float32Array(MAXP*3);
const aSeed = new Float32Array(MAXP);
for(let i=0;i<MAXP;i++) aSeed[i]=rnd();

pGeo.setAttribute('position', new THREE.BufferAttribute(aPos,3));
pGeo.setAttribute('aPrev',    new THREE.BufferAttribute(aPrev,3));
pGeo.setAttribute('aColor',   new THREE.BufferAttribute(aCol,3));
pGeo.setAttribute('aSeed',    new THREE.BufferAttribute(aSeed,1));

export const pMat = new THREE.ShaderMaterial({
  uniforms:{
    uTime:{value:0}, uMorph:{value:1}, uSize:{value:1.9},
    uSpread:{value:1}, uWarm:{value:0}, uAlpha:{value:1}, uSwirl:{value:0},
    uSpill:{value:0}, uCrack:{value:0},
    uTint:{value:new THREE.Color(1,1,1)}, uKeep:{value:0.12}
  },
  vertexShader:`
    uniform float uTime,uMorph,uSize,uSpread,uWarm,uSwirl,uSpill,uAlpha,uCrack,uKeep;
    uniform vec3 uTint;
    attribute vec3 aPrev; attribute vec3 aColor; attribute float aSeed;
    varying vec3 vC; varying float vA; varying float vK;
    void main(){
      float m = clamp(uMorph,0.0,1.0);
      m = m*m*(3.0-2.0*m);
      vec3 p = mix(aPrev, position, m);
      float s = aSeed*6.2831;
      // 呼吸 / 漂浮
      p += vec3(sin(uTime*0.63+s*1.7), cos(uTime*0.51+s*2.3), sin(uTime*0.41+s*0.9))
           * 0.013 * uSpread;
      // 涡旋
      float ang = uSwirl * 0.35 * (0.4+aSeed);
      float ca=cos(ang), sa=sin(ang);
      p.xz = mat2(ca,-sa,sa,ca) * p.xz;
      // 心跳
      float pulse = 1.0 + 0.02*sin(uTime*1.2 + s);
      p *= pulse;
      // 心壁裂开：贴着裂缝的粒子被推向两侧，真的撕出一道口子
      if(uCrack > 0.001){
        float dxs = p.x + 0.16 + 0.13*sin(p.y*8.5) + 0.05*sin(p.y*21.0);
        float g = exp(-dxs*dxs*80.0);
        p.x += sign(dxs + 1e-4) * g * uCrack * 0.30;
        p.y += g * uCrack * 0.04;
      }
      // 心壁破裂：一部分粒子从左侧缺口漏出去
      if(uSpill > 0.001){
        float leak = smoothstep(0.34, 0.92, aSeed) * uSpill;
        vec3 dir = normalize(vec3(-0.95, 0.24, 0.20));
        p += dir * leak * (0.35 + aSeed*2.30);
        p += vec3(0.0, (aSeed-0.62)*1.10, (aSeed-0.45)*0.55) * leak;
        p += vec3(sin(s*11.0+uTime*1.7), cos(s*7.0+uTime*1.3), sin(s*5.0+uTime*0.9))
             * leak * 0.16;
      }
      vec4 mv = modelViewMatrix * vec4(p,1.0);
      gl_Position = projectionMatrix * mv;
      /* 12.0 这个系数是调出来的：再大一点整屏会糊成一片雾 */
      gl_PointSize = uSize * (12.0 / max(0.001,-mv.z));
      /* 单色化：参考片里粒子只是"这一段的颜色"，不是彩虹。
         取亮度 × 幕色，只保留少量原色（uKeep），以免结构全被抹平。 */
      float lum = dot(aColor, vec3(0.299,0.587,0.114));
      vC = mix(uTint*(lum*1.55), aColor, uKeep);
      vA = uAlpha * mix(1.0, 0.9+0.1*sin(uTime*2.0+s*9.0), 0.25);
      vK = 0.0;
    }`,
  fragmentShader:`
    varying vec3 vC; varying float vA; varying float vK;
    void main(){
      vec2 d = gl_PointCoord - 0.5;
      float r = length(d);
      if(r>0.5) discard;
      float a = pow(smoothstep(0.5,0.0,r), 1.7);
      gl_FragColor = vec4(vC, a*vA);
    }`,
  transparent:true, depthTest:false, depthWrite:false,
  blending: THREE.AdditiveBlending
});

export const points = new THREE.Points(pGeo, pMat);
points.frustumCulled = false;
scene.add(points);

/* ── 形态状态 ───────────────────────────────────────────────────── */
export const ps = {
  curShape: 'cloud',
  morphT0: -9,        // 本次形变的起点时间
  morphDur: 0.62,
  nowT: 0,
  skipMorph: false    // 跳转进度条时置 true：形态直接到位，不播过渡
};

export function setShape(name, instant, t){
  if(!SH[name] || ps.curShape===name) return;
  aPrev.set(SH[ps.curShape] ? SH[ps.curShape].pos : aPos);
  aPos.set(SH[name].pos);
  aCol.set(SH[name].col);
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.aPrev.needsUpdate = true;
  pGeo.attributes.aColor.needsUpdate = true;
  pGeo.setDrawRange(0, SH[name].n);
  ps.morphT0 = (t === undefined ? ps.nowT : t) - (instant ? 9 : 0);
  ps.curShape = name;
}

export function initShape(){
  aPos.set(SH.cloud.pos); aPrev.set(SH.cloud.pos); aCol.set(SH.cloud.col);
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.aPrev.needsUpdate = true;
  pGeo.attributes.aColor.needsUpdate = true;
  pGeo.setDrawRange(0, SH.cloud.n);
}

/* ══════════════════════════════════════════════════════════════════
   形态库
   ══════════════════════════════════════════════════════════════════ */
export const SH = {}; // name -> {pos, col, n}

function makeShape(name, n, fn){
  const pos = new Float32Array(MAXP*3);
  const col = new Float32Array(MAXP*3);
  const p = new THREE.Vector3(), c = new THREE.Color();
  for(let i=0;i<n;i++){
    fn(i, p, c, i/n);
    pos[i*3]=p.x; pos[i*3+1]=p.y; pos[i*3+2]=p.z;
    col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
  }
  // 补空位（避免上一个形态的残留）
  for(let i=n;i<MAXP;i++){ pos[i*3]=0;pos[i*3+1]=-999;pos[i*3+2]=0; }
  SH[name] = { pos, col, n };
}
const gauss = ()=> (rnd()+rnd()+rnd()-1.5)*0.9;

export function buildShapes(){
  /* cloud —— 旋臂星云（不是均匀噪声，否则看起来像一团涂抹） */
  makeShape('cloud', 13500, (i,p,c)=>{
    const arm = Math.floor(rnd()*3);
    const r = Math.pow(rnd(),0.70)*1.55;
    const ang = rnd()*0.9 + r*2.4 + arm*2.0944;
    const thick = 0.26*(1-r*0.32);
    p.set(Math.cos(ang)*r, gauss()*thick*1.5, Math.sin(ang)*r*0.72);
    const k = clamp(1.0-r/1.7);
    c.setRGB(0.04+0.09*k, 0.20+0.30*k, 0.26+0.32*k).multiplyScalar(0.18+0.42*k);
  });

  /* text —— 立体字（把 "world.execute(me);" 光栅化后采样） */
  (function(){
    const cv = document.createElement('canvas'); cv.width=2048; cv.height=340;
    const g = cv.getContext('2d');
    g.fillStyle='#000'; g.fillRect(0,0,2048,340);
    g.fillStyle='#fff'; g.textAlign='center'; g.textBaseline='middle';
    g.font='600 150px ui-monospace, "JetBrains Mono", monospace';
    g.fillText('world.execute(me);',1024,175);
    const d = g.getImageData(0,0,2048,340).data;
    const pts=[];
    for(let y=0;y<340;y+=3) for(let x=0;x<2048;x+=3){
      if(d[(y*2048+x)*4]>128) pts.push([x,y]);
    }
    makeShape('text', 62000, (i,p,c)=>{
      const q = pts[(i*7919)%pts.length];
      const jx = gauss()*1.4, jy = gauss()*1.4;
      p.set((q[0]+jx-1024)/300, -(q[1]+jy-170)/300, gauss()*0.10);
      const t = rnd();
      c.setRGB(0.35+t*0.5, 0.85+t*0.15, 0.95).multiplyScalar(0.55+t*0.45);
    });
  })();

  /* points —— 零维膨胀：从一点长成一个球
     r 的指数别太偏外。原来用 0.36，点几乎全堆在球壳上，
     投影出来就是一圈发光的毛边，跟线框球撞在一起谁也看不清。
     0.78 才是"有内有外"的雾球：中间有东西，边缘自然变厚。 */
  makeShape('points', 34000, (i,p,c)=>{
    const r = 0.14 + Math.pow(rnd(),0.78)*0.98;
    const th=rnd()*Math.PI*2, ph=Math.acos(rr(-1,1));
    p.set(Math.sin(ph)*Math.cos(th)*r, Math.sin(ph)*Math.sin(th)*r, Math.cos(ph)*r);
    const k=rnd();
    c.setRGB(0.12+k*0.22, 0.55+k*0.4, 0.62+k*0.35).multiplyScalar(0.20+0.32*rnd());
  });

  /* ring —— 周长 */
  makeShape('ring', 30000, (i,p,c)=>{
    const a=rnd()*Math.PI*2, R=1.35, tr=Math.pow(rnd(),0.7)*0.09;
    const r2=R+ (gauss()*0.02);
    p.set(Math.cos(a)*r2 + Math.cos(a)*tr, Math.sin(a)*r2 + Math.sin(a)*tr, gauss()*0.05);
    const k=rnd();
    c.setRGB(0.2+k*0.3, 0.85+k*0.15, 0.85).multiplyScalar(0.42+k*0.36);
  });

  /* sine —— 正弦带。带子要薄：0.12 画出来是一条发光的香肠，
     而参考片里那种精密感来自"细"而不是"亮"。 */
  makeShape('sine', 36000, (i,p,c)=>{
    const x = rr(-2.0,2.0);
    const y = Math.sin(x*2.6)*0.62;
    const z = rr(-0.05,0.05);
    const band = 0.045;
    p.set(x, y + gauss()*band*0.4, z + gauss()*band*0.5);
    const k=rnd();
    c.setRGB(0.15+k*0.2, 0.75+k*0.25, 0.9).multiplyScalar(0.72);
  });

  /* hyperbola —— 极限 */
  makeShape('hyperbola', 34000, (i,p,c)=>{
    const side = i%2? 1:-1;
    const u = rr(-1.7,1.7);
    const x = Math.cosh(u)*0.86;
    const z = Math.sinh(u)*0.86*0.55;
    const tail = Math.abs(u)/1.7;
    p.set(side*(x + gauss()*0.008), z + gauss()*0.008, gauss()*0.015);
    const k = 1-tail*0.75;
    c.setRGB(0.15+0.2*k, 0.8*k+0.15, 0.85*k+0.2).multiplyScalar(0.42+0.50*k);
  });

  /* stream —— 上升的螺旋漏斗：中心留空，才看得出"涌出" */
  makeShape('stream', 48000, (i,p,c)=>{
    const u = Math.pow(rnd(), 0.62);          /* 0=芯 1=外缘 */
    const a = rnd()*Math.PI*2 + u*9.0;
    const r = 0.13 + u*1.04;
    const y = -1.05 + u*1.86 + gauss()*0.05;
    p.set(Math.cos(a)*r, y, Math.sin(a)*r*0.88 + gauss()*0.04);
    const k = 1-u;
    c.setRGB(0.20+k*0.30, 0.72+k*0.30, 0.86+k*0.14).multiplyScalar(0.22+0.55*k);
  });

  /* eggplant —— 长椭球参数曲面 */
  makeShape('eggplant', 44000, (i,p,c)=>{
    const u = rnd()*Math.PI*2;
    const v = Math.acos(rr(-1,1));
    const n = 2.6;
    const sx = 0.52, sy = 1.02, sz = 0.52;
    const cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v);
    const rad = (a,b)=> Math.pow(Math.pow(Math.abs(a),n)+Math.pow(Math.abs(b),n), -1/n);
    const R = rad(cu*cv, su*cv);
    p.set(R*cu*cv*sx, R*su*cv*sy, R*sv*sz);
    p.multiplyScalar(1 + gauss()*0.012);
    const k=rnd();
    c.setRGB(0.10+k*0.16, 0.16+k*0.22, 0.20+k*0.26).multiplyScalar(0.7+k*0.5);
  });

  /* sphereP —— 完美球：玻璃展柜。点要稀、要暗，她才能被看见 */
  makeShape('sphereP', 12000, (i,p,c)=>{
    const th=rnd()*Math.PI*2, ph=Math.acos(rr(-1,1));
    const R=1.05 + gauss()*0.004;
    p.set(Math.sin(ph)*Math.cos(th)*R, Math.sin(ph)*Math.sin(th)*R, Math.cos(ph)*R);
    const k=rnd();
    c.setRGB(0.82+k*0.18, 0.26+k*0.18, 0.28+k*0.16).multiplyScalar(0.16+k*0.20);
  });

  /* waves —— 声波同心环 */
  makeShape('waves', 26000, (i,p,c)=>{
    const ring = Math.floor(rnd()*7);
    const a = rnd()*Math.PI*2;
    const R = 0.28 + ring*0.26 + gauss()*0.012;
    p.set(Math.cos(a)*R, Math.sin(a)*R*0.34, gauss()*0.02);
    const k=1-ring/7;
    c.setRGB(0.2+k*0.3, 0.8+k*0.2, 0.7+k*0.3).multiplyScalar(0.22+0.44*k);
  });

  /* heartFill —— 心形：一层贴着皮的亮壳 + 心腔里的一团雾 */
  makeShape('heartFill', 82000, (i,p,c)=>{
    const th = rnd()*Math.PI*2, u = rr(-1,1), r0 = Math.sqrt(Math.max(0,1-u*u));
    const dx = Math.cos(th)*r0, dy = u, dz = Math.sin(th)*r0;
    const R = heartRadius(dx,dy,dz);
    const shell = rnd() < 0.76;
    const d = shell ? (0.84 + 0.16*Math.pow(rnd(),0.55))
                    : (Math.pow(rnd(), 0.55) * 0.84);
    p.set(dx*R*d, dy*R*d, dz*R*d);
    /* 外壳绯红描边；心腔里是一团由内向外渐暗的灯芯 */
    let surf, gain;
    if(shell){ surf = 0.88 + 0.12*rnd(); gain = 0.62; }
    else {
      const q = 1 - d/0.84;              /* 0=贴着壳 1=心腔正中心 */
      surf = 0.34 + 0.60*q*q;
      gain = 0.13 + 0.20*q*q;
    }
    let r = lerp(0.44, 1.00, surf), g = lerp(0.03, 0.34, surf), b = lerp(0.10, 0.30, surf);
    if(rnd() < 0.03){ r=1.0; g=0.88; b=0.74; }   /* 星点高光 */
    c.setRGB(r, g, b).multiplyScalar(gain * (0.72 + 0.55*rnd()));
  });

  /* heartShell —— 心皮：最亮的一圈玫瑰金，勾出轮廓 */
  makeShape('heartShell', 26000, (i,p,c)=>{
    const th = rnd()*Math.PI*2, u = rr(-1,1), r0 = Math.sqrt(Math.max(0,1-u*u));
    const dx = Math.cos(th)*r0, dy = u, dz = Math.sin(th)*r0;
    const R = heartRadius(dx,dy,dz) * (1 + gauss()*0.008);
    p.set(dx*R, dy*R, dz*R);
    const k = rnd();
    c.setRGB(1.0, 0.44+k*0.26, 0.34+k*0.26).multiplyScalar(0.30+k*0.34);
  });

  /* dust —— 远方尘埃（稀薄、成带） */
  makeShape('dust', 16000, (i,p,c)=>{
    const r=rr(2.6,7.2), th=rnd()*Math.PI*2;
    p.set(Math.cos(th)*r, gauss()*0.9, Math.sin(th)*r*0.8);
    const k=rnd()*0.45+0.15;
    c.setRGB(0.07*k, 0.22*k, 0.28*k);
  });
}
