'use strict';
// 55: 把包层事件流(events.csv)与击退样本(kb-log.csv)按时间轴对齐,
// 区分"真正 W-Tap 重按疾跑后的那一击"与"一直按着 W 的续击", 验证疾跑加成只挂在 W-Tap 那一击。
// 用法: node 55_wtap_join.js [kbSkipRows] [maxJoinMs]
const fs = require('fs');
const K = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\kb-log.csv';
const E = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\events.csv';

function csv(file, skip) {
  const raw = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const head = raw[0].split(',');
  const I = {}; head.forEach((h, i) => I[h] = i);
  return raw.slice(1 + (skip || 0)).map(l => l.split(',')).filter(c => c.length === head.length).map(c => ({ c, I }));
}

// ---- 事件流: 每名玩家的疾跑切换时刻 ----
const ev = csv(E, 0).map(({ c, I }) => ({
  ts: +c[I.ts_ms], type: c[I.type], p: c[I.player],
  sprint: c[I.sprint] === 'true', extra: c[I.extra_kb] === 'true',
}));
const starts = {}, stops = {};
for (const e of ev) {
  if (e.type === 'SPRINT_START') (starts[e.p] = starts[e.p] || []).push(e.ts);
  else if (e.type === 'SPRINT_STOP') (stops[e.p] = stops[e.p] || []).push(e.ts);
}
console.log(`事件流 ${ev.length} 条 (SPRINT_START ${ev.filter(e => e.type === 'SPRINT_START').length} / STOP ${ev.filter(e => e.type === 'SPRINT_STOP').length})`);

// ---- 击退样本 ----
const kbSkip = parseInt(process.argv[2] || '0', 10);
const kb = csv(K, kbSkip).map(({ c, I }) => ({
  ts: +c[I.ts_ms], atk: c[I.attacker], vic: c[I.victim],
  atkS: c[I.atk_sprint] === 'true', atkE: c[I.atk_extra_kb] === 'true',
  vicS: c[I.vic_sprint] === 'true', ndt: +c[I.vic_ndt],
  h: parseFloat(c[I.pkt_h]), vy: parseFloat(c[I.pkt_y]),
}));
console.log(`击退样本 ${kb.length} (跳过前 ${kbSkip} 条)`);
if (!kb.length) process.exit(0);

// 最近一次事件(不限类型)距该次命中的时间
function nearest(list, ts) { let best = Infinity; for (const t of list) { const d = ts - t; if (d >= 0 && d < best) best = d; } return best; }

const BASE = 0.527375, ATK_EXTRA = 0.4215;
const hasBonus = r => r.h > BASE + 0.05;   // 明显高于基础值 => 吃到疾跑加成

const buckets = [
  ['A. W-Tap 重按疾跑后 <=150ms 命中', r => r.dStart <= 150],
  ['B. 重按后 150~500ms 命中', r => r.dStart > 150 && r.dStart <= 500],
  ['C. 重按后 >500ms(一直按着 W 的续击)', r => r.dStart > 500],
];
for (const r of kb) { r.dStart = nearest(starts[r.atk] || [], r.ts); r.dStop = nearest(stops[r.atk] || [], r.ts); }

const med = a => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
const f4 = v => Number.isFinite(v) ? v.toFixed(4) : '  -   ';
console.log('\n---- 按"距上次 W-Tap 重按疾跑的时间"分组 ----');
for (const [name, f] of buckets) {
  const a = kb.filter(f);
  const withB = a.filter(hasBonus).length;
  const baseOnly = a.filter(r => Math.abs(r.h - BASE) < 0.01).length;
  const vicOnly = a.filter(r => Math.abs(r.h - 0.886775) < 0.005).length;
  const both = a.filter(r => r.atkS && r.vicS).length;
  console.log(`${name}  n=${String(a.length).padStart(4)} med=${f4(med(a.map(r => r.h)))} 有加成=${withB} (${a.length ? (100 * withB / a.length).toFixed(0) : 0}%) 恰为基础值=${baseOnly} 恰为受击方加成值=${vicOnly}`);
  console.log(`      标记: atk_sprint=true ${a.filter(r => r.atkS).length} / extraKB=true ${a.filter(r => r.atkE).length} / vic_sprint=true ${a.filter(r => r.vicS).length}  (各占 n=${a.length})`);
  const hist = {};
  for (const r of a) { const k = r.h.toFixed(3); hist[k] = (hist[k] || 0) + 1; }
  console.log('      取值分布 top6: ' + Object.entries(hist).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => `${k}×${v}`).join('  '));
}

console.log('\n---- 全窗口按标记组合分组(直接看"标记 vs 是否吃到加成") ----');
const combos = [
  ['atk_sprint=T, vic_sprint=T', r => r.atkS && r.vicS],
  ['atk_sprint=T, vic_sprint=F', r => r.atkS && !r.vicS],
  ['atk_sprint=F, vic_sprint=T', r => !r.atkS && r.vicS],
  ['atk_sprint=F, vic_sprint=F', r => !r.atkS && !r.vicS],
];
for (const [n, f] of combos) {
  const a = kb.filter(f);
  if (!a.length) { console.log(`  ${n}  n=0`); continue; }
  console.log(`  ${n}  n=${String(a.length).padStart(4)} med=${f4(med(a.map(r => r.h)))} min=${f4(Math.min(...a.map(r => r.h)))} max=${f4(Math.max(...a.map(r => r.h)))}`);
}

console.log('\n---- 决定性判定: 两次命中之间"有没有重新按下疾跑(W-Tap)" ----');
// 对同一受击方的相邻两次命中, 统计攻击方在 (上次命中, 本次命中) 区间内的 SPRINT_START 次数。
// stop-sprint 会在每次命中时清掉疾跑标记 ⇒ 只有区间内重新按下疾跑, 本次才该吃疾跑加成。
const byVic = {};
for (const r of kb) (byVic[r.vic] = byVic[r.vic] || []).push(r);
let rewTap = 0, rewTapBonus = 0, noTap = 0, noTapBonus = 0;
const noTapVals = [], tapVals = [];
for (const arr of Object.values(byVic)) {
  arr.sort((a, b) => a.ts - b.ts);
  for (let i = 0; i < arr.length - 1; i++) {
    const prev = arr[i], cur = arr[i + 1];
    const st = starts[cur.atk] || [];
    const n = st.filter(t => t > prev.ts && t <= cur.ts).length;
    const bonus = cur.h > BASE + 0.05;
    if (n > 0) { rewTap++; if (bonus) rewTapBonus++; tapVals.push(cur.h); }
    else { noTap++; if (bonus) noTapBonus++; noTapVals.push(cur.h); }
  }
}
console.log(`  区间内有重按疾跑(W-Tap)  n=${rewTap}  其中吃到加成 ${rewTapBonus} (${rewTap ? (100 * rewTapBonus / rewTap).toFixed(0) : 0}%)  med=${f4(med(tapVals))}`);
console.log(`  区间内没有重按疾跑        n=${noTap}  其中吃到加成 ${noTapBonus} (${noTap ? (100 * noTapBonus / noTap).toFixed(0) : 0}%)  med=${f4(med(noTapVals))}`);
if (noTapVals.length) console.log(`    无重按组 |out| 分布: med=${f4(med(noTapVals))} min=${f4(Math.min(...noTapVals))} max=${f4(Math.max(...noTapVals))}`);
console.log('  判定: 无重按组若仍普遍吃到加成 => 疾跑加成仍在"每一击"上(修复无效);');
console.log('        无重按组应集中在 0.5274(双不疾跑) 或 0.8868(仅受击方疾跑)。');
const cont = kb.filter(r => r.dStart > 500);
console.log(`  续击样本 ${cont.length} 条, 其中 |out| 高于基础值 0.05 以上的: ${cont.filter(hasBonus).length}`);
if (cont.length) {
  console.log(`  续击 |out| 分布: med=${f4(med(cont.map(r => r.h)))} min=${f4(Math.min(...cont.map(r => r.h)))} max=${f4(Math.max(...cont.map(r => r.h)))}`);
  console.log(`  续击中 atk_sprint 标记为 true 的: ${cont.filter(r => r.atkS).length} / ${cont.length}`);
}

console.log('\n---- 整体健康度 ----');
const hs = kb.map(r => r.h);
console.log(`  |out| med=${f4(med(hs))} min=${f4(Math.min(...hs))} max=${f4(Math.max(...hs))}`);
console.log(`  顶到水平上限 0.9494 的: ${hs.filter(v => v > 0.94935).length} / ${hs.length}`);
console.log(`  近零击退 (<0.2): ${hs.filter(v => v < 0.2).length} / ${hs.length}`);
console.log(`  垂直非 0.361375: ${kb.filter(r => Math.abs(r.vy - 0.361375) > 1e-6).length} / ${kb.length}`);
console.log(`  ndt 11~20(应恒为 0 条, damage-increment=false 已整体忽略): ${kb.filter(r => r.ndt >= 11).length}`);
