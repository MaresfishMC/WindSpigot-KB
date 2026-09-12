'use strict';
// 60: 攻受位置重合(水平距离 < 1e-4)时的击退缺失排查。
// 引擎 KnockbackEngine.applyBaseKnockback 在 magnitude < 1.0E-4 时直接 return(本次不给击退),
// 而原版 1.8.8 在同样条件下会重掷一个随机小方向, 击退照常施加。
const fs = require('fs');
const K = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\kb-log.csv';
const raw = fs.readFileSync(K, 'utf8').split(/\r?\n/).filter(Boolean);
const head = raw[0].split(',');
const I = {}; head.forEach((h, i) => I[h] = i);
const rows = raw.slice(1).map(l => l.split(',')).filter(c => c.length === head.length).map(c => ({
  ts: +c[I.ts_ms], atk: c[I.attacker], vic: c[I.victim],
  ax: +c[I.atk_x], az: +c[I.atk_z], vx: +c[I.vic_x], vz: +c[I.vic_z],
  h: +c[I.pkt_h], px: +c[I.pkt_x], pz: +c[I.pkt_z],
  atkS: c[I.atk_sprint] === 'true', vicS: c[I.vic_sprint] === 'true',
}));
const buckets = [[0, 0.0001], [0.0001, 0.01], [0.01, 0.05], [0.05, 0.1], [0.1, 0.3], [0.3, 1], [1, 99]];
console.log('水平距离(攻->受)分布 与 该距离下的击退值:');
for (const [lo, hi] of buckets) {
  const a = rows.filter(r => { const d = Math.hypot(r.vx - r.ax, r.vz - r.az); return d >= lo && d < hi; });
  if (!a.length) { console.log(`  [${lo}, ${hi})  n=0`); continue; }
  const hs = a.map(r => r.h);
  const med = hs.slice().sort((x, y) => x - y)[hs.length >> 1];
  console.log(`  [${String(lo).padEnd(7)}, ${String(hi).padEnd(6)})  n=${String(a.length).padStart(4)}  |v| med=${med.toFixed(4)} min=${Math.min(...hs).toFixed(4)} max=${Math.max(...hs).toFixed(4)}  近零(<0.05)=${hs.filter(v => v < 0.05).length}`);
}
const close = rows.filter(r => Math.hypot(r.vx - r.ax, r.vz - r.az) < 0.05);
console.log(`\n水平距离 <0.05 的命中: ${close.length}/${rows.length}`);
for (const r of close.slice(0, 15)) {
  const d = Math.hypot(r.vx - r.ax, r.vz - r.az);
  console.log(`  ${new Date(r.ts).toLocaleTimeString()} ${r.atk}->${r.vic} 距离=${d.toFixed(5)} pkt=(${r.px.toFixed(4)}, ${r.pz.toFixed(4)}) |v|=${r.h.toFixed(4)} atkSprint=${r.atkS} vicSprint=${r.vicS}`);
}
console.log('\n判定: 若距离极小的样本里 |v| 恰好等于"仅疾跑加成"(0.4215 左右)或 0, 说明阶段一被 return 跳过。');
