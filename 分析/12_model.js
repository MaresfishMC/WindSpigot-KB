'use strict';
// 冲量模型参数搜索:  out = clamp( |A*u_pos + B*u_yaw*Sa + C*u_pos*Sv|, cap )
// 用 |out| 的 RMSE 作为目标(方向已由几何确定, 模长是唯一自由度)
const F = require('./fitlib');
const L = F.L;

const all = F.loadJsonl('F:\\open\\新服务器\\PVP内核\\分析\\s12_r1.jsonl')
  .concat(F.loadJsonl('F:\\open\\新服务器\\PVP内核\\分析\\s12_r2.jsonl'));
const rows = all.filter(x => x.outY > 0.3613 && x.onGround);   // 排除异常垂直包, 取地面
for (const x of rows) {
  const dd = L.dot2(x.pre, x.uPos);
  x.Sa = x.peerSprint ? 1 : 0;
  x.Sv = (x.selfSprint && dd > 0) ? 1 : 0;   // 受击方疾跑且朝攻击者运动
  x.Ss = x.selfSprint ? 1 : 0;               // 受击方疾跑(任意朝向)
  x.mag = x.outH;
  x.theta = L.angBetween(x.uPos, x.uYaw);
}
console.log('拟合样本(地面, 正常垂直包):', rows.length);

function vecMag(A, B, C, D, x) {
  const vx = A * x.uPos[0] + B * x.uYaw[0] * x.Sa + C * x.uPos[0] * x.Sv + D * x.uPos[0] * x.Ss;
  const vz = A * x.uPos[1] + B * x.uYaw[1] * x.Sa + C * x.uPos[1] * x.Sv + D * x.uPos[1] * x.Ss;
  return Math.hypot(vx, vz);
}
function rmse(p, data) {
  const { A, B, C, D, cap } = p;
  let s = 0;
  for (const x of data) { const m = Math.min(vecMag(A, B, C, D, x), cap); s += (m - x.mag) ** 2; }
  return Math.sqrt(s / data.length);
}

// 坐标下降
function refine(p, data, iters = 60) {
  let best = { ...p }, bestE = rmse(best, data);
  const steps = { A: .02, B: .02, C: .02, D: .02, cap: .005 };
  for (let it = 0; it < iters; it++) {
    let improved = false;
    for (const k of Object.keys(steps)) {
      for (const sign of [1, -1]) {
        const q = { ...best }; q[k] = best[k] + sign * steps[k];
        if (k === 'cap' && q[k] <= 0.2) continue;
        const e = rmse(q, data);
        if (e < bestE - 1e-9) { best = q; bestE = e; improved = true; }
      }
    }
    if (!improved) for (const k of Object.keys(steps)) steps[k] /= 2;
  }
  return { p: best, e: bestE };
}

const seeds = [
  { A: .5274, B: .42, C: 0, D: 0, cap: .9494 },
  { A: .5274, B: .42, C: -.25, D: 0, cap: .9494 },
  { A: .6, B: .35, C: -.2, D: 0, cap: .9494 },
  { A: .5274, B: 0, C: 0, D: .3, cap: .9494 },
  { A: .5, B: .45, C: 0, D: -.15, cap: .95 },
];
let best = null;
for (const s of seeds) { const r = refine(s, rows); if (!best || r.e < best.e) best = r; console.log('  seed', JSON.stringify(s), '→ RMSE', L.fmt(r.e, 5), JSON.stringify(best === r ? r.p : r.p)); }
console.log('\n*** 最优(4项) ***', JSON.stringify(Object.fromEntries(Object.entries(best.p).map(([k, v]) => [k, +v.toFixed(5)]))), 'RMSE', L.fmt(best.e, 5));

// 简化模型: 仅 A,B,cap
function refine2(p, data, iters = 60) { return refine(p, data, iters); }
for (const s of [{ A: .5274, B: .42, C: 0, D: 0, cap: .9494 }]) {
  const r = refine(s, rows);
  if (!best || r.e < best.e) { /* keep */ }
}
const p2 = (() => { const s = { A: .5274, B: .42, C: 0, D: 0, cap: .9494 }; const r = refine(s, rows); return r; })();
console.log('*** 简化(仅A,B,cap) ***', JSON.stringify(Object.fromEntries(Object.entries(p2.p).map(([k, v]) => [k, +v.toFixed(5)]))), 'RMSE', L.fmt(p2.e, 5));

// 诊断: 用简化模型看分组偏差
const P = p2.p;
console.log('\n=== 简化模型分组偏差 ===');
const grp = {};
for (const x of rows) {
  const pred = Math.min(vecMag(P.A, P.B, 0, 0, x), P.cap);
  const k = `Sa${x.Sa}Ss${x.Ss}tw${x.Sv}`;
  (grp[k] ||= []).push(x.mag - pred);
}
for (const k of Object.keys(grp).sort()) { const a = grp[k]; if (a.length >= 5) console.log(`  ${k.padEnd(14)} n=${String(a.length).padStart(4)} 偏差 med=${L.fmt(L.median(a), 4)} (正=实测更大)`); }

console.log('\n=== 关键状态实测 |out| 众数(θ<10°) ===');
const al = rows.filter(x => Math.abs(L.angBetween(x.uPos, x.uYaw)) < 10);
for (const [lab, f] of [
  ['Sa0 受击非疾跑', x => !x.Sa && !x.Ss], ['Sa0 受击疾跑', x => !x.Sa && x.Ss],
  ['Sa1 受击非疾跑', x => x.Sa && !x.Ss], ['Sa1 受击疾跑', x => x.Sa && x.Ss],
]) {
  const a = al.filter(f); if (a.length < 5) { console.log(`  ${lab} n=${a.length} 少`); continue; }
  const m = {}; for (const x of a) { const k = x.mag.toFixed(3); m[k] = (m[k] || 0) + 1; }
  console.log(`  ${lab.padEnd(16)} n=${String(a.length).padStart(4)} med=${L.fmt(L.median(a.map(x => x.mag)), 4)} 众数=${Object.entries(m).sort((p, q) => q[1] - p[1]).slice(0, 4).map(([k, n]) => k + 'x' + n).join(' ')}`);
}

// 精确包值(1/8000 量化)
console.log('\n=== 基础值精确量化 ===');
const base = rows.filter(x => !x.Sa && !x.Ss && Math.abs(L.angBetween(x.uPos, x.uYaw)) < 10);
const qx = base.map(x => Math.round(x.out[0] * 8000)), qz = base.map(x => Math.round(x.out[1] * 8000));
console.log('  n=' + base.length, ' out_x*8000 众数:', Object.entries(qx.reduce((a, v) => (a[v] = (a[v] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).slice(0, 5));
console.log('  |out|*8000 众数:', Object.entries(base.map(x => Math.round(x.mag * 8000)).reduce((a, v) => (a[v] = (a[v] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).slice(0, 5));
console.log('  精确 |out| 值:', [...new Set(base.map(x => x.mag.toFixed(6)))].slice(0, 10));
const hiRows = rows.filter(x => x.mag > 0.945);
console.log('  上限样本 |out| 最大:', L.fmt(Math.max(...hiRows.map(x => x.mag)), 6), ' 众数:', Object.entries(hiRows.map(x => x.mag.toFixed(4)).reduce((a, v) => (a[v] = (a[v] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).slice(0, 5));
console.log('  上限样本 cosθ 中位:', L.fmt(L.median(hiRows.map(x => Math.cos(L.angBetween(x.uPos, x.uYaw) * Math.PI / 180))), 4));
