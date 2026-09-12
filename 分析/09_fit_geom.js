'use strict';
const F = require('./fitlib');
const L = F.L;

const r1 = F.loadJsonl('F:\\open\\新服务器\\PVP内核\\分析\\s12_r1.jsonl').map(x => (x.round = 1, x));
const r2 = F.loadJsonl('F:\\open\\新服务器\\PVP内核\\分析\\s12_r2.jsonl').map(x => (x.round = 2, x));
const all = r1.concat(r2);
console.log('样本: R1', r1.length, ' R2', r2.length, ' 合计', all.length);

console.log('\n=== 几何校验: u_pos vs u_yaw 夹角(度) ===');
for (const [lab, d] of [['R1', r1], ['R2', r2], ['全体', all]]) {
  const a = d.map(x => Math.abs(x.yawErr));
  console.log(`  ${lab.padEnd(4)} p25=${L.fmt(L.quantile(a, .25), 1)} p50=${L.fmt(L.quantile(a, .5), 1)} p75=${L.fmt(L.quantile(a, .75), 1)} p90=${L.fmt(L.quantile(a, .9), 1)}`);
}

console.log('\n=== 状态分布 ===');
const tally = {};
for (const x of all) { const k = `${x.peerSprint ? 'AS' : 'A-'}${x.selfSprint ? 'VS' : 'V-'}${x.onGround ? 'G' : 'Air'} tw=${x.toward ? 'T' : 'F'}`; tally[k] = (tally[k] || 0) + 1; }
console.log(' ', JSON.stringify(tally));

const Sa = x => x.peerSprint;
const Sv = x => x.selfSprint && x.toward;

const V1 = [
  { name: 'r', vec: 'pre' },
  { name: 'k_base', vec: 'uPos' },
  { name: 'k_sprint', vec: 'uYawV', gate: Sa },
  { name: 'k_victim', vec: 'uPosV', gate: Sv },
];
const V2 = [   // 疾跑沿位置方向(采样上方差异)
  { name: 'r', vec: 'pre' },
  { name: 'k_base', vec: 'uPos' },
  { name: 'k_sprint', vec: 'uPosV', gate: Sa },
  { name: 'k_victim', vec: 'uPosV', gate: Sv },
];
const V3 = [   // 无受击方门控(仅按疾跑标记)
  { name: 'r', vec: 'pre' },
  { name: 'k_base', vec: 'uPos' },
  { name: 'k_sprint', vec: 'uYawV', gate: Sa },
  { name: 'k_victim', vec: 'uPosV', gate: x => x.selfSprint },
];
const V0 = [{ name: 'r', vec: 'pre' }, { name: 'k_base', vec: 'uPos' }];  // 仅基础(取无疾跑子集)

console.log('\n================ 水平模型拟合 ================');
const f1 = F.fit(all, V1, 'V1 全体: r·pre + k_b·u_pos + k_s·u_yaw·Sa + k_v·u_pos·Sv');
const f2 = F.fit(all, V2, 'V2 全体: 疾跑沿 u_pos');
const f3 = F.fit(all, V3, 'V3 全体: 受击方门控仅用疾跑标记');
const noSprint = all.filter(x => !x.peerSprint && !x.selfSprint);
const f0 = F.fit(noSprint, V0, 'V0 无疾跑子集: r·pre + k_b·u_pos');

console.log('\n================ 残差结构 (V1) ================');
if (f1) {
  const rr = f1.e.res;
  const by = {};
  for (const q of rr) { const k = `${q.r.peerSprint ? 'AS' : 'A-'}${q.r.selfSprint ? 'VS' : 'V-'}${q.r.onGround ? 'G' : 'Air'}tw${q.r.toward ? 'T' : 'F'}`; (by[k] ||= []).push(q.err); }
  console.log('  组 | n | medianErr | p90Err');
  for (const k of Object.keys(by).sort()) { const a = by[k]; console.log(`  ${k.padEnd(14)} | ${String(a.length).padStart(4)} | ${L.fmt(L.median(a), 4)} | ${L.fmt(L.quantile(a, .9), 4)}`); }

  // 预测值 vs 实测 的分布
  const pred = rr.map(q => L.hypot2(q.px, q.pz)), act = rr.map(q => q.r.outH);
  console.log('\n  预测 |out| 分位:', [.05, .25, .5, .75, .95].map(q => L.fmt(L.quantile(pred, q), 3)).join(' / '));
  console.log('  实测 |out| 分位:', [.05, .25, .5, .75, .95].map(q => L.fmt(L.quantile(act, q), 3)).join(' / '));

  // 角度残差
  const ang = rr.map(q => L.angBetween([q.px, q.pz], q.r.out));
  console.log('  |预测方向-实测方向| 度: p25', L.fmt(L.quantile(ang.map(Math.abs), .25), 2), 'p50', L.fmt(L.quantile(ang.map(Math.abs), .5), 2), 'p90', L.fmt(L.quantile(ang.map(Math.abs), .9), 2));
}

console.log('\n================ 垂直模型 ================');
function fitVert(rows, label) {
  const capped = rows.filter(x => x.outY >= 0.3613);
  const unc = rows.filter(x => x.outY < 0.3613);
  console.log(`\n[${label}] 全体 ${rows.length}: 贴上限 ${capped.length} / 未贴上限 ${unc.length}`);
  console.log(`  贴上限样本 outY: min=${L.fmt(Math.min(...capped.map(x => x.outY)), 6)} max=${L.fmt(Math.max(...capped.map(x => x.outY)), 6)}`);
  if (unc.length >= 8) {
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const x of unc) { n++; sx += x.preY; sy += x.outY; sxx += x.preY * x.preY; sxy += x.preY * x.outY; }
    const det = n * sxx - sx * sx;
    const rv = (n * sxy - sx * sy) / det, kY = (sxx * sy - sx * sxy) / det;
    console.log(`  未贴上限子集回归: outY = ${L.fmt(rv, 5)} * preY + ${L.fmt(kY, 6)}   (n=${n})`);
    console.log(`  preY 范围 ${L.fmt(Math.min(...unc.map(x => x.preY)), 3)} ~ ${L.fmt(Math.max(...unc.map(x => x.preY)), 3)}`);
  } else {
    const py = rows.map(x => x.preY);
    console.log(`  preY 范围 ${L.fmt(Math.min(...py), 4)} ~ ${L.fmt(Math.max(...py), 4)} (变化过小, 垂直保留不可辨识)`);
    console.log(`  ⇒ 若保留=0 则 vertical=${L.fmt(L.median(rows.map(x => x.outY)), 6)}; 若保留=0.5 则 vertical=${L.fmt(L.median(rows.map(x => x.outY)) - 0.5 * L.median(py), 6)}`);
  }
}
fitVert(r1, '第一轮'); fitVert(r2, '第二轮'); fitVert(all, '全体');
