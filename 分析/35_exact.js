'use strict';
const fs = require('fs');
const L = require('F:\\open\\新服务器\\PVP内核\\分析\\lib.js');
const CSV = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\kb-log.csv';
const lines = fs.readFileSync(CSV, 'utf8').split('\n').filter(s => s.trim());
const head = lines[0].split(',');
const rows = lines.slice(1).map(l => {
  const c = l.split(','); const o = {}; head.forEach((h, i) => o[h] = c[i]);
  const n = k => Number(o[k]); const b = k => o[k] === 'true';
  return { ts: n('ts_ms'), atk: o.attacker, vic: o.victim, aS: b('atk_sprint'), vS: b('vic_sprint'),
    gnd: b('vic_ground'), yaw: n('atk_yaw'), pkt: [n('pkt_x'), n('pkt_y'), n('pkt_z')], pktH: n('pkt_h'),
    aPing: n('atk_ping'), vPing: n('vic_ping'), dist: n('dist'), pre: [n('pre_x'), n('pre_y'), n('pre_z')],
    ax: n('atk_x'), az: n('atk_z'), vx: n('vic_x'), vz: n('vic_z') };
});
const T = new Date(rows[rows.length-1].ts) - new Date(rows[0].ts);
console.log(`样本 ${rows.length} 条, 采集时长 ${(T/1000).toFixed(0)}s`);
console.log(`ping: 攻击方(每方各自) ${[...new Set(rows.map(r=>r.atk+':'+r.aPing))].join(' ')} | 受击方 ${[...new Set(rows.map(r=>r.vic+':'+r.vPing))].join(' ')}`);

// 用"发包数值"自身判别状态(不依赖 flags): 四个理论档位
const LEV = [
  { name: '双方都不疾跑', v: 0.527375 },
  { name: '仅受击方疾跑', v: 0.886775 },
  { name: '仅攻击方疾跑', v: 0.948875 },
  { name: '双方疾跑(上限)', v: 0.949400 },
];
console.log('\n=== 实测值的精确分布(1/8000 量化) ===');
const ex = {};
for (const r of rows) { const k = r.pktH.toFixed(6); ex[k] = (ex[k] || 0) + 1; }
for (const [v, n] of Object.entries(ex).sort((a, b) => b[1] - a[1])) {
  const near = LEV.reduce((p, q) => Math.abs(q.v - Number(v)) < Math.abs(p.v - Number(v)) ? q : p);
  const d = Math.abs(near.v - Number(v));
  console.log(`  ${v.padStart(9)} x${String(n).padStart(3)}   ${d < 0.002 ? '← ' + near.name : '(矢量合成中间值: 位置方向与攻击者朝向夹角所致)'}`);
}

console.log('\n=== 按 flags 分组 × 按数值档位交叉(看 flags 与数值是否自洽) ===');
for (const k of ['A-|V-', 'A-|VS', 'AS|V-', 'AS|VS']) {
  const a = rows.filter(r => `${r.aS?'AS':'A-'}|${r.vS?'VS':'V-'}` === k);
  if (!a.length) continue;
  const h = {}; for (const r of a) { const t = r.pktH.toFixed(4); h[t] = (h[t]||0)+1; }
  const top = Object.entries(h).sort((p,q)=>q[1]-p[1]).slice(0,5).map(([v,n])=>`${v}×${n}`).join('  ');
  console.log(`  ${k.padEnd(7)} n=${String(a.length).padStart(3)}  众数: ${top}`);
}

console.log('\n=== 垂直分量 ===');
const yv = {}; for (const r of rows) { const t = r.pkt[1].toFixed(6); yv[t] = (yv[t]||0)+1; }
console.log('  ' + Object.entries(yv).sort((a,b)=>b[1]-a[1]).map(([v,n])=>`${v}×${n}`).join('  '));

console.log('\n=== 动量保留 = 0 验证 ===');
const base = rows.filter(r => !r.aS && !r.vS);
if (base.length) {
  const pm = base.map(r => Math.hypot(r.pre[0], r.pre[2]));
  console.log(`  无疾跑组 n=${base.length}  |pre| ${L.fmt(Math.min(...pm),3)}~${L.fmt(Math.max(...pm),3)}  |pkt| 唯一值 ${[...new Set(base.map(r=>r.pktH.toFixed(6)))].join(',')}  sd=${L.fmt(L.sd(base.map(r=>r.pktH)),6)}`);
}
function corr(a, f, g) { const X=a.map(f),Y=a.map(g),mx=L.mean(X),my=L.mean(Y); let s=0,x=0,y=0;
  for(let i=0;i<X.length;i++){s+=(X[i]-mx)*(Y[i]-my);x+=(X[i]-mx)**2;y+=(Y[i]-my)**2;} return s/Math.sqrt(x*y); }
console.log(`  全体 corr(|pre|, |pkt|) = ${L.fmt(corr(rows, r=>Math.hypot(r.pre[0],r.pre[2]), r=>r.pktH), 4)}`);

console.log('\n=== 方向: 发包方向 vs 位置方向 ===');
const ang = [];
for (const r of rows) {
  const dp = [r.vx - r.ax, r.vz - r.az], m = Math.hypot(dp[0], dp[1]);
  if (m < 0.3) continue;
  const uPos = [dp[0]/m, dp[1]/m], uYaw = L.lookDir(r.yaw), p = [r.pkt[0], r.pkt[2]];
  ang.push({ pos: Math.abs(L.angBetween(uPos, p)), yaw: Math.abs(L.angBetween(uYaw, p)) });
}
if (ang.length) {
  console.log(`  n=${ang.length}  与位置方向夹角: 中位 ${L.fmt(L.median(ang.map(a=>a.pos)),2)}°`);
  console.log(`           与攻击者朝向夹角: 中位 ${L.fmt(L.median(ang.map(a=>a.yaw)),2)}°`);
}
