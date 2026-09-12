'use strict';
// 用 out 自身方向作为受击方运动门控(方向无关), 并检验"两分量夹角混合"假说
const L = require('./lib');

const all = [...L.clean(L.loadCsv(L.R1)), ...L.clean(L.loadCsv(L.R2))];
for (const x of all) {
  const u = L.lookDir(x.yaw);
  x.u = u;
  x.towardOut = L.dot2([x.pre[0], x.pre[2]], [x.out[0], x.out[2]]) < 0; // 受击方朝击退反方向运动 = 朝攻击者
  x.angYawOut = L.angBetween(u, [x.out[0], x.out[2]]);                   // 输出方向 vs 攻击者视线
  x.preMag = L.hypot2(x.pre[0], x.pre[2]);
  x.preToward = -L.dot2([x.pre[0], x.pre[2]], u);                        // >0 表示朝攻击者运动
}

function stats(a) {
  if (a.length < 3) return `n=${a.length} 太少`;
  const v = a.map(x => x.outH);
  return `n=${String(a.length).padStart(4)} med=${L.fmt(L.median(v), 4)} p10=${L.fmt(L.quantile(v, .1), 4)} p90=${L.fmt(L.quantile(v, .9), 4)} sd=${L.fmt(L.sd(v), 4)} angYawOut=${L.fmt(L.median(a.map(x => x.angYawOut)), 2)}`;
}

console.log('=== 门控 = pre·out < 0 (受击方朝攻击者运动) ===');
const sel = (aS, vS, tw) => all.filter(x => x.attackerSprint === aS && x.victimSprint === vS && x.onGround && x.towardOut === tw);
for (const [as, vs] of [[false, false], [true, false], [false, true], [true, true]]) {
  console.log(`\nA${as ? 'S' : '-'} V${vs ? 'S' : '-'} 地面`);
  console.log('  朝攻击者(T):', stats(sel(as, vs, true)));
  console.log('  背离   (F):', stats(sel(as, vs, false)));
}

console.log('\n=== 输出方向 vs 攻击者 yaw 的角度分布 (全体) ===');
const A = all.map(x => Math.abs(x.angYawOut));
for (const q of [.05, .25, .5, .75, .9, .95, .99]) console.log(`  |ang| p${String(Math.round(q * 100)).padStart(2)} = ${L.fmt(L.quantile(A, q), 2)}°`);

console.log('\n=== 只看基准(A- V- 且背离)的 out 方向 vs yaw —— 纯基础击退方向应 = 位置方向 ===');
const base = all.filter(x => !x.attackerSprint && !x.victimSprint && x.onGround && !x.towardOut);
console.log('  n =', base.length, '| 中位夹角', L.fmt(L.median(base.map(x => x.angYawOut)), 2), '° | sd', L.fmt(L.sd(base.map(x => x.angYawOut)), 2));
console.log('  但该组 medOutH =', L.fmt(L.median(base.map(x => x.outH)), 5), ' ⇒ 方向由基础击退决定');

console.log('\n=== 相关性检验(在双疾跑地面组内) ===');
const ds = all.filter(x => x.attackerSprint && x.victimSprint && x.onGround);
function corr(a, f) {
  const X = a.map(f), Y = a.map(x => x.outH);
  const mx = L.mean(X), my = L.mean(Y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < X.length; i++) { sxy += (X[i] - mx) * (Y[i] - my); sxx += (X[i] - mx) ** 2; syy += (Y[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}
console.log('  n =', ds.length);
console.log('  corr(|out|, distance)      =', L.fmt(corr(ds, x => x.distance), 4));
console.log('  corr(|out|, |pre|)         =', L.fmt(corr(ds, x => x.preMag), 4));
console.log('  corr(|out|, preToward)     =', L.fmt(corr(ds, x => x.preToward), 4));
console.log('  corr(|out|, gap)           =', L.fmt(corr(ds.filter(x => x.gap > 0), x => x.gap), 4), '(gap>0子集 n=' + ds.filter(x => x.gap > 0).length + ')');
console.log('  corr(|out|, |angYawOut|)   =', L.fmt(corr(ds, x => Math.abs(x.angYawOut)), 4));

console.log('\n=== |out| 分箱 vs distance (双疾跑地面) ===');
for (let d = 0; d < 6; d++) {
  const a = ds.filter(x => x.distance >= d && x.distance < d + 1);
  if (a.length >= 5) console.log(`  d∈[${d},${d + 1}) n=${String(a.length).padStart(4)} med=${L.fmt(L.median(a.map(x => x.outH)), 4)} p10=${L.fmt(L.quantile(a.map(x => x.outH), .1), 4)} p90=${L.fmt(L.quantile(a.map(x => x.outH), .9), 4)} 达上限比例=${L.fmt(100 * a.filter(x => x.outH > 0.945).length / a.length, 1)}%`);
}

console.log('\n=== |out| 分箱 vs |pre| (双疾跑地面) ===');
for (let d = 0; d < 8; d++) {
  const a = ds.filter(x => x.preMag >= d * 0.05 && x.preMag < (d + 1) * 0.05);
  if (a.length >= 5) console.log(`  |pre|∈[${L.fmt(d * 0.05, 2)},${L.fmt((d + 1) * 0.05, 2)}) n=${String(a.length).padStart(4)} med=${L.fmt(L.median(a.map(x => x.outH)), 4)} 达上限比例=${L.fmt(100 * a.filter(x => x.outH > 0.945).length / a.length, 1)}%`);
}

console.log('\n=== |out| 分箱 vs |angYawOut| (双疾跑地面) —— 夹角混合假说的关键检验 ===');
for (let d = 0; d < 8; d++) {
  const a = ds.filter(x => Math.abs(x.angYawOut) >= d * 10 && Math.abs(x.angYawOut) < (d + 1) * 10);
  if (a.length >= 5) console.log(`  |ang|∈[${d * 10},${(d + 1) * 10})° n=${String(a.length).padStart(4)} med=${L.fmt(L.median(a.map(x => x.outH)), 4)} 达上限比例=${L.fmt(100 * a.filter(x => x.outH > 0.945).length / a.length, 1)}%`);
}

console.log('\n=== 极低 |out| 样本 (<0.25) 排查 ===');
for (const x of all.filter(x => x.outH < 0.25).slice(0, 25)) {
  console.log(`  idx=${x.index} outH=${L.fmt(x.outH, 4)} aS=${x.attackerSprint} vS=${x.victimSprint} gnd=${x.onGround} d=${L.fmt(x.distance, 2)} pre=(${L.fmt(x.pre[0], 3)},${L.fmt(x.pre[2], 3)})|pre|=${L.fmt(x.preMag, 3)} out=(${L.fmt(x.out[0], 3)},${L.fmt(x.out[2], 3)}) gap=${x.gap}`);
}
