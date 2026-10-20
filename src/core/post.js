import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { renderer, scene, camera } from './stage.js';

/* ══════════════════════════════════════════════════════════════════
   post.js —— Bloom + 调色
   注意两个曾经踩过的坑：
   1) 不要把 bloom.setSize 手动调一次，composer.setSize 已经带过；
   2) 对比曲线 col*col*(3-2col) 只在 0..1 有定义，过曝必须先 clamp，
      否则 HDR 的负值区会把红色高光压成青色、正中心压成黑洞。
   ══════════════════════════════════════════════════════════════════ */

export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

export const bloom = new UnrealBloomPass(new THREE.Vector2(1080, 608), 0.34, 0.62, 0.78);
composer.addPass(bloom);

export const grade = new ShaderPass({
  uniforms:{ tDiffuse:{value:null}, uTime:{value:0}, uAberr:{value:0},
             uGrain:{value:0.028}, uVig:{value:1.0}, uFlash:{value:0},
             uTint:{value:new THREE.Color(1,1,1)}, uHal:{value:0.55} },
  vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader:`
    uniform sampler2D tDiffuse; uniform float uTime,uAberr,uGrain,uVig,uFlash,uHal;
    uniform vec3 uTint;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 c = uv-0.5;
      float r2 = dot(c,c);
      float ab = uAberr*(0.0015+0.004*r2);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c*ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c*ab).b;

      // 白平衡：整帧往当前幕的主色偏，但高光不染（否则白会脏）
      float l = dot(col, vec3(0.299,0.587,0.114));
      vec3 tnt = uTint / max(max(uTint.r,uTint.g),max(uTint.b,1e-4));
      col *= mix(vec3(1.0), tnt, 0.42*(1.0-smoothstep(0.58,1.0,l)));

      // 光晕溢出（halation）：高光边缘往暖橙渗一圈，胶片感的主要来源
      vec2 e = vec2(1.7/1080.0);
      vec3 bl = (texture2D(tDiffuse, uv+e).rgb + texture2D(tDiffuse, uv-e).rgb
               + texture2D(tDiffuse, uv+vec2(e.x,-e.y)).rgb
               + texture2D(tDiffuse, uv+vec2(-e.x,e.y)).rgb) * 0.25;
      col += max(bl-0.60, 0.0) * vec3(1.0,0.52,0.30) * uHal;

      // 黑位轻抬：黑不死，画面才像胶片而不像关机
      col += 0.009;
      // 暗角
      col *= mix(1.0, 1.0 - r2*0.72, uVig);
      // 温和对比 + sRGB 编码
      col = max(col, 0.0);
      col = pow(col, vec3(0.86));
      col = clamp(col, 0.0, 1.0);
      col = mix(col, col*col*(3.0-2.0*col), 0.22);
      // 颗粒
      float g = h(uv*vec2(1920.0,1080.0)+uTime*61.7)-0.5;
      col += g*uGrain;
      col += uFlash;
      gl_FragColor = vec4(max(col,0.0),1.0);
    }`
});
composer.addPass(grade);
