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
    vPing: n('vic_ping'), aPing: n('atk_ping'), dist: n('dist'), pre: [n('pre_x'), n('pre_y'), n('pre_z')] };
});
console.log(`样本 ${rows.length} 条`);

// 各组中位(用众数簇更能反映离散量级)
const grp = {}; for (const r of rows) (grp[`${r.aS?'AS':'A-'}|${r.vS?'VS':'V-'}`] ||= []).push(r);
console.log('\n=== 各组 |水平速度| 直方(0.02 桶) ===');
for (const k of ['A-|V-','A-|VS','AS|V-','AS|VS']) {
  const a = grp[k]; if (!a) continue;
  const h = {}; for (const r of a) { const b = (Math.floor(r.pktH / 0.02) * 0.02).toFixed(2); h[b] = (h[b]||0)+1; }
  console.log(`  ${k} (n=${a.length}): ` + Object.entries(h).sort((p,q)=>p[0]-q[0]).map(([v,n])=>`${v}:${n}`).join(' '));
}

console.log('\n=== 打击间隔 <500ms 的记录(逐条) ===');
const byVic = {};
for (const r of rows) (byVic[r.vic] ||= []).push(r);
let found = 0;
for (const v of Object.keys(byVic)) {
  const t = byVic[v].sort((a,b)=>a.ts-b.ts);
  for (let i = 1; i < t.length; i++) {
    const gap = t[i].ts - t[i-1].ts;
    if (gap < 500) {
      found++;
      const p = t[i-1], c = t[i];
      console.log(`  ${v} 间隔 ${gap}ms`);
      console.log(`     上一次: aS=${p.aS} vS=${p.vS} |pkt|=${L.fmt(p.pktH,4)}`);
      console.log(`     本次  : aS=${c.aS} vS=${c.vS} |pkt|=${L.fmt(c.pktH,4)} 攻击者=${c.atk} 距离=${L.fmt(c.dist,2)}`);
    }
  }
}
if (!found) console.log('  (无)');

console.log('\n=== 间隔分位 ===');
const all = [];
for (const v of Object.keys(byVic)) { const t = byVic[v].sort((a,b)=>a.ts-b.ts); for (let i=1;i<t.length;i++) all.push(t[i].ts-t[i-1].ts); }
if (all.length) console.log(`  n=${all.length}  min=${Math.min(...all)}  p05=${L.quantile(all,.05)}  p10=${L.quantile(all,.1)}  p25=${L.quantile(all,.25)}  中位=${L.median(all)}`);
const sub = all.filter(g => g < 490);
console.log(`  <490ms 的比例: ${sub.length}/${all.length} = ${L.fmt(100*sub.length/all.length,1)}%`);
