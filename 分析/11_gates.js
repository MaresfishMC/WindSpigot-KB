'use strict';
const F = require('./fitlib');
const L = F.L;

const all = F.loadJsonl('F:\\open\\新服务器\\PVP内核\\分析\\s12_r1.jsonl').map(x => (x.round = 1, x))
  .concat(F.loadJsonl('F:\\open\\新服务器\\PVP内核\\分析\\s12_r2.jsonl').map(x => (x.round = 2, x)));

for (const x of all) {
  x.theta = L.angBetween(x.uPos, x.uYaw);                 // u_pos -> u_yaw 带符号夹角
  x.thetaAbs = Math.abs(x.theta);
  x.toward = L.dot2(x.pre, x.uPos) > 0;
  x.preToward = -L.dot2(x.pre, x.uPos);                   // >0 = 朝攻击者运动的分量
  x.preMag = L.hypot2(x.pre[0], x.pre[1]);
  x.anom = x.outY < 0.3613;                               // 非正常垂直包
}
const good = all.filter(x => !x.anom);
const aligned = good.filter(x => x.thetaAbs < 10);
console.log('全体', all.length, ' 正常垂直包', good.length, ' 对齐(θ<10°)', aligned.length);

const Sa = x => x.peerSprint, Sv = x => x.selfSprint && x.toward;

function stat(a, label) {
  if (a.length < 5) { console.log(`  ${label.padEnd(24)} n=${a.length} 太少`); return; }
  const v = a.map(x => x.outH);
  const mode = {};
  for (const t of v) { const k = t.toFixed(3); mode[k] = (mode[k] || 0) + 1; }
  const top = Object.entries(mode).sort((p, q) => q[1] - p[1]).slice(0, 3).map(([k, n]) => `${k}x${n}`).join(' ');
  console.log(`  ${label.padEnd(24)} n=${String(a.length).padStart(4)} med=${L.fmt(L.median(v), 4)} p10=${L.fmt(L.quantile(v, .1), 4)} p90=${L.fmt(L.quantile(v, .9), 4)} 众数簇=${top}`);
}

console.log('\n=== [A] 对齐子集(θ<10°, 地面, 非异常包) 的 |out| ===');
const A = aligned.filter(x => x.onGround);
stat(A.filter(x => !Sa(x) && !Sv(x)), 'Sa0 Sv0');
stat(A.filter(x => Sa(x) && !Sv(x)), 'Sa1 Sv0');
stat(A.filter(x => !Sa(x) && Sv(x)), 'Sa0 Sv1');
stat(A.filter(x => Sa(x) && Sv(x)), 'Sa1 Sv1');
console.log('  ---- 用"受击方疾跑"(不分朝向) ----');
stat(A.filter(x => !Sa(x) && !x.selfSprint), 'Sa0 受击非疾跑');
stat(A.filter(x => !Sa(x) && x.selfSprint), 'Sa0 受击疾跑');
stat(A.filter(x => Sa(x) && !x.selfSprint), 'Sa1 受击非疾跑');
stat(A.filter(x => Sa(x) && x.selfSprint), 'Sa1 受击疾跑');

console.log('\n=== [B] |out| vs 夹角 θ (仅 AS VS 地面 对齐放宽到 60°) ===');
const sv = good.filter(x => x.onGround && Sa(x) && Sv(x));
for (let d = 0; d < 6; d++) {
  const a = sv.filter(x => x.thetaAbs >= d * 10 && x.thetaAbs < (d + 1) * 10);
  if (a.length >= 5) console.log(`  θ∈[${d * 10},${(d + 1) * 10})° n=${String(a.length).padStart(4)} med|out|=${L.fmt(L.median(a.map(x => x.outH)), 4)} 贴上限占比=${L.fmt(100 * a.filter(x => x.outH > .945).length / a.length, 1)}%`);
}

console.log('\n=== [C] 弹弓假说: A- VS 组 |out| vs 朝攻击者速度分量 ===');
const vs = good.filter(x => x.onGround && !Sa(x) && x.selfSprint && x.thetaAbs < 15);
console.log('  n =', vs.length, ' 贴上限比例', L.fmt(100 * vs.filter(x => x.outH > .945).length / vs.length, 1), '%');
for (let d = -5; d < 5; d++) {
  const a = vs.filter(x => x.preToward >= d * 0.04 && x.preToward < (d + 1) * 0.04);
  if (a.length >= 4) console.log(`  朝攻击者分量∈[${L.fmt(d * .04, 2)},${L.fmt((d + 1) * .04, 2)}) n=${String(a.length).padStart(4)} med|out|=${L.fmt(L.median(a.map(x => x.outH)), 4)}`);
}
// 线性回归 |out| ~ 1 + preToward
function linreg(a, f) {
  const X = a.map(f), Y = a.map(x => x.outH);
  const n = X.length, sx = L.mean(X), sy = L.mean(Y);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (X[i] - sx) * (Y[i] - sy); sxx += (X[i] - sx) ** 2; }
  const m = sxy / sxx;
  return { m, c: sy - m * sx };
}
if (vs.length > 20) { const r = linreg(vs, x => x.preToward); console.log(`  回归: |out| = ${L.fmt(r.m, 4)} * 朝攻击者分量 + ${L.fmt(r.c, 4)}`); }

console.log('\n=== [D] 攻击方疾跑组: |out| vs 受击方状态 (AS 组, 地面, θ<15°) ===');
const as = good.filter(x => x.onGround && Sa(x) && x.thetaAbs < 15);
console.log('  n =', as.length, ' 贴上限比例', L.fmt(100 * as.filter(x => x.outH > .945).length / as.length, 1), '%');
console.log('  受击方疾跑&朝攻击者:', L.fmt(L.median(as.filter(x => Sv(x)).map(x => x.outH)), 4), `(n=${as.filter(x => Sv(x)).length})`);
console.log('  受击方疾跑&背离    :', L.fmt(L.median(as.filter(x => x.selfSprint && !x.toward).map(x => x.outH)), 4), `(n=${as.filter(x => x.selfSprint && !x.toward).length})`);
console.log('  受击方非疾跑      :', L.fmt(L.median(as.filter(x => !x.selfSprint).map(x => x.outH)), 4), `(n=${as.filter(x => !x.selfSprint).length})`);

console.log('\n=== [E] 垂直确认: 同 preY 不同 outY ? ===');
const air = good.filter(x => !x.onGround);
const airLow = air.filter(x => x.preY < -0.35);
console.log('  空中 preY<-0.35 样本 n =', airLow.length, ' outY 唯一值:', [...new Set(airLow.map(x => x.outY.toFixed(5)))].slice(0, 8).join(', '));
console.log('  preY 分箱 → outY 中位:');
for (let d = -7; d <= 3; d++) {
  const a = good.filter(x => x.preY >= d * 0.1 && x.preY < (d + 1) * 0.1);
  if (a.length >= 5) console.log(`   preY∈[${L.fmt(d * .1, 1)},${L.fmt((d + 1) * .1, 1)}) n=${String(a.length).padStart(4)} outY med=${L.fmt(L.median(a.map(x => x.outY)), 6)} sd=${L.fmt(L.sd(a.map(x => x.outY)), 6)}`);
}
