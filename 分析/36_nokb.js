'use strict';
// 专查 "nokb": 哪些命中没有产生应有的击退
const fs = require('fs');
const L = require('F:\\open\\新服务器\\PVP内核\\分析\\lib.js');
const CSV = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\kb-log.csv';
const lines = fs.readFileSync(CSV, 'utf8').split('\n').filter(s => s.trim());
const head = lines[0].split(',');
const rows = lines.slice(1).map(l => {
  const c = l.split(','); const o = {}; head.forEach((h, i) => o[h] = c[i]);
  const n = k => Number(o[k]); const b = k => o[k] === 'true';
  const r = { ts: n('ts_ms'), atk: o.attacker, vic: o.victim, aS: b('atk_sprint'), vS: b('vic_sprint'),
    gnd: b('vic_ground'), yaw: n('atk_yaw'), pkt: [n('pkt_x'), n('pkt_y'), n('pkt_z')], pktH: n('pkt_h'),
    aPing: n('atk_ping'), vPing: n('vic_ping'), dist: n('dist'), pre: [n('pre_x'), n('pre_y'), n('pre_z')],
    ax: n('atk_x'), ay: n('atk_y'), az: n('atk_z'), vx: n('vic_x'), vy: n('vic_y'), vz: n('vic_z') };
  const dp = [r.vx - r.ax, r.vz - r.az]; r.geo = Math.hypot(dp[0], dp[1]);
  r.uPos = [dp[0]/r.geo, dp[1]/r.geo];
  r.uYaw = L.lookDir(r.yaw);
  r.angPY = L.angBetween(r.uPos, r.uYaw);      // 位置方向 -> 攻击者朝向 的夹角
  r.pktAngPos = L.angBetween(r.uPos, [r.pkt[0], r.pkt[2]]);
  return r;
});
console.log(`样本 ${rows.length} 条, 时间 ${new Date(rows[0].ts).toLocaleTimeString()}~${new Date(rows[rows.length-1].ts).toLocaleTimeString()}`);

console.log('\n=== |水平速度| 全分布 ===');
const h = {};
for (const r of rows) { const b = (Math.floor(r.pktH / 0.05) * 0.05).toFixed(2); h[b] = (h[b]||0)+1; }
const mx = Math.max(...Object.values(h));
for (const k of Object.keys(h).sort((a,b)=>a-b)) {
  console.log(`  ${k}: ${String(h[k]).padStart(4)} ${'█'.repeat(Math.max(1, Math.round(40*h[k]/mx)))}`);
}

console.log('\n=== "疑似 nokb" = |水平速度| < 0.45 (远低于最小基础值 0.5274) ===');
const low = rows.filter(r => r.pktH < 0.45);
console.log(`  共 ${low.length} 条 (${L.fmt(100*low.length/rows.length,1)}%)`);
for (const r of low.slice(0, 30)) {
  console.log(`  |pkt|=${L.fmt(r.pktH,4)}  aS=${r.aS?1:0} vS=${r.vS?1:0} gnd=${r.gnd?1:0}  几何距离=${L.fmt(r.geo,2)} 记录的dist=${L.fmt(r.dist,2)}  |pkt_y|=${L.fmt(r.pkt[1],4)}  位置→朝向夹角=${L.fmt(r.angPY,1)}°  发包与位置夹角=${L.fmt(r.pktAngPos,1)}°`);
}

console.log('\n=== 关键交叉: |pkt| 与 位置→攻击者朝向夹角 的关系 ===');
for (const [lo, hi] of [[-181,-150],[-150,-120],[-120,-90],[-90,-60],[-60,-30],[-30,-10],[-10,10],[10,30],[30,60],[60,90],[90,120],[120,150],[150,181]]) {
  const a = rows.filter(r => r.angPY >= lo && r.angPY < hi);
  if (a.length < 3) continue;
  console.log(`  夹角∈[${String(lo).padStart(4)},${String(hi).padStart(4)})° n=${String(a.length).padStart(4)}  |pkt| 中位=${L.fmt(L.median(a.map(r=>r.pktH)),4)}  p10=${L.fmt(L.quantile(a.map(r=>r.pktH),.1),4)}  贴上限比例=${L.fmt(100*a.filter(r=>r.pktH>0.945).length/a.length,1)}%`);
}

console.log('\n=== 是否是"几何距离 vs 记录距离"不一致导致的错配 ===');
let mism = 0;
for (const r of rows) if (Math.abs(r.geo - r.dist) > 0.3) mism++;
console.log(`  |几何距离 - 记录距离| > 0.3 的样本: ${mism}/${rows.length} (${L.fmt(100*mism/rows.length,1)}%)`);

console.log('\n=== 按状态分组(修正: 用发包数值反推真实状态) ===');
const REAL = [
  { n: '双方都不疾跑', v: 0.527375 }, { n: '仅受击方疾跑', v: 0.886775 },
  { n: '仅攻击方疾跑', v: 0.948875 }, { n: '双方疾跑(上限)', v: 0.9494 }];
const tally = { 确认为标定档位: 0, 矢量合成中间值: 0, 明显偏低: 0 };
for (const r of rows) {
  const near = REAL.some(q => Math.abs(q.v - r.pktH) < 0.002);
  if (near) tally.确认为标定档位++;
  else if (r.pktH < 0.45) tally.明显偏低++;
  else tally.矢量合成中间值++;
}
console.log('  ' + JSON.stringify(tally));
