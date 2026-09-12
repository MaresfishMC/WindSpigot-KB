'use strict';
// 用 MMC 原始采样(testtt, 含双方真实坐标) 检查: 攻击者朝向与位置方向夹角很大时, MMC 是否相消
const F = require('F:\\open\\新服务器\\PVP内核\\分析\\fitlib.js');
const L = F.L;
const all = F.loadJsonl('F:\\open\\新服务器\\PVP内核\\分析\\s12_r1.jsonl')
  .concat(F.loadJsonl('F:\\open\\新服务器\\PVP内核\\分析\\s12_r2.jsonl'));
for (const x of all) {
  x.ang = L.angBetween(x.uPos, x.uYaw);      // 位置方向 -> 攻击者朝向
  x.angAbs = Math.abs(x.ang);
  x.Sa = x.peerSprint;
}
const ok = all.filter(x => x.outY > 0.3613 && x.onGround);
console.log(`MMC 样本 ${ok.length}`);

console.log('\n=== MMC: 攻击方疾跑 且 受击方不疾跑 (Sa1 Ss0) —— 夹角 vs |out| ===');
const g = ok.filter(x => x.Sa && !x.selfSprint);
console.log(`  n=${g.length}`);
for (const [lo, hi] of [[0,15],[15,30],[30,45],[45,60],[60,90],[90,120],[120,150],[150,181]]) {
  const a = g.filter(x => x.angAbs >= lo && x.angAbs < hi);
  if (!a.length) { console.log(`  [${String(lo).padStart(3)},${String(hi).padStart(3)})° n=0`); continue; }
  const v = a.map(x => x.outH);
  console.log(`  [${String(lo).padStart(3)},${String(hi).padStart(3)})° n=${String(a.length).padStart(3)}  |out| 中位=${L.fmt(L.median(v),4)}  min=${L.fmt(Math.min(...v),4)}  max=${L.fmt(Math.max(...v),4)}  |中位 - 基础0.5274|=${L.fmt(Math.abs(L.median(v)-0.527375),4)}`);
}

console.log('\n=== MMC 夹角>90° 的逐条明细(关键: 是相消还是回落到基础值) ===');
const wide = ok.filter(x => x.angAbs > 90);
console.log(`  n=${wide.length}`);
for (const x of wide.slice(0, 30)) {
  console.log(`   |out|=${L.fmt(x.outH,4)}  夹角=${L.fmt(x.ang,1)}°  aS=${x.Sa?1:0} vS=${x.selfSprint?1:0}  距离=${L.fmt(x.geoDist,2)}  round=${x.round}`);
}
const v = wide.map(x => x.outH);
if (v.length) console.log(`  ⇒ |out| 中位 ${L.fmt(L.median(v),4)}  与基础 0.527375 的差 ${L.fmt(L.median(v)-0.527375,4)}  (若≈0 说明 MMC 回落到基础值而非相消)`);
console.log(`  ⇒ 相消模型在 120/150/180° 的预测: 0.4832 / 0.2660 / 0.1059`);
const below = v.filter(t => t < 0.45).length;
console.log(`  ⇒ MMC 中 |out| < 0.45 (低于基础值30%) 的样本: ${below}/${v.length}`);
