/* ══════════════════════════════════════════════════════════════════
   heartField.js —— 心形隐函数
   坐标约定：x 左右，y 上下，z 厚度（薄轴）

       (x² + 2.25z² + y² − 1)³ − x²y³ − 0.1125·z²·y³ = 0

   原点在心腔中心，双瓣朝 +y，尖端朝 −y。
   v10 起玻璃心和心形骨架都删了，只剩粒子形态还用这个式子。
   ══════════════════════════════════════════════════════════════════ */

export function heartJS(x,y,z){
  const a = x*x + 2.25*z*z + y*y - 1.0;
  return a*a*a - x*x*y*y*y - 0.1125*z*z*y*y*y;
}

/* 沿方向 d 从原点外推到心形表面，二分 30 次求半径。
   heartWire 的经纬线和 heartFill 的贴壳采样都走这里。 */
export function heartRadius(dx,dy,dz){
  let lo=0, hi=2.4;
  for(let k=0;k<30;k++){ const m=(lo+hi)*0.5;
    if(heartJS(dx*m, dy*m, dz*m) < 0) lo=m; else hi=m; }
  return lo;
}
