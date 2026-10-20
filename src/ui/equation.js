/* ══════════════════════════════════════════════════════════════════
   equation.js —— 把当前这一句的式子写在坐标纸左下角
   ──────────────────────────────────────────────────────────────────
   这一层是"看得懂"的关键。参考片里的几何之所以成立，是因为观众
   不需要知道它是什么；但一条函数曲线如果不给式子，就只是"一根线
   在扭"。给了式子，扭动就变成了推导。
   ══════════════════════════════════════════════════════════════════ */
import { el } from './dom.js';

let cur = '';

export function updateEq(lab){
  if(!lab) return;
  const key = lab[0] + '\u0000' + lab[1];
  if(key === cur) return;
  cur = key;

  el.eqMain.textContent = lab[0] || '';
  el.eqSub.textContent  = lab[1] || '';
  el.eq.classList.toggle('empty', !lab[0] || lab[0] === '—');

  /* 重播一次极短的淡入：式子换掉这件事本身要看得见 */
  for(const n of [el.eqMain, el.eqSub]){
    n.style.animation = 'none';
    void n.offsetWidth;
    n.style.animation = '';
  }
}

export function resetEq(){ cur = ''; }
