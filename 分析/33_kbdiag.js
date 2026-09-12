'use strict';
// 解析 KBProbe 抓到的服务端实际发包数据, 按疾跑状态分组对账
const fs = require('fs');
const CSV = process.argv[2] || 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\kb-log.csv';
const L = require('F:\\open\\新服务器\\PVP内核\\分析\\lib.js');

const lines = fs.readFileSync(CSV, 'utf8').split('\n').filter(s => s.trim());
const head = lines[0].split(',');
const rows = lines.slice(1).map(l => {
  const c = l.split(','); const o = {};
  head.forEach((h, i) => o[h] = c[i]);
  const n = k => Number(o[k]); const b = k => o[k] === 'true';
  return {
    ts: n('ts_ms'), atk: o.attacker, vic: o.victim,
    aS: b('atk_sprint'), vS: b('vic_sprint'), gnd: b('vic_ground'),
    yaw: n('atk_yaw'), ax: n('atk_x'), ay: n('atk_y'), az: n('atk_z'),
    vx: n('vic_x'), vy: n('vic_y'), vz: n('vic_z'),
    pre: [n('pre_x'), n('pre_y'), n('pre_z')],
    pkt: [n('pkt_x'), n('pkt_y'), n('pkt_z')], pktH: n('pkt_h'),
    aPing: n('atk_ping'), vPing: n('vic_ping'), dist: n('dist'),
  };
});
console.log(`样本 ${rows.length} 条  (时间 ${new Date(rows[0].ts).toLocaleTimeString()} ~ ${new Date(rows[rows.length-1].ts).toLocaleTimeString()})`);
console.log(`对局: ${rows[0].atk} vs ${rows[0].vic}   ping 攻击方 ${L.median(rows.map(r=>r.aPing))} / 受击方 ${L.median(rows.map(r=>r.vPing))}`);

const EXPECT = { 'AS|VS': 0.9494, 'AS|V-': 0.948875, 'A-|VS': 0.886775, 'A-|V-': 0.527375 };
const grp = {};
for (const r of rows) {
  const k = `${r.aS ? 'AS' : 'A-'}|${r.vS ? 'VS' : 'V-'}`;
  (grp[k] ||= []).push(r);
}
console.log('\n=== 按疾跑状态分组: 服务端实际发包 |水平速度| ===');
console.log('状态         n   中位      众数                p10      p90      期望值     垂直中位');
for (const k of ['A-|V-', 'A-|VS', 'AS|V-', 'AS|VS']) {
  const a = grp[k];
  if (!a || !a.length) { console.log(`  ${k.padEnd(8)}  0`); continue; }
  const m = {}; for (const r of a) { const t = r.pktH.toFixed(4); m[t] = (m[t] || 0) + 1; }
  const top = Object.entries(m).sort((p, q) => q[1] - p[1]).slice(0, 3).map(([v, n]) => `${v}x${n}`).join(' ');
  const med = L.median(a.map(r => r.pktH));
  const exp = EXPECT[k];
  console.log(`  ${k.padEnd(8)} ${String(a.length).padStart(3)}  ${L.fmt(med, 6)}  ${top.padEnd(20)} ${L.fmt(L.quantile(a.map(r=>r.pktH), .1), 4)}  ${L.fmt(L.quantile(a.map(r=>r.pktH), .9), 4)}  ${L.fmt(exp, 6)}  ${L.fmt(L.median(a.map(r=>r.pkt[1])), 6)}`);
}

console.log('\n=== 去重后的 |水平速度| 值分布(全样本) ===');
const all = {};
for (const r of rows) { const t = r.pktH.toFixed(4); all[t] = (all[t] || 0) + 1; }
console.log('  ' + Object.entries(all).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([v, n]) => `${v}x${n}`).join('  '));

console.log('\n=== 垂直分量分布 ===');
const yv = {};
for (const r of rows) { const t = r.pkt[1].toFixed(6); yv[t] = (yv[t] || 0) + 1; }
console.log('  ' + Object.entries(yv).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([v, n]) => `${v}x${n}`).join('  '));

console.log('\n=== 动量保留检验: |pkt| 是否随 |pre| 变化 ===');
function corr(a, f, g) {
  const X = a.map(f), Y = a.map(g); const mx = L.mean(X), my = L.mean(Y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < X.length; i++) { sxy += (X[i]-mx)*(Y[i]-my); sxx += (X[i]-mx)**2; syy += (Y[i]-my)**2; }
  return sxy / Math.sqrt(sxx * syy);
}
const base = grp['A-|V-'] || [];
if (base.length >= 3) {
  const pm = base.map(r => Math.hypot(r.pre[0], r.pre[2]));
  console.log(`  无疾跑组 n=${base.length}  |pre| ${L.fmt(Math.min(...pm),3)}~${L.fmt(Math.max(...pm),3)}  |pkt| sd=${L.fmt(L.sd(base.map(r=>r.pktH)),5)}  corr(|pre|,|pkt|)=${L.fmt(corr(base,r=>Math.hypot(r.pre[0],r.pre[2]),r=>r.pktH),4)}`);
} else console.log(`  无疾跑组样本仅 ${base.length} 条, 暂不足以判动量`);
console.log(`  全体 corr(|pre|,|pkt|) = ${L.fmt(corr(rows, r=>Math.hypot(r.pre[0],r.pre[2]), r=>r.pktH), 4)}`);

console.log('\n=== 方向检验: 发包方向 vs 位置方向 / 攻击者朝向 ===');
let sumPos = 0, sumYaw = 0, cnt = 0;
for (const r of rows) {
  const dp = [r.vx - r.ax, r.vz - r.az]; const m = Math.hypot(dp[0], dp[1]);
  if (m < 0.1) continue;
  const uPos = [dp[0]/m, dp[1]/m];
  const uYaw = L.lookDir(r.yaw);
  const p = [r.pkt[0], r.pkt[2]];
  sumPos += Math.abs(L.angBetween(uPos, p)); sumYaw += Math.abs(L.angBetween(uYaw, p)); cnt++;
}
if (cnt) console.log(`  n=${cnt}  发包方向与位置方向夹角中位 ${L.fmt(sumPos/cnt,2)}°  |  与攻击者朝向夹角中位 ${L.fmt(sumYaw/cnt,2)}°`);

console.log('\n=== 打击间隔(同一受击方相邻两次) ===');
const byVic = {};
for (const r of rows) (byVic[r.vic] ||= []).push(r.ts);
for (const v of Object.keys(byVic)) {
  const t = byVic[v].sort((a, b) => a - b); const g = [];
  for (let i = 1; i < t.length; i++) g.push(t[i] - t[i-1]);
  if (g.length) console.log(`  ${v}: n=${t.length} 间隔中位 ${L.median(g)}ms 最小 ${Math.min(...g)}ms  p10 ${L.quantile(g,.1)}ms`);
}
