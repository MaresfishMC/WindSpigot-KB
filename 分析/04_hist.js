'use strict';
// |out| 直方图 —— 冲量由若干离散分量合成, 直方图应显现峰簇
const L = require('./lib');

function hist(rows, label, bin = 0.005) {
  const v = rows.map(r => r.outH).filter(Number.isFinite);
  if (v.length < 5) { console.log(`\n### ${label}: n=${v.length} 太少`); return; }
  const lo = Math.floor(Math.min(...v) / bin) * bin, hi = Math.ceil(Math.max(...v) / bin) * bin;
  const b = {};
  for (const x of v) { const k = Math.floor(x / bin) * bin; b[k] = (b[k] || 0) + 1; }
  console.log(`\n### ${label}  n=${v.length}  min=${L.fmt(Math.min(...v), 5)} max=${L.fmt(Math.max(...v), 5)}`);
  const keys = Object.keys(b).map(Number).sort((a, c) => a - c);
  const mx = Math.max(...keys.map(k => b[k]));
  for (const k of keys) {
    const n = b[k];
    const bar = '█'.repeat(Math.max(1, Math.round(40 * n / mx)));
    console.log(`  ${L.fmt(k, 3)} [${String(n).padStart(4)}] ${bar}`);
  }
}

function uniqueTop(rows, label) {
  const m = {};
  for (const r of rows) { const k = r.outH.toFixed(4); m[k] = (m[k] || 0) + 1; }
  const top = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 14);
  console.log(`\n--- ${label} 唯一值 TOP (n=${rows.length}, 唯一值数=${Object.keys(m).length})`);
  for (const [k, n] of top) console.log(`    ${k}  x${n}`);
}

const all = [...L.clean(L.loadCsv(L.R1)), ...L.clean(L.loadCsv(L.R2))];
console.log('总样本', all.length);

hist(all, '全体');
uniqueTop(all, '全体');

const g = (f) => all.filter(f);
hist(g(r => !r.attackerSprint && !r.victimSprint && r.onGround), '无疾跑 地面 (基准段)');
hist(g(r => r.attackerSprint && !r.victimSprint && r.onGround), '仅攻击方疾跑 地面');
hist(g(r => !r.attackerSprint && r.victimSprint && r.onGround), '仅受击方疾跑 地面');
hist(g(r => r.attackerSprint && r.victimSprint && r.onGround), '双疾跑 地面');

uniqueTop(g(r => !r.attackerSprint && !r.victimSprint && r.onGround), '无疾跑 地面');
uniqueTop(g(r => r.attackerSprint && r.victimSprint && r.onGround), '双疾跑 地面');

// 上尾部（硬上限）的精确值
const hi = all.filter(r => r.outH > 0.945).map(r => r.outH.toFixed(6));
const hm = {}; for (const k of hi) hm[k] = (hm[k] || 0) + 1;
console.log('\n--- 硬上限尾部 (outH>0.945) 唯一值 TOP');
for (const [k, n] of Object.entries(hm).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`    ${k}  x${n}`);
