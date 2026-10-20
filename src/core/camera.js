import * as THREE from 'three';
import { camera } from './stage.js';
import { view } from './view.js';
import { clamp } from './math.js';

/* ══════════════════════════════════════════════════════════════════
   camera.js —— 一台正对着坐标纸的镜头
   ──────────────────────────────────────────────────────────────────
   v9 把运镜砍到几乎不动。理由：这是"函数在作图"，不是"房间里在发生
   什么"。镜头一动，坐标系就跟着歪，读图的人立刻失去参照。
   留下的只有极轻的呼吸（抖动在 1cm 量级），幅度小到看不出在动，
   但停帧时不会像一张死图。
   ──────────────────────────────────────────────────────────────────
   取景不是写死的坐标，而是每一帧按 #plot 的真实矩形反算：
     屏幕 x = W/2 + (X0 − x)/visW·W  ⇒  要让 x=0 落在绘图区中心，
     X0 = (cx − 0.5)·visW。这样换画幅（16:9 / 9:16 / 1:1）、
     左栏换边、左栏塌陷，原点都自动留在该在的地方。
   ══════════════════════════════════════════════════════════════════ */

const FOV = 30;
const NEED_W = 3.06;      // 曲线要装下的一口气（世界单位）
const NEED_H = 1.68;
const FILL   = 0.86;      // 曲线最多占绘图区的 86%，留边

export const lookTarget = new THREE.Vector3();

export function updateCamera(t){
  const r = view.plotRect || { x:0.24, y:0.10, w:0.52, h:0.44 };
  const aspect = camera.aspect || 1.778;

  /* 由"要装下多大"反推视距：宽和高各算一次，取更远的那个 */
  /* 上下夹一层：r.h 会随左栏塌陷/换边抖动，没有夹的话
     同一个形状在相邻两幕里能差出一倍的尺寸。 */
  const visH = clamp(Math.max(
    NEED_H / (r.h * FILL),
    (NEED_W / (r.w * FILL)) / aspect
  ), 2.60, 3.55);
  const visW = visH * aspect;
  const z = visH / (2 * Math.tan(FOV * Math.PI / 360));

  const cx = r.x + r.w*0.5;
  const cy = r.y + r.h*0.5;

  camera.position.set(
    0.010*Math.sin(t*0.145),
    0.008*Math.sin(t*0.19),
    z + 0.030*Math.sin(t*0.21)
  );
  camera.fov = FOV;
  camera.updateProjectionMatrix();

  /* 屏幕 x = W/2 − (x − X0)/visW·W。
     要让 x=0 落在绘图区中心 cx 上，解得 X0 = (0.5 − cx)·visW
     —— 是 0.5 减 cx，不是 cx 减 0.5。符号反了的话，窗口越偏右，
     原点越往左跑，两个误差还会互相放大。 */
  lookTarget.set((0.5 - cx)*visW, (cy - 0.5)*visH, 0);
  camera.lookAt(lookTarget);
  camera.rotation.z = 0;
}
