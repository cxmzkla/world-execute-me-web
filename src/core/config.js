import * as THREE from 'three';

/* ══════════════════════════════════════════════════════════════════
   config.js —— 全局常量
   ══════════════════════════════════════════════════════════════════ */

/* 全片时长：320kbps / 48kHz，手工解析 MP3 帧头得出，不是估算 */
export const DUR = 212.0;

/* 全局唯一粒子池上限。所有形态共用这一块 buffer，只改 drawRange，
   严禁每幕 new BufferGeometry —— 那样每换一次形态就掉一次帧。 */
export const MAXP = 130000;

export const C = {
  ink:  '#e8ecef', dim:'#8a9299', amber:'#ffb347',
  cy:   '#35e0d0', cy2:'#1b3a6b', deep:'#0b1b2b',
  gold: '#f0c060', rose:'#ff6f91', err:'#ff3b30'
};

export const V3 = h => new THREE.Color(h);
