import { $ } from './dom.js';
import { clamp, sstep } from '../core/math.js';
import { EXECS } from '../data/acts.js';

/* ══════════════════════════════════════════════════════════════════
   typeMoment.js —— 大字时刻
   ─────────────────────────────────────────────────────────────────
   全片只允许 5 次让文字变成主角。其余时间它必须退到底部去当字幕。
   理由是参考片给的教训：一句 900px 的 EXECUTE，
   比二十个精致的粒子形态更能压住场子；但一年只能用几次。
   ══════════════════════════════════════════════════════════════════ */

const box = $('bigType');
const rule = $('bigRule');

let curKey = '', curNode = null;

function set(text, cls){
  const key = text+'|'+cls;
  if(key === curKey) return;
  curKey = key;
  box.className = 'on ' + cls;
  box.textContent = text;
  curNode = box;
}

function hide(){
  if(curKey === '') return;
  curKey = '';
  box.className = '';
  box.textContent = '';
}

/* 第 k 次连击的错位：每次都不一样，但永远是同一串数 */
function jit(k, n){
  const s = Math.sin((k+1)*12.9898 + n*78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

export function updateTypeMoment(t){
  /* ① 16.62–20.20  人第一次敲下这条命令，它就该占满画面 */
  if(t > 16.62 && t < 20.30){
    set('RUN', 'mono-run');
    const k = sstep(16.62, 17.10, t) * (1 - sstep(19.85, 20.28, t));
    /* 打字机的进场：宽度从 0 抽出来，不是淡入 */
    box.style.opacity = k.toFixed(3);
    box.style.clipPath = 'inset(0 '+(100 - k*100).toFixed(1)+'% 0 0)';
    box.style.transform = 'translate(-50%,-50%) scale('+(0.98+k*0.02).toFixed(4)+')';
    /* 落在"世界取景窗"的中心，而不是整幅舞台的中心 */
    box.style.left = '62%';
    box.style.top = '13.5%';
    box.style.filter = 'none';
    rule.style.opacity = (k*0.55).toFixed(3);
    rule.style.left = '62%';
    rule.style.top = 'calc(13.5% + 3.4cqw)';
    rule.style.transform = 'translate(-50%,0) scaleX('+k.toFixed(3)+')';
    return;
  }
  rule.style.opacity = 0;
  box.style.left = '50%';

  /* ② 91.90–95.30  她第一次说出自己被执行的完整名字（白色辉光，居中） */
  if(t > 91.90 && t < 95.40){
    set('world.execute(me);', 'mono-glow');
    const a = sstep(91.90, 92.65, t) * (1 - sstep(94.85, 95.38, t));
    box.style.opacity = a.toFixed(3);
    box.style.clipPath = 'inset(0)';
    const br = 1 + 0.02*Math.sin(t*3.1);
    box.style.transform = 'translate(-50%,-50%) scale('+(br*(0.985+0.015*a)).toFixed(4)+')';
    return;
  }

  /* ③ 147.66–158.20  十二次 EXECUTION：每一次都重新盖一遍，盖歪一点 */
  if(t > 147.66 && t < 158.30){
    set('EXECUTION', 'mono-exec');
    let k = 0;
    for(let i=0;i<EXECS.length;i++) if(t >= EXECS[i]) k = i;
    const near = EXECS[k];
    const d = clamp((t - near)/0.30);
    const pop = 1 + 0.16*Math.exp(-Math.pow((t-near)/0.09, 2));
    /* 每次换击都换一个落点与倾角 —— 这是"盖章"而不是"居中标题" */
    const ox = jit(k,1)*7, oy = jit(k,2)*4 - 1;
    const rot = jit(k,3)*1.6;
    const sc = (0.92 + 0.06*Math.min(1,k)) * pop;
    box.style.opacity = (0.90 + 0.10*Math.exp(-Math.pow((t-near)/0.07,2))).toFixed(3);
    box.style.clipPath = 'inset(0)';
    box.style.transform =
      'translate(calc(-50% + '+ox.toFixed(2)+'%), calc(-50% + '+oy.toFixed(2)+'%)) '+
      'rotate('+rot.toFixed(2)+'deg) scale('+sc.toFixed(4)+')';
    /* 每击之间轻微整体降一点亮度，避免 10 秒都是同一个亮度 */
    box.style.filter = 'brightness('+(1.0 + 0.5*Math.exp(-Math.pow((t-near)/0.10,2))).toFixed(3)+')';
    return;
  }

  /* ④ 169.86–171.70  她只说了两个字。整块屏幕留白 */
  if(t > 169.86 && t < 171.80){
    set('别。', 'mono-whisper');
    const a = sstep(169.86, 170.12, t) * (1 - sstep(171.34, 171.80, t));
    box.style.opacity = a.toFixed(3);
    box.style.clipPath = 'inset(0)';
    box.style.transform = 'translate(-50%,-50%)';
    box.style.filter = 'none';
    return;
  }

  /* ⑤ 206.00–211.90  最后一个光标，停在那里 */
  if(t > 206.00){
    set('world.execute(me);', 'mono-last');
    box.style.opacity = '0.55';
    box.style.clipPath = 'inset(0)';
    box.style.transform = 'translate(-50%,-50%)';
    box.style.filter = 'none';
    return;
  }

  hide();
}
