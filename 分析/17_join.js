'use strict';
// 用攻击方自身会话的 C02_ATTACK 真值(自身疾跑/yaw/坐标) 重新判定门控
const fs = require('fs');
const L = require('./lib');

function lines(p) { return fs.readFileSync(p, 'utf8').split('\n').filter(s => s.trim()).map(JSON.parse); }
const ROUNDS = [
  { r: 1, s12: 'F:\\open\\新服务器\\PVP内核\\分析\\s12_r1.jsonl', atk: 'F:\\open\\新服务器\\PVP内核\\分析\\atk_r1.jsonl' },
  { r: 2, s12: 'F:\\open\\新服务器\\PVP内核\\分析\\s12_r2.jsonl', atk: 'F:\\open\\新服务器\\PVP内核\\分析\\atk_r2.jsonl' },
];

const out = [];
for (const R of ROUNDS) {
  const s12 = lines(R.s12);
  const atk = lines(R.atk).map(a => ({ ...a, t: +a.epoch_ms })).sort((a, b) => a.t - b.t);
  const ts = atk.map(a => a.t);
  let maxDt = 0, matched = 0;
  const dts = [];
  for (const s of s12) {
    const t = +s.epoch_ms;
    // 二分找最近
    let lo = 0, hi = ts.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (ts[m] < t) lo = m + 1; else hi = m; }
    let best = null, bd = 1e9;
    for (const k of [lo - 1, lo, lo + 1]) {
      if (k < 0 || k >= atk.length) continue;
      const d = Math.abs(atk[k].t - t);
      if (d < bd) { bd = d; best = atk[k]; }
    }
    if (best && bd <= 200) { matched++; dts.push(bd); }
    out.push({ ...s, round: R.r, atkSprintTrue: best && bd <= 200 ? best.self_sprinting === 'true' : null, atkYawTrue: best && bd <= 200 ? Number(best.self_yaw) : null, atkDt: bd, atkMotionX: best && bd <= 200 ? Number(best.self_motion_x) : null, atkMotionZ: best && bd <= 200 ? Number(best.self_motion_z) : null, atkKeyFwd: best && bd <= 200 ? best.self_key_forward === 'true' : null });
  }
  console.log(`第${R.r}轮: S12 ${s12.length}, 攻击 ${atk.length}, 匹配(|Δt|≤200ms) ${matched}  Δt 中位 ${L.median(dts)}ms p90 ${L.quantile(dts, .9)}ms`);
  maxDt = Math.max(...dts);
}

for (const x of out) {
  x.peerSprintReported = x.peer_sprinting === 'true';
  x.selfSprint = x.self_sprinting === 'true';
  x.outH = L.hypot2(Number(x.velocity_x), Number(x.velocity_z));
  const pre = [Number(x.self_motion_x), Number(x.self_motion_z)];
  const dp = [Number(x.self_x) - Number(x.peer_x), Number(x.self_z) - Number(x.peer_z)];
  const m = L.hypot2(dp[0], dp[1]);
  x.uPos = [dp[0] / m, dp[1] / m];
  x.geoDist = m;
  x.toward = L.dot2(pre, x.uPos) > 0;
  x.outY = Number(x.velocity_y);
}
const clean = out.filter(x => x.outY > 0.3613 && x.self_on_ground === 'true' && x.geoDist <= 3.6 && x.atkSprintTrue !== null);
console.log('\n可用样本', clean.length);

console.log('\n=== 攻击方自身疾跑真值 vs 受击方记录的 peer_sprinting ===');
const cm = {};
for (const x of clean) { const k = `真值${x.atkSprintTrue ? 1 : 0} / 记录${x.peerSprintReported ? 1 : 0}`; cm[k] = (cm[k] || 0) + 1; }
console.log(' ', JSON.stringify(cm));

console.log('\n=== 用真值重做分组(严格对齐 cosθ>0.999) ===');
const tight = clean.filter(x => L.dot2(x.uPos, L.lookDir(Number(x.peer_yaw))) > 0.999);
console.log(' 严格对齐 n =', tight.length);
function st(label, f) {
  const a = tight.filter(f);
  if (a.length < 4) { console.log(`  ${label.padEnd(26)} n=${a.length} 少`); return; }
  console.log(`  ${label.padEnd(26)} n=${String(a.length).padStart(4)} |out| med=${L.fmt(L.median(a.map(x => x.outH)), 5)} min=${L.fmt(Math.min(...a.map(x => x.outH)), 4)} max=${L.fmt(Math.max(...a.map(x => x.outH)), 4)}`);
}
st('真Sa0 真Ss0', x => !x.atkSprintTrue && !x.selfSprint);
st('真Sa1 真Ss0', x => x.atkSprintTrue && !x.selfSprint);
st('真Sa0 真Ss1', x => !x.atkSprintTrue && x.selfSprint);
st('真Sa1 真Ss1', x => x.atkSprintTrue && x.selfSprint);
console.log('  ---- 用记录值对照 ----');
st('记Sa0 记Ss0', x => !x.peerSprintReported && !x.selfSprint);
st('记Sa1 记Ss0', x => x.peerSprintReported && !x.selfSprint);
st('记Sa0 记Ss1', x => !x.peerSprintReported && x.selfSprint);
st('记Sa1 记Ss1', x => x.peerSprintReported && x.selfSprint);

console.log('\n=== 真值口径下的 |out| 分箱一致性(全体, 不滤对齐) ===');
for (const [lab, f] of [['真Sa0&真Ss0', x => !x.atkSprintTrue && !x.selfSprint], ['其他(有疾跑)', x => x.atkSprintTrue || x.selfSprint]]) {
  const a = clean.filter(f);
  const v = a.map(x => x.outH);
  const m = {}; for (const t of v) { const k = t.toFixed(3); m[k] = (m[k] || 0) + 1; }
  console.log(`  ${lab.padEnd(14)} n=${String(a.length).padStart(4)} med=${L.fmt(L.median(v), 4)} 众数=${Object.entries(m).sort((p, q) => q[1] - p[1]).slice(0, 5).map(([k, n]) => k + 'x' + n).join(' ')}`);
}
fs.writeFileSync('F:\\open\\新服务器\\PVP内核\\分析\\joined.jsonl', out.map(x => JSON.stringify(x)).join('\n'));
console.log('\n已写出 joined.jsonl');
