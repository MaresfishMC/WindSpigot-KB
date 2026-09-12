'use strict';
// 决定性检验: 若 out = A*u_pos + B*u_yaw*Sa (+ ...), 则
//   |out|^2 = A^2 + B^2 + 2AB*cos(theta)
// 在 Sa=1 组内把 |out|^2 对 cos(theta) 回归 ⇒ 斜率=2AB, 截距=A^2+B^2  ⇒ 解出 B
const F = require('./fitlib');
const L = F.L;

const all = F.loadJsonl('F:\\open\\新服务器\\PVP内核\\分析\\s12_r1.jsonl')
  .concat(F.loadJsonl('F:\\open\\新服务器\\PVP内核\\分析\\s12_r2.jsonl'));
const clean = [];
for (const x of all) {
  if (x.outY < 0.3613 || !x.onGround) continue;      // 正常垂直包 + 地面
  if (x.geoDist > 3.6) continue;                      // 超出攻击距离 ⇒ 非正常命中
  const c = L.dot2(x.uPos, x.uYaw);
  x.cos = c; x.theta = L.angBetween(x.uPos, x.uYaw);
  x.Sa = x.peerSprint; x.Ss = x.selfSprint; x.toward = L.dot2(x.pre, x.uPos) > 0;
  x.mag2 = x.outH * x.outH;
  clean.push(x);
}
console.log('清洗后样本:', clean.length);

function ols(a, f, y) {
  const X = a.map(f), Y = a.map(y);
  const n = X.length, mx = L.mean(X), my = L.mean(Y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (X[i] - mx) * (Y[i] - my); sxx += (X[i] - mx) ** 2; syy += (Y[i] - my) ** 2; }
  const m = sxy / sxx;
  return { m, c: my - m * mx, r2: (sxy * sxy) / (sxx * syy), n };
}

function solveB(A, slope) {  // slope = 2AB
  const B = slope / (2 * A);
  return B;
}

function testGroup(label, sel, Aassume) {
  const a = clean.filter(sel);
  if (a.length < 20) { console.log(`\n[${label}] n=${a.length} 太少`); return; }
  const r = ols(a, x => x.cos, x => x.mag2);
  console.log(`\n[${label}] n=${r.n}  A=${Aassume}`);
  console.log(`  |out|^2 = ${L.fmt(r.m, 5)}*cosθ + ${L.fmt(r.c, 5)}   (R²=${L.fmt(r.r2, 4)})`);
  console.log(`  => 由斜率解 B = ${L.fmt(solveB(Aassume, r.m), 5)} ; 由截距 A²+B²=${L.fmt(r.c, 5)} ⇒ B=${L.fmt(Math.sqrt(Math.max(0, r.c - Aassume * Aassume)), 5)}`);
  console.log(`  实测 |out|: med=${L.fmt(L.median(a.map(x => x.outH)), 4)}  max=${L.fmt(Math.max(...a.map(x => x.outH)), 4)}`);
  // 分 cos 箱
  for (const [lo, hi] of [[0.999, 1.001], [0.99, 0.999], [0.97, 0.99], [0.94, 0.97], [0.9, 0.94], [0.8, 0.9], [0.5, 0.8], [-1, 0.5]]) {
    const b = a.filter(x => x.cos >= lo && x.cos < hi);
    if (b.length >= 4) console.log(`    cosθ∈[${lo},${hi}) n=${String(b.length).padStart(4)} med|out|=${L.fmt(L.median(b.map(x => x.outH)), 4)} med|out|²=${L.fmt(L.median(b.map(x => x.mag2)), 4)}`);
  }
}

const BASE = 0.527375;
console.log('\n============ 攻击方非疾跑 · 受击方非疾跑 (纯基础) ============');
testGroup('Sa0 Ss0', x => !x.Sa && !x.Ss, BASE);
console.log('\n============ 攻击方疾跑 · 受击方非疾跑 (基础+疾跑) ============');
testGroup('Sa1 Ss0', x => x.Sa && !x.Ss, BASE);
console.log('\n============ 攻击方非疾跑 · 受击方疾跑 ============');
testGroup('Sa0 Ss1 朝攻击者', x => !x.Sa && x.Ss && x.toward, BASE);
testGroup('Sa0 Ss1 背离', x => !x.Sa && x.Ss && !x.toward, BASE);
console.log('\n============ 双疾跑 ============');
testGroup('Sa1 Ss1 朝攻击者', x => x.Sa && x.Ss && x.toward, BASE);
testGroup('Sa1 Ss1 背离', x => x.Sa && x.Ss && !x.toward, BASE);

console.log('\n============ 全局: cosθ 分箱(所有状态混合) ============');
for (const [lo, hi] of [[0.999, 1.001], [0.99, 0.999], [0.97, 0.99], [0.94, 0.97], [0.9, 0.94], [0.8, 0.9], [0.5, 0.8], [-1, 0.5]]) {
  const b = clean.filter(x => x.cos >= lo && x.cos < hi);
  if (b.length >= 4) console.log(`  cosθ∈[${lo},${hi}) n=${String(b.length).padStart(4)} med|out|=${L.fmt(L.median(b.map(x => x.outH)), 4)} 贴上限%=${L.fmt(100 * b.filter(x => x.outH > .945).length / b.length, 1)}`);
}
