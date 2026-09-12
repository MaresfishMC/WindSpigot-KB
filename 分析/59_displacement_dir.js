'use strict';
// 59: 实际位移方向反查 —— 用同一受击方相邻两次命中之间的坐标变化,
// 与上一次命中发出的速度包方向做点积, 判断受击方"实际有没有被推向攻击方"(负向击退)。
// 过滤: 位移 >1.5 格视为死亡重生/传送, 不计入。
const fs = require('fs');
const K = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\kb-log.csv';
const raw = fs.readFileSync(K, 'utf8').split(/\r?\n/).filter(Boolean);
const head = raw[0].split(',');
const I = {}; head.forEach((h, i) => I[h] = i);
const rows = raw.slice(1).map(l => l.split(',')).filter(c => c.length === head.length).map(c => ({
  ts: +c[I.ts_ms], atk: c[I.attacker], vic: c[I.victim],
  ax: +c[I.atk_x], az: +c[I.atk_z], vx: +c[I.vic_x], vz: +c[I.vic_z],
  px: +c[I.pkt_x], pz: +c[I.pkt_z], h: +c[I.pkt_h], ndt: +c[I.vic_ndt],
}));

const byVic = {};
for (const r of rows) (byVic[r.vic] = byVic[r.vic] || []).push(r);
let n = 0, backward = 0, forward = 0, tiny = 0, teleport = 0;
const worst = [];
for (const arr of Object.values(byVic)) {
  arr.sort((a, b) => a.ts - b.ts);
  for (let i = 0; i < arr.length - 1; i++) {
    const a = arr[i], b = arr[i + 1];
    const dt = b.ts - a.ts;
    if (dt < 80 || dt > 900) continue;
    const dx = b.vx - a.vx, dz = b.vz - a.vz;
    const step = Math.hypot(dx, dz);
    if (step < 0.05) { tiny++; continue; }
    if (step > 1.5) { teleport++; continue; }
    const ux = dx / step, uz = dz / step;
    let kx = a.vx - a.ax, kz = a.vz - a.az;
    const kd = Math.hypot(kx, kz);
    if (kd < 1e-6) continue;
    kx /= kd; kz /= kd;
    const dot = ux * kx + uz * kz;
    n++;
    if (dot < 0) { backward++; worst.push({ ts: a.ts, atk: a.atk, vic: a.vic, dot, step, h: a.h, ndt: a.ndt, dt }); }
    else forward++;
  }
}
console.log(`参与判定的相邻位移段: ${n}   跳过: 位移<0.05 共 ${tiny} 段, 位移>1.5(重生/传送) 共 ${teleport} 段`);
console.log(`  实际位移"远离攻击方": ${forward} (${n ? (100 * forward / n).toFixed(1) : 0}%)`);
console.log(`  实际位移"靠近攻击方"(负向): ${backward} (${n ? (100 * backward / n).toFixed(1) : 0}%)`);
worst.sort((a, b) => a.dot - b.dot);
console.log('\n最"负"的 12 段:');
for (const w of worst.slice(0, 12)) {
  console.log(`  ${new Date(w.ts).toLocaleTimeString()} ${w.atk}->${w.vic} 点积=${w.dot.toFixed(3)} 位移=${w.step.toFixed(3)} 包|v|=${w.h.toFixed(4)} ndt=${w.ndt} dt=${w.dt}ms`);
}
const low = rows.filter(r => r.h < 0.2).length;
console.log(`\n包值 <0.2 的命中: ${low}/${rows.length}`);
console.log('位移本身包含受击方自己的输入与摩擦, 因此"包值很小"时受击方继续前冲会被判为负向, 属正常物理。');
