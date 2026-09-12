'use strict';
// 53b: 连续发包诊断 —— 用 kb-log 的间隔 + vic_ndt, 判断"连击窗口内是否被重复施加强制击退"。
const fs = require('fs');
const K = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\kb-log.csv';
const raw = fs.readFileSync(K, 'utf8').split(/\r?\n/).filter(Boolean);
const head = raw[0].split(',');
const I = {}; head.forEach((h, i) => I[h] = i);
const rows = raw.slice(1).map(l => l.split(',')).filter(c => c.length === head.length).map(c => ({
  ts: +c[I.ts_ms], atk: c[I.attacker], vic: c[I.victim],
  atkS: c[I.atk_sprint] === 'true', atkE: c[I.atk_extra_kb] === 'true', vicS: c[I.vic_sprint] === 'true',
  ndt: +c[I.vic_ndt], h: parseFloat(c[I.pkt_h]), vy: parseFloat(c[I.pkt_y]),
}));
const skip = parseInt(process.argv[2] || '0', 10);
const win = skip > 0 ? rows.slice(skip) : rows;
console.log(`样本 ${rows.length}  本次窗口 ${win.length} (跳过前 ${skip} 条)`);
rows.length = 0; rows.push(...win);

// 同一受击方的相邻发包间隔
const byVic = {};
for (const r of rows) (byVic[r.vic] = byVic[r.vic] || []).push(r);
let gaps = [], fast = 0, fastNdt = [];
for (const [v, arr] of Object.entries(byVic)) {
  arr.sort((a, b) => a.ts - b.ts);
  for (let i = 1; i < arr.length; i++) {
    const g = arr[i].ts - arr[i - 1].ts;
    gaps.push(g);
    if (g < 480) { fast++; fastNdt.push(arr[i].ndt); }
  }
}
gaps.sort((a, b) => a - b);
const q = p => gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))];
console.log(`\n同一受击方相邻发包间隔(ms): n=${gaps.length} min=${gaps[0]} p10=${q(0.1)} med=${q(0.5)} p90=${q(0.9)} max=${gaps[gaps.length - 1]}`);
console.log(`  间隔 < 480ms(即落在 10 tick 连击窗口内) 的发包: ${fast}/${gaps.length} = ${(100 * fast / gaps.length).toFixed(1)}%`);
const nb = {}; for (const n of fastNdt) nb[n] = (nb[n] || 0) + 1;
console.log('  这些快速发包时受击方 ndt 分布:', Object.entries(nb).sort((a, b) => a[0] - b[0]).slice(0, 12).map(([k, v]) => `${k}:${v}`).join(' '));

// 分组统计
const med = a => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
const grp = (n, f) => { const a = rows.filter(f); console.log(`${n}  n=${String(a.length).padStart(4)} med=${med(a.map(r => r.h)).toFixed(4)} min=${Math.min(...a.map(r => r.h)).toFixed(4)} 顶上限=${a.filter(r => r.h > 0.94935).length}`); };
console.log('\n---- 分组 ----');
grp('双不疾跑    ', r => !r.atkS && !r.vicS);
grp('攻击疾跑    ', r => r.atkS && !r.vicS);
grp('受击疾跑    ', r => !r.atkS && r.vicS);
grp('双方疾跑    ', r => r.atkS && r.vicS);
console.log('\n---- 无敌帧窗口命中 (ndt>0) ----');
grp('ndt 1-10    ', r => r.ndt >= 1 && r.ndt <= 10);
grp('ndt 11-20   ', r => r.ndt >= 11);
grp('ndt = 0     ', r => r.ndt === 0);
const iframe = rows.filter(r => r.ndt > 0);
console.log(`  无敌帧内命中占比 ${(100 * iframe.length / rows.length).toFixed(1)}%  (原版此处不应有击退包)`);
console.log(`  垂直: 非 0.361375 的条数 ${rows.filter(r => Math.abs(r.vy - 0.361375) > 1e-6).length}`);
