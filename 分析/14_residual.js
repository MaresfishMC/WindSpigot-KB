'use strict';
// 减去已测得的基础冲量 A*u_pos 后, 残差应 = 疾跑/受击方加成 ⇒ 直接看其方向与模长
const F = require('./fitlib');
const L = F.L;

const A_BASE = 0.527375;
const all = F.loadJsonl('F:\\open\\新服务器\\PVP内核\\分析\\s12_r1.jsonl')
  .concat(F.loadJsonl('F:\\open\\新服务器\\PVP内核\\分析\\s12_r2.jsonl'));
const rows = all.filter(x => x.outY > 0.3613 && x.onGround && x.geoDist <= 3.6);
for (const x of rows) {
  const res = [x.out[0] - A_BASE * x.uPos[0], x.out[1] - A_BASE * x.uPos[1]];
  x.res = res; x.resMag = L.hypot2(res[0], res[1]);
  x.resAngYaw = L.angBetween(x.uYaw, res);          // 残差 vs 攻击者视线
  x.resAngPos = L.angBetween(x.uPos, res);          // 残差 vs 位置方向
  x.theta = L.angBetween(x.uPos, x.uYaw);
  x.Sa = x.peerSprint; x.Ss = x.selfSprint; x.toward = L.dot2(x.pre, x.uPos) > 0;
}
console.log('样本:', rows.length);

function dump(label, sel) {
  const a = rows.filter(sel);
  if (a.length < 6) { console.log(`  ${label.padEnd(22)} n=${a.length} 少`); return; }
  const m = a.map(x => x.resMag);
  console.log(`  ${label.padEnd(22)} n=${String(a.length).padStart(4)} |res| med=${L.fmt(L.median(m), 4)} p10=${L.fmt(L.quantile(m, .1), 4)} p90=${L.fmt(L.quantile(m, .9), 4)} | vs u_yaw ${L.fmt(L.median(a.map(x => Math.abs(x.resAngYaw))), 1)}° | vs u_pos ${L.fmt(L.median(a.map(x => Math.abs(x.resAngPos))), 1)}°`);
}

console.log('\n=== 残差模长与方向 ===');
dump('Sa0 Ss0 (应≈0)', x => !x.Sa && !x.Ss);
dump('Sa1 Ss0 (仅攻击方疾跑)', x => x.Sa && !x.Ss);
dump('Sa0 Ss1 (仅受击方疾跑)', x => !x.Sa && x.Ss);
dump('Sa1 Ss1 (双疾跑)', x => x.Sa && x.Ss);

console.log('\n=== Sa1 Ss0 按 θ 细分: 残差是否随 θ 衰减? ===');
for (const [lo, hi] of [[0.999, 1.001], [0.99, 0.999], [0.97, 0.99], [0.94, 0.97], [0.9, 0.94], [0.7, 0.9], [-1, 0.7]]) {
  const a = rows.filter(x => x.Sa && !x.Ss && L.dot2(x.uPos, x.uYaw) >= lo && L.dot2(x.uPos, x.uYaw) < hi);
  if (a.length >= 4) console.log(`  cosθ∈[${lo},${hi}) n=${String(a.length).padStart(4)} |res| med=${L.fmt(L.median(a.map(x => x.resMag)), 4)}  vs u_yaw ${L.fmt(L.median(a.map(x => Math.abs(x.resAngYaw))), 1)}°  vs u_pos ${L.fmt(L.median(a.map(x => Math.abs(x.resAngPos))), 1)}°`);
}

console.log('\n=== 残差是否 = B*u_yaw ? 直接拟合 ===');
// 最小二乘: res = p*u_yaw + q*u_pos  (看 q 是否≈0)
const sa1 = rows.filter(x => x.Sa && !x.Ss);
let s11 = 0, s12 = 0, s22 = 0, s1r = 0, s2r = 0;
for (const x of sa1) {
  const a = x.uYaw, b = x.uPos;
  s11 += L.dot2(a, a); s12 += L.dot2(a, b); s22 += L.dot2(b, b);
  s1r += L.dot2(a, x.res); s2r += L.dot2(b, x.res);
}
const det = s11 * s22 - s12 * s12;
console.log(`  Sa1 Ss0 n=${sa1.length}: res = ${L.fmt((s1r * s22 - s2r * s12) / det, 5)}*u_yaw + ${L.fmt((s11 * s2r - s12 * s1r) / det, 5)}*u_pos`);

const sa0s1 = rows.filter(x => !x.Sa && x.Ss);
s11 = s12 = s22 = s1r = s2r = 0;
for (const x of sa0s1) {
  const a = x.uYaw, b = x.uPos;
  s11 += L.dot2(a, a); s12 += L.dot2(a, b); s22 += L.dot2(b, b);
  s1r += L.dot2(a, x.res); s2r += L.dot2(b, x.res);
}
console.log(`  Sa0 Ss1 n=${sa0s1.length}: res = ${L.fmt((s1r * s22 - s2r * s12) / det, 5)}*u_yaw + ${L.fmt((s11 * s2r - s12 * s1r) / det, 5)}*u_pos`);

console.log('\n=== 直接看: 已知 A=0.527375 时, 各状态 |out| 是否等于 A + 常数 ===');
const tight = rows.filter(x => Math.cos(x.theta * Math.PI / 180) > 0.999);
console.log('  严格对齐(cosθ>0.999) n =', tight.length);
for (const [lab, f] of [
  ['Sa0 Ss0', x => !x.Sa && !x.Ss], ['Sa1 Ss0', x => x.Sa && !x.Ss],
  ['Sa0 Ss1 朝', x => !x.Sa && x.Ss && x.toward], ['Sa0 Ss1 背', x => !x.Sa && x.Ss && !x.toward],
  ['Sa1 Ss1 朝', x => x.Sa && x.Ss && x.toward], ['Sa1 Ss1 背', x => x.Sa && x.Ss && !x.toward],
]) {
  const a = tight.filter(f);
  if (a.length < 4) { console.log(`  ${lab.padEnd(12)} n=${a.length} 少`); continue; }
  console.log(`  ${lab.padEnd(12)} n=${String(a.length).padStart(4)} |out| med=${L.fmt(L.median(a.map(x => x.outH)), 5)} min=${L.fmt(Math.min(...a.map(x => x.outH)), 4)} max=${L.fmt(Math.max(...a.map(x => x.outH)), 4)}`);
}
