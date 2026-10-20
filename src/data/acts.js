/* ══════════════════════════════════════════════════════════════════
   acts.js —— 13 幕 / 打击点 / 心跳点 / 倒计时
   幕次边界全部咬在 LRC 时间戳上：歌词换行的那一刻，世界也该换样子。
   ══════════════════════════════════════════════════════════════════ */

export const ACTS = [
  { i:'BOOT',      t0:0.000,  t1:16.000, fn:'boot(me)',              as:'undefined'   },
  { i:'RUN',       t0:16.000, t1:29.709, fn:'world.execute(me)',     as:'await run()' },
  { i:'PROOF',     t0:29.709, t1:44.452, fn:'prove(me)',             as:'f : ℝ → ℝ'   },
  { i:'AC-DC',     t0:44.452, t1:59.223, fn:'transform(me)',         as:'AC ⇄ DC'     },
  { i:'DEPLOY',    t0:59.223, t1:74.045, fn:'deploy(me)',            as:'executing'   },
  { i:'OBJECTS',   t0:74.045, t1:88.587, fn:'nutrition_facts(me)',   as:'specimen'    },
  { i:'TRANCE',    t0:88.587, t1:103.489,fn:'switch(me)',            as:'trance'      },
  { i:'ISOLATION', t0:103.489,t1:131.224,fn:'isolate(me)',           as:'null'        },
  { i:'VOID',      t0:131.224,t1:147.660,fn:'idle(me)',              as:'--'          },
  { i:'×12',       t0:147.660,t1:161.584,fn:'execute(me)',           as:'execution'   },
  { i:'REBUILD',   t0:161.584,t1:177.246,fn:'restore(me)',           as:'you'         },
  { i:'LOVE',      t0:177.246,t1:191.356,fn:'love(me)',              as:'♥(t)'        },
  { i:'END',       t0:191.356,t1:212.000,fn:'return(me)',            as:'undefined'   }
];

export function actIndex(t){
  let lo=0, hi=ACTS.length-1;
  while(lo<hi){ const m=(lo+hi+1)>>1; if(t>=ACTS[m].t0) lo=m; else hi=m-1; }
  return lo;
}

/* 心跳：LOVE 幕的四次重音，玻璃心与粒子心一起收缩 */
export const HEARTBEATS = [179.929, 183.646, 187.665, 191.356];

/* ×12 幕的十二次 EXECUTION（每次切开一刀画面） */
export const EXECS = [147.660,148.600,149.520,150.540,151.520,152.280,153.160,153.980,
                      155.200,156.080,157.040,158.000];

/* 六种语言的倒计时 */
export const COUNT6 = [158.900,159.321,159.657,160.244,160.693,161.124];
export const COUNT6_TXT = ['EIN','DOS','TROIS','NE','FEM','LIU'];
