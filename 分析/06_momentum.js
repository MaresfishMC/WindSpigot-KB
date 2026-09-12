'use strict';
// 决定性检验: 扫描 r, 令 冲量 = out - r*pre; 若模型成立, 冲量模长的离散度应在真值处最小
const L = require('./lib');

const all = [...L.clean(L.loadCsv(L.R1)), ...L.clean(L.loadCsv(L.R2))];
for (const x of all) x.preMag = L.hypot2(x.pre[0], x.pre[2]);

function residMagVariation(rows, r) {
  const m = rows.map(x => L.hypot2(x.out[0] - r * x.pre[0], x.out[2] - r * x.pre[2]));
  return { cv: L.sd(m) / L.mean(m), sd: L.sd(m), mean: L.mean(m) };
}

// 只用品类最干净的样本: 基准段(A- V- 地面 朝攻击者) —— 冲量恒为 0.5274, 理想情况下离散度=0
const ctrl = all.filter(x => !x.attackerSprint && !x.victimSprint && x.onGround);
console.log('=== 基准段 (A- V- 地面) n=' + ctrl.length + ' : 扫描 r 使冲量模长方差最小 ===');
console.log('   r      mean|out-r*pre|   sd        CV');
let best = null;
for (let r = -3; r <= 3.0001; r += 0.05) {
  const v = residMagVariation(ctrl, r);
  if (!best || v.cv < best.cv) best = { r, ...v };
  if (Math.abs(r % 0.5) < 1e-9 || Math.abs(r) < 1e-9) console.log(`  ${L.fmt(r, 2).padStart(5)}   ${L.fmt(v.mean, 5)}      ${L.fmt(v.sd, 5)}   ${L.fmt(v.cv, 4)}`);
}
console.log(`  ⇒ 最优 r = ${L.fmt(best.r, 3)}  (mean=${L.fmt(best.mean, 5)} sd=${L.fmt(best.sd, 5)} CV=${L.fmt(best.cv, 4)})`);

// 精细扫描
for (let r = -0.5; r <= 0.5001; r += 0.01) {
  const v = residMagVariation(ctrl, r);
  if (!best || v.cv < best.cv) best = { r, ...v };
}
console.log(`  精细: 最优 r = ${L.fmt(best.r, 3)} (mean=${L.fmt(best.mean, 5)} sd=${L.fmt(best.sd, 5)} CV=${L.fmt(best.cv, 4)})`);

console.log('\n=== 基准段逐行明细(前 40 行) ===');
console.log(' idx  |pre|   predir(°)  |out|    outdir(°)  d     yaw     gnd');
for (const x of ctrl.slice(0, 40)) {
  const pd = Math.atan2(x.pre[2], x.pre[0]) / Math.PI * 180;
  const od = Math.atan2(x.out[2], x.out[0]) / Math.PI * 180;
  console.log(`${String(x.index).padStart(5)} ${L.fmt(x.preMag, 3)}  ${L.fmt(pd, 1).padStart(8)}  ${L.fmt(x.outH, 4)}  ${L.fmt(od, 1).padStart(8)}  ${L.fmt(x.distance, 2)}  ${L.fmt(x.yaw, 1).padStart(7)}  ${x.onGround}`);
}

// 若 r=0, 则 |out| 与 |pre| 在基准段内不应有任何关系
const A = ctrl.map(x => x.outH), B = ctrl.map(x => x.preMag);
const mA = L.mean(A), mB = L.mean(B);
let sxy = 0, sxx = 0, syy = 0;
for (let i = 0; i < A.length; i++) { sxy += (A[i] - mA) * (B[i] - mB); sxx += (B[i] - mB) ** 2; syy += (A[i] - mA) ** 2; }
console.log(`\n基准段内 corr(|out|,|pre|) = ${L.fmt(sxy / Math.sqrt(sxx * syy), 4)}   |pre| 范围 ${L.fmt(Math.min(...B), 3)}~${L.fmt(Math.max(...B), 3)}`);

// 上一击输出 vs 本击输入: 连击里若保留前次速度, 应正相关
console.log('\n=== 连击链检验: 相邻样本(gap 400~700ms) outH[n] vs pre[n] ===');
const idxMap = new Map();
for (const x of all) idxMap.set(x.index + '|' + (x.attacker || ''), x);
const pairs = [];
for (const x of all) {
  const p = idxMap.get((x.index - 1) + '|' + (x.attacker || ''));
  if (p && x.gap > 400 && x.gap < 700) pairs.push([p, x]);
}
console.log('  对数 =', pairs.length);
if (pairs.length > 10) {
  const X = pairs.map(p => L.hypot2(p[1].pre[0], p[1].pre[2]).valueOf()), Y = pairs.map(p => p[0].outH);
  const mx = L.mean(X), my = L.mean(Y);
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < X.length; i++) { a += (X[i] - mx) * (Y[i] - my); b += (X[i] - mx) ** 2; c += (Y[i] - my) ** 2; }
  console.log(`  corr(|pre[n]|, |out[n-1]|) = ${L.fmt(a / Math.sqrt(b * c), 4)}  (若客户端受前次速度影响, 应显著正)`);
}
