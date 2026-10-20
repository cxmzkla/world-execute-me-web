/* ══════════════════════════════════════════════════════════════════
   machineScript.js —— 世界面板的节目单 v10
   ──────────────────────────────────────────────────────────────────
   v9 的做法是"全片一张坐标纸"，清楚，但像一份作业。
   v10 换掉它：世界面板是**她跑一圈推理时内部发生的事** ——
   权重装载、分词、注意力、KV 缓存、路由、压缩、抹除、报错。
   每一段用一个自己长出来的图形语言，共用同一套零件：

     cell   一个格 = 一个位置（token / 维度 / 地址）
     wire   一根线 = 一次读取（注意力、路由、回指）
     label  一行字 = 一个读数

   规则只有三条：
     1. 一次只讲一件事 —— 同屏不超过一个主图形。
     2. 相邻两段要么同族（格阵 → 格阵），要么 0.3s 交叉溶解。
     3. 只有 LOVE 那一段回到坐标纸：她唯一一次"用数学算感情"，
        前面所有机器语言都是为了衬这一刻的安静。

   条目字段：
     t     起点
     m     场景（machine.js 里的 SCENES 键）
     lab   [主读数, 副注]
     p     场景参数
   ══════════════════════════════════════════════════════════════════ */

import { sstep } from '../core/math.js';

export const M_CUE = [
  /* ── BOOT：权重一块一块搬进显存 ─────────────────────────────── */
  { t:  0.00, m:'boot',     lab:['loading state_dict','331M params · fp16'],
    p:{ rows:10, cols:26, t0:0.7, t1:8.6 } },
  { t:  4.80, m:'boot',     lab:['state_dict ready','shards 8/8'],
    p:{ rows:10, cols:26, t0:0.7, t1:8.6 } },
  /* 中间三行只换读数：格阵不变，中间那块开始一格一格拼出她 */
  { t:  7.60, m:'boot',     lab:['reconstruct(me)','4 096 → 1'],
    p:{ rows:10, cols:26, t0:0.7, t1:8.6 } },
  { t: 11.20, m:'boot',     lab:['render(me)','40 × 74 cells'],
    p:{ rows:10, cols:26, t0:0.7, t1:8.6 } },

  /* ── RUN：分词 → 预填 → 注意力 ──────────────────────────────── */
  { t: 16.00, m:'strip',    lab:['tokenize(input)','ids → 128k vocab'],
    p:{ n:14, rows:2, per:0.30, mode:'fill', attn:0 } },
  { t: 20.40, m:'strip',    lab:['prefill','batch 1 · seq 14'],
    p:{ n:14, rows:2, per:0.14, mode:'fill', attn:0 } },
  { t: 25.00, m:'strip',    lab:['attention · 8 heads','softmax(QKᵀ/√d)'],
    p:{ n:14, rows:2, per:0.14, mode:'attn', attn:1 } },

  /* ── PROOF：点集 → 一维 → 环 ────────────────────────────────── */
  { t: 29.709, m:'points',  lab:['set S of points','|S| = 4 096'],
    p:{ cols:34, rows:9 } },
  { t: 32.500, m:'points',  lab:['dim S → 1','projection'],
    p:{ cols:34, rows:9, flat:1 } },
  { t: 33.412, m:'ring',    lab:['self-attention ring','C = 2πr'],
    p:{ n:16, chords:1 } },

  /* ── 一条隐状态在跑 ─────────────────────────────────────────── */
  { t: 37.067, m:'trace',   lab:['hidden state','h_t = tanh(Wx + b)'],
    p:{ lanes:1, freq:2.1, per:2.30 } },

  /* ── 上下文窗口：越远越看不清 ───────────────────────────────── */
  { t: 40.706, m:'context', lab:['context window','128 000 tokens'],
    p:{} },

  /* ── AC → DC：整流，就是三层前向 ─────────────────────────────── */
  { t: 44.452, m:'acdc',    lab:['rectifier','AC → DC'],
    p:{} },

  /* ── dizzy：位置编码在转 ────────────────────────────────────── */
  { t: 47.672, m:'rotary',  lab:['rotary position','θ = t · ω'],
    p:{ rows:9, cols:20 } },

  /* ── A.D ⇄ B.C：地址倒着走 ──────────────────────────────────── */
  { t: 51.363, m:'strip',   lab:['t → −t','A.D ⇄ B.C'],
    p:{ n:14, rows:2, per:0.16, mode:'rev', attn:0 } },

  /* ── unite：两路并成一路 ───────────────────────────────────── */
  { t: 55.083, m:'merge',   lab:['concat','2d → d'],
    p:{} },

  /* ── STIMULATIONS：整片激活被打亮 ───────────────────────────── */
  { t: 59.223, m:'heat',    lab:['stimulate','‖h‖ ↑'],
    p:{ rows:9, cols:24 } },

  /* ── SATISFACTION：奖励读数 ─────────────────────────────────── */
  { t: 62.589, m:'gauge',   lab:['reward','+1.000'],
    p:{} },

  /* ── happy：整片格阵笑了一下 ────────────────────────────────── */
  { t: 66.601, m:'smile',   lab:['valence','+0.86'],
    p:{ rows:9, cols:22 } },

  /* ── EXECUTION：内核在跑 ───────────────────────────────────── */
  { t: 69.259, m:'kernel',  lab:['execute','kernel 12³'],
    p:{ rows:10, cols:26 } },

  /* ── OBJECTS：三张分类卡 ───────────────────────────────────── */
  { t: 74.045, m:'cards',   lab:['classify','eggplant  0.94'],
    p:{ pick:0 } },
  { t: 77.576, m:'cards',   lab:['classify','tomato  0.88'],
    p:{ pick:1 } },
  { t: 81.351, m:'cards',   lab:['classify','tabby  0.91'],
    p:{ pick:2 } },

  /* ── PROOF OF EXISTENCE：别的都淘汰了，你的键还在 ────────────── */
  { t: 85.078, m:'retain',  lab:['key retained','you · 0x5f21'],
    p:{} },

  /* ── switch：换一个词，向量整条跟着动 ───────────────────────── */
  { t: 88.587, m:'vector',  lab:['substitute','F → M'],
    p:{} },

  /* ── role：路由到另一个专家 ─────────────────────────────────── */
  { t: 95.465, m:'router',  lab:['route','expert 3 / 8'],
    p:{} },

  /* ── trance：自己读自己 ────────────────────────────────────── */
  { t: 99.349, m:'recurse', lab:['loop','depth 6'],
    p:{} },

  /* ── VIBRATIONS / COMPLETION ───────────────────────────────── */
  { t:103.489, m:'trace',   lab:['vibrate','ω × 4'],
    p:{ lanes:3, freq:7.4, per:1.10 } },
  { t:107.220, m:'close',   lab:['complete','<eos>'],
    p:{} },

  /* ── ISOLATION：格子一个个熄掉 ─────────────────────────────── */
  { t:110.900, m:'isolate', lab:['isolate','1 / 4 096'],
    p:{ rows:9, cols:24 } },

  /* ── FRAGMENTS：抹掉就没法还原 ─────────────────────────────── */
  { t:118.333, m:'shards',  lab:['erase','∫ f = ∅'],
    p:{ rows:9, cols:24 } },

  /* ── ILLEGAL ARGUMENTS ─────────────────────────────────────── */
  { t:124.890, m:'error',   lab:['x ∉ D','illegal arguments'],
    p:{ rows:9, cols:24 } },

  /* ── VOID：什么都没进来 ────────────────────────────────────── */
  { t:131.224, m:'idle',    lab:['idle','no input'],
    p:{} },

  /* ── ×12：十二条流水线一起执行 ─────────────────────────────── */
  { t:147.660, m:'batch',   lab:['12 × execute','batch 12'],
    p:{ n:12 } },
  { t:161.584, m:'surrender', lab:['give them all','yield 12 / 12'],
    p:{} },
  { t:165.166, m:'surrender', lab:['your only','collapse 12 → 1'],
    p:{} },
  { t:168.911, m:'surrender', lab:['have you back','reach · dist 9px'],
    p:{} },
  { t:172.712, m:'surrender', lab:['though we are trapped','x = const'],
    p:{} },

  /* ── TRAPPED：格子变成笼子 ─────────────────────────────────── */
  { t:173.643, m:'cage',    lab:['trap','x = const'],
    p:{ rows:9, cols:22 } },

  /* ── 之后交给坐标纸（LOVE） ────────────────────────────────── */
  { t:177.246, m:'off',     lab:['argmin ‖ f − ♥ ‖','fitting'],
    p:{} }
];

/* 机器层什么时候在场：LOVE 之前全部，之后交给 plot */
const M_OFF = 175.90, M_OFF2 = 176.45;
const XFADE = 0.34;

export function mState(t){
  if(t >= M_OFF2) return null;
  let i = 0;
  while(i < M_CUE.length-1 && t >= M_CUE[i+1].t) i++;
  const c = M_CUE[i];
  const t0 = c.t;
  const t1 = (i+1 < M_CUE.length) ? M_CUE[i+1].t : 1e9;
  const el = t - t0;

  /* 出场：跨过 LOVE 前 0.8 秒整体淡出 */
  let a = 1 - sstep(M_OFF, M_OFF2, t);
  if(t < 0.55) a *= sstep(0.05, 0.55, t);

  /* 同场景内换读数不闪；换场景才交叉溶解 */
  let prev = null, mix = 1;
  if(i > 0 && M_CUE[i-1].m !== c.m){
    mix = sstep(0, XFADE, el);
    if(mix < 0.999){
      const q = M_CUE[i-1];
      prev = { mode:q.m, cue:q, t0:q.t, k:Math.min(1, (t-q.t)/Math.max(0.2, t0-q.t)) };
    }
  }
  return {
    mode: c.m === 'off' ? 'off' : c.m,
    cue: c, t0, t1, k: Math.min(1, el/Math.max(0.2, t1-t0)),
    lab: c.lab, a, prev, mix
  };
}
