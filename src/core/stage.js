import * as THREE from 'three';

/* ══════════════════════════════════════════════════════════════════
   stage.js —— renderer / scene / camera / 环境
   环境光不是外部 HDR：用几个纯色球体喂给 PMREMGenerator，
   既省一次几 MB 的下载，也不会有跨域问题。
   ══════════════════════════════════════════════════════════════════ */

export const stageEl = document.getElementById('stage');
export const canvas  = document.getElementById('gl');

export const renderer = new THREE.WebGLRenderer({
  canvas, antialias:true, powerPreference:'high-performance',
  preserveDrawingBuffer:true          // 逐帧截图取证用；如不需要可置 false
});
renderer.setClearColor(0x04060a, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

export const scene  = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(38, 16/9, 0.1, 120);
scene.fog = new THREE.FogExp2(0x05080c, 0.045);

/* ── 程序化环境 ─────────────────────────────────────────────────── */
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const es = new THREE.Scene();
  es.background = new THREE.Color(0x070c10);
  const gg = new THREE.SphereGeometry(2.4, 24, 16);
  const addGlow = (hex, x, y, z, s)=>{
    const m = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ color: hex }));
    m.position.set(x,y,z); m.scale.setScalar(s); es.add(m);
  };
  addGlow(0x2a6f7a, 2.0, 1.4, 1.6, 0.55);
  addGlow(0x8a4a2a, -1.8, -0.6, -1.4, 0.45);
  addGlow(0x9fc9d6, 0, 2.2, 0, 0.30);
  addGlow(0x121a22, 0, -2.4, 0, 1.10);
  try{
    const rt = pmrem.fromScene(es, 0.06);
    if(rt && rt.texture) scene.environment = rt.texture;
  }catch(e){}
}

scene.add(new THREE.AmbientLight(0x335566, 0.9));

/* 主光冷、轮廓光暖：所有几何体都靠这一对冷暖关系立起来 */
export const key = new THREE.PointLight(0x66e8ff, 26, 26, 2);
key.position.set(2.4, 3.2, 3.4); scene.add(key);

export const rim = new THREE.PointLight(0xff9a5a, 12, 22, 2);
rim.position.set(-3.2, -1.0, -2.2); scene.add(rim);
