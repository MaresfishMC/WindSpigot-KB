'use strict';
const fs = require('fs');
const L = require('F:\\open\\新服务器\\PVP内核\\分析\\lib.js');
const CSV = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\kb-log.csv';
const lines = fs.readFileSync(CSV, 'utf8').split('\n').filter(s => s.trim());
const head = lines[0].split(',');
const rows = lines.slice(1).map(l => {
  const c = l.split(','); const o = {}; head.forEach((h, i) => o[h] = c[i]);
  const n = k => Number(o[k]); const b = k => o[k] === 'true';
  const r = { ts: n('ts_ms'), atk: o.attacker, vic: o.victim, aS: b('atk_sprint'), vS: b('vic_sprint'),
    gnd: b('vic_ground'), yaw: n('atk_yaw'), pkt: [n('pkt_x'), n('pkt_y'), n('pkt_z')], pktH: n('pkt_h'),
    dist: n('dist'), ax: n('atk_x'), ay: n('atk_y'), az: n('atk_z'), vx: n('vic_x'), vy: n('vic_y'), vz: n('vic_z') };
  const dp = [r.vx - r.ax, r.vz - r.az]; r.geo = Math.hypot(dp[0], dp[1]);
  r.uPos = r.geo > 1e-9 ? [dp[0]/r.geo, dp[1]/r.geo] : [0,0];
  r.uYaw = L.lookDir(r.yaw);
  r.ang = L.angBetween(r.uPos, r.uYaw);
  r.angAbs = Math.abs(r.ang);
  return r;
});
console.log(`样本 ${rows.length}`);

console.log('\n=== 二维交叉: 几何距离 × 位置→朝向夹角  ⇒ |pkt| 中位 ===');
const dEdge = [0, 0.5, 0.8, 1.2, 2, 3, 5];
const aEdge = [0, 30, 60, 90, 120, 150, 181];
process.stdout.write('  dist\\ang  ');
for (let j = 0; j < aEdge.length-1; j++) process.stdout.write(`[${aEdge[j]},${aEdge[j+1]})`.padEnd(12));
console.log();
for (let i = 0; i < dEdge.length-1; i++) {
  process.stdout.write(`  [${dEdge[i]},${dEdge[i+1]})`.padEnd(11));
  for (let j = 0; j < aEdge.length-1; j++) {
    const a = rows.filter(r => r.geo >= dEdge[i] && r.geo < dEdge[i+1] && r.angAbs >= aEdge[j] && r.angAbs < aEdge[j+1]);
    process.stdout.write((a.length >= 3 ? `${L.fmt(L.median(a.map(r=>r.pktH)),3)}(${a.length})` : a.length ? `·(${a.length})` : '-').padEnd(12));
  }
  console.log();
}

console.log('\n=== 近身(<0.8格) 样本明细 ===');
const near = rows.filter(r => r.geo < 0.8);
console.log(`  n=${near.length} (${L.fmt(100*near.length/rows.length,1)}%)  |pkt| 中位=${L.fmt(L.median(near.map(r=>r.pktH)),4)}  p10=${L.fmt(L.quantile(near.map(r=>r.pktH),.1),4)}`);
for (const r of near.slice(0, 12)) {
  console.log(`   |pkt|=${L.fmt(r.pktH,4)} geo=${L.fmt(r.geo,2)} ang=${L.fmt(r.ang,1)}° aS=${r.aS?1:0} vS=${r.vS?1:0} y=${L.fmt(r.ay,1)}`);
}

console.log('\n=== 夹角>120° 的样本明细(看是否都是近身) ===');
const wide = rows.filter(r => r.angAbs > 120);
console.log(`  n=${wide.length}`);
for (const r of wide) {
  console.log(`   |pkt|=${L.fmt(r.pktH,4)} geo=${L.fmt(r.geo,2)} ang=${L.fmt(r.ang,1)}° aS=${r.aS?1:0} vS=${r.vS?1:0}`);
}

console.log('\n=== 理论对照: |base*u_pos + sprint*u_yaw| 在不同夹角下的期望值 ===');
const base = 0.527375, sp = 0.4215, cap = 0.9494;
for (const deg of [0, 30, 60, 90, 120, 150, 170, 180]) {
  const rad = deg * Math.PI / 180;
  const v = Math.sqrt(base*base + sp*sp + 2*base*sp*Math.cos(rad));
  console.log(`  夹角 ${String(deg).padStart(3)}° → 理论 |out| = ${L.fmt(Math.min(v, cap), 4)}${v > cap ? ' (被上限钳制)' : ''}`);
}
console.log(`  注: 夹角 180° 时理论值 = |${base} - ${sp}| = ${L.fmt(Math.abs(base-sp),4)} ⇒ 几乎无击退(这就是"nokb")`);
