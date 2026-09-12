'use strict';
const F = require('./fitlib');
const L = F.L;

const r1 = F.loadJsonl('F:\\open\\新服务器\\PVP内核\\分析\\s12_r1.jsonl').map(x => (x.round = 1, x));
const r2 = F.loadJsonl('F:\\open\\新服务器\\PVP内核\\分析\\s12_r2.jsonl').map(x => (x.round = 2, x));
const all = r1.concat(r2);

// 精确分解: out = A*u_pos + B*u_yaw  ⇒  在 (u_pos, u_yaw) 基下解 2x2 线性方程
for (const x of all) {
  const c = L.dot2(x.uPos, x.uYaw);
  x.cos = c;
  const p1 = L.dot2(x.out, x.uPos), p2 = L.dot2(x.out, x.uYaw);
  const det = 1 - c * c;
  x.A = (p1 - c * p2) / det;   // 沿 u_pos 的分量
  x.B = (p2 - c * p1) / det;   // 沿 u_yaw 的分量
  x.sin = Math.sqrt(Math.max(0, det));
  x.toward = L.dot2(x.pre, x.uPos) > 0;
}
const ok = all.filter(x => x.sin > 0.25);   // 方向可分离
console.log('可分解样本( |sinθ|>0.25 ):', ok.length, '/', all.length);

const Sa = x => x.peerSprint, Sv = x => x.selfSprint && x.toward;
function dump(label, sel) {
  const a = ok.filter(sel);
  if (a.length < 5) { console.log(`  ${label.padEnd(26)} n=${a.length} 太少`); return; }
  console.log(`  ${label.padEnd(26)} n=${String(a.length).padStart(4)}  A: med=${L.fmt(L.median(a.map(x => x.A)), 5)} p10=${L.fmt(L.quantile(a.map(x => x.A), .1), 4)} p90=${L.fmt(L.quantile(a.map(x => x.A), .9), 4)}  |  B: med=${L.fmt(L.median(a.map(x => x.B)), 5)} p10=${L.fmt(L.quantile(a.map(x => x.B), .1), 4)} p90=${L.fmt(L.quantile(a.map(x => x.B), .9), 4)}`);
}

console.log('\n=== A(沿位置方向) / B(沿攻击者视线方向) 按状态分组 ===');
console.log('  门控: Sa=攻击方疾跑, Sv=受击方疾跑且朝攻击者运动');
dump('Sa0 Sv0 onGround', x => !Sa(x) && !Sv(x) && x.onGround);
dump('Sa1 Sv0 onGround', x => Sa(x) && !Sv(x) && x.onGround);
dump('Sa0 Sv1 onGround', x => !Sa(x) && Sv(x) && x.onGround);
dump('Sa1 Sv1 onGround', x => Sa(x) && Sv(x) && x.onGround);
console.log('  --- 受击方疾跑但背离 (tw=F) ---');
dump('Sa0 VS onGround twF', x => !Sa(x) && x.selfSprint && !x.toward && x.onGround);
dump('Sa1 VS onGround twF', x => Sa(x) && x.selfSprint && !x.toward && x.onGround);
console.log('  --- 非疾跑受击方 ---');
dump('Sa0 V- onGround', x => !Sa(x) && !x.selfSprint && x.onGround);
dump('Sa1 V- onGround', x => Sa(x) && !x.selfSprint && x.onGround);

console.log('\n=== 检验假说 A = k_b + k_v*Sv, B = k_s*Sa ===');
const A0 = ok.filter(x => !Sa(x) && !Sv(x) && x.onGround).map(x => x.A);
const A1 = ok.filter(x => !Sa(x) && Sv(x) && x.onGround).map(x => x.A);
const B0 = ok.filter(x => !Sa(x) && x.onGround).map(x => x.B);
const B1 = ok.filter(x => Sa(x) && x.onGround).map(x => x.B);
console.log(`  k_b = median A | Sa0 Sv0 = ${L.fmt(L.median(A0), 5)}`);
console.log(`  k_b + k_v = median A | Sa0 Sv1 = ${L.fmt(L.median(A1), 5)}  ⇒ k_v = ${L.fmt(L.median(A1) - L.median(A0), 5)}`);
console.log(`  B | Sa0 = ${L.fmt(L.median(B0), 5)}  (应≈0)`);
console.log(`  B | Sa1 = ${L.fmt(L.median(B1), 5)}  ⇒ k_s = ${L.fmt(L.median(B1) - L.median(B0), 5)}`);

console.log('\n=== A、B 与 |out| 是否达上限的关系 ===');
for (const [lab, sel] of [['Sa0 Sv0', x => !Sa(x) && !Sv(x) && x.onGround], ['Sa1 Sv1', x => Sa(x) && Sv(x) && x.onGround]]) {
  const a = ok.filter(sel);
  const capped = a.filter(x => x.outH > 0.945);
  console.log(`  ${lab}: n=${a.length} 贴上限 ${capped.length} (${L.fmt(100 * capped.length / a.length, 1)}%)  贴上限者 A med=${L.fmt(L.median(capped.map(x => x.A)), 4)} B med=${L.fmt(L.median(capped.map(x => x.B)), 4)}`);
}

console.log('\n=== 上限检验: 全体 |out| 上尾 ===');
const mags = all.map(x => x.outH);
console.log('  p90', L.fmt(L.quantile(mags, .9), 5), 'p95', L.fmt(L.quantile(mags, .95), 5), 'p99', L.fmt(L.quantile(mags, .99), 5), 'max', L.fmt(Math.max(...mags), 6));
const hi = all.filter(x => x.outH > 0.945);
console.log('  贴上限样本 n =', hi.length, ' 其状态分布:');
const ht = {}; for (const x of hi) { const k = `Sa${Sa(x) ? 1 : 0}Sv${Sv(x) ? 1 : 0}${x.onGround ? 'G' : 'Air'}`; ht[k] = (ht[k] || 0) + 1; }
console.log('   ', JSON.stringify(ht));
console.log('  |cosθ| 分布(全体):', [.25, .5, .75, .9].map(q => L.fmt(L.quantile(all.map(x => Math.abs(x.cos)), q), 3)).join(' / '));

console.log('\n=== 垂直: 未贴上限的 22 个样本明细 ===');
for (const x of all.filter(x => x.outY < 0.3613)) {
  console.log(`  R${x.round} seq=${x.seq} outY=${L.fmt(x.outY, 5)} preY=${L.fmt(x.preY, 4)} gnd=${x.onGround} selfS=${x.selfSprint} peerS=${x.peerSprint} kb=${x.kb} d=${L.fmt(x.geoDist, 2)} outH=${L.fmt(x.outH, 4)}`);
}
