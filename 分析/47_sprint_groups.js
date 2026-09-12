'use strict';
// 按"攻击方疾跑 / 受击方疾跑"分组, 对比 MMC 实测 与 本服实时数据 的水平击退幅值。
// 目的: 判定 W-tap(攻击方疾跑那一击) 与 双方疾跑 的击退是否偏大, 并把正确值算出来。
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const LIVE = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\kb-log.csv';

function med(a) { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
function pct(a, q) { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; }
function fmt(v) { return Number.isFinite(v) ? v.toFixed(4) : '  -   '; }
function stat(a) {
  if (!a.length) return 'n=0';
  return `n=${String(a.length).padStart(4)} med=${fmt(med(a))} p10=${fmt(pct(a, 0.10))} min=${fmt(Math.min(...a))} max=${fmt(Math.max(...a))}`;
}

// ---------- MMC 参考 ----------
const mmc = [];
const jf = path.join(DIR, 'joined.jsonl');
for (const line of fs.readFileSync(jf, 'utf8').split(/\r?\n/)) {
  if (!line) continue;
  const o = JSON.parse(line);
  const outH = parseFloat(o.outH);
  if (!Number.isFinite(outH)) continue;
  mmc.push({
    atkSprint: o.atkSprintTrue === 'true' || o.atkSprintTrue === true,
    vicSprint: o.self_sprinting === 'true' || o.self_sprinting === true,
    h: outH,
  });
}

// ---------- 本服实时 ----------
const live = [];
const rows = fs.readFileSync(LIVE, 'utf8').split(/\r?\n/).filter(Boolean);
for (let i = 1; i < rows.length; i++) {
  const c = rows[i].split(',');
  if (c.length < 26) continue;
  const ts = parseInt(c[0], 10);
  const h = parseFloat(c[24]);
  if (!Number.isFinite(h) || h <= 0) continue;
  live.push({
    ts,
    atkSprint: c[3] === 'true',
    atkExtra: c[4] === 'true',
    vicSprint: c[5] === 'true',
    ndt: parseInt(c[7], 10) || 0,
    h,
  });
}
const sinceBoot = parseInt(process.argv[2] || '0', 10);
const liveRecent = sinceBoot > 0 ? live.filter(r => r.ts >= sinceBoot) : live;

const groups = [
  ['攻击方不疾跑 + 受击方不疾跑', r => !r.atkSprint && !r.vicSprint],
  ['攻击方疾跑   + 受击方不疾跑', r => r.atkSprint && !r.vicSprint],
  ['攻击方不疾跑 + 受击方疾跑  ', r => !r.atkSprint && r.vicSprint],
  ['双方都疾跑(攻击方疾跑那一击)', r => r.atkSprint && r.vicSprint],
];

console.log('============ MMC 实测 (joined.jsonl) ============');
for (const [name, f] of groups) console.log(`${name}  ${stat(mmc.filter(f).map(r => r.h))}`);
console.log('\n============ 本服实时 (全部 ' + live.length + ' 条) ============');
for (const [name, f] of groups) console.log(`${name}  ${stat(live.filter(f).map(r => r.h))}`);
if (sinceBoot > 0) {
  console.log('\n============ 本服实时 (本次启动后 ' + liveRecent.length + ' 条) ============');
  for (const [name, f] of groups) console.log(`${name}  ${stat(liveRecent.filter(f).map(r => r.h))}`);
}

// ---------- 上限堆积 ----------
console.log('\n---- 0.9494 上限堆积比例 ----');
for (const [tag, arr] of [['MMC', mmc.map(r => r.h)], ['本服', live.map(r => r.h)]]) {
  const at = arr.filter(v => v > 0.94935).length;
  console.log(`${tag}: ${at}/${arr.length} = ${(100 * at / arr.length).toFixed(1)}%`);
}

// ---------- 无敌帧窗口命中 ----------
console.log('\n---- 本服 受击方无敌帧剩余 tick 分布 (ndt>0 表示处于无敌帧内) ----');
const buckets = [[0, 0], [1, 5], [6, 10], [11, 20], [21, 99]];
for (const [lo, hi] of buckets) {
  const arr = live.filter(r => r.ndt >= lo && r.ndt <= hi).map(r => r.h);
  console.log(`ndt ${String(lo).padStart(2)}-${String(hi).padStart(2)}  ${stat(arr)}`);
}

// ---------- 攻击方疾跑标记一致性 ----------
const mismatch = live.filter(r => r.atkSprint !== r.atkExtra);
console.log(`\n攻击方 sprint 标记与 extraKB 标记不一致: ${mismatch.length}/${live.length}`);
