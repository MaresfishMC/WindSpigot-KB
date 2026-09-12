'use strict';
// 58: 反方向(负向)击退排查。
// 判定: 速度包水平分量与"攻击方→受击方"方向点积 < 0 => 受击方被推向攻击方(负向击退)。
// 同时扫描各数值列的最小值, 定位用户反馈的"负数 kb"落在哪一列。
const fs = require('fs');
const K = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\kb-log.csv';
const raw = fs.readFileSync(K, 'utf8').split(/\r?\n/).filter(Boolean);
const head = raw[0].split(',');
const I = {}; head.forEach((h, i) => I[h] = i);
const numCols = head.filter(h => !['attacker', 'victim', 'atk_sprint', 'atk_extra_kb', 'vic_sprint', 'vic_ground'].includes(h));
const rows = raw.slice(1).map(l => l.split(',')).filter(c => c.length === head.length);

console.log(`样本 ${rows.length}`);
console.log('\n---- 各数值列最小值(找负数) ----');
for (const c of numCols) {
  const vals = rows.map(r => parseFloat(r[I[c]])).filter(Number.isFinite);
  const min = Math.min(...vals);
  if (min < 0) console.log(`  ${c.padEnd(14)} min=${min.toFixed(5)}  (负值 ${vals.filter(v => v < 0).length}/${vals.length})`);
}

console.log('\n---- 反向击退(被推向攻击方)排查 ----');
let neg = 0, tot = 0;
const bad = [];
for (const r of rows) {
  const ax = parseFloat(r[I.atk_x]), az = parseFloat(r[I.atk_z]);
  const vx = parseFloat(r[I.vic_x]), vz = parseFloat(r[I.vic_z]);
  const px = parseFloat(r[I.pkt_x]), pz = parseFloat(r[I.pkt_z]);
  if (![ax, az, vx, vz, px, pz].every(Number.isFinite)) continue;
  // 攻击方 → 受击方 单位方向
  let dx = vx - ax, dz = vz - az;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) continue;
  dx /= d; dz /= d;
  const dot = px * dx + pz * dz;
  const mag = Math.hypot(px, pz);
  tot++;
  if (dot < 0) {
    neg++;
    if (bad.length < 12) bad.push({ ts: +r[I.ts_ms], atk: r[I.attacker], vic: r[I.victim], dot, mag, h: parseFloat(r[I.pkt_h]), ndt: +r[I.vic_ndt], dist: parseFloat(r[I.dist]) });
  }
}
console.log(`  点积 < 0 的样本: ${neg}/${tot} = ${tot ? (100 * neg / tot).toFixed(2) : 0}%`);
for (const b of bad) {
  console.log(`   ${new Date(b.ts).toLocaleTimeString()} ${b.atk}->${b.vic} 沿向投影=${b.dot.toFixed(4)} |包|=${b.mag.toFixed(4)} pkt_h=${b.h.toFixed(4)} ndt=${b.ndt} dist=${b.dist.toFixed(2)}`);
}

console.log('\n---- 另外两种"负"的候选: 垂直向下 / 攻受位置重合 ----');
const vyNeg = rows.filter(r => parseFloat(r[I.pkt_y]) < 0).length;
console.log(`  pkt_y < 0 (垂直向下击退): ${vyNeg}/${rows.length}`);
let coincide = 0;
for (const r of rows) {
  const d = parseFloat(r[I.dist]);
  if (Number.isFinite(d) && d < 0.3) coincide++;
}
console.log(`  攻受距离 <0.3 格(方向几乎无定义, 原版会取随机方向): ${coincide}/${rows.length}`);
