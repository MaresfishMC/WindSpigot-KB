'use strict';
const F = require('./fitlib'); const L = F.L;
const all = F.loadJsonl('F:\\open\\新服务器\\PVP内核\\分析\\s12_r1.jsonl').map(x => (x.round = 1, x))
  .concat(F.loadJsonl('F:\\open\\新服务器\\PVP内核\\分析\\s12_r2.jsonl').map(x => (x.round = 2, x)));
for (const r of [1, 2]) {
  const a = all.filter(x => x.round === r).sort((p, q) => p.epoch - q.epoch);
  const gaps = []; for (let i = 1; i < a.length; i++) gaps.push(a[i].epoch - a[i - 1].epoch);
  const lt = gaps.filter(g => g < 480);
  console.log(`第${r}轮: 相邻速度包间隔 <480ms 的 ${lt.length}/${gaps.length}  样本值: ${lt.slice(0, 25).join(', ')}`);
  console.log(`  间隔分位: p01=${L.quantile(gaps, .01)} p05=${L.quantile(gaps, .05)} p25=${L.quantile(gaps, .25)} 中位=${L.median(gaps)} p75=${L.quantile(gaps, .75)}`);
  const h = {}; for (const g of gaps) { const k = Math.round(g / 100) * 100; h[k] = (h[k] || 0) + 1; }
  console.log('  直方(100ms 桶):', Object.entries(h).sort((p, q) => p[0] - q[0]).map(([k, n]) => `${k}:${n}`).join(' '));
}
