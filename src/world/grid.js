import * as THREE from 'three';
import { scene } from '../core/stage.js';

/* ══════════════════════════════════════════════════════════════════
   grid.js —— 地面网格
   一圈圈同心环 + 两层不同密度的格线。环是"水位线"：
   每次 EXECUTION 打下来，环就从中心往外推一圈。
   ══════════════════════════════════════════════════════════════════ */

export const gridMat = new THREE.ShaderMaterial({
  uniforms:{ uTime:{value:0}, uInt:{value:0}, uWarm:{value:0}, uWave:{value:0} },
  vertexShader:`
    varying vec3 vW;
    void main(){ vW = (modelMatrix*vec4(position,1.0)).xyz;
      gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader:`
    varying vec3 vW;
    uniform float uTime,uInt,uWarm,uWave;
    float gridLine(vec2 c, float w){
      vec2 g = abs(fract(c)-0.5)/w;
      return 1.0 - clamp(min(g.x,g.y),0.0,1.0);
    }
    void main(){
      vec2 xz = vW.xz;
      float g1 = gridLine(xz*1.0, 0.012)*0.45;
      float g2 = gridLine(xz*0.25, 0.010)*0.85;
      float r = length(xz);
      /* smoothstep 的 edge0 必须小于 edge1，写反了会得到实心大圆盘 */
      float ring = (1.0-smoothstep(0.0,0.012,abs(r-1.55)))*0.55
                 + (1.0-smoothstep(0.0,0.012,abs(r-2.85)))*0.28
                 + (1.0-smoothstep(0.0,0.012,abs(r-4.15)))*0.15;
      float pulse = 0.55+0.45*sin(r*2.4 - uTime*1.6 + uWave);
      /* 三重衰减：径向指数 + 远端截断 + 掠射角压暗。
         之前 smoothstep(9.0,3.0,r) 的 edge0 大于 edge1，属未定义行为，
         结果远处格线不衰减，在地平线处连成一条横贯全屏的亮带。 */
      float fade = exp(-r*0.30) * (1.0-smoothstep(2.6,8.2,r))
                 * smoothstep(0.0,0.55,1.0-abs(normalize(vW).y));
      vec3 cool = vec3(0.06,0.55,0.62);
      vec3 warm = vec3(1.00,0.76,0.42);
      vec3 col = mix(cool, warm, uWarm);
      float a = (g1+g2+ring)*(0.30+0.70*pulse)*fade*uInt;
      gl_FragColor = vec4(col*a, a);
    }`,
  transparent:true, depthWrite:false, blending: THREE.AdditiveBlending
});

export const grid = new THREE.Mesh(new THREE.PlaneGeometry(26,26,1,1), gridMat);
grid.rotation.x = -Math.PI/2;
grid.position.y = -1.62;
scene.add(grid);
