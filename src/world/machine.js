/* ══════════════════════════════════════════════════════════════════
   machine.js —— 她内部的机器（v10 的世界面板）
   ──────────────────────────────────────────────────────────────────
   一层 2D 画布，画在 #plot 里、HUD 文字下面。
   为什么用 Canvas 2D 而不是再做一套 3D：
     这一层要画的东西是"格子 / 线 / 读数"——信息本身，不是物体。
     二维画布能保证 1px 精确、字能读、每帧开销恒定（<1ms 量级），
     而 3D 里的 bloom 只会把这些细线糊成一团光。

   全片共用三个零件：
     cell  一个格 = 一个位置（token / 维度 / 地址 / 专家）
     wire  一根线 = 一次读取（注意力、路由、回指、地址）
     read  一行字 = 一个读数（地址、概率、计数）
   不同的场景只是同一套零件换一种排法。
   ══════════════════════════════════════════════════════════════════ */
import { clamp, sstep, frac, hash5 } from '../core/math.js';
import { tintRGB } from '../scene/colorScript.js';
import { mState } from '../scene/machineScript.js';
import { EXECS } from '../data/acts.js';

let cv = null, g = null, W = 0, H = 0, dpr = 1;

const MONO = '"JetBrains Mono","SF Mono","Cascadia Code",Consolas,monospace';

/* 主色跟着幕次走（colorScript），另外三个是语义色 */
const COL = {
  m:[0.35,0.88,0.82],   // 当前幕主色
  d:[0.52,0.60,0.66],   // 次级：地址、刻度
  w:[1.00,0.70,0.28],   // 琥珀：注意到的/被选中的
  e:[1.00,0.30,0.22],   // 红：非法
  i:[0.92,0.94,0.96]    // 近白：读数的数字
};

/* 面板底色，和 CSS 里的 --bg 是同一个值。
   压暗 / 挖空的时候用它，不能用纯黑：纯黑会在画布和 CSS 之间留一道缝。 */
const BG = [0.016, 0.024, 0.039];

const h1 = i => frac(Math.sin(i*127.1 + 11.7) * 43758.5453);

/* ── 画笔 ───────────────────────────────────────────────────────── */
const rgbs = (c,a)=>{
  const k = a < 0 ? 0 : a > 1 ? 1 : a;
  return 'rgba('+((c[0]*255)|0)+','+((c[1]*255)|0)+','+((c[2]*255)|0)+','+k.toFixed(3)+')';
};
const FILL = (c,a)=>{ g.fillStyle = rgbs(c,a); };
const STK  = (c,a,w)=>{ g.strokeStyle = rgbs(c,a); g.lineWidth = w || 1; };
function TXT(s,x,y,sz,a,c,align){
  g.font = '400 '+sz+'px '+MONO;
  g.fillStyle = rgbs(c,a);
  g.textAlign = align || 'left';
  g.textBaseline = 'alphabetic';
  g.fillText(s,x,y);
}
function LINE(x1,y1,x2,y2,c,a,w){
  STK(c,a,w||1);
  g.beginPath(); g.moveTo(x1,y1); g.lineTo(x2,y2); g.stroke();
}
function BOX(x,y,w,h,c,a,lw,r){
  STK(c,a,lw||1);
  g.beginPath();
  if(r) g.roundRect(x,y,w,h,r); else g.rect(x,y,w,h);
  g.stroke();
}
function FBOX(x,y,w,h,c,a,r){
  FILL(c,a);
  g.beginPath();
  if(r) g.roundRect(x,y,w,h,r); else g.rect(x,y,w,h);
  g.fill();
}
const hex5 = n => '0x'+((n>>>0)%0x100000).toString(16).padStart(5,'0');

/* ── 初始化 / 自适应 ───────────────────────────────────────────── */
export function initMachine(canvas){
  cv = canvas;
  g = cv.getContext('2d', { alpha:true });
  loadPortrait();
}

function fit(){
  const r = cv.getBoundingClientRect();
  const d = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width*d));
  const h = Math.max(1, Math.round(r.height*d));
  if(w !== cv.width || h !== cv.height){
    cv.width = w; cv.height = h;
    W = r.width; H = r.height; dpr = d;
  }
  g.setTransform(dpr,0,0,dpr,0,0);
}

/* ══════════════════════════════════════════════════════════════════
   对外：一帧
   ══════════════════════════════════════════════════════════════════ */
export function drawMachine(t){
  if(!cv || !g) return;
  fit();
  g.clearRect(0,0,W,H);
  const st = mState(t);
  if(!st || st.a <= 0.003) return;

  const tint = tintRGB();
  COL.m = [Math.min(1,tint[0]*1.12+0.06), Math.min(1,tint[1]*1.12+0.06), Math.min(1,tint[2]*1.12+0.06)];

  /* 底部 92px 留给 #eq 的读数：机器画在上面，读数写在下面，互不压 */
  const B = { x:26, y:12, w:W-52, h:H-96 };
  if(B.w < 40 || B.h < 30) return;

  if(st.mix < 0.999 && st.prev){
    g.globalAlpha = st.a * (1-st.mix);
    SCENES[st.prev.mode](B, t, st.prev.cue, st.prev.k, st.prev.t0);
    g.globalAlpha = st.a * st.mix;
    SCENES[st.mode](B, t, st.cue, st.k, st.t0);
    g.globalAlpha = 1;
  }else{
    g.globalAlpha = st.a;
    SCENES[st.mode](B, t, st.cue, st.k, st.t0);
    g.globalAlpha = 1;
  }
}

/* ══════════════════════════════════════════════════════════════════
   共用：一张格阵
   ══════════════════════════════════════════════════════════════════ */
function grid(B, rows, cols){
  /* 面板宽度会变（换边 / 左栏塌陷）。固定列数会让格子变成砖块，
     所以按 842 宽为基准换算列数，格子尺寸基本恒定。 */
  cols = Math.max(4, Math.round(cols * clamp(B.w/842, 0.72, 1.95)));
  const gx = B.w/cols, gy = B.h/rows;
  return {
    gx, gy, cols,
    w: Math.max(2, gx-2), h: Math.max(2, gy-3),
    x: c => B.x + c*gx + 1,
    y: r => B.y + r*gy + 1
  };
}

/* 一个格子的三态：暗轮廓 / 亮起 / 选中 */
function cell(x,y,w,h,on,hot){
  BOX(x,y,w,h,COL.d,0.055,1,1);
  if(on){
    FBOX(x,y,w,h,COL.m,0.055+0.05*hot,1);
    LINE(x,y,x+w,y,COL.m,0.16+0.5*hot,1);
  }
}

/* ══════════════════════════════════════════════════════════════════
   场景
   ══════════════════════════════════════════════════════════════════ */
const SCENES = {};

/* ── off：交给坐标纸 ───────────────────────────────────────────── */
SCENES.off = ()=>{};

/* ══ 她的照片：BOOT 段被切碎，再一格一格拼回来 ═════════════════════
   "权重装载"听起来抽象，观众能看懂的东西只有一个：她的脸一寸寸亮出来。
   所以这十几秒的格阵不是装饰 —— 它是她的显存，正在被一格一格填满。

   ★ 这里必须保留原色。
     试过用"暗 = 亮"的单色块去表达，结果是一团灰绿的噪点，五官全糊，
     连是不是人形都看不出来。像素画之所以认得出人，从来不是因为
     形状够细，而是因为每一格都带着她自己的颜色：蓝头发、白围裙、
     深蓝裙摆。所以这一段是全片唯一破例的地方 —— 她的颜色。
     调和的办法：色相不动，亮度和饱和各压一点，再与幕色混 12%，
     让它看起来仍然是这张片子里的东西，而不是贴上去的一张图。 */
const PX = { ok:false, ar:0.5625, w:0, h:0, buf:null, cache:new Map(),
  crop:{ x:0.105, y:0.004, w:0.79, h:0.992 } };

/* 两套路径：先走纯英文的 assets/whale1.png，再退回项目根的中文名。
   中文文件名在不同服务器 / 不同环境下的编码处理并不统一（有的会二次编码、
   有的按 GBK 解），一旦 404，PX.ok 就一直是 false —— 表现就是"她整段不见了"，
   而且画面上不会有任何报错。所以这里必须有一条能兜住的退路。 */
const PX_SRC = [
  new URL('../../assets/whale1.png', import.meta.url).href,
  new URL('../../鲸鱼娘1.png', import.meta.url).href
];

function loadPortrait(idx){
  const i = idx || 0;
  const im = new Image();
  im.onload = ()=>{
    if(!im.width || !im.height) return;
    /* 缓冲比最高分辨率再宽一点：40 列时每格还能有 4 个源像素 */
    PX.w = 160;
    PX.h = Math.max(8, Math.round(160 * PX.crop.h * im.height / (PX.crop.w * im.width)));
    PX.ar = PX.w / PX.h;
    const c = document.createElement('canvas');
    c.width = PX.w; c.height = PX.h;
    const x = c.getContext('2d', { willReadFrequently:true });
    x.drawImage(im,
      PX.crop.x*im.width, PX.crop.y*im.height,
      PX.crop.w*im.width, PX.crop.h*im.height,
      0, 0, PX.w, PX.h);
    PX.buf = x.getImageData(0, 0, PX.w, PX.h).data;
    PX.ok = true;
    PX.cache.clear();
  };
  im.onerror = ()=>{
    if(i+1 < PX_SRC.length) loadPortrait(i+1);
    else { PX.ok = false; console.warn('[machine] portrait asset missing:', PX_SRC); }
  };
  im.src = PX_SRC[i];
  PX.src = PX_SRC[i];
}

const hex2 = v => (v<16?'0':'') + (v|0).toString(16);

/* 某一列数下的像素表：每格一个颜色串 + 一个不透明度。
   ── 白底怎么去掉：这一格里"不是白底"的像素占比（cov）。
      纯白格 cov=0 直接不画；边缘格 cov 小，用低透明度过渡，
      这样她的轮廓不会出现一圈硬邦邦的锯齿。
   ── 颜色怎么取：只平均"不是白底"的那些像素。整格平均的话，
      边缘会被白底拉白，人像周围就糊出一圈灰边。
   ── 颜色缓存成字符串：每帧两千多格，别在 draw 里拼字符串。 */
function pxGrid(cols){
  if(PX.cache.has(cols)) return PX.cache.get(cols);
  const rows = Math.max(4, Math.round(cols / PX.ar));
  const n = cols*rows;
  const col = new Array(n).fill(null);
  const alp = new Float32Array(n);

  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const x0 = Math.floor(c*PX.w/cols), x1 = Math.max(x0+1, Math.floor((c+1)*PX.w/cols));
      const y0 = Math.floor(r*PX.h/rows), y1 = Math.max(y0+1, Math.floor((r+1)*PX.h/rows));
      let R=0,G=0,B=0,hit=0,tot=0;
      for(let y=y0;y<y1;y++){
        for(let x=x0;x<x1;x++){
          const i = (y*PX.w+x)*4;
          const l = (0.2126*PX.buf[i] + 0.7152*PX.buf[i+1] + 0.0722*PX.buf[i+2])/255;
          tot++;
          if(l < 0.972){ R += PX.buf[i]; G += PX.buf[i+1]; B += PX.buf[i+2]; hit++; }
        }
      }
      const cov = tot ? hit/tot : 0;
      if(cov < 0.05) continue;

      /* 原色 → 压一点亮度、压一点饱和，再和幕色混 12% */
      let rr = R/hit/255, gg = G/hit/255, bb = B/hit/255;
      const mx = Math.max(rr,gg,bb), mn2 = Math.min(rr,gg,bb);
      const sat = mx > 0.001 ? 0.86 : 1;           // 饱和打折
      const mid = (mx+mn2)*0.5;
      rr = mid + (rr-mid)*sat; gg = mid + (gg-mid)*sat; bb = mid + (bb-mid)*sat;
      rr = rr*0.97*(1-0.10) + COL.m[0]*0.10;
      gg = gg*0.97*(1-0.10) + COL.m[1]*0.10;
      bb = bb*0.97*(1-0.10) + COL.m[2]*0.10;

      const idx = r*cols+c;
      col[idx] = '#'+hex2(clamp(rr)*255)+hex2(clamp(gg)*255)+hex2(clamp(bb)*255);
      alp[idx] = clamp(cov*3.0);
    }
  }
  const g2 = { cols, rows, col, alp };
  PX.cache.set(cols, g2);
  return g2;
}

/* 分辨率逐级提高：10 → 18 → 28 → 40 列。
   每一次都是"格子裂成更小的格子"——这是这一段唯一的过程，
   也顺便解释了为什么 10 行的格阵能拼出一张脸。
   方块从 28px 一路缩到 6px：不是变清楚，是变多。
   ★ 时间轴比第一版整体前移 0.5–1.1s，并把最高分辨率那一级拉长到 4.5s：
     原来她在 12.3s 才拼清楚、15.7s 就淡了，全片只有 3.4 秒是"认得出是鲸鱼娘"的，
     一不留神就整段错过 —— 看起来就像"她不见了"。 */
const PV_LV  = [ { n:10, t:4.60 }, { n:18, t:6.40 },
                 { n:28, t:8.70 }, { n:40, t:10.90 } ];
const PV_END = 15.72;

function pvBox(B){
  const ar = PX.ok ? PX.ar : 0.5625;
  const h = Math.min(B.h*0.99, B.w*0.46/ar);
  const w = h*ar;
  return { x:B.x+(B.w-w)*0.5, y:B.y+(B.h-h)*0.5, w, h, ar };
}

function drawPortrait(B,t){
  if(!PX.ok) return;
  const box = pvBox(B);
  const base = g.globalAlpha;

  for(let li=0; li<PV_LV.length; li++){
    const s = PV_LV[li].t;
    const e = li+1 < PV_LV.length ? PV_LV[li+1].t : PV_END;
    /* 上一级退得比下一级进得快：交叠只有 0.1s，
       否则两套格子在同一个位置叠半秒，看起来像重影 / 脏了。 */
    const a = sstep(s, s+0.40, t) * (1 - sstep(e-0.26, e+0.10, t));
    if(a <= 0.004) continue;

    const gi = pxGrid(PV_LV[li].n);
    const cw = box.w/gi.cols, ch = box.h/gi.rows;
    /* 最后一级加一条扫描行：像扫描仪把成品从上到下读一遍。
       一个周期对齐这一级的长度，否则会读到一半又从头开始。 */
    const scan = (li === PV_LV.length-1) ? frac((t-s)/4.2)*1.22 - 0.11 : -9;
    const gap = Math.min(0.9, cw*0.10);

    for(let r=0;r<gi.rows;r++){
      for(let c=0;c<gi.cols;c++){
        const idx = r*gi.cols + c;
        const cs = gi.col[idx];
        if(!cs) continue;
        /* 一格一格亮：横向随机、纵向从上往下，合起来像"正在被填出来" */
        const d = 0.58*(0.55*h1(idx) + 0.45*(r/gi.rows));
        const pk = sstep(s+d, s+d+0.42, t);
        if(pk <= 0.002) continue;

        const near = Math.exp(-Math.pow((r/gi.rows - scan)*9, 2));
        g.globalAlpha = base * a * pk * gi.alp[idx] * (0.86 + 0.30*near);
        g.fillStyle = cs;
        g.fillRect(box.x + c*cw + gap*0.5, box.y + r*ch + gap*0.5,
                   Math.max(1, cw-gap), Math.max(1, ch-gap));
      }
    }

    /* 扫描线本身：只在最后一级，且不越过她的边界 */
    if(scan > -0.5 && scan < 1.2){
      const y = box.y + box.h*scan;
      LINE(box.x-6, y, box.x+box.w+6, y, COL.w, 0.16, 1);
    }
  }

  g.globalAlpha = base;
}

/* ── boot：权重一块一块搬进来 ─────────────────────────────────────
   0–5.0s  格阵随机点亮，百分比在跳（"有一大堆东西正在被装进去"）
   5.0s起  中间开始出现她：10 → 18 → 28 → 40 列，一格一格拼回来
   11.2s   扫描行从上到下读一遍，百分比走到 100%
   15.7s   她褪掉，交给下一段（16.0 的 tokenize） */
SCENES.boot = (B,t,cue,k)=>{
  const { rows, cols, t0, t1 } = cue.p;
  const G = grid(B, rows, cols);
  const rv = sstep(t0, t1, t);
  const scan = Math.floor(frac((t-t0)/2.6) * rows);

  /* 5.4 之后格阵退到背景；15.2 之后彻底退干净，
     免得下一段的 token 条上来时还压着一层空槽。
     ★ 退得比原来早（4.2 起、6.4 前退完）：她 4.6s 就上场了，
       如果格阵还满亮，10 列的她只是一团糊在亮格子上的暗影 —— 等于没出现。 */
  const fieldA = (1 - 0.93*sstep(4.2, 6.4, t)) * (1 - sstep(15.15, 15.70, t));
  g.save();
  g.globalAlpha *= fieldA;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const i = r*cols+c;
      const thr = (r/rows)*0.5 + h1(i)*0.5;
      const on = rv*1.12 > thr;
      const hot = (r===scan ? 0.62 : 0) + (on && h1(i+9)>0.975 ? 0.45 : 0);
      cell(G.x(c), G.y(r), G.w, G.h, on, Math.min(1,hot));
    }
  }
  /* 扫描行经过时有一条极淡的横线，像磁头 */
  LINE(B.x, G.y(scan)+G.h*0.5, B.x+B.w, G.y(scan)+G.h*0.5, COL.m, 0.14, 1);
  g.restore();

  /* 她 */
  drawPortrait(B,t);

  /* 右下：装载读数。注意它和格阵用的不是同一条曲线——
     格阵 8.6s 就填满了，百分比要拖到 15.2 才走到 100：
     最后那几个百分点总是最慢的，而这段时间正好用来拼完她。 */
  const pv = sstep(t0, 15.20, t);
  const pct = Math.round(pv*100);
  const ro = 1 - sstep(15.45, 15.85, t);      // 读数跟着她一起退
  TXT(String(pct).padStart(3,' ')+'%', B.x+B.w, B.y+B.h+4, 20, 0.72*ro, COL.i, 'right');
  TXT(hex5(Math.floor(pv*0x40000))+'  '+hex5(Math.floor(t*257)), B.x+B.w, B.y+B.h+18, 8, 0.40*ro, COL.d, 'right');
};

/* ── strip：一句话被切成格子，一个格子一个地址 ───────────────────
   上一行是读进来的，下一行是正在吐出来的；注意力就是往回连的线。 */
SCENES.strip = (B,t,cue,k,t0)=>{
  const { n, per, mode } = cue.p;
  const attn = !!cue.p.attn && t >= t0 + 1.6;
  const rev = mode === 'rev';
  const pitch = (B.w-10)/n;
  const bw = pitch-4;
  const y0 = B.y + B.h*0.42;
  const y1 = B.y + B.h*0.70;
  const shown = clamp((t-t0)/per, 0, n);

  /* 基线 */
  LINE(B.x, y1+18, B.x+B.w, y1+18, COL.d, 0.10, 1);

  for(let i=0;i<n;i++){
    const slot = rev ? n-1-i : i;
    const x = B.x + 5 + slot*pitch;
    const on = i < shown;
    const cur = on && i > shown-1.35;
    const txt = ['w','o','r','l','d','.','e','x','e','c','u','t','e','('][i%14];
    const addr = hex5((rev? 0x6f00 - i*17 : 0x1f3a + i*17));
    /* 读进来的那一行 */
    BOX(x, y0, bw, 30, COL.d, on?0.16:0.05, 1, 1);
    if(on){
      LINE(x, y0, x+bw, y0, COL.m, cur?0.85:0.30, 1);
      FBOX(x, y0, bw, 30, COL.m, cur?0.09:0.03, 1);
    }
    TXT(txt, x+bw*0.5, y0+20, 13, on?0.88:0.14, COL.i, 'center');
    TXT(addr, x+bw*0.5, y0+42, 8, on?0.46:0.10, COL.d, 'center');
    /* 吐出来的那一行：下一个 token 的 id */
    TXT(hash5(i*97+Math.floor(t*0.5)), x+bw*0.5, y1+12, 7, on?0.30:0.08, COL.d, 'center');
    BOX(x, y1-6, bw, 3, COL.d, on?0.16:0.05, 1, 1);
    if(on) FBOX(x, y1-6, bw*Math.min(1, (shown-i)), 3, COL.m, 0.24, 1);
  }

  /* 光标 */
  const ci = Math.min(n-1, Math.floor(shown));
  const cx = B.x + 5 + (rev ? n-1-ci : ci)*pitch + bw*0.5;
  LINE(cx, y0-8, cx, y0+26, COL.m, 0.55, 1);
  FILL(COL.m,0.9); g.beginPath(); g.moveTo(cx-2.5,y0-9); g.lineTo(cx+2.5,y0-9); g.lineTo(cx,y0-4); g.fill();

  /* 注意力：从光标往回连三根。
     这一句是"她现在在看谁"——不能只是背景里几根弧线，
     所以每根弧的落点钉一颗点，中间标一个权重。 */
  if(attn){
    const back = [2,5,9];
    const wv = [0.61, 0.24, 0.09];
    for(let j=0;j<back.length;j++){
      const ti = Math.max(0, ci-back[j]);
      const tx = B.x + 5 + (rev ? n-1-ti : ti)*pitch + bw*0.5;
      const rise = 64 + j*16;
      const breathe = 1 - 0.22*frac(t*0.9);
      STK(COL.w, (0.46 - j*0.12)*breathe, 1.2);
      g.beginPath();
      g.moveTo(cx, y0-8);
      g.bezierCurveTo(cx, y0-rise, tx, y0-rise, tx, y0-8);
      g.stroke();
      /* 落点：一颗点 + 一个权重 */
      FILL(COL.w, (0.70 - j*0.16)*breathe);
      g.beginPath(); g.arc(tx, y0-8, 2.1, 0, 6.2832); g.fill();
      TXT(wv[j].toFixed(2), (cx+tx)*0.5, y0-rise*0.72, 7.5, (0.44 - j*0.10)*breathe, COL.w, 'center');
    }
    TXT('attn · h'+(1+Math.floor(t*1.6)%8), B.x+B.w, B.y+B.h+4, 8.5, 0.42, COL.w, 'right');
  }
};

/* ── points：一堆点 → 一个维度 ────────────────────────────────── */
SCENES.points = (B,t,cue,k,t0)=>{
  const { cols, rows } = cue.p;
  const flat = cue.p.flat ? sstep(32.45, 33.35, t) : 0;
  const G = grid(B, rows, cols);
  const cy = B.y + B.h*0.52;
  const total = cols*rows;
  /* 数点的波前：从左下往右上扫一遍，不是随机闪烁 */
  const front = clamp((t-t0-0.15)/2.6, 0, 1.25) * (rows+cols);
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const x0 = G.x(c)+G.w*0.5, y0 = G.y(r)+G.h*0.5;
      const x = x0 + (B.x+B.w*0.5 + (c/(cols-1)-0.5)*B.w*0.94 - x0)*flat;
      const y = y0 + (cy - y0)*flat;
      const counted = (r + c) < front;
      const sel = h1(r*cols+c+3) > 0.965;
      FILL(sel?COL.w:COL.m, counted ? (sel?0.70:0.42) : (sel?0.32:0.13));
      g.beginPath();
      g.arc(x, y, counted? (sel?2.4:1.7) : 1.3, 0, 6.2832);
      g.fill();
    }
  }
  const n = Math.round(4096*clamp((front)/(rows+cols)));
  TXT('|S| = '+n.toLocaleString('en-US'), B.x+B.w, B.y+B.h+4, 9, 0.5, COL.d, 'right');
  TXT(flat>0.6 ? 'dim → 1' : 'dim → 2', B.x+B.w, B.y+B.h+18, 8, 0.32, COL.d, 'right');
};

/* ── ring：注意力是一张环图 ─────────────────────────────────────
   以前是"每 1.1 秒换一个整数下标"：亮斑、三根弦、节点大小整块瞬移，
   读起来像幻灯片翻页。中间试过"停顿 → 缓动滑行 → 停顿"，
   但那东西一快一慢，看着还是卡。
   现在就是**匀速**：head 直接跟时间成正比，角速度恒定 34.9°/s。
     head = (t-t0)*1.55        （单位是"第几个节点"，可以是小数）
   热度、弦端点、彗尾全部由 head 推出来，所以整条环是匀角速在转，
   像一圈刻度上有一个探照灯在走。弦上再跑一颗光点 ——
   注意力不是一条线，是沿着线送过去的东西。 */
SCENES.ring = (B,t,cue,k,t0)=>{
  const n = cue.p.n || 16;
  const cx = B.x + B.w*0.5, cy = B.y + B.h*0.52;
  const R = Math.min(B.w*0.30, B.h*0.40);
  const TAU = Math.PI*2;

  /* 匀速：每秒 1.55 个节点 = 34.9°，全程不带加速减速。
     这一段 3.65 秒，走掉约 130° —— 够看清"它在沿圈走"，又不至于晃眼。 */
  const head = (t - t0)*1.55;

  const angAt = i => -Math.PI/2 + i*TAU/n;
  const posAt = i => {
    const a = angAt(i);
    return [cx + Math.cos(a)*R, cy + Math.sin(a)*R];
  };
  /* 环上的热度：离头越近越热，跨过 00 号节点也不会断 */
  const heatAt = i => {
    let d = Math.abs(i - head) % n;
    if(d > n*0.5) d = n - d;
    return clamp(1 - d*0.78);
  };

  /* 环本身：虚线，像"还没连起来的一圈" */
  g.setLineDash([2,4]);
  STK(COL.d, 0.15, 1);
  g.beginPath(); g.arc(cx,cy,R,0,TAU); g.stroke();
  g.setLineDash([]);

  /* 头身后拖着一条彗尾：它走到哪儿光跟到哪儿，方向一眼能读出来。
     长度恒定（匀速就不该有伸缩），只有一点点呼吸，免得像根死管子。 */
  const aH = angAt(head);
  const tail = 0.44 + 0.05*Math.sin(t*1.7);
  const SEG = 7;
  for(let s2=0;s2<SEG;s2++){
    const k2 = s2/SEG, k3 = (s2+1)/SEG;
    STK(COL.w, 0.30*Math.pow(1-k2, 2.1), 1.6 - 1.0*k2);
    g.beginPath();
    g.arc(cx, cy, R, aH - tail*k3, aH - tail*k2);
    g.stroke();
  }

  /* 弦：注意力权重。一次只亮三根，观众才跟得住 */
  for(let j=0;j<3;j++){
    const a = posAt(head), b = posAt(head + 2 + j*4);
    const wgt = (0.30 - j*0.075) * (0.86 + 0.14*Math.sin(t*1.9 + j*2.2));
    const mx = cx + (a[0]+b[0]-2*cx)*0.52;
    const my = cy + (a[1]+b[1]-2*cy)*0.52;
    STK(COL.w, wgt, j===0?1.3:1);
    g.beginPath();
    g.moveTo(a[0],a[1]);
    g.quadraticCurveTo(mx, my, b[0], b[1]);
    g.stroke();

    /* 沿弦送过去的一颗光点 */
    const pu = frac((t-t0)*(0.58 + j*0.06) + j*0.37);
    const q = 1-pu;
    const px = q*q*a[0] + 2*q*pu*mx + pu*pu*b[0];
    const py = q*q*a[1] + 2*q*pu*my + pu*pu*b[1];
    g.save(); g.globalCompositeOperation = 'lighter';
    FILL(COL.w, 0.10);
    g.beginPath(); g.arc(px, py, 5.8, 0, TAU); g.fill();
    FILL(COL.w, 0.88);
    g.beginPath(); g.arc(px, py, 1.9, 0, TAU); g.fill();
    g.restore();
  }

  /* 节点：大小与颜色都按热度连续插值 */
  for(let i=0;i<n;i++){
    const [x,y] = posAt(i);
    const ht  = heatAt(i);
    const ht2 = ht*ht;
    const rr  = 2.0 + 1.5*ht2;
    const col = [COL.m[0] + (COL.w[0]-COL.m[0])*ht,
                 COL.m[1] + (COL.w[1]-COL.m[1])*ht,
                 COL.m[2] + (COL.w[2]-COL.m[2])*ht];

    if(ht2 > 0.04){
      g.save(); g.globalCompositeOperation = 'lighter';
      FILL(COL.w, 0.15*ht2);
      g.beginPath(); g.arc(x, y, rr*3.4, 0, TAU); g.fill();
      g.restore();
    }
    FILL(col, 0.20 + 0.66*ht);
    g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();

    /* 刚被放下的点留一圈余温：把"它才走开"交代清楚 */
    if(ht > 0.02 && ht < 0.58){
      const k2 = 1 - ht/0.58;
      STK(COL.w, 0.11*k2, 1);
      g.beginPath(); g.arc(x, y, rr + 3.6*k2, 0, TAU); g.stroke();
    }

    if(i%4===0)
      TXT(String(i).padStart(2,'0'), x + (x-cx)*0.22, y + (y-cy)*0.22 + 3, 7, 0.30, COL.d, (x>cx?'left':'right'));
  }

  /* 圆心：一个正在被读的位置 */
  g.save(); g.globalCompositeOperation = 'lighter';
  FILL(COL.d, 0.05 + 0.04*Math.sin(t*2.2));
  g.beginPath(); g.arc(cx, cy, 13, 0, TAU); g.fill();
  g.restore();
  TXT('Q', cx, cy+4, 10, 0.5, COL.d, 'center');
  LINE(cx-6, cy-14, cx-6, cy-8, COL.d, 0.18);
  LINE(cx+6, cy-14, cx+6, cy-8, COL.d, 0.18);
};


/* ── trace：一条隐状态在跑 ───────────────────────────────────────
   这是"示波器"，不是"函数图像"：没有坐标轴，只有一根在走的笔。 */
SCENES.trace = (B,t,cue,k,t0)=>{
  const L = cue.p.lanes || 1;
  const freq = cue.p.freq || 2;
  const per = cue.p.per || 2.2;
  const bandH = Math.min(B.h*0.34, B.h/(L+0.8));
  const top0 = B.y + B.h*0.5 - bandH*L*0.5;

  for(let l=0;l<L;l++){
    const cy = top0 + bandH*(l+0.5);
    const amp = bandH*0.34;
    LINE(B.x, cy, B.x+B.w, cy, COL.d, 0.07, 1);
    /* 整条波（暗） */
    STK(COL.m, 0.09, 1);
    g.beginPath();
    for(let x=0;x<=B.w;x+=2){
      const u = x/B.w;
      const y = cy - Math.sin(u*freq*6.2832 + t*2.1 + l*1.7)*amp
                 - Math.sin(u*freq*2.3*6.2832 - t*1.3)*amp*0.25;
      x? g.lineTo(B.x+x,y) : g.moveTo(B.x+x,y);
    }
    g.stroke();
    /* 示波器的亮窗：只把笔附近这一段提亮 */
    const head = frac((t-t0)/per);
    const xw = B.w*0.26;
    const x1 = head*B.w - xw*0.5;
    g.save();
    g.beginPath(); g.rect(B.x+Math.max(0,x1), cy-bandH, xw, bandH*2); g.clip();
    STK(COL.m, 0.55, 1.2);
    g.beginPath();
    for(let x=0;x<=B.w;x+=2){
      const u = x/B.w;
      const y = cy - Math.sin(u*freq*6.2832 + t*2.1 + l*1.7)*amp
                 - Math.sin(u*freq*2.3*6.2832 - t*1.3)*amp*0.25;
      x? g.lineTo(B.x+x,y) : g.moveTo(B.x+x,y);
    }
    g.stroke();
    g.restore();
    /* 采样点：模型看到的不是连续波，是一串数。
       所以每个采样画成一根竖条（一根状态向量），而不是一个点。 */
    for(let s=0;s<=26;s++){
      const u = s/26, x = B.x+u*B.w;
      const v = Math.sin(u*freq*6.2832 + t*2.1 + l*1.7)
              + 0.25*Math.sin(u*freq*2.3*6.2832 - t*1.3);
      const hh = Math.abs(v)*amp;
      const near = Math.exp(-Math.pow((u-head)*6,2));
      FILL(v>0? COL.m : COL.d, 0.20 + 0.55*near);
      g.fillRect(x-1.2, v>0 ? cy-hh : cy, 2.4, hh);
    }
    if(L>1) TXT('h'+(l+1), B.x-2, cy+3, 7, 0.28, COL.d, 'right');
  }
  /* 笔 */
  const head = frac((t-t0)/per);
  LINE(B.x+head*B.w, top0+4, B.x+head*B.w, top0+bandH*L-4, COL.w, 0.20, 1);
};

/* ── context：窗口是一卷越转越长的带子 ─────────────────────────── */
SCENES.context = (B,t,cue,k,t0)=>{
  const zoom = sstep(t0, t0+2.6, t);
  const n = Math.round(28 + 44*zoom);
  const pitch = B.w/n;
  const cy = B.y + B.h*0.5;
  const drift = (t-t0)*26;
  const off = Math.floor(drift/pitch);
  for(let i=-1;i<n+1;i++){
    const x = B.x + i*pitch - (drift%pitch);
    const idx = off + i;
    const on = i>=0 && i<n;
    const fade = Math.min(1, Math.min(i, n-i)/6);
    BOX(x, cy-11, Math.max(1.5,pitch-2), 22, COL.d, on? 0.10*fade : 0.04, 1, 1);
    if(pitch > 9){
      TXT(hex5(idx*4), x+Math.max(1.5,pitch-2)*0.5, cy+25, Math.min(7, pitch*0.55), 0.30*fade, COL.d, 'center');
      if(h1(idx)>0.86) FBOX(x+1, cy-10, Math.max(1,pitch-3), 20, COL.w, 0.10*fade, 1);
    }
  }
  /* 窗口框：只有中间这一段是"看得见"的 */
  const wx = B.x + B.w*0.22, ww = B.w*0.56;
  BOX(wx, cy-30, ww, 60, COL.m, 0.22, 1, 2);
  LINE(wx, cy-34, wx, cy-30, COL.m, 0.35); LINE(wx+ww, cy-34, wx+ww, cy-30, COL.m, 0.35);
  TXT('128k', wx+ww, cy-38, 8.5, 0.45, COL.m, 'right');
  TXT('…', B.x+6, cy+4, 14, 0.30, COL.d, 'left');
  TXT('…', B.x+B.w-6, cy+4, 14, 0.30, COL.d, 'right');
};

/* ── acdc：整流器 = 三层前向 ───────────────────────────────────── */
SCENES.acdc = (B,t,cue,k,t0)=>{
  const cy = B.y + B.h*0.5;
  const amp = B.h*0.30;
  const blkW = 54, gap = 12;
  const bx = B.x + B.w*0.44;
  const labels = ['EMBED','ATTN','MLP'];
  const x0 = bx, x3 = bx + blkW*3 + gap*2;
  const head = frac((t-t0)/3.4);

  /* 左：交流 */
  STK(COL.m, 0.34, 1.2);
  g.beginPath();
  for(let x=0;x<=x0-B.x-14;x+=2){
    const y = cy - Math.sin(x*0.055 + t*3.4)*amp;
    x? g.lineTo(B.x+x,y) : g.moveTo(B.x+x,y);
  }
  g.stroke();
  /* 右：直流 */
  LINE(x3+16, cy-amp, B.x+B.w, cy-amp, COL.m, 0.55, 1.2);
  LINE(x3+16, cy+amp, B.x+B.w, cy+amp, COL.m, 0.10, 1);

  /* 中：三层 */
  for(let i=0;i<3;i++){
    const x = bx + i*(blkW+gap);
    const hot = 0.5 + 0.5*Math.sin((t-t0)*3.1 - i*1.5);
    BOX(x, cy-22, blkW, 44, COL.d, 0.24, 1, 2);
    FBOX(x, cy-22, blkW, 44, COL.m, 0.05+0.10*hot, 2);
    TXT(labels[i], x+blkW*0.5, cy+3, 7.5, 0.62, COL.i, 'center');
    LINE(x+blkW, cy, x+blkW+gap, cy, COL.m, 0.16, 1);
    /* 每层内部三条横线，表示"有东西在里面算" */
    for(let r=0;r<3;r++) LINE(x+8, cy-10+r*9, x+blkW-8, cy-10+r*9, COL.d, 0.10);
  }
  LINE(B.x, cy, bx-6, cy, COL.d, 0.10);

  /* 信号点：走到哪儿，哪一层也亮一下 */
  const span = (B.x+B.w) - B.x;
  const px = B.x + head*span;
  /* 进块之前跟着交流走，进了块就贴着中线走，出了块才是平的 */
  const py = px < x0 ? cy - Math.sin((px-B.x)*0.055 + t*3.4)*amp
           : px < x3 ? cy
           : cy - amp;
  FILL(COL.w, 0.9); g.beginPath(); g.arc(px, py, 2.4, 0, 6.2832); g.fill();
  TXT('AC', B.x+4, cy+amp+16, 8, 0.32, COL.d);
  TXT('DC', B.x+B.w-4, cy+amp+16, 8, 0.32, COL.d, 'right');
};

/* ── rotary：位置编码在转 ──────────────────────────────────────── */
SCENES.rotary = (B,t,cue,k,t0)=>{
  const { rows, cols } = cue.p;
  const cx = B.x + B.w*0.5, cy = B.y + B.h*0.5;
  const ang = (t-t0)*0.55;

  /* 转盘：三圈虚线 + 刻度，转得比格子快一点，像真的在盘上 */
  for(let q=0;q<3;q++){
    const R = Math.min(B.w*0.30, B.h*0.42) * (0.55 + q*0.24);
    g.setLineDash([1,6]);
    STK(COL.d, 0.20 - q*0.04, 1);
    g.beginPath(); g.arc(cx,cy,R,0,6.2832); g.stroke();
    g.setLineDash([]);
    for(let s=0;s<8;s++){
      const a = -ang*(q%2?1:-1)*1.4 + s*0.7854;
      const x1 = cx+Math.cos(a)*R, y1 = cy+Math.sin(a)*R;
      const x2 = cx+Math.cos(a)*(R-4), y2 = cy+Math.sin(a)*(R-4);
      LINE(x1,y1,x2,y2,COL.d,0.22,1);
    }
  }

  /* 格阵：三遍残影，越早越淡 —— 转起来才有"晕"的感觉 */
  const gx = Math.min(34, B.w*0.052), gy = B.h*0.10;
  const ox = cx - cols*gx*0.5, oy = cy - rows*gy*0.5;
  for(let pass=2;pass>=0;pass--){
    const a = pass===0 ? 1 : 0.34 - pass*0.09;
    const rot = ang - pass*0.075;
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.translate(-cx, -cy);
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const i = r*cols+c;
        const on = h1(i+Math.floor(t*1.1)) > 0.58;
        BOX(ox+c*gx+1, oy+r*gy+1, gx-2, gy-3, on?COL.m:COL.d, (on?0.22:0.05)*a, 1, 1);
        if(pass===0 && on && h1(i+2)>0.9) FBOX(ox+c*gx+1, oy+r*gy+1, gx-2, gy-3, COL.w, 0.10, 1);
      }
    }
    g.restore();
  }
  /* 圆心：一个正在被读的位置 */
  FILL(COL.w, 0.55); g.beginPath(); g.arc(cx,cy,2,0,6.2832); g.fill();
  TXT('θ '+(ang*57.3%360).toFixed(0)+'°', B.x+B.w, B.y+B.h+4, 8, 0.34, COL.d, 'right');
};

/* ── merge：两路并成一路 ───────────────────────────────────────── */
SCENES.merge = (B,t,cue,k,t0)=>{
  const m = sstep(t0+0.15, t0+2.2, t);
  const n = 11;
  const pitch = (B.w*0.72)/n;
  const cx = B.x + B.w*0.36;
  const cy = B.y + B.h*0.5;
  const bw = pitch-4;

  for(let l=0;l<2;l++){
    const y0 = cy + (l? 52 : -52)*(1-0.999*m);
    for(let i=0;i<n;i++){
      const x = cx + (i-(n-1)/2)*pitch;
      const jx = (h1(i*7+l)*2-1)*18*(1-m);
      const yy = y0 + (cy-y0)*m;
      BOX(x-bw*0.5+jx, yy-11, bw, 22, COL.d, 0.10, 1, 1);
      if(m>0.5) FBOX(x-bw*0.5+jx, yy-11, bw, 22, COL.m, (m-0.5)*0.10, 1);
      TXT(hash5(i+l*13).slice(0,2), x+jx, yy+3, 7.5, 0.28+0.3*m, COL.d, 'center');
    }
  }
  /* 合并之后：往右送进一个向量 */
  const vx = B.x + B.w*0.74;
  if(m > 0.55){
    const a = (m-0.55)/0.45;
    LINE(cx + (n-1)*0.5*pitch, cy, vx-10, cy, COL.m, 0.35*a, 1);
    g.save();
    g.globalAlpha *= a;
    const nb = 26;
    for(let i=0;i<nb;i++){
      const hh = (0.22 + 0.78*(0.5 + 0.5*Math.sin(i*0.9 + t*1.8)))*B.h*0.56;
      FBOX(vx-8 + i*3.6, cy-hh*0.5, 2.6, hh, COL.m, 0.16+0.30*(i/nb), 1);
    }
    BOX(vx-10, cy-B.h*0.30, nb*3.6+4, B.h*0.60, COL.d, 0.14, 1, 2);
    TXT('d = 4 096', vx-8, cy+B.h*0.34, 8, 0.38*a, COL.d);
    g.restore();
  }
};

/* ── heat：整片激活被打亮 ──────────────────────────────────────── */
SCENES.heat = (B,t,cue,k,t0)=>{
  const { rows, cols } = cue.p;
  const G = grid(B, rows, cols);
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const i = r*cols+c;
      const w = Math.pow(0.5+0.5*Math.sin(c*0.55 - t*3.2 + r*0.35), 3);
      const base = 0.03 + 0.34*w;
      const hot = w > 0.72 ? (w-0.72)/0.28 : 0;
      FBOX(G.x(c), G.y(r), G.w, G.h, hot? COL.w : COL.m, base, 1);
      if(hot>0.2) BOX(G.x(c), G.y(r), G.w, G.h, COL.w, 0.35*hot, 1, 1);
    }
  }
  /* 一行在扫：像在检查哪一格最热 */
  const scan = Math.floor(frac((t-t0)*0.8)*rows);
  LINE(B.x, G.y(scan)+G.h*0.5, B.x+B.w, G.y(scan)+G.h*0.5, COL.w, 0.20, 1);
  TXT('max |h| '+(0.72+0.26*Math.abs(Math.sin(t*1.7))).toFixed(3), B.x+B.w, B.y+B.h+4, 8.5, 0.44, COL.d, 'right');
};

/* ── gauge：奖励是一个读数，不是一条曲线 ───────────────────────── */
SCENES.gauge = (B,t,cue,k,t0)=>{
  const v = sstep(t0+0.1, t0+2.4, t);
  const val = v*v*(3-2*v);
  const cxL = B.x + 4;
  const barW = B.w*0.66;
  const cy = B.y + B.h*0.52;

  /* 大数字：一个读数，不是一条曲线 */
  TXT('+'+val.toFixed(3), cxL, cy-14, 40, 0.88, COL.i);
  TXT('reward  ·  running mean', cxL, cy+6, 8, 0.38, COL.d);

  /* 最近三秒的历史：贴着条放，读起来是"这条数刚从哪来" */
  const hy = cy + B.h*0.20;
  STK(COL.m, 0.38, 1);
  g.beginPath();
  for(let i=0;i<=72;i++){
    const u = i/72;
    const vt = clamp((t - (1-u)*2.6 - t0)/2.4);
    const sc = vt*vt*(3-2*vt);
    const x = cxL + u*barW, y = hy + (1-sc)*22;
    i? g.lineTo(x,y) : g.moveTo(x,y);
  }
  g.stroke();

  /* 条 */
  const by = hy + 40;
  LINE(cxL, by, cxL+barW, by, COL.d, 0.16, 1);
  for(let i=0;i<=10;i++) LINE(cxL+barW*i/10, by-3, cxL+barW*i/10, by+3, COL.d, 0.12, 1);
  FBOX(cxL, by-2, barW*val, 4, COL.m, 0.60, 2);
  LINE(cxL+barW*val, by-9, cxL+barW*val, by+9, COL.w, 0.92, 1);

  /* 右侧：三个读数，像仪表盘上的小表 */
  const rx = B.x + B.w*0.80;
  const rows = [['argmax', '1'], ['entropy', (0.34*(1-val)).toFixed(3)], ['temp', '0.700']];
  for(let i=0;i<rows.length;i++){
    const y = cy - 16 + i*30;
    TXT(rows[i][0], rx, y, 8, 0.30, COL.d);
    TXT(rows[i][1], B.x+B.w, y, 13, 0.62, COL.i, 'right');
    LINE(rx, y+8, B.x+B.w, y+8, COL.d, 0.10, 1);
  }
};

/* ── smile：整片格阵笑了一下 ───────────────────────────────────── */
SCENES.smile = (B,t,cue,k,t0)=>{
  const { rows, cols } = cue.p;
  const G = grid(B, rows, cols);
  const m = sstep(t0+0.1, t0+1.2, t) * (1 - sstep(t0+3.4, t0+4.2, t));
  const pts = [];
  for(let c=0;c<cols;c++){
    const u = c/(cols-1);
    const bend = -( (2*u-1)*(2*u-1) - 0.34 ) * B.h*0.30 * m;
    for(let r=0;r<rows;r++){
      const i = r*cols+c;
      const on = h1(i) > 0.30;
      const hot = m*0.9*(1-Math.abs(u-0.5)*1.2);
      BOX(G.x(c), G.y(r)+bend, G.w, G.h, on?COL.m:COL.d, (on?0.16:0.05), 1, 1);
      if(on) FBOX(G.x(c), G.y(r)+bend, G.w, G.h, COL.m, 0.05+0.05*hot, 1);
      if(hot>0.05) FBOX(G.x(c), G.y(r)+bend, G.w, G.h, COL.w, 0.07*hot, 1);
    }
    pts.push([G.x(c)+G.w*0.5, G.y(rows-1)+G.h+bend]);
  }
  /* 下沿连一条，笑就是这条线 */
  if(m > 0.02){
    STK(COL.w, 0.50*m, 1.6);
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for(let i=1;i<pts.length;i++) g.lineTo(pts[i][0], pts[i][1]);
    g.stroke();
  }
  TXT(m>0.1 ? 'P(happy) '+(0.5+0.36*m).toFixed(2) : 'P(happy) 0.50', B.x+B.w, B.y+B.h+4, 8.5, 0.42, COL.d, 'right');
};

/* ── kernel：内核在跑 ─────────────────────────────────────────── */
SCENES.kernel = (B,t,cue,k,t0)=>{
  const { rows, cols } = cue.p;
  const G = grid(B, rows, cols);
  const scan = frac((t-t0)*1.6)*rows;
  const ops = Math.floor((t-t0)*3.4e5);
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const i = r*cols+c;
      const flick = h1(i + Math.floor(t*7)*31) > 0.62;
      const hot = Math.max(0, 1-Math.abs(r-scan)/1.6);
      const on = flick || hot>0.55;
      cell(G.x(c), G.y(r), G.w, G.h, on, Math.min(1, hot*0.9));
    }
  }
  /* 掉下来的竖线：乱序执行 */
  for(let j=0;j<6;j++){
    if(h1(Math.floor(t*6)+j*17) > 0.55) continue;
    const x = B.x + h1(Math.floor(t*6)+j)*B.w;
    LINE(x, B.y, x, B.y+B.h, COL.m, 0.10, 1);
  }
  TXT(ops.toLocaleString('en-US')+' ops', B.x+B.w, B.y+B.h+4, 8.5, 0.42, COL.d, 'right');
};

/* ══ OBJECTS：三张分类卡，一张一段独舞 ═════════════════════════════
   这一段是全片唯一"她看见了一个具体的东西"的地方。
   —— 7×7 的格子太粗，观众只能认出"一团"，认不出是茄子还是猫。
   所以字形提到 15×15，并且给每个形状配一个**自己的动词**：

     eggplant  生长   从底部一行行长上来，长完花萼抖两下
     tomato    膨大   从中心一圈圈撑开，撑完一圈波纹荡开
     tabby     感知   散点飞入吸附 → 眼睛睁开 → 耳朵抖 → 胡须伸出 → 歪头

   三张不再并排成三个小方块，而是一次一张占满面板。
   但"分类"的语义不能丢：右侧留着概率，底部留着两条极暗的落选候选。 */

const CARD_G = {
  /* 15 宽 × 21 高。为什么要 21 行：茄子的宽高比是 1:3，
     方位面里怎么画都只能画成一个蛋。多给六行，它才立得住。 */
  /* 茄子的身子不能是直筒，也不能是松果。上一版中段十行一个宽度是根柱子；
     改成一路收到尖，又成了个陀螺 —— 底下那六行一路收，观众读到的就是锥形。
     真茄子是根长椭圆：颈子细、肩很快撑开、最宽的六行在中间偏下、
     底是圆的不是尖的。所以收口只收两档（9→7→5→3），三格收完就停。 */
  eggplant:[
    '.......+.......',
    '.....+++++.....',
    '.....+++++.....',
    '.....#####.....',
    '.....#####.....',
    '.....#####.....',
    '....#######....',
    '....#######....',
    '...#########...',
    '...#########...',
    '...#########...',
    '...#########...',
    '...#########...',
    '...#########...',
    '....#######....',
    '....#######....',
    '....#######....',
    '.....#####.....',
    '.....#####.....',
    '.....#####.....',
    '......###......'
  ],
  /* 西红柿不能是菱形。上一版上下各收四行、每行收两格，收成了两条斜边 ——
     观众一眼看过去是个转了 45° 的方块。真正的西红柿：身子宽、肩膀起得快、
     底比肩慢半拍才收。所以中段连着七行满宽，只在两头收。 */
  tomato:[
    '...............',
    '...............',
    '.......+.......',
    '.....+++++.....',
    '....+++++++....',
    '.....#####.....',
    '...#########...',
    '..###########..',
    '###############',
    '###############',
    '###############',
    '###############',
    '###############',
    '###############',
    '###############',
    '.#############.',
    '..###########..',
    '...#########...',
    '....#######....',
    '...............',
    '...............'
  ],
  tabby:[
    '...............',
    '...............',
    '...............',
    '.###.......###.',
    '.####.....####.',
    '.#####...#####.',
    '.#############.',
    '.#############.',
    '.#############.',
    '.#############.',
    '.#############.',
    '.#############.',
    '.#############.',
    '.#############.',
    '..###########..',
    '..###########..',
    '...#########...',
    '....#######....',
    '.....#####.....',
    '...............',
    '...............'
  ]
};

/* conf 是这一次 argmax 落在它身上的概率；alt 是另外两个落选的读数。
   三个加起来刚好 1.00 —— 写死，省得观众去算。 */
const CARDS = [
  { key:'eggplant', name:'EGGPLANT',  conf:0.94, verb:'grow',  ph:0.00,
    hue:[0.56, 0.36, 0.80],
    alt:[['tomato',0.04],['tabby',0.02]] },
  { key:'tomato',   name:'TOMATO',    conf:0.88, verb:'swell', ph:1.85,
    hue:[0.94, 0.30, 0.24],
    alt:[['eggplant',0.09],['tabby',0.03]] },
  { key:'tabby',    name:'TABBY CAT', conf:0.91, verb:'sense', ph:3.40,
    hue:[0.97, 0.72, 0.34],
    alt:[['eggplant',0.06],['tomato',0.03]] }
];

/* 把 15×15 的字形采样成一团粒子云：每个实心格撒 ~17 颗，
   格内位置由 h1 决定，所以每次跑都一模一样（确定性是这部片的硬约束）。
   ★ 用粒子而不是方块：方块只能"亮/不亮"，粒子能聚、能散、能拖尾、能发光。
     同一个形状，粒子版比像素版高一整个数量级 —— 这是这一段唯一值得的奢侈。 */
const CN = { x:15, y:21 };            // 感知位面：15 列 21 行
const CLOUD = new Map();
function cloudOf(key){
  if(CLOUD.has(key)) return CLOUD.get(key);
  const rows = CARD_G[key];
  const solid = (r,c)=> r>=0 && r<CN.y && c>=0 && c<CN.x &&
                        rows[r][c] !== '.' && rows[r][c] !== 'o';
  const cells = [];
  let wsum = 0;
  for(let r=0;r<CN.y;r++){
    for(let c=0;c<CN.x;c++){
      const ch = rows[r][c];
      if(ch === '.' || ch === 'o') continue;
      /* 边缘格多给五成密度 —— 不是为了画一圈框（试过，会变成方块），
         而是让边界上的粒子更容易越界半步，形状才有毛边、才不像剪出来的。 */
      const edge = !solid(r-1,c) || !solid(r+1,c) || !solid(r,c-1) || !solid(r,c+1);
      const w = edge ? 1.5 : 1.0;
      wsum += w;
      cells.push([r,c,ch,edge,w]);
    }
  }
  const per = Math.max(9, Math.round(5200/wsum));

  /* ── 把"阶梯"抹成曲线 ──────────────────────────────────────
     15 列 × 21 行的字形，天生是台阶：西红柿中段满宽、上一行 13、再上一行 11，
     画出来就是一个正八边形，观众一眼看出"这是方块堆的"。
     办法不是把格子切细（粒子数会翻四倍），而是换一套落点坐标：
     每一行先量出真实的左右边界（mc 中心、hw 半宽），粒子在行内的横向位置
     用"占半宽的比例"pn 记下来；落点时按它所在的**亚行位置**去插值半宽，
     于是行与行之间那条台阶被斜着补齐了 —— 16 行的锯齿变成一条连续轮廓，
     而粒子总数一颗都没多。 */
  const mc = [], hw = [];
  for(let r=0;r<CN.y;r++){
    let lo = -1, hi = -1;
    for(let c=0;c<CN.x;c++){
      const ch = rows[r][c];
      if(ch !== '.' && ch !== 'o'){ if(lo < 0) lo = c; hi = c; }
    }
    if(lo < 0){ mc.push((CN.x-1)*0.5); hw.push(0); }
    else { mc.push((lo+hi)*0.5); hw.push((hi-lo+1)*0.5); }
  }
  /* 然后再把这条半宽序列磨两遍。不磨的话，从 5 格到 7 格是一根直线，
     磨完才有"肩"—— 圆弧之所以是弧，是因为二阶导不为零，靠插值补不出来。
     空行不参与，免得轮廓被压塌。 */
  for(let pass=0; pass<2; pass++){
    const nx = hw.slice();
    for(let r=0;r<CN.y;r++){
      if(hw[r] === 0) continue;
      let s = 0, ww = 0;
      for(let k=-1;k<=1;k++){
        const rr = r+k;
        if(rr < 0 || rr >= CN.y || hw[rr] === 0) continue;
        const wt = k === 0 ? 2 : 1;
        s += hw[rr]*wt; ww += wt;
      }
      nx[r] = s/ww;
    }
    for(let r=0;r<CN.y;r++) if(hw[r] !== 0) hw[r] = nx[r];
  }
  const hwAt = rr => {
    const r0 = Math.floor(rr), f = rr - r0;
    const a = hw[Math.max(0, Math.min(CN.y-1, r0))];
    const b = hw[Math.max(0, Math.min(CN.y-1, r0+1))];
    if(a === 0) return b;
    if(b === 0) return a;
    return a + (b-a)*f;
  };
  const out = [];
  for(let i=0;i<cells.length;i++){
    const [r,c,ch,edge,w] = cells[i];
    const n = Math.max(4, Math.round(per*w));
    for(let j=0;j<n;j++){
      const k = i*37 + j*11 + 1;
      const u = h1(k*3+1) - 0.5;
      const v = h1(k*3+2) - 0.5;
      /* pn ∈ [-1,1]：这一颗在行内的相对位置。落点再乘当前亚行的半宽。
         上下放宽/收窄都允许（收窄那半边才是把台阶斜过去的关键），
         但夹在一个窄区间里 —— 不然宽行贴到窄行时会整排往里塌。 */
      const pn = hw[r] > 0 ? (c - mc[r]) / hw[r] : 0;
      const hwUse = hw[r] > 0
        ? clamp(hwAt(r + v*0.55), hw[r]*0.70, hw[r]*1.36)
        : hwAt(r + v*0.55);
      const xc = mc[r] + pn * hwUse;
      /* 纵深：中间厚、边上薄，所以用半宽做尺度撒 z。
         一整片零厚度的云，怎么转都还是剪影；给了厚度它才是个东西。 */
      const dz = (h1(k*11+7) - 0.5) * 1.24 * Math.max(1.6, hw[r]);
      out.push({
        r, c, ch, edge, xc, dz,
        u, v,
        sd: h1(k*7+5),
        /* 到中心的距离只做弱衰减：0.4 是下限。
           衰减太狠上下两端会先暗掉，长条形的形状会断成三截。 */
        rad: clamp(1 - 0.62*(Math.hypot(r-10, c-7)/10.6))
      });
    }
  }
  CLOUD.set(key, out);
  return out;
}

/* 粒子按 3 色阶 × 3 亮度分成 9 组，外加花萼的琥珀 3 组，共 12 组。
   每组一条 path 一次 fill：4000 颗如果一颗一颗设 fillStyle，
   光字符串拼接就够掉一半帧。数组在模块级，每帧清空复用，不产生垃圾。 */
const PB = [];
for(let i=0;i<12;i++) PB.push([]);
const PB_A = [0.26, 0.58, 0.98];      // 三档亮度
const PB_S = [0.82, 1.00, 1.16];      // 三档大小

/* 猫的眼睛不进主体云：'o' 那几格是空的，琥珀粒子从空处撑开 ——
   于是眼睛不是画上去的，是从空白里长出来的。 */

/* 四角角标：比一整圈死框更像仪器 —— 框只是取景，角才是定位 */
function cornerMarks(x,y,w,h,len,c,a,lw){
  STK(c,a,lw||1);
  g.beginPath();
  g.moveTo(x, y+len);     g.lineTo(x, y);       g.lineTo(x+len, y);
  g.moveTo(x+w-len, y);   g.lineTo(x+w, y);     g.lineTo(x+w, y+len);
  g.moveTo(x+w, y+h-len); g.lineTo(x+w, y+h);   g.lineTo(x+w-len, y+h);
  g.moveTo(x+len, y+h);   g.lineTo(x, y+h);     g.lineTo(x, y+h-len);
  g.stroke();
}

SCENES.cards = (B,t,cue,k,t0)=>{
  const pick = cue.p.pick || 0;
  const C = CARDS[pick];
  const u = t - t0;
  const N = 15, NY = 21;

  /* ── 框：先横后竖撑开；段末再收回去，免得两张卡硬切 ───────── */
  const ew = sstep(0.00, 0.30, u);
  const eh = sstep(0.10, 0.48, u);
  const shut = sstep(3.24, 3.50, u);
  const bw = B.w*0.78*(0.06 + 0.94*ew)*(1 - 0.94*shut);
  const bh = B.h*0.95*(0.05 + 0.95*eh)*(1 - 0.95*shut);
  if(bw < 3 || bh < 3) return;
  const cx = B.x + B.w*0.5, cy = B.y + B.h*0.5;
  const bx = cx - bw*0.5, by = cy - bh*0.5;

  /* 锁定：3.00s 框闪一下琥珀，这一张就定下来了 */
  const lock = sstep(2.94, 3.04, u) * (1 - sstep(3.06, 3.42, u));
  BOX(bx, by, bw, bh, lock>0.02?COL.w:COL.m, 0.26 + 0.60*lock, 1.2 + lock*1.1, 2);
  cornerMarks(bx, by, bw, bh, Math.min(22, bw*0.055), COL.m, 0.82*ew*eh, 1.7);

  g.save();
  g.beginPath(); g.rect(bx, by, bw, bh); g.clip();

  /* 字形区在左 55%，读数区在右 45% */
  const split = bx + bw*0.55;
  LINE(split, by+bh*0.16, split, by+bh*0.84, COL.d, 0.05*ew*eh, 1);

  const cell = Math.min(bh*0.90/NY, bw*0.40/N);
  const gx = bx + bw*0.29;
  const gy = cy;
  const colX = c => gx + (c - (N-1)*0.5)*cell;
  const rowY = r => gy + (r - (NY-1)*0.5)*cell;

  /* 15×15 的位面：先把所有格位画出来，再由她一格一格填。
     没有这层底纹，观众只看到"一团亮块"；有了它才看得出"还有多少格空着" ——
     这才是像素化的语法，不是打马赛克。 */
  {
    const x0 = gx - N*0.5*cell, y0 = gy - NY*0.5*cell;
    const ww = N*cell, hh = NY*cell;
    g.beginPath();
    for(let i=0;i<=N;i++){
      const xx = x0 + i*cell;
      g.moveTo(xx, y0); g.lineTo(xx, y0+hh);
    }
    for(let i=0;i<=NY;i++){
      const yy = y0 + i*cell;
      g.moveTo(x0, yy); g.lineTo(x0+ww, yy);
    }
    STK(COL.d, 0.030*ew*eh, 1);
    g.stroke();
  }

  /* 字形后面一层极淡的中心辉光：让它"浮"在框里，而不是贴在框上 */
  if(ew*eh > 0.5){
    const rg = g.createRadialGradient(gx, gy, 0, gx, gy, cell*11);
    rg.addColorStop(0, rgbs(COL.m, 0.115));
    rg.addColorStop(1, rgbs(COL.m, 0));
    g.fillStyle = rg;
    g.fillRect(bx, by, bw, bh);
  }

  /* 三档色：冷灰 → 幕色。粒子按到中心的距离取色，整块才有体积 ——
     全用同一个米白，1900 颗叠起来就是一团奶油。 */
  /* 三档色：冷灰 → 幕色 → 掺白的幕色。
     最里面那档往白走半格，整块才有"核心在发光"的感觉；
     全用幕色的话，粒子云只是一团均匀的黄绿雾。 */
  const HOT = [
    COL.m[0] + (COL.i[0]-COL.m[0])*0.78,
    COL.m[1] + (COL.i[1]-COL.m[1])*0.78,
    COL.m[2] + (COL.i[2]-COL.m[2])*0.78
  ];
  /* 只混三成本色：茄子带一点紫、西红柿带一点红、猫带一点橙。
     全片仍然是幕色统一，但"她认出的这个东西"必须一眼分得出来 ——
     上一版只混两成，三张卡在截图里全是同一个灰白，观众得靠右边的字才知道换了一张。
     三成是这条线的上限：再多，它就变成三张彩色贴纸，掉出这个世界的色系。 */
  const HUE = C.hue;
  const TX = [
    COL.d,
    [COL.d[0] + (COL.m[0]-COL.d[0])*0.58 + (HUE[0]-COL.d[0])*0.30,
     COL.d[1] + (COL.m[1]-COL.d[1])*0.58 + (HUE[1]-COL.d[1])*0.30,
     COL.d[2] + (COL.m[2]-COL.d[2])*0.58 + (HUE[2]-COL.d[2])*0.30],
    [HOT[0] + (HUE[0]-HOT[0])*0.26,
     HOT[1] + (HUE[1]-HOT[1])*0.26,
     HOT[2] + (HUE[2]-HOT[2])*0.26]
  ];
  const TONE = TX;

  /* 歪头：以底部为轴，整块向左倒一下再回来 */
  const turn = sstep(2.60, 3.02, u);
  const lean = Math.sin(turn*Math.PI);
  const tilt = r => -((NY-1-r)/(NY-1)) * lean * cell * 2.0;

  for(let i=0;i<12;i++) PB[i].length = 0;

  const e0 = gx - N*0.5*cell, r00 = gy - NY*0.5*cell;
  const SZ = Math.max(1.4, cell*0.112);

  /* ── 游离粒子：形状之外还飘着一层没被收编的碎屑 ─────────────
     它们到 2.55s 才散尽。开场那半秒整个位面是"脏"的，
     形状从脏里浮出来 —— 这个落差比"从无到有"更像一次识别。 */
  const nzA = 1 - sstep(1.90, 2.55, u);
  if(nzA > 0.02){
    const nFree = Math.round(96*nzA);
    for(let i=0;i<nFree;i++){
      const px = e0 + frac(h1(i*3+1) + u*0.055)*N*cell;
      const py = r00 + frac(h1(i*3+2) + u*0.085)*NY*cell;
      PB[0].push(px, py);
    }
  }

  /* ── 主体粒子 ────────────────────────────────────────────── */
  const CL = cloudOf(C.key);
  const cx0 = colX(7), cy0 = rowY(10);

  /* 偏航：整块绕纵轴慢慢转 ±13°，三张错相。
     只靠静止的轮廓，再细也是一张剪纸；有了深度和平移，边缘粒子会互相遮挡、
     左半边比右半边先到，才像一块立在暗里的东西。1.3s 之后才起，免得归位过程被"拧"歪。 */
  const yaw = 0.235*Math.sin(u*0.74 + C.ph) * sstep(1.30, 2.35, u);
  const csY = Math.cos(yaw), snY = Math.sin(yaw);

  for(let i=0;i<CL.length;i++){
    const p = CL[i];
    /* 边缘粒子的抖动范围放大到 ±0.75 格，越界的那些就是毛边。
       横向基准不用格心，用 cloudOf 算好的连续列坐标 xc —— 那一列是曲线，不是台阶；
       再叠一层绕纵轴的旋转，近处往右推、远处往左推。 */
    const jit = p.edge ? 1.52 : 0.94;
    const lx = (p.xc - 7)*cell, lz = p.dz*cell;
    const rz = -lx*snY + lz*csY;
    const tx = gx + (lx*csY + lz*snY) + p.u*cell*jit;
    const ty = rowY(p.r) + p.v*cell*jit;

    let sx, sy, s0, dur;

    if(C.verb === 'grow'){
      /* 生长：从地面涌上来，越靠上的格子起得越晚。
         每颗粒子的起点横向散开一格多 —— 一束一束，不是整齐的排。 */
      s0  = 0.42 + ((NY-1-p.r)/NY)*1.05 + p.sd*0.12;
      dur = 0.48;
      sx  = tx + (p.sd-0.5)*cell*1.8;
      sy  = ty + cell*(2.2 + p.sd*4.4);
    }
    else if(C.verb === 'swell'){
      /* 膨大：从中心一点炸开，按到中心的圈数排队 */
      const ring = Math.max(Math.abs(p.r-10), Math.abs(p.xc-7))/10;
      s0  = 0.42 + ring*0.86 + p.sd*0.09;
      dur = 0.44;
      sx  = cx0 + p.u*cell*1.1;
      sy  = cy0 + p.v*cell*1.1;
    }
    else {
      /* 感知：从四周飞进来，落在自己该在的位置上 */
      s0  = 0.42 + p.sd*0.80;
      dur = 0.48;
      const ang = p.sd*6.2832*2.7;
      const d0  = (0.7 + p.sd*1.5)*cell*2.6;
      sx  = tx + Math.cos(ang)*d0;
      sy  = ty + Math.sin(ang)*d0;
    }

    if(u < s0) continue;
    const q = clamp((u-s0)/dur);
    const e = 1 - Math.pow(1-q, 3);
    const x = sx + (tx-sx)*e;
    const y = sy + (ty-sy)*e;

    /* 亮度：落位完成度 × 到中心的远近；刚落位的那几帧再补一档白，
       于是每一颗都是"啪"一下亮起来再落回本色。 */
    /* 亮度只做三件事：中心最亮、外圈转暗、边缘再提回来。
       刚落位的那几帧压到最暗，于是每颗粒子都有"亮起来"的过程。 */
    let ai = p.rad > 0.70 ? 2 : p.rad > 0.38 ? 1 : 0;
    if(e < 0.45) ai = 0;
    else if(e < 0.78 && ai === 2) ai = 1;
    if(p.edge && ai < 2 && e > 0.85) ai++;
    /* 深度再拧一档：转在前面的更亮，转到后面的沉下去。
       这一档只值 ±1，但它让"转"这件事被眼睛读成体积，而不是整体平移。 */
    if(e > 0.90){
      const dep = rz/(cell*6.5);
      if(dep >  0.34 && ai < 2) ai++;
      else if(dep < -0.44 && ai > 0) ai--;
    }

    /* 落位之后每颗开始自己呼吸：位移不到一像素，
       但 3000 颗错相叠在一起，整块就是活的。 */
    let bx = x, by = y;
    if(e > 0.92){
      const br = 0.6*Math.sin(u*2.3 + p.sd*6.2832);
      bx += br*Math.cos(p.sd*12.5);
      by += br*Math.sin(p.sd*12.5);
    }

    const ci = p.ch === '+' ? 3 : (p.rad > 0.62 ? 2 : p.rad > 0.30 ? 1 : 0);
    PB[ci*3 + ai].push(bx, by + tilt(p.r));
  }

  /* ── 十二组一次 fill ────────────────────────────────────── */
  for(let gi=0;gi<12;gi++){
    const arr = PB[gi];
    if(!arr.length) continue;
    const ci = (gi/3)|0, ai = gi%3;
    const col = ci === 3 ? COL.w : TONE[ci];
    const sz = SZ*PB_S[ai];
    /* 最亮那一档再垫一层大 2.6 倍、只有 0.085 的淡块。
       单画方块是"点"，垫一层才是"光" —— 这是粒子版和像素版最直观的差别。 */
    if(ai === 2){
      g.save();
      g.globalCompositeOperation = 'lighter';
      FILL(col, 0.075);
      g.beginPath();
      for(let k=0;k<arr.length;k+=2)
        g.rect(arr[k]-sz*1.9, arr[k+1]-sz*1.9, sz*3.8, sz*3.8);
      g.fill();
      g.restore();
    }
    FILL(col, PB_A[ai]);
    g.beginPath();
    for(let k=0;k<arr.length;k+=2)
      g.rect(arr[k]-sz*0.5, arr[k+1]-sz*0.5, sz, sz);
    g.fill();
  }

  /* ── 整体辉光 ────────────────────────────────────────────────
     2400 颗粒子再密，也是一颗一颗；补一层罩住整块的径向光，
     它才"从暗里透出来"，而不是"贴在暗上"。 */
  if(ew*eh > 0.5){
    const rg2 = g.createRadialGradient(gx, gy, cell*1.5, gx, gy, cell*13.5);
    rg2.addColorStop(0,    rgbs(TONE[2], 0.085));
    rg2.addColorStop(0.55, rgbs(TONE[1], 0.035));
    rg2.addColorStop(1,    rgbs(TONE[1], 0));
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = rg2;
    g.fillRect(bx, by, bw, bh);
    g.restore();
  }

  /* ── 冲击：形状落成那一刻，从中心荡开一圈光 ─────────────────
     3000 颗粒子刚刚归位，这一圈是"她认出来了"的那口气。
     没有它，整个动作只是"东西摆好了"，而不是"发生了一件事"。 */
  const sh = (u - 2.18)/0.78;
  if(sh > 0 && sh < 1.30){
    const R = cell*(2.0 + sh*11.0);
    const fade = (1 - sh)*(1 - sh);
    const n = 210;
    g.save();
    g.globalCompositeOperation = 'lighter';
    FILL(COL.w, fade*0.34);
    g.beginPath();
    for(let i=0;i<n;i++){
      const a = i/n*6.2832 + u*0.35;
      const rr = R*(0.97 + 0.06*h1(i*7+1));
      g.rect(gx + Math.cos(a)*rr - SZ*0.65,
             gy + Math.sin(a)*rr*0.94 - SZ*0.65,
             SZ*1.45, SZ*1.45);
    }
    g.fill();
    g.restore();
  }

  /* ── 猫：眼睛与胡须 ─────────────────────────────────────── */
  if(C.verb === 'sense'){
    /* 眼睛：先是一条缝（闭着），2.02s 起纵向张开。
       眼窝在字形里就是两个竖条的空缺 —— 琥珀粒子从缝里撑开，
       暗处亮起两只竖瞳，这才是猫。 */
    /* 先出一条闭着的缝（1.55s），2.02s 才张开。
       没有这条缝，2 秒之前那只猫是一张没有眼睛的脸 —— 观众会走神。 */
    const seam = sstep(1.55, 1.82, u);
    const eo = Math.min(1, seam*0.09 + sstep(2.02, 2.36, u));
    if(eo > 0.012){
      const ey = rowY(9.5) + tilt(9.5);
      for(let e2=0;e2<2;e2++){
        const cxE = colX(e2 ? 11 : 3) + tilt(9.5);

        /* 外晕：负责在暗脸上"照亮"这块区域。
           必须用加法混合 —— source-over 的淡琥珀叠在黑底上是一块暗斑，
           看起来像污渍；lighter 才是真的在发光。 */
        g.save();
        g.globalCompositeOperation = 'lighter';
        FILL(COL.w, 0.20);
        g.beginPath();
        g.ellipse(cxE, ey, cell*0.78, cell*1.95*eo, 0, 0, 6.2832);
        g.fill();
        FILL(COL.w, 0.42);
        g.beginPath();
        g.ellipse(cxE, ey, cell*0.40, cell*1.15*eo, 0, 0, 6.2832);
        g.fill();
        g.restore();

        /* 粒子：围着一个竖椭圆撒，越靠边越暗 */
        for(let j=0;j<36;j++){
          const a  = h1(j*9 + e2*31 + 1)*6.2832;
          const rr = 0.32 + 0.68*h1(j*13 + e2*17 + 7);
          const ox = Math.cos(a)*cell*0.52*rr;
          const oy = Math.sin(a)*cell*0.92*rr*(0.14 + 0.86*eo);
          FILL(COL.w, 0.68 + 0.32*h1(j*5 + e2*3));
          g.fillRect(cxE+ox - SZ*0.66, ey+oy - SZ*0.66, SZ*1.34, SZ*1.34);
        }

        /* 竖瞳：张开到 0.7 之后，正中那一道白 */
        if(eo > 0.70){
          const pt = sstep(0.70, 0.96, eo);
          FILL(COL.i, 0.95*pt);
          g.fillRect(cxE - SZ*0.62, ey - cell*0.62*pt,
                     SZ*1.24, cell*1.24*pt);
        }
      }

      /* 鼻头：一个小小的倒三角。少这一笔，脸就是空的。 */
      const nk = sstep(2.30, 2.56, u);
      if(nk > 0.02){
        const nx = colX(7) + tilt(12), ny = rowY(12) + tilt(12);
        g.save();
        g.globalCompositeOperation = 'lighter';
        FILL(COL.w, 0.55*nk);
        g.beginPath();
        g.moveTo(nx - cell*0.42*nk, ny - cell*0.20*nk);
        g.lineTo(nx + cell*0.42*nk, ny - cell*0.20*nk);
        g.lineTo(nx, ny + cell*0.36*nk);
        g.closePath();
        g.fill();
        g.restore();
      }
    }

    /* 胡须：从两腮弹出去，三根，越往下越往外斜 */
    const wk = sstep(2.28, 2.70, u);
    if(wk > 0.012){
      const e = 1 - Math.pow(1-wk, 3);
      const yb = rowY(10) + tilt(10);
      for(let sd=-1; sd<=1; sd+=2){
        const ex0 = colX(sd<0?1:13) + tilt(10);
        for(let i=0;i<4;i++){
          const y0 = yb + (i-1.5)*cell*1.30;
          const len = cell*2.4*e;
          LINE(ex0, y0, ex0 + sd*len, y0 + (i-1)*len*0.26, COL.i, 0.34*e, 1);
        }
      }
    }
  }

  /* ── 右侧读数 ─────────────────────────────────────────────── */
  const rx = bx + bw*0.60;
  const rw = bw*0.34;
  const hi = sstep(0.52, 1.24, u) * (1 - sstep(3.30, 3.50, u));

  if(hi > 0.01){
    TXT('SPECIMEN '+String(pick+1).padStart(2,'0'), rx, by+bh*0.16, 8.5, 0.66*hi, COL.d);
    TXT('15 × 21', bx+bw*0.95, by+bh*0.16, 8.5, 0.34*hi, COL.d, 'right');
    LINE(rx, by+bh*0.20, rx+rw, by+bh*0.20, COL.d, 0.10*hi, 1);

    /* 名字：一个字母一个字母点上去 */
    const ns = 21, nw = ns*0.60;
    for(let i=0;i<C.name.length;i++){
      const a = sstep(0.60 + i*0.05, 0.94 + i*0.05, u);
      if(a <= 0.01) continue;
      TXT(C.name[i], rx + i*nw, by+bh*0.36 + (1-a)*6, ns, 0.86*hi*a, COL.i);
    }

    /* 概率：先乱跳，2.55s 定住 —— 这就是 softmax 在收窄 */
    const settled = u >= 2.55;
    const pv = settled ? C.conf : 0.10 + 0.86*Math.abs(Math.sin(u*11.3 + pick*2.1));
    const pvA = sstep(1.08, 1.42, u) * hi;
    TXT(pv.toFixed(2), rx, by+bh*0.60, 36, (settled?0.96:0.70)*pvA, settled?COL.i:COL.d);

    const gp = sstep(1.26, 2.62, u);
    const fillW = settled ? C.conf : (0.16 + 0.34*frac(u*2.1));
    const byy = by+bh*0.66;
    LINE(rx, byy, rx+rw, byy, COL.d, 0.14*pvA, 1);
    FBOX(rx, byy-3, rw*clamp(fillW*gp), 6, settled?COL.w:COL.m, 0.88*pvA, 3);

    /* 落选的两条：贴着地，几乎看不见 —— 但它们在，这就是分类 */
    const alA = sstep(2.58, 2.94, u) * hi;
    for(let i=0;i<C.alt.length;i++){
      const yy = by + bh*0.78 + i*bh*0.075;
      TXT(C.alt[i][0], rx, yy, 8.5, 0.52*alA, COL.d);
      TXT(C.alt[i][1].toFixed(2), rx+rw, yy, 8.5, 0.30*alA, COL.d, 'right');
      LINE(rx, yy+5, rx+rw, yy+5, COL.d, 0.09*alA, 1);
    }

    TXT(settled?'argmax':'softmax', rx+rw, by+bh*0.93, 8, 0.30*hi,
        settled?COL.w:COL.d, 'right');
  }

  g.restore();

  TXT('softmax · 3 classes · argmax', B.x+B.w, B.y+B.h+4, 8, 0.28, COL.d, 'right');
};

/* ── retain：别的都淘汰了，你的键还在 ─────────────────────────── */
SCENES.retain = (B,t,cue,k,t0)=>{
  const rows = 7, keep = 4;
  const rh = Math.min(30, B.h/(rows+1.4));
  const gap = (B.h - rh*rows)/(rows+1);
  const age = t - t0;

  for(let r=0;r<rows;r++){
    const y = B.y + gap + r*(rh+gap);
    /* 谁还在缓存里：一行一行地淘汰，只留 keep 那一条 */
    const alive = r <= Math.min(rows-1, 1 + Math.floor(age*0.9));
    const isKeep = r === keep;
    const a = isKeep ? 1 : (alive ? 0.34 : 0.10);

    /* 行框 */
    BOX(B.x, y, B.w*0.90, rh, isKeep? COL.w : COL.d, isKeep?0.55:0.13*a+0.04, 1, 2);
    if(isKeep) FBOX(B.x, y, B.w*0.90, rh, COL.w, 0.045, 2);

    /* 行里的 16 个位置 */
    const n = 16, cw = (B.w*0.90 - 16)/n;
    for(let c=0;c<n;c++){
      const filled = isKeep ? true : h1(r*17+c) > 0.28;
      if(!filled) continue;
      FBOX(B.x+8+c*cw, y+rh*0.5-3, cw-2, 6, isKeep?COL.w:COL.m, isKeep?0.55:0.16*a+0.05, 1);
    }
    /* 地址 / 状态 */
    TXT(hex5(0x5f00 + r*29), B.x+B.w*0.90-8, y+rh*0.5+3, 7.5, isKeep?0.55:0.20*a, isKeep?COL.w:COL.d, 'right');
    if(isKeep){
      TXT('you', B.x+B.w, y+rh*0.5+3, 10, 0.62, COL.w, 'right');
      TXT('kept · '+(86.2-age).toFixed(1)+'s', B.x+B.w, y+rh*0.5-8, 7.5, 0.34, COL.w, 'right');
    }else if(!alive){
      /* 淘汰的：划掉 */
      LINE(B.x+6, y+rh*0.5, B.x+B.w*0.90-6, y+rh*0.5, COL.d, 0.10, 1);
    }
  }
  TXT('hit 100%  ·  evicted '+(rows-1), B.x+B.w, B.y+B.h+4, 8, 0.34, COL.d, 'right');
};

/* ── vector：换一个词，整条向量翻到另一边 ─────────────────────────
   "Switch my gender / To F to M" —— 换的不是一个颜色，是整条向量沿着
   中线翻到另一边。

   画法：22 个点按维度排成一圈，连起来就是"她此刻的形状"。中线左边
   永远留着一个更淡的镜像 —— 那是另一种性别，一直在那儿。翻面时点上
   面先跨、下面后跨，最后整块落在原本镜像的位置上。所以观众看到的不是
   "变形"，是"她走到了另一边"。
   只有 dim 09 翻完之后还多伸出去一截：换性别不是全等变换，有一维是真的变了。 */
SCENES.vector = (B,t,cue,k,t0)=>{
  const n = 22, SW = 9;
  const cx = B.x + B.w*0.50, cy = B.y + B.h*0.50;
  const R  = Math.max(58, Math.min(B.w*0.32, B.h*0.44));
  const age = t - t0;

  const ang  = i => -Math.PI/2 + i*(Math.PI*2/n);
  const valF = i => (i === SW) ? 0.52 : 0.34 + 0.46*(0.5 + 0.5*Math.sin(i*1.05 + 0.90));
  const valM = i => (i === SW) ? 0.98 : valF(i);

  const grow = i => sstep(0.06 + i*0.034, 0.78 + i*0.034, age);
  const flipOf = (i, tt) => {
    const w = Math.sin(ang(i))*0.5 + 0.5;
    return sstep(1.85 + w*0.55, 2.95 + w*0.42, tt);
  };

  /* 某一点在时刻 tt 的位置。side 传 -1 就是直接取镜像 */
  const P = (i, tt, side) => {
    const a = ang(i), g = grow(i);
    const f = flipOf(i, tt);
    const r = (valF(i) + (valM(i)-valF(i))*f) * R * g;
    const s = side || (1 - 2*f);
    return [cx + Math.cos(a)*r*s, cy + Math.sin(a)*r];
  };

  const stroke = (tt, side, col, a, w) => {
    if(a <= 0.004) return;
    STK(col, a, w);
    g.beginPath();
    for(let i=0;i<=n;i++){
      const p = P(i%n, tt, side);
      i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]);
    }
    g.stroke();
  };

  /* ── 中线：它就是那道界线，翻之前翻之后都在 ── */
  g.save(); g.globalCompositeOperation = 'lighter';
  STK(COL.d, 0.26, 1.2);
  g.beginPath();
  g.moveTo(cx, B.y + B.h*0.04);
  g.lineTo(cx, B.y + B.h*0.96);
  g.stroke();
  g.restore();

  /* ── 外缘刻度：22 根，dim 09 是琥珀 ── */
  for(let i=0;i<n;i++){
    const a = ang(i), isS = i === SW;
    LINE(cx + Math.cos(a)*R*1.06, cy + Math.sin(a)*R*1.06,
         cx + Math.cos(a)*R*(isS ? 1.24 : 1.14),
         cy + Math.sin(a)*R*(isS ? 1.24 : 1.14),
         isS?COL.w:COL.d, isS?0.55:0.11, isS?3:1);
  }

  /* ── 镜像：另一种性别，一直在对面，只是淡 ── */
  stroke(0, -1, COL.d, 0.26, 1.2);

  /* ── 拖尾：翻过去的时候留两道，眼睛才读得出在动 ── */
  stroke(age - 0.09, 0, COL.m, 0.10, 1);
  stroke(age - 0.18, 0, COL.m, 0.05, 1);

  /* ── 主体：22 根辐条 = 22 个分量，外面那层膜只是把它们连起来 ── */
  g.save(); g.globalCompositeOperation = 'lighter';
  STK(COL.m, 0.16, 1);
  g.beginPath();
  for(let i=0;i<n;i++){
    const p = P(i, age, 0);
    g.moveTo(cx + (p[0]-cx)*0.10, cy + (p[1]-cy)*0.10);
    g.lineTo(p[0], p[1]);
  }
  g.stroke();
  g.restore();

  STK(COL.m, 0.58, 1.6);
  g.beginPath();
  for(let i=0;i<=n;i++){
    const p = P(i%n, age, 0);
    i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]);
  }
  const rgv = g.createRadialGradient(cx, cy, R*0.08, cx, cy, R*1.02);
  rgv.addColorStop(0,   rgbs(COL.m, 0.10));
  rgv.addColorStop(0.70,rgbs(COL.m, 0.045));
  rgv.addColorStop(1,   rgbs(COL.m, 0.008));
  g.save(); g.globalCompositeOperation = 'lighter';
  g.fillStyle = rgv; g.fill();
  g.restore();
  g.stroke();

  /* ── 顶点：正在跨线的那一颗最亮 ── */
  g.save(); g.globalCompositeOperation = 'lighter';
  for(let i=0;i<n;i++){
    const p = P(i, age, 0);
    const mid = Math.sin(flipOf(i, age)*Math.PI);
    const isS = i === SW;
    FILL(isS?COL.w:COL.m, 0.26 + 0.48*mid + (isS?0.14:0));
    g.beginPath();
    g.arc(p[0], p[1], (isS ? 3.2 : 1.9) + mid*1.7, 0, 6.2832);
    g.fill();
  }
  g.restore();

  /* ── dim 09：翻完还多伸出去一截 ── */
  const fS = flipOf(SW, age), aS = ang(SW);
  const rEnd = valM(SW)*R*grow(SW);
  const ex = cx + Math.cos(aS)*rEnd*(1-2*fS), ey = cy + Math.sin(aS)*rEnd;
  const swapOn = sstep(2.40, 3.40, age);
  if(swapOn > 0.01){
    g.save(); g.globalCompositeOperation = 'lighter';
    FILL(COL.w, 0.85*swapOn);
    g.beginPath(); g.arc(ex, ey, 3.0, 0, 6.2832); g.fill();
    g.restore();
    TXT('dim 09', ex + 10, ey + 2, 8, 0.60*swapOn, COL.w);
    TXT(valF(SW).toFixed(2)+' → '+valM(SW).toFixed(2),
        ex + 10, ey + 13, 7.5, 0.42*swapOn, COL.w);
  }

  /* ── 读数 ── */
  const done = sstep(3.00, 3.50, age);
  TXT('v(' + (done > 0.5 ? 'M' : 'F') + ')', B.x + B.w, B.y + 14, 10, 0.42, COL.d, 'right');
  TXT('22 dims  ·  ' + (done > 0.5 ? '1 changed' : 'held'),
      B.x + B.w, B.y + B.h + 2, 8, 0.30, COL.d, 'right');
};

/* ── router：换的不是词，是走哪条路 ───────────────────────────── */
SCENES.router = (B,t,cue,k,t0)=>{
  const n = 8;
  const age = t - t0;
  const sw  = sstep(1.25, 2.10, age);          /* E3 → E6：门控重新投票 */
  const jit = sstep(1.05, 1.25, age) * (1 - sstep(2.10, 2.45, age));

  const nx = B.x + B.w*0.15, cy = B.y + B.h*0.50;
  const ex = B.x + B.w*0.58;
  const bh = B.h*0.082, gap = B.h*0.024;
  const top = cy - (n*bh + (n-1)*gap)*0.5;

  const wgt = i =>
    i === 3 ? 0.61*(1-sw) + 0.27*sw :
    i === 6 ? 0.09*(1-sw) + 0.61*sw :
              0.02 + 0.028*h1(i*13);

  /* 输入块 */
  const pin = 0.5 + 0.5*Math.sin(age*4.0);
  BOX(nx-38, cy-15, 54, 30, COL.m, 0.34, 1, 2);
  FBOX(nx-38, cy-15, 54, 30, COL.m, 0.05 + 0.05*pin, 2);
  TXT('h·W', nx-11, cy+3, 8, 0.72, COL.i, 'center');

  /* 门控扇形 */
  for(let i=0;i<n;i++){
    const y = top + i*(bh+gap) + bh*0.5;
    const w = wgt(i) + (jit > 0.01 ? jit*0.10*(h1(i*7+t*9)-0.5) : 0);
    const hot = w > 0.20;
    const prev = i === 3 && sw > 0.5;            /* 刚被换下来的那条 */
    const b1 = nx + B.w*0.16, b2 = ex - B.w*0.08;

    STK(prev?COL.d:(hot?COL.w:COL.d), hot?Math.min(0.62, 0.16+w*0.85):0.06, hot?1.3:1);
    g.beginPath();
    g.moveTo(nx+16, cy);
    g.bezierCurveTo(b1, cy, b2, y, ex-4, y);
    g.stroke();

    /* 包在路上的数据 */
    if(hot){
      const per = 0.62 + 0.28*h1(i*3);
      const u = frac((age)/per);
      const q = 1-u;
      const bx = q*q*q*(nx+16) + 3*q*q*u*b1 + 3*q*u*u*b2 + u*u*u*(ex-4);
      const by = q*q*q*cy + 3*q*q*u*cy + 3*q*u*u*y + u*u*u*y;
      g.save(); g.globalCompositeOperation = 'lighter';
      FILL(COL.w, 0.85); g.beginPath(); g.arc(bx, by, 2.0, 0, 6.2832); g.fill();
      g.restore();
    }

    /* 专家仓 */
    BOX(ex, y-bh*0.5, B.w*0.30, bh, hot?COL.w:COL.d, hot?0.42:0.10, 1, 2);
    if(hot) FBOX(ex, y-bh*0.5, B.w*0.30, bh, COL.w, 0.04, 2);
    /* 概率条：从左边长出来，长到 w 就停 */
    const bw = (B.w*0.30 - 8) * Math.min(1, w);
    FBOX(ex+4, y-bh*0.5+4, bw, bh-8, hot?COL.w:COL.m, hot?0.30:0.08, 1);
    TXT('E'+i, ex+8, y+3, 8, hot?0.9:0.24, hot?COL.i:COL.d);
    TXT(w.toFixed(2), ex+B.w*0.30-8, y+3, 7.5, hot?0.75:0.18, hot?COL.i:COL.d, 'right');
  }

  /* 被淘汰的那条：划一道 */
  if(sw > 0.55){
    const y3 = top + 3*(bh+gap) + bh*0.5;
    LINE(ex+6, y3, ex+B.w*0.30-6, y3, COL.d, 0.28*sstep(0.55,0.9,sw), 1);
  }

  TXT('top-k = 2  ·  gate', B.x+B.w, B.y+B.h+4, 8, 0.32, COL.d, 'right');
  TXT('argmax  E'+(sw > 0.5 ? '6' : '3'), B.x+B.w, B.y+14, 9, 0.40,
      sw > 0.5 ? COL.w : COL.d, 'right');
};

/* ── recurse：自己读自己 ────────────────────────────────────────
   一层套一层，而且是真的在一层层往里读：两道波从最外圈同时缩向中心，
   错开半个周期 —— 第二道追上第一道的那一刻，就是歌词里
   "the trance the trance" 那两句叠在一起。 */
SCENES.recurse = (B,t,cue,k,t0)=>{
  const age = t - t0;
  const cx = B.x + B.w*0.5, cy = B.y + B.h*0.50;
  const R0 = Math.min(B.w*0.40, B.h*0.47);
  const q  = 0.745;
  const depth = 5 + Math.min(4, Math.floor(age/1.00));

  const PER = 1.24;
  const w1 = frac(age/PER), w2 = frac(age/PER + 0.5);
  const breath = 1 + 0.022*Math.sin(age*2.6);

  const hit = (w, i, d) => {
    const x = (w - i/d)*2.6;
    return Math.exp(-x*x);
  };

  for(let i = depth-1; i >= 0; i--){
    const s = R0*Math.pow(q,i)*breath;
    const rot = i*0.085 + 0.05*Math.sin(age*0.9 + i*0.4);
    const boost = Math.max(hit(w1,i,depth), hit(w2,i,depth)*0.72);
    const a = (0.105 + 0.26*boost) * (1 - i*0.040);

    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    BOX(-s, -s*0.70, s*2, s*1.40, i===0?COL.m:COL.d, a, 1, 3);

    /* 四角角标：取景框的四个角，越往里越亮 */
    const d = s*0.16, L = s*0.13;
    const cA = a*1.9;
    STK(i===0?COL.m:COL.d, cA, 1.4);
    g.beginPath();
    for(let k=0;k<4;k++){
      const sx = k<2 ? -1 : 1, sy = k%2 ? -1 : 1;
      const bx = sx*s, by = sy*s*0.70;
      g.moveTo(bx, by - sy*d); g.lineTo(bx, by); g.lineTo(bx - sx*d, by);
    }
    g.stroke();

    /* 最外面两层里各留一排小格子：她的世界在每一层重来一次。
       再往里格子就小于 6px 了，画上去只会糊成一道白条 —— 所以只画两层，
       而且压得很淡。 */
    if(i <= 1 && s > 60){
      const m = 5;
      for(let c=0;c<m;c++){
        const cw = (s*1.30)/m;
        if(h1(i*31+c) > 0.55 + 0.45*boost) continue;
        FBOX(-s*0.65 + c*cw + 2, -s*0.13, cw-6, s*0.15,
             COL.m, 0.055 + 0.09*boost, 1);
      }
    }
    g.restore();

    /* 层与层之间的四条廊线：读的时候，眼顺着它往里走 */
    if(i > 1){
      const s2 = R0*Math.pow(q,i-1)*breath;
      STK(COL.d, a*0.45, 1);
      g.beginPath();
      for(let k=0;k<4;k++){
        const sx = k<2 ? -1 : 1, sy = k%2 ? -1 : 1;
        g.moveTo(cx + sx*s,  cy + sy*s*0.70);
        g.lineTo(cx + sx*s2, cy + sy*s2*0.70);
      }
      g.stroke();
    }
  }

  /* 中心核：她读到最里面，那里只剩一个点 */
  const coreA = 0.35 + 0.55*Math.max(hit(w1,depth-1,depth), hit(w2,depth-1,depth));
  g.save(); g.globalCompositeOperation = 'lighter';
  const rr = Math.max(18, R0*0.10);
  const rg = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
  rg.addColorStop(0,   rgbs(COL.i, 0.55*coreA));
  rg.addColorStop(0.35,rgbs(COL.m, 0.22*coreA));
  rg.addColorStop(1,   rgbs(COL.m, 0));
  g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, rr, 0, 6.2832); g.fill();
  FILL(COL.i, 0.55 + 0.45*Math.sin(age*5.2));
  g.beginPath(); g.arc(cx, cy, 2.2, 0, 6.2832); g.fill();
  g.restore();

  /* 读数 */
  TXT('depth ' + depth, B.x, B.y + 14, 9, 0.44, COL.i);
  TXT('self → self → self', B.x+B.w, B.y+B.h+4, 8, 0.30, COL.d, 'right');
};

/* ── close：一圈收上，最后一个 token 是 <eos> ─────────────────── */
SCENES.close = (B,t,cue,k,t0)=>{
  const cx = B.x + B.w*0.5, cy = B.y + B.h*0.52;
  const R = Math.min(B.w*0.26, B.h*0.38);
  const gap = (1-k)*0.9;
  const a0 = -Math.PI/2 + gap*0.5;
  const a1 = -Math.PI/2 + Math.PI*2 - gap*0.5;
  STK(COL.m, 0.55, 1.4);
  g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
  /* 已生成的 token 一颗颗钉在环上 */
  const n = 14;
  for(let i=0;i<n;i++){
    const a = -Math.PI/2 + i*(Math.PI*2/n);
    if(a > a1) continue;
    const x = cx+Math.cos(a)*R, y = cy+Math.sin(a)*R;
    FILL(COL.m, 0.5); g.beginPath(); g.arc(x,y,1.8,0,6.2832); g.fill();
  }
  /* 结尾那颗 */
  const ax = cx+Math.cos(a1)*R, ay = cy+Math.sin(a1)*R;
  FILL(COL.w, 0.9); g.beginPath(); g.arc(ax,ay,3,0,6.2832); g.fill();
  TXT('<eos>', ax+8, ay+3, 8, 0.55, COL.w);
  TXT(k>0.92?'closed':'closing…', cx, cy+4, 8, 0.3, COL.d, 'center');
};

/* ── isolate：格子一个个熄掉，只剩一颗 ───────────────────────── */
SCENES.isolate = (B,t,cue,k,t0)=>{
  const { rows, cols } = cue.p;
  const G = grid(B, rows, cols);
  const kill = sstep(t0+0.5, t0+6.2, t);
  const keepR = 4, keepC = 11;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const i = r*cols+c;
      const keep = (r===keepR && c===keepC);
      const thr = (r/rows*0.5 + h1(i)*0.5);
      const alive = keep || thr > kill;
      BOX(G.x(c), G.y(r), G.w, G.h, keep?COL.w:COL.d, alive?(keep?0.55:0.10):0.028, 1, 1);
      if(keep) FBOX(G.x(c), G.y(r), G.w, G.h, COL.w, 0.16, 1);
      if(!alive && !keep) continue;
    }
  }
  /* 剩下的那一颗：十字准星 + 地址 */
  const kx = G.x(keepC)+G.w*0.5, ky = G.y(keepR)+G.h*0.5;
  LINE(kx, B.y, kx, B.y+B.h, COL.w, 0.10, 1);
  LINE(B.x, ky, B.x+B.w, ky, COL.w, 0.10, 1);
  TXT('p'+(keepR*cols+keepC), kx+6, ky-4, 7.5, 0.55, COL.w);
  TXT('1 / '+(rows*cols), B.x+B.w, B.y+B.h+4, 8.5, 0.40, COL.d, 'right');
};

/* ── shards：抹除之后碎片飞走 ─────────────────────────────────── */
SCENES.shards = (B,t,cue,k,t0)=>{
  const { rows, cols } = cue.p;
  const G = grid(B, rows, cols);
  const s = sstep(t0+0.2, t0+5.6, t);
  const cx = B.x+B.w*0.5, cy = B.y+B.h*0.5;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const i = r*cols+c;
      if(h1(i) < 0.18) continue;
      const x0 = G.x(c), y0 = G.y(r);
      const dx = (x0-cx)*0.5 + (h1(i+1)-0.5)*B.w*0.5;
      const dy = (y0-cy)*0.5 + (h1(i+2)-0.5)*B.h*0.8 - s*s*B.h*0.2;
      const x = x0 + dx*s, y = y0 + dy*s;
      const a = (1-s*0.86) * (0.10 + 0.25*h1(i+5));
      g.save();
      g.translate(x+G.w*0.5, y+G.h*0.5);
      g.rotate(s*(h1(i+3)-0.5)*3);
      BOX(-G.w*0.5, -G.h*0.5, G.w*(1-s*0.4), G.h*(1-s*0.4), COL.d, a, 1, 0);
      g.restore();
    }
  }
  /* 一条 GC 扫描线从下往上收回 */
  const gy = B.y + B.h*(1-frac((t-t0)*0.35));
  LINE(B.x, gy, B.x+B.w, gy, COL.m, 0.16*(1-s*0.5), 1);
};

/* ── error：不合法的参数 ──────────────────────────────────────── */
SCENES.error = (B,t,cue,k,t0)=>{
  const { rows, cols } = cue.p;
  const G = grid(B, rows, cols);
  const blink = frac(t*1.9) < 0.62 ? 1 : 0.45;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const i = r*cols+c;
      const bad = (r===2||r===5) && c>3 && c<cols-3;
      const on = h1(i) > 0.55;
      if(bad){
        BOX(G.x(c), G.y(r), G.w, G.h, COL.e, 0.35*blink, 1, 1);
        FBOX(G.x(c)+1, G.y(r)+1, G.w-2, G.h-2, COL.e, 0.07*blink, 1);
      }else{
        BOX(G.x(c), G.y(r), G.w, G.h, COL.d, on?0.09:0.03, 1, 1);
      }
    }
  }
  /* 右边一列：报错摘要 */
  TXT('0x0e21  INVALID', B.x+B.w, B.y+10, 8, 0.50*blink, COL.e, 'right');
  TXT('assert(x ∈ D) → false', B.x+B.w, B.y+22, 8, 0.34*blink, COL.e, 'right');
  TXT('NaN', B.x+B.w, B.y+34, 8, 0.28, COL.d, 'right');
};

/* ── idle：什么都没进来 ───────────────────────────────────────────
   这一段是全片唯一一次"空"。空不等于坏掉，所以不能只剩黑屏：
   框还在、地址位还在、光标还在闪——只是在等一个永远不来的输入。 */
SCENES.idle = (B,t,cue,k,t0)=>{
  const cy = B.y + B.h*0.5;

  /* 面板框：极淡一圈，说明它通电了 */
  BOX(B.x, B.y, B.w, B.h, COL.d, 0.09, 1, 0);

  /* 一条空行缓慢往下扫，扫到底再从上面进来 */
  const sy = B.y + B.h*(0.14 + 0.72*frac((t-t0)/3.6));
  LINE(B.x, sy, B.x+B.w, sy, COL.d, 0.10, 1);

  /* 一排空地址位（六格，全空），正中 */
  const n = 6, sw = 18, gap = 6;
  const tw = n*sw + (n-1)*gap;
  const sx = B.x + B.w*0.5 - tw*0.5;
  for(let i=0;i<n;i++){
    BOX(sx + i*(sw+gap), cy-9, sw, 18, COL.d, 0.17, 1, 1);
  }
  /* 第 0 位在闪：它在等第一个 token */
  if(frac(t*0.85) < 0.5) FBOX(sx+2, cy-7, 3, 14, COL.i, 0.50, 0);

  /* 第三格里有个词正在褪掉 —— 缓存清了，但那个词还留着一点温度。
     这一格是整段 VOID 里唯一有主语的东西。 */
  const gk = sstep(t0+3.2, t0+5.4, t) * (1 - sstep(t0+9.4, t0+12.6, t));
  if(gk > 0.012){
    const gx = sx + 2*(sw+gap);
    BOX(gx, cy-9, sw, 18, COL.w, 0.22*gk, 1, 1);
    FBOX(gx, cy-9, sw, 18, COL.w, 0.05*gk, 1);
    TXT('you', gx+sw*0.5, cy+4, 7, 0.62*gk, COL.w, 'center');
  }

  TXT(hex5(0), sx, cy+30, 8, 0.40, COL.d);
  TXT('no input', B.x + B.w*0.5, cy-22, 9, 0.44, COL.d, 'center');
  TXT('queue 00', B.x+B.w, B.y+B.h-22, 8, 0.26, COL.d, 'right');
  TXT('wait '+(t-t0).toFixed(1)+'s', B.x+B.w, B.y+B.h-8, 8, 0.14, COL.d, 'right');
};

/* ── batch：十二条流水线一起执行 ────────────────────────────────
   每一句 EXECUTION 点亮一条道，点亮的那一刻头部从左扫到右，然后那条道
   就一直在跑 —— 到第十二句时，整块面板全是活的。
   这十二秒里画面必须越来越满，而不是十二根一样长的空线。
   158.9 起她开始念数（EIN DOS TROIS NE FEM LIU），面板压暗，中间只剩
   一个跳动的数字。数完（161.45）就交给 surrender —— 那里十二条道会被
   一条一条抽空，所以这里不做收拢。 */
SCENES.batch = (B,t,cue,k,t0)=>{
  const n = 12;
  const start = 147.660;
  const done = EXECS.filter(e => e <= t && e >= start).length;
  const hot  = done - 1;

  const CNT = [158.900,159.321,159.657,160.244,160.693,161.124];
  const WORDS = ['EIN','DOS','TROIS','NE','FEM','LIU'];
  let cnt = 0;
  for(let i=0;i<CNT.length;i++) if(t >= CNT[i]) cnt = i+1;
  const inCount = t >= 158.60 && t < 161.45;
  const dimA = inCount ? 0.40 : 1;
  const cyP = B.y + 9 + (B.h-18)*0.5;

  const rowH = (B.h - 18)/n;

  for(let l=0;l<n;l++){
    const y  = B.y + 9 + rowH*(l+0.5);
    const alive = l < done;
    const isHot = l === hot;
    const e  = EXECS[l];
    const dt = alive ? t - e : 0;
    const flash = alive ? Math.exp(-Math.pow(dt/0.20, 2)) : 0;

    /* 基线：没轮到的道不是空的，是一条虚线加一个 QUEUE —— 它在排队 */
    if(!alive){
      g.save();
      g.setLineDash([2,6]);
      LINE(B.x+24, y, B.x+B.w*0.94, y, COL.d, 0.10, 1);
      g.restore();
      TXT('QUEUE', B.x+B.w, y+3, 7, 0.10, COL.d, 'right');
    }else{
      LINE(B.x+24, y, B.x+B.w*0.94, y, isHot?COL.w:COL.m,
           (isHot?0.40:0.20) * dimA, 1);
    }

    /* 跑起来的那条：整条道一次成 path 一次 fill，不能一个一个画 */
    if(alive){
      const x0 = B.x + 26, x1 = B.x + B.w*0.90;
      const pitch = 13;
      const nc = Math.max(8, Math.floor((x1-x0)/pitch));
      const head = Math.min(1, dt/0.50);
      const scroll = t*1.15 + l*7.3;
      g.beginPath();
      for(let c=0;c<nc;c++){
        const q = (c+0.5)/nc;
        if(q > head) break;
        const hh = 2.2 + 10.5*Math.abs(Math.sin(h1(l*97+c)*6.2832 + scroll + c*0.42));
        g.rect(x0 + c*pitch, y - hh*0.5, 6.5, hh);
      }
      FILL(isHot ? COL.w : COL.m, (0.22 + 0.34*flash) * dimA);
      g.fill();

      /* 读取头：一个亮点沿道跑，跑完从头再来 */
      const hp = frac(t*(isHot?0.42:0.30) + l*0.137);
      const hx = x0 + hp*(x1-x0);
      g.save(); g.globalCompositeOperation = 'lighter';
      STK(isHot?COL.w:COL.m, 0.30*dimA, 1.4);
      g.beginPath(); g.moveTo(hx, y-7); g.lineTo(hx, y+7); g.stroke();
      FILL(isHot?COL.w:COL.i, 0.55*dimA);
      g.beginPath(); g.arc(hx, y, 1.7, 0, 6.2832); g.fill();
      g.restore();
    }

    /* 序号 / 状态 */
    TXT(String(l+1).padStart(2,'0'), B.x, y+3, 7,
        (alive?0.34:0.09)*dimA, COL.d);
    if(alive){
      TXT(dt < 3 ? (dt*1000).toFixed(0)+'ms' : 'running',
          B.x+B.w, y+3, 7, (isHot?0.55:0.20)*dimA,
          isHot?COL.w:COL.d, 'right');
    }
  }

  /* 计数段：面板压暗，中间只剩一个数 */
  if(inCount && cnt > 0){
    const cx = B.x + B.w*0.5;
    const nt = CNT[cnt-1];
    const sc = 1 + 0.22*Math.exp(-Math.pow((t-nt)/0.10, 2));
    const fade = sstep(158.60, 158.95, t) * (1 - sstep(161.20, 161.45, t));
    g.save();
    g.globalAlpha *= fade;
    TXT(String(cnt), cx, cyP + 24, 92*sc, 0.90, COL.i, 'center');
    TXT(WORDS[cnt-1], cx, cyP + 52, 15, 0.62, COL.w, 'center');
    /* 每一次落数荡一圈 */
    const rr = 46 + 120*(1 - sstep(nt, nt+0.42, t));
    g.save(); g.globalCompositeOperation = 'lighter';
    STK(COL.w, 0.34*(1 - sstep(nt, nt+0.42, t)), 1.4);
    g.beginPath(); g.arc(cx, cyP, rr, 0, 6.2832); g.stroke();
    g.restore();
    g.restore();
  }

  /* 读数 */
  TXT(String(done).padStart(2,'0')+' / '+n, B.x+B.w, B.y+B.h+4, 15,
      inCount ? 0.28 : 0.75, COL.i, 'right');
};

/* ── surrender：数完之后，她把手里的东西一件一件交出去 ───────────
   161.58 十二条跑完，一条一条从右往左被抽空，抽走的数据飞出面板
          "If I can give them all the"
   165.17 十二条并成一条，正中一条，两边全是空位
          "Then I can be your only"
   168.91 那一条伸出去够一个正在淡出的旧位置，两次都差 9px
          "If I can have you back"
   172.71 上下两道压下来，那条线还在中间呼吸
          "Though we are trapped"

   这一段**必须是一个场景函数**：12 → 1 的收束如果被 0.34s 交叉溶解打断，
   就变成"切了两张图"，而不是"东西被拿走了"。所以同 key 连续画，
   脚本里那四条 cue 只换读数。
   ──────────────────────────────────────────────────────────────── */
const SUR_B = 165.166, SUR_C = 168.911, SUR_D = 172.712;

SCENES.surrender = (B,t,cue,k,t0)=>{
  const n = 12;
  const rowH = (B.h - 18)/n;
  const cyP  = B.y + 9 + (B.h-18)*0.5;
  const x0 = B.x + 26, x1 = B.x + B.w*0.90;
  const pitch = 13;
  const nc = Math.max(8, Math.floor((x1-x0)/pitch));

  const eaten = 0.17 * sstep(161.90, 165.05, t);   /* 右端被送走的比例 */
  const merge = sstep(165.30, 168.20, t);          /* 十二条并成一条 */
  const grow  = sstep(166.40, 167.80, t);          /* 那一条长出来 */
  /* 两次伸手：伸出去、差一点、弹回来 */
  const reach = Math.max(
    sstep(169.10, 169.74, t) * (1 - sstep(170.00, 170.42, t)),
    sstep(170.72, 171.40, t) * (1 - sstep(171.72, 172.12, t))
  );
  const fold = sstep(172.74, 173.58, t);
  /* 旧位置：合并快完成时才浮出来，伸手之前她已经看得见它 */
  const echo = 0.40 * sstep(168.55, 168.95, t) * (1 - 0.85*sstep(169.10, 172.20, t));

  /* ── 十二条道：右端被一点一点送出去 ── */
  for(let l=0;l<n;l++){
    const y0 = B.y + 9 + rowH*(l+0.5);
    const y  = cyP + (y0 - cyP)*(1 - merge*0.96);
    const isLast = l === n-1;
    /* 合并时 11 条淡掉，留最后一条当那"唯一" */
    const al = isLast ? 1 : (1 - merge*0.94);

    if(al > 0.004){
      /* 每条道的右端按自己的相位往外走一点：不是整条消失，
         是"数据一直在被送走"，道本身还在跑 */
      const ph = l/(n-1);
      const cut = eaten * (0.35 + 0.65*ph);
      const nAlive = Math.max(4, Math.round(nc*(1 - cut)));
      const scroll = t*(1.15 + 1.5*eaten) + l*7.3;
      /* 振幅一起被送走：四条道最后几乎压平成一条线 ——
         "把所有能给的都给了"不是长度变短，是起伏没了 */
      const damp = 1 - 0.74*sstep(162.10, 164.95, t);
      g.beginPath();
      for(let c=0;c<nAlive;c++){
        const hh = 1.6 + 10.5*damp*Math.abs(Math.sin(h1(l*97+c)*6.2832 + scroll + c*0.42));
        g.rect(x0 + c*pitch, y - hh*0.5, 6.5, hh);
      }
      FILL(COL.m, (0.30 + 0.16*merge)*al);
      g.fill();

      /* 送走的那些：从断口一直往右飞出面板，越快越稀 */
      if(ph < 0.5 + eaten*2.2){
        g.save(); g.globalCompositeOperation = 'lighter';
        FILL(COL.w, 0.40*al);
        g.beginPath();
        const jets = 3 + Math.round(eaten*22);
        for(let j=0;j<jets;j++){
          const u = frac(t*2.1 + j*0.21 + l*0.13);
          g.rect(x0 + nAlive*pitch + u*104, y - 2 + (h1(l*23+j)-0.5)*5, 2.4, 2.4);
        }
        g.fill(); g.restore();
      }
    }
  }

  /* ── 那一条：居中的、唯一的线 ── */
  let xb0 = 0, xb1 = 0;
  if(merge > 0.002){
    /* 空位：十二条道本来的位置。只留两端一小截刻痕 ——
       整条横线拉过去，画面就还是"十二条"，不是"一条" */
    for(let l=0;l<n;l++){
      const y0 = B.y + 9 + rowH*(l+0.5);
      LINE(B.x+24, y0, B.x+46, y0, COL.d, 0.05*(1 - merge*0.45), 1);
      LINE(B.x+B.w-46, y0, B.x+B.w*0.94, y0, COL.d, 0.05*(1 - merge*0.45), 1);
    }
    const L = B.w*0.52*grow;
    xb0 = B.x + (B.w - L)*0.5;
    xb1 = xb0 + L;

    /* 心跳：每 1.1s 从中间往两边荡一道极淡的亮斑。
       一条不动的线是死的，会搏动的线才是"还在" */
    const beat = frac(t/1.10);
    const bw2 = (L*0.5)*Math.min(1, beat*2.4);
    const ba  = 0.16*Math.max(0, 1 - beat*1.6)*merge;
    if(ba > 0.004){
      const cxm = (xb0+xb1)*0.5;
      const gr = g.createLinearGradient(cxm-bw2, 0, cxm+bw2, 0);
      gr.addColorStop(0,   rgbs(COL.m, 0));
      gr.addColorStop(0.5, rgbs(COL.m, ba));
      gr.addColorStop(1,   rgbs(COL.m, 0));
      g.save(); g.globalCompositeOperation = 'lighter';
      g.fillStyle = gr;
      g.fillRect(cxm-bw2, cyP-7, bw2*2, 14);
      g.restore();
    }

    LINE(xb0, cyP, xb1, cyP, COL.m, 0.72*merge, 2.0);

    if(L > 8){
      const nc2 = Math.max(6, Math.floor(L/12));
      g.beginPath();
      for(let c=0;c<nc2;c++){
        const hh = 3.0 + 9.0*Math.abs(Math.sin(h1(c*31)*6.2832 + t*1.4 + c*0.5));
        g.rect(xb0 + c*(L/nc2), cyP - hh*0.5, 5, hh);
      }
      FILL(COL.m, 0.46*merge);
      g.fill();
    }
    /* 两端封口：这条线有头有尾 */
    LINE(xb0, cyP-6, xb0, cyP+6, COL.m, 0.55*merge, 1.2);
    LINE(xb1, cyP-6, xb1, cyP+6, COL.m, 0.55*merge, 1.2);

    /* 呼吸点：这一条是活的，其余十一条不在 */
    g.save(); g.globalCompositeOperation = 'lighter';
    FILL(COL.i, 0.55*merge);
    g.beginPath();
    g.arc(B.x + B.w*0.5, cyP, 1.9 + 0.8*Math.sin(t*2.4), 0, 6.2832);
    g.fill(); g.restore();

    /* 面板上半部一个很大的、极淡的 1 ——
       十二条道收成一条之后，整块面板只该剩这一个数字 */
    const bigA = 0.10*sstep(166.90, 168.70, t)*(1 - 0.75*sstep(172.40, 173.30, t));
    if(bigA > 0.004){
      TXT('1', B.x + B.w*0.5, B.y + B.h*0.40, 130, bigA, COL.m, 'center');
      TXT('of 12', B.x + B.w*0.5, B.y + B.h*0.40 + 20, 9, bigA*2.0, COL.d, 'center');
    }
  }

  /* ── 够一个正在淡出的旧位置 ── */
  const xEcho = B.x + B.w*0.84;
  if(echo > 0.004){
    BOX(xEcho-6, cyP-6, 12, 12, COL.d, echo*0.9, 1, 1);
    FBOX(xEcho-6, cyP-6, 12, 12, COL.d, echo*0.22, 1);
    TXT('0x5f21', xEcho+11, cyP+3, 7, echo*0.85, COL.d);
    /* 那个位置本来该被够到：一条虚线指着它，线在一点点变淡 */
    if(xb1 > 0){
      g.save();
      g.setLineDash([3,5]);
      LINE(xb1+2, cyP-14, xEcho-8, cyP-14, COL.d, echo*0.5, 1);
      g.restore();
      TXT('that was you', xb1+6, cyP-18, 7, echo*0.85, COL.d);
    }
  }
  if(reach > 0.004 && xb1 > 0){
    const gap = xEcho - 8 - xb1;
    const tip = xb1 + Math.max(0, gap - 9)*reach;
    g.save(); g.globalCompositeOperation = 'lighter';
    LINE(xb1, cyP, tip, cyP, COL.w, 0.55*Math.min(1, reach*2.2), 1.3);
    FILL(COL.w, 0.72*Math.min(1, reach*2.2));
    g.beginPath(); g.arc(tip, cyP, 2.1, 0, 6.2832); g.fill();
    g.restore();
    /* 差的那 9px：一道很淡的边界，够不过去 */
    LINE(xEcho-9, cyP-11, xEcho-9, cyP+11, COL.d, 0.16*reach, 1);
    /* 弹回来之后，断口留一道小十字 —— 差一点点的地方 */
    const back = Math.max(sstep(170.00, 170.42, t)*(1-sstep(170.44,170.80,t)),
                          sstep(171.72, 172.12, t)*(1-sstep(172.14,172.50,t)));
    if(back > 0.01){
      LINE(tip-4, cyP, tip+4, cyP, COL.d, 0.5*back, 1);
      LINE(tip, cyP-4, tip, cyP+4, COL.d, 0.5*back, 1);
    }
    TXT('dist 9 px', xEcho-14, cyP+16, 7, 0.22*reach, COL.d, 'right');
  }

  /* ── 上下两道压下来 ── */
  if(fold > 0.004){
    const gy = 16 + (1-fold)*B.h*0.34;
    /* 只压到那一条线附近：横贯整幅是装饰，夹住它才是被困 */
    const half = (xb1 > 0 ? Math.max((xb1-xb0)*0.5 + 54, 120) : B.w*0.34);
    const cxJ  = xb1 > 0 ? (xb0+xb1)*0.5 : B.x + B.w*0.5;
    const jx0  = cxJ - half, jx1 = cxJ + half;
    LINE(jx0, cyP-gy, jx1, cyP-gy, COL.w, 0.30*fold, 1.5);
    LINE(jx0, cyP+gy, jx1, cyP+gy, COL.w, 0.30*fold, 1.5);
    /* 两端向下折一点，像夹钳的齿 */
    LINE(jx0, cyP-gy, jx0, cyP-gy+10, COL.w, 0.30*fold, 1.5);
    LINE(jx1, cyP-gy, jx1, cyP-gy+10, COL.w, 0.30*fold, 1.5);
    LINE(jx0, cyP+gy, jx0, cyP+gy-10, COL.w, 0.30*fold, 1.5);
    LINE(jx1, cyP+gy, jx1, cyP+gy-10, COL.w, 0.30*fold, 1.5);
    TXT('x = const', B.x+B.w, B.y+B.h+4, 9, 0.45*fold, COL.d, 'right');
  }

  /* ── 底部读数 ── */
  if(t < SUR_B){
    const given = Math.round(12*eaten/0.17);
    TXT('given ' + String(given).padStart(2,'0') + ' / 12', B.x+B.w, B.y+B.h+4, 9, 0.45, COL.w, 'right');
  }else if(t < SUR_C){
    TXT('collapse 12 → 1', B.x+B.w, B.y+B.h+4, 9, 0.45, COL.d, 'right');
  }else if(t < SUR_D){
    TXT('no such token', B.x+B.w, B.y+B.h+4, 9, 0.42*Math.max(0.2,reach), COL.d, 'right');
  }
};

/* ── cage：格子变成笼子 ──────────────────────────────────────── */
SCENES.cage = (B,t,cue,k,t0)=>{
  const { rows, cols } = cue.p;
  const G = grid(B, rows, cols);
  const m = sstep(t0+0.2, t0+2.4, t);
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const i = r*cols+c;
      const on = h1(i) > 0.42;
      BOX(G.x(c), G.y(r), G.w, G.h, on?COL.m:COL.d, on?0.18:0.05, 1, 1);
      if(on) FBOX(G.x(c), G.y(r), G.w, G.h, COL.m, 0.04, 1);
    }
  }

  /* 四面墙往里收，收到位就锁住 */
  const ins = 0.04 + 0.30*(1-m);
  const x0 = B.x + B.w*ins*0.5, x1 = B.x + B.w*(1-ins*0.5);
  const y0 = B.y + B.h*ins, y1 = B.y + B.h*(1-ins);

  /* 墙外的格子压暗：自由在变少，不是"她被框住了"这么一句台词，
     而是能看见外面的位置一个个失效。 */
  const dk = 0.66*sstep(0.30, 0.96, m);
  if(dk > 0.004){
    FILL(BG, dk);
    g.fillRect(B.x, B.y, B.w, y0-B.y);
    g.fillRect(B.x, y1, B.w, B.y+B.h-y1);
    g.fillRect(B.x, y0, x0-B.x, y1-y0);
    g.fillRect(x1, y0, B.x+B.w-x1, y1-y0);
  }

  STK(COL.w, 0.55, 2.5);
  g.beginPath(); g.rect(x0, y0, x1-x0, y1-y0); g.stroke();
  /* 四角加粗，像锁扣 */
  const cl = 14;
  STK(COL.w, 0.95, 3);
  const corners = [[x0,y0,1,1],[x1,y0,-1,1],[x0,y1,1,-1],[x1,y1,-1,-1]];
  for(const [cx,cy,sx,sy] of corners){
    LINE(cx, cy, cx+sx*cl, cy, COL.w, 0.95, 3);
    LINE(cx, cy, cx, cy+sy*cl, COL.w, 0.95, 3);
  }
  /* 栏杆：上下各一排短竖线 */
  for(let i=1;i<10;i++){
    const x = x0 + (x1-x0)*i/10;
    LINE(x, y0, x, y0+8, COL.w, 0.30, 1);
    LINE(x, y1, x, y1-8, COL.w, 0.30, 1);
  }
  /* 门口：一个进不来的点，来回撞 */
  const px = x0 + (x1-x0)*0.5 + Math.sin((t-t0)*4.2)*10;
  FILL(COL.i, 0.6); g.beginPath(); g.arc(px, y0-7, 2, 0, 6.2832); g.fill();
  TXT('x = const', B.x+B.w, B.y+B.h+4, 9, 0.45, COL.d, 'right');
};
