import * as THREE from 'three';

import { DUR } from './core/config.js';
import { clamp } from './core/math.js';
import { clock } from './core/clock.js';
import { pointer, view } from './core/view.js';
import { stageEl, renderer, scene, camera } from './core/stage.js';
import { composer } from './core/post.js';
import { updateCamera, lookTarget } from './core/camera.js';
import { ACTS, actIndex } from './data/acts.js';

/* ⚠ import 顺序有副作用：
   world/particles.js 在求值时会消耗 13 万个随机数（粒子种子），
   ui/dom.js 在求值时会消耗 40 个（右侧算子日志的幽灵文本）。
   两者必须按这个先后求值，否则全片所有形态的随机分布都会平移，
   画面虽然仍然确定性，但会和已经调好的构图对不上。 */
import { buildShapes, initShape, points, pMat, ps, setShape, SH } from './world/particles.js';
import { gridMat } from './world/grid.js';
import { plotG, curveA, curveB, curveR, axes, grid, tanLine } from './world/plot.js';
import { initMachine, drawMachine } from './world/machine.js';

import { $, el } from './ui/dom.js';
import { updateUI, invalidateHud } from './ui/hud.js';
import { updateLayout, invalidateLayout } from './ui/layout.js';
import { invalidateAttrs } from './ui/attrs.js';
import { resetChat, invalidateStrip } from './ui/chat.js';
import { resetStdout, buildLine, getTokCount } from './ui/stdout.js';
import { getSliceN, resetSlices } from './ui/slices.js';

import { applyScene, desiredShape } from './scene/apply.js';

/* ══════════════════════════════════════════════════════════════════
   main.js —— 启动、时钟、音频、事件、逐帧调度
   ══════════════════════════════════════════════════════════════════ */

/* ── 鼠标 ───────────────────────────────────────────────────────── */
addEventListener('pointermove', e=>{
  pointer.x = e.clientX / innerWidth;
  pointer.y = e.clientY / innerHeight;
});

/* ── 画布坐标（十二宫格要按"世界取景窗"在舞台上的位置切） ───────── */
function worldRectCSS(){
  const wr = el.world.getBoundingClientRect();
  const sr = stageEl.getBoundingClientRect();
  return { x: wr.left-sr.left, y: wr.top-sr.top, w: wr.width, h: wr.height, H: sr.height, W: sr.width };
}

/* ══════════════════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════════════════ */
/* 是否把 3D 世界裁剪在"世界取景窗"之内。
   参考片之所以像一个程序，而不是一段动画，靠的就是这条硬边：
   窗口里的东西永远不会跑到顶栏和对话栏上。 */
let clipWorld = true;

function render(){
  const sliceN = getSliceN();
  if(sliceN > 1){
    /* ×12 幕：真的渲 12 次，每次换一个 viewport + scissor，
       而不是把一张图切成十二块贴上去 —— 那样每格里都是同一个视角。 */
    const r = worldRectCSS();
    const cols = sliceN<=4 ? 2 : sliceN<=6 ? 3 : 4;
    const rows = Math.ceil(sliceN/cols);
    const gap = 2;
    const cw = r.w/cols, chh = r.h/rows;
    const save = camera.position.clone();
    renderer.setScissorTest(false);
    renderer.setClearColor(0x020406, 1);
    renderer.clear();
    renderer.setScissorTest(true);
    for(let i=0;i<sliceN;i++){
      const cx = i%cols, cy = Math.floor(i/cols);
      const vx = r.x + cx*cw + gap*0.5;
      const vyTop = r.y + cy*chh + gap*0.5;
      const vw = Math.max(4, cw-gap), vh = Math.max(4, chh-gap);
      const vy = r.H - vyTop - vh;
      renderer.setViewport(vx, vy, vw, vh);
      renderer.setScissor(vx, vy, vw, vh);
      /* 每格换一点视差 + 一个距离，十二格才像一张"接触印相"：
         原来 (cx-1)*0.30 在 4 列时是 -1/0/1/2，整张表明显偏右，
         而且偏移太大，走廊被推出格子外，看着像几个红盒子飘着。 */
      const ox = (cx - (cols-1)/2) * 0.16;
      const oy = ((rows-1)/2 - cy) * 0.12;
      camera.position.set(save.x + ox, save.y + oy,
                          save.z + ((i*7)%5 - 2)*0.42);
      camera.lookAt(lookTarget);
      renderer.render(scene, camera);
    }
    camera.position.copy(save);
    camera.lookAt(lookTarget);
    renderer.setScissorTest(false);
    renderer.setViewport(0,0,r.W,r.H);
  }else{
    if(clipWorld){
      /* 先把整块画布擦干净（否则窗口外的上一帧会留在玻璃面板后面），
         再把后续所有绘制限制在取景窗的矩形里。 */
      const r = worldRectCSS();
      renderer.setScissorTest(false);
      renderer.setClearColor(0x04060a, 1);
      renderer.clear();
      renderer.setScissorTest(true);
      renderer.setScissor(r.x, r.H - r.y - r.h, r.w, r.h);
    }
    composer.render();
    if(clipWorld) renderer.setScissorTest(false);
  }
}

/* ══════════════════════════════════════════════════════════════════
   AUDIO
   ══════════════════════════════════════════════════════════════════ */
const audio = $('audio');
let analyser = null, freq = null;

function initAudioGraph(){
  if(analyser) return;
  try{
    const ac = new (window.AudioContext||window.webkitAudioContext)();
    const src = ac.createMediaElementSource(audio);
    analyser = ac.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;
    src.connect(analyser);
    analyser.connect(ac.destination);
    freq = new Uint8Array(analyser.frequencyBinCount);
    ac.resume();
  }catch(e){ clock.audioOK = false; }
}

/* 跳转：所有"记住上一帧"的缓存全部作废，形态直接到位不播过渡 */
function seekTo(v){
  clock.t = clamp(v, 0, DUR);
  clock.lastSync = performance.now();
  ps.morphT0 = clock.t - 9;
  ps.skipMorph = true;
  if(clock.audioOK){ try{ audio.currentTime = clock.t; }catch(e){} }
  /* 作废所有增量缓存，下一帧从头重建 */
  resetStdout();
  invalidateAttrs();
  invalidateHud();
  invalidateStrip();
  invalidateLayout();
  resetSlices();
  resetChat();
}

/* ── 波形 ───────────────────────────────────────────────────────── */
const waveCv = $('wave');
const waveCtx = waveCv.getContext('2d');
function sizeWave(){
  const dpr = Math.min(2, devicePixelRatio||1);
  waveCv.width = 240*dpr; waveCv.height = 18*dpr;
  waveCtx.setTransform(dpr,0,0,dpr,0,0);
}
sizeWave();

function drawWave(t){
  const W=240,H=18;
  waveCtx.clearRect(0,0,W,H);
  let data;
  if(analyser && clock.playing){
    analyser.getByteFrequencyData(freq);
    data = freq;
  }
  waveCtx.strokeStyle = 'rgba(232,236,239,.55)';
  waveCtx.lineWidth = 1;
  waveCtx.beginPath();
  const N = 80;
  for(let i=0;i<N;i++){
    let v;
    if(data){
      const idx = Math.floor(Math.pow(i/N,1.4)*data.length*0.55)+2;
      v = (data[idx]||0)/255;
    }else{
      v = 0.12 + 0.1*Math.sin(t*3 + i*0.7);
    }
    const x = i/(N-1)*W;
    const h = Math.max(0.6, v*H*0.92);
    waveCtx.moveTo(x, H/2-h/2);
    waveCtx.lineTo(x, H/2+h/2);
  }
  waveCtx.stroke();
  waveCtx.strokeStyle='rgba(255,255,255,.10)';
  waveCtx.beginPath(); waveCtx.moveTo(0,H/2); waveCtx.lineTo(W,H/2); waveCtx.stroke();
}

/* ══════════════════════════════════════════════════════════════════
   尺寸 / 画幅
   ══════════════════════════════════════════════════════════════════ */
let AR = 16/9, quality = 1;

function resizeStage(){
  const vw = innerWidth, vh = innerHeight;
  let w = vw, h = vw/AR;
  if(h > vh){ h = vh; w = vh*AR; }
  stageEl.style.width = w+'px';
  stageEl.style.height = h+'px';
  stageEl.classList.toggle('tall', AR < 1.15);
  const dpr = Math.min(2.5, devicePixelRatio||1) * quality;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
  invalidateLayout();
  updateLayout(clock.t);
}
addEventListener('resize', resizeStage);

/* ══════════════════════════════════════════════════════════════════
   事件
   ══════════════════════════════════════════════════════════════════ */
const gate = $('gate');
const hint = $('hint');

gate.addEventListener('click', ()=>{
  clock.started = true;
  clock.playing = true;          // 先起播，别等 play() 的 Promise
  initAudioGraph();
  /* 不能 await 之后再写 clock.t = 0：
     audio.play() 解析可能晚于用户拖进度条，那样会把时间轴打回 0。 */
  audio.play().catch(()=>{ clock.audioOK = false; });
  gate.classList.add('hide');
  setTimeout(()=>gate.style.display='none', 700);
  if(location.protocol === 'file:'){
    hint.textContent = '建议用本地服务器打开以获得完整的音频与纹理加载';
    hint.classList.add('on');
    setTimeout(()=>hint.classList.remove('on'), 6000);
  }
});

$('bPlay').addEventListener('click', ()=>{
  if(!clock.started) return;
  clock.playing = !clock.playing;
  if(clock.playing){ audio.play().catch(()=>{}); $('bPlay').textContent='❚❚'; }
  else { audio.pause(); $('bPlay').textContent='▶'; }
});

$('bReplay').addEventListener('click', ()=>{
  seekTo(0); clock.playing=true; audio.play().catch(()=>{}); $('bPlay').textContent='❚❚';
});

/* 进度条 */
const seekWrap = $('seekWrap');
function pctOf(e){
  const r = seekWrap.getBoundingClientRect();
  return clamp((e.clientX-r.left)/r.width);
}
let dragging = false;
seekWrap.addEventListener('pointerdown', e=>{
  dragging = true; seekWrap.setPointerCapture(e.pointerId);
  seekTo(pctOf(e)*DUR);
});
seekWrap.addEventListener('pointermove', e=>{
  if(!dragging) return;
  seekTo(pctOf(e)*DUR);
});
seekWrap.addEventListener('pointerup', ()=>{ dragging=false; });

/* 章节锚点：一条进度条上标出十三幕的起点 */
ACTS.forEach(a=>{
  const m = document.createElement('div');
  m.className='mk';
  m.style.left = (a.t0/DUR*100)+'%';
  m.title = a.i;
  m.addEventListener('pointerdown', ev=>{ ev.stopPropagation(); seekTo(a.t0+0.01); });
  seekWrap.appendChild(m);
});

/* 画幅 / 画质 / 字幕 / 静音 / 隐藏 */
let ratioIdx = 0;
const RATIOS = [16/9, 9/16, 1/1], RLABEL = ['16:9','9:16','1:1'];
$('bRatio').addEventListener('click', ()=>{
  ratioIdx = (ratioIdx+1)%3;
  AR = RATIOS[ratioIdx];
  $('bRatio').textContent = RLABEL[ratioIdx];
  resizeStage();
});
const QS = [1, 1.5, 2], QL = ['1080p','1440p','4K'];
let qIdx = 0;
$('bRes').addEventListener('click', ()=>{
  qIdx = (qIdx+1)%3; quality = QS[qIdx];
  $('bRes').textContent = QL[qIdx]; resizeStage();
});
let subOn = true;
$('bSub').addEventListener('click', ()=>{
  subOn = !subOn;
  $('bSub').classList.toggle('on', subOn);
  $('stdout').style.opacity = subOn ? 1 : 0.001;
});
$('bMute').addEventListener('click', ()=>{
  audio.muted = !audio.muted;
  $('bMute').classList.toggle('on', !audio.muted);
});
$('bMute').classList.add('on');

let uiHidden = false;
function toggleUI(){
  uiHidden = !uiHidden;
  stageEl.classList.toggle('hideUI', uiHidden);
}
$('bHide').addEventListener('click', toggleUI);

addEventListener('keydown', e=>{
  if(e.code==='Space'){ e.preventDefault(); $('bPlay').click(); }
  if(e.key==='r'||e.key==='R') $('bReplay').click();
  if(e.key==='h'||e.key==='H') toggleUI();
  if(e.key==='m'||e.key==='M') $('bMute').click();
  if(e.key==='l'||e.key==='L') $('bSub').click();
  if(e.key==='ArrowRight') seekTo(clock.t+0.1);
  if(e.key==='ArrowLeft')  seekTo(clock.t-0.1);
  const n = parseInt(e.key,10);
  if(n>=1 && n<=9){ const a = ACTS[Math.min(n-1, ACTS.length-1)]; seekTo(a.t0+0.01); }
});

/* ══════════════════════════════════════════════════════════════════
   主循环
   ══════════════════════════════════════════════════════════════════ */
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0;

function frame(now){
  requestAnimationFrame(frame);
  const dt = Math.min(0.5, (now-last)/1000); last = now;

  /* t 是权威时钟；音频被拖动着对齐它，
     这样即使服务器不支持 Range、seeking 不可靠，画面也不会卡住 */
  if(clock.freezeT !== null){
    clock.t = clock.freezeT;
  } else if(clock.started && clock.playing){
    clock.t = Math.min(DUR, clock.t + dt);
    if(clock.audioOK && !audio.paused && performance.now()-clock.lastSync > 900){
      const a = audio.currentTime;
      if(Math.abs(a - clock.t) > 0.35){
        try{ audio.currentTime = clock.t; }catch(e){}
        clock.lastSync = performance.now();
      }
    }
  }

  if(clock.t >= DUR && clock.playing){ clock.playing = false; $('bPlay').textContent='▶'; }

  const t = clamp(clock.t, 0, DUR);
  const ai = actIndex(t);

  try{
    updateUI(t, ai);
    applyScene(t, ai);
    /* 绘图区的真实矩形：相机按它反算取景，换画幅/换边/左栏塌陷都能自适应 */
    const pr = el.plot.getBoundingClientRect();
    const sr = stageEl.getBoundingClientRect();
    if(sr.width > 0 && sr.height > 0){
      view.plotRect = {
        x:(pr.left-sr.left)/sr.width, y:(pr.top-sr.top)/sr.height,
        w:pr.width/sr.width, h:pr.height/sr.height
      };
    }
    updateCamera(t);
    drawMachine(t);
    drawWave(t);
    render();
    window.__frames = (window.__frames||0) + 1;
    window.__lastErr = null;
  }catch(e){
    window.__lastErr = String(e && e.stack || e);
  }

  fpsAcc += dt; fpsN++;
  if(now - fpsT > 480){
    el.fps.textContent = Math.round(fpsN/fpsAcc)+' fps';
    fpsAcc = 0; fpsN = 0; fpsT = now;
  }
}

/* ══════════════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════════════ */
initMachine(el.machine);
buildShapes();
scene.add(plotG);
initShape();
resizeStage();
resetChat();
buildLine(-1);

/* 调试钩子（不影响正常播放） */
window.__seek = seekTo;
window.__freeze = v=>{ clock.freezeT = (v===null||v===undefined) ? null : v; };
window.__state = ()=>({
  t: clock.t, act: ACTS[actIndex(clock.t)].i,
  slice: getSliceN(), shape: ps.curShape, tok: getTokCount()
});
window.__dev = {
  THREE, scene, camera, points, pMat, gridMat, SH, setShape,
  composer, ps, clock,
  plotG, curveA, curveB, curveR, axes, grid, tanLine,
  applyScene, desiredShape, updateCamera,
  hide(what){ if(what==='grid') gridMat.uniforms.uInt.value = 0;
              if(what==='pts') points.visible = false;
              if(what==='plot') plotG.visible = false; },
  clip(v){ clipWorld = !!v; }
};

requestAnimationFrame(frame);
