'use strict';
// 最终拟合: 使用攻击方自身会话的疾跑真值
//   raw = |A*u_pos + B*u_yaw*Sa + C*u_pos*(Ss&toward) + D*u_pos*(Ss&!toward)|
//   out = min(raw, cap)
const fs = require('fs');
const L = require('./lib');

const rows = fs.readFileSync('F:\\open\\新服务器\\PVP内核\\分析\\joined.jsonl', 'utf8').split('\n').filter(s => s.trim()).map(JSON.parse)
  .filter(x => x.outY > 0.3613 && x.self_on_ground === 'true' && x.geoDist <= 3.6 && x.atkSprintTrue !== null);
console.log('拟合样本', rows.length);

for (const x of rows) {
  x.Sa = x.atkSprintTrue ? 1 : 0;
  x.Ss = x.selfSprint ? 1 : 0;
  x.T = x.toward ? 1 : 0;
  x.mag = x.outH;
  x.uY2 = L.lookDir(Number(x.peer_yaw));   // 受击方记录的 peer_yaw(攻击方 yaw)
  x.uYa = x.atkYawTrue !== null ? L.lookDir(x.atkYawTrue) : x.uY2;
  // 用攻击方自身坐标重算 u_pos(攻击方客户端看到的受击方位置)
  x.thetaRec = L.angBetween(x.uPos, x.uY2);
}
function mag(A, B, C, D, x, useTrue) {
  const uy = useTrue ? x.uYa : x.uY2;
  const vx = A * x.uPos[0] + B * uy[0] * x.Sa + C * x.uPos[0] * x.Ss * x.T + D * x.uPos[0] * x.Ss * (1 - x.T);
  const vz = A * x.uPos[1] + B * uy[1] * x.Sa + C * x.uPos[1] * x.Ss * x.T + D * x.uPos[1] * x.Ss * (1 - x.T);
  return Math.hypot(vx, vz);
}
function rmse(p, useTrue) {
  let s = 0;
  for (const x of rows) { const m = Math.min(mag(p.A, p.B, p.C, p.D, x, useTrue), p.cap); s += (m - x.mag) ** 2; }
  return Math.sqrt(s / rows.length);
}
function descend(p0, useTrue) {
  let best = { ...p0 }, be = rmse(best, useTrue);
  const st = { A: .01, B: .01, C: .01, D: .01, cap: .002 };
  for (let it = 0; it < 200; it++) {
    let imp = false;
    for (const k of Object.keys(st)) for (const s of [1, -1]) {
      const q = { ...best }; q[k] = best[k] + s * st[k];
      if (q.cap < 0.3) continue;
      const e = rmse(q, useTrue);
      if (e < be - 1e-10) { best = q; be = e; imp = true; }
    }
    if (!imp) for (const k of Object.keys(st)) st[k] /= 2;
    if (Math.max(...Object.values(st)) < 1e-5) break;
  }
  return { p: best, e: be };
}
let best = null;
for (const seed of [{ A: .5274, B: .40, C: .36, D: .36, cap: .9494 }, { A: .5274, B: .42, C: .36, D: .20, cap: .9494 }, { A: .5274, B: .30, C: .42, D: .42, cap: .95 }]) {
  for (const ut of [false, true]) {
    const r = descend(seed, ut);
    if (!best || r.e < best.e) best = { ...r, ut };
  }
}
console.log('\n*** 最优 ***', '用攻击方真yaw=' + best.ut, JSON.stringify(Object.fromEntries(Object.entries(best.p).map(([k, v]) => [k, +v.toFixed(5)]))), 'RMSE', L.fmt(best.e, 5));

// 简化模型: C=D (受击方疾跑不分朝向), 或 D=0 (仅朝攻击者)
console.log('\n=== 模型对比 ===');
const cands = {
  'M1: B(Sa) + C(Ss&toward) + D(Ss&away)': best.p,
};
for (const [lab, fix] of [['M2: 受击方疾跑不分朝向', { D: 'C' }], ['M3: 受击方仅朝攻击者', { D: 'zero' }], ['M4: 无受击方项', { C: 'zero', D: 'zero' }], ['M5: 仅攻击方疾跑项', { C: 'zero', D: 'zero', B: 'free' }]]) {
  let p = { ...best.p };
  if (fix.D === 'C') p.D = p.C;
  if (fix.D === 'zero') p.D = 0;
  if (fix.C === 'zero') p.C = 0;
  // 重新下降(仅自由参数)
  const free = Object.keys(p).filter(k => !(fix[k] === 'zero'));
  let bs = { ...p }, be = rmse(bs, best.ut);
  const st = { A: .01, B: .01, C: .01, D: .01, cap: .002 };
  for (let it = 0; it < 150; it++) {
    let imp = false;
    for (const k of free) for (const s of [1, -1]) {
      const q = { ...bs }; q[k] = bs[k] + s * st[k]; if (q.cap < 0.3) continue;
      if (fix.D === 'C') q.D = q.C;
      const e = rmse(q, best.ut);
      if (e < be - 1e-10) { bs = q; be = e; imp = true; }
    }
    if (!imp) for (const k of free) st[k] /= 2;
    if (Math.max(...free.map(k => st[k])) < 1e-5) break;
  }
  console.log(`  ${lab.padEnd(30)} RMSE=${L.fmt(be, 5)}  ${JSON.stringify(Object.fromEntries(Object.entries(bs).map(([k, v]) => [k, +v.toFixed(4)])))}`);
}

console.log('\n=== 实测锚点 (严格对齐 cosθ<8°) ===');
const tight = rows.filter(x => Math.abs(L.angBetween(x.uPos, x.uY2) * Math.PI / 180) < 0.14);
console.log(' n =', tight.length);
for (const [lab, f] of [
  ['Sa0 Ss0', x => !x.Sa && !x.Ss], ['Sa1 Ss0', x => x.Sa && !x.Ss],
  ['Sa0 Ss1 朝', x => !x.Sa && x.Ss && x.T], ['Sa0 Ss1 背', x => !x.Sa && x.Ss && !x.T],
  ['Sa1 Ss1 朝', x => x.Sa && x.Ss && x.T], ['Sa1 Ss1 背', x => x.Sa && x.Ss && !x.T],
]) {
  const a = tight.filter(f);
  if (a.length < 3) { console.log(`  ${lab.padEnd(12)} n=${a.length} 少`); continue; }
  console.log(`  ${lab.padEnd(12)} n=${String(a.length).padStart(4)} med=${L.fmt(L.median(a.map(x => x.mag)), 5)} min=${L.fmt(Math.min(...a.map(x => x.mag)), 4)} max=${L.fmt(Math.max(...a.map(x => x.mag)), 4)}`);
}
console.log('\n=== 上限: 全体 |out| 上尾 ===');
const mags = rows.map(x => x.mag);
console.log(' p99', L.fmt(L.quantile(mags, .99), 5), 'max', L.fmt(Math.max(...mags), 6));
console.log(' >0.945 的样本:', mags.filter(v => v > 0.945).length, '/', mags.length);
const hi = rows.filter(x => x.mag > 0.945);
console.log(' 其中 Sa0&Ss0 的:', hi.filter(x => !x.Sa && !x.Ss).length, ' Sa0&Ss1:', hi.filter(x => !x.Sa && x.Ss).length, ' Sa1&Ss0:', hi.filter(x => x.Sa && !x.Ss).length, ' Sa1&Ss1:', hi.filter(x => x.Sa && x.Ss).length);
