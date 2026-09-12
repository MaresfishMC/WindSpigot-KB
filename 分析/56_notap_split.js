'use strict';
// 56: 对"两次命中之间没有重新按下疾跑"的样本做来源拆分, 判定疾跑加成是否只挂在 W-Tap 那一击。
// 若这些样本全部落在基础值 / 仅受击方加成值上, 则 W-Tap 语义正确。
const fs = require('fs');
const K = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\kb-log.csv';
const E = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\events.csv';
function load(f, skip) {
  const raw = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean);
  const head = raw[0].split(',');
  const I = {}; head.forEach((h, i) => I[h] = i);
  return raw.slice(1 + (skip || 0)).map(l => l.split(',')).filter(c => c.length === head.length).map(c => ({
    ts: +c[I.ts_ms], type: c[I.type], p: c[I.player], atk: c[I.attacker], vic: c[I.victim],
    atkS: c[I.atk_sprint] === 'true', atkE: c[I.atk_extra_kb] === 'true', vicS: c[I.vic_sprint] === 'true',
    h: parseFloat(c[I.pkt_h]),
  }));
}
const kbSkip = parseInt(process.argv[2] || '0', 10);
const ev = load(E, 0);
const kb = load(K, kbSkip);
const starts = {};
for (const e of ev) if (e.type === 'SPRINT_START') (starts[e.p] = starts[e.p] || []).push(e.ts);

const byVic = {};
for (const r of kb) (byVic[r.vic] = byVic[r.vic] || []).push(r);
let n = 0, baseOnly = 0, vicOnly = 0, atkBonus = 0, other = 0;
const others = [];
for (const arr of Object.values(byVic)) {
  arr.sort((a, b) => a.ts - b.ts);
  for (let i = 0; i < arr.length - 1; i++) {
    const p = arr[i], c = arr[i + 1];
    const s = (starts[c.atk] || []).filter(t => t > p.ts && t <= c.ts).length;
    if (s > 0) continue;
    n++;
    if (Math.abs(c.h - 0.527375) < 0.01) baseOnly++;
    else if (Math.abs(c.h - 0.886775) < 0.006) vicOnly++;
    else if (c.atkS || c.atkE) atkBonus++;
    else { other++; others.push(c.h.toFixed(4) + '|atkS=' + c.atkS + '|vicS=' + c.vicS); }
  }
}
console.log(`无重按疾跑的命中 n=${n}`);
console.log(`  恰为基础值 0.527375 (完全无加成)              : ${baseOnly}`);
console.log(`  恰为受击方加成值 0.886775 (合法: 受击方疾跑) : ${vicOnly}`);
console.log(`  攻击方标记仍为疾跑且吃了加成 (应为 0)         : ${atkBonus}`);
console.log(`  其它(几何夹角中间值)                          : ${other}`);
if (others.length) console.log('    其它样本: ' + others.slice(0, 10).join('  '));
