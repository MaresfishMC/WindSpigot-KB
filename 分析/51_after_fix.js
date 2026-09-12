'use strict';
// 修复后复核: 按列名解析(兼容不同探针版本列布局), 分组对比 MMC, 并检查三项修复是否生效。
// 用法: node 51_after_fix.js [sinceTsMs]
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const LIVE = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\kb-log.csv';
const CAP = 0.9494, BASE = 0.527375, ATK_EXTRA = 0.4215, VIC_EXTRA = 0.3594;

const num = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : NaN; };
function med(a) { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
function pct(a, q) { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; }
const f4 = v => Number.isFinite(v) ? v.toFixed(4) : '  -   ';
function stat(a) { if (!a.length) return 'n=0'; return `n=${String(a.length).padStart(4)} med=${f4(med(a))} p10=${f4(pct(a, 0.10))} min=${f4(Math.min(...a))} max=${f4(Math.max(...a))}`; }

function loadCsv(file) {
  const raw = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  if (!raw.length) return [];
  const head = raw[0].split(',').map(s => s.trim());
  const ix = {}; head.forEach((h, i) => ix[h] = i);
  const out = [];
  for (let i = 1; i < raw.length; i++) {
    const c = raw[i].split(',');
    if (c.length !== head.length) continue;
    out.push({
      ts: parseInt(c[ix.ts_ms], 10),
      atk: c[ix.attacker], vic: c[ix.victim],
      atkSprint: c[ix.atk_sprint] === 'true',
      atkExtra: c[ix.atk_extra_kb] === 'true',
      vicSprint: c[ix.vic_sprint] === 'true',
      vicGround: c[ix.vic_ground] === 'true',
      ndt: parseInt(c[ix.vic_ndt], 10) || 0,
      h: num(c[ix.pkt_h]), vy: num(c[ix.pkt_y]), yaw: num(c[ix.atk_yaw]),
      dist: num(c[ix.dist]),
      preH: Math.hypot(num(c[ix.pre_x]), num(c[ix.pre_z])),
    });
  }
  return out;
}

function loadMmc() {
  const p = path.join(DIR, 'joined.jsonl');
  const out = [];
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line) continue;
    const o = JSON.parse(line);
    const h = parseFloat(o.outH);
    if (!Number.isFinite(h)) continue;
    out.push({ atkSprint: o.atkSprintTrue === 'true', vicSprint: o.self_sprinting === 'true', h });
  }
  return out;
}

const since = parseInt(process.argv[2] || '0', 10);
const all = loadCsv(LIVE);
const live = since > 0 ? all.filter(r => r.ts >= since) : all;
const mmc = loadMmc();

console.log(`本服样本: 全部 ${all.length} / 本次窗口 ${live.length}   (MMC 参考 ${mmc.length})`);
if (!live.length) { console.log('本次窗口暂无数据 —— 需要测试员上线对刀。'); process.exit(0); }

const groups = [
  ['攻击方不疾跑 + 受击方不疾跑', r => !r.atkSprint && !r.vicSprint],
  ['攻击方疾跑   + 受击方不疾跑', r => r.atkSprint && !r.vicSprint],
  ['攻击方不疾跑 + 受击方疾跑  ', r => !r.atkSprint && r.vicSprint],
  ['双方疾跑(W-Tap连击)        ', r => r.atkSprint && r.vicSprint],
];
const cmp = (tag, arr, key) => {
  console.log(`\n---- ${tag} ----`);
  for (const [name, f] of groups) {
    console.log(`  ${name}  MMC ${stat(arr.mmc.filter(f).map(key))}`);
    console.log(`  ${name}  本服 ${stat(arr.live.filter(f).map(key))}`);
  }
};
cmp('水平击退 |速度包|', { mmc, live }, r => r.h);

const atCap = a => a.filter(v => v > CAP - 0.00005).length;
console.log(`\n---- 水平上限 ${CAP} 堆积 ----`);
console.log(`  MMC : ${atCap(mmc.map(r => r.h))}/${mmc.length} = ${(100 * atCap(mmc.map(r => r.h)) / mmc.length).toFixed(1)}%`);
console.log(`  本服: ${atCap(live.map(r => r.h))}/${live.length} = ${(100 * atCap(live.map(r => r.h)) / live.length).toFixed(1)}%`);

console.log('\n---- 低击退尾巴 (应恢复 MMC 式相消) ----');
for (const t of [0.20, 0.35, 0.45, 0.527]) {
  const m = live.filter(r => r.h < t).length, n = mmc.filter(r => r.h < t).length;
  console.log(`  < ${t.toFixed(3)}: MMC ${(100 * n / mmc.length).toFixed(1)}%   本服 ${(100 * m / live.length).toFixed(1)}%`);
}

console.log('\n---- 垂直击退 (标定恒为 0.361375) ----');
const vy = live.map(r => r.vy).filter(Number.isFinite);
console.log(`  ${stat(vy)}  非 0.361375 的条数: ${vy.filter(v => Math.abs(v - 0.361375) > 1e-6).length}`);
const vyAtkSprint = live.filter(r => r.atkSprint).map(r => r.vy);
console.log(`  攻击方疾跑时的垂直: ${stat(vyAtkSprint)}  (应仍为 0.361375, W-Tap 不应加垂直)`);

console.log('\n---- 疾跑加成是否只挂在"真疾跑"那一击 ----');
console.log(`  攻击方 atkSprint 但非 extraKB 的命中(未 W-Tap 的续击): ${live.filter(r => r.atkSprint && !r.atkExtra).length}`);
console.log(`  攻击方非疾跑命中(应为基础值附近): ${live.filter(r => !r.atkSprint && !r.vicSprint).length}`);
const noExtra = live.filter(r => !r.atkSprint && !r.vicSprint).map(r => r.h);
if (noExtra.length) console.log(`  该组是否等于基础值 ${BASE}: 偏差最大 ${Math.max(...noExtra.map(v => Math.abs(v - BASE))).toExponential(2)}`);

console.log('\n---- 无敌帧窗口命中 (nokb 根因回归检查) ----');
for (const [lo, hi] of [[0, 0], [1, 5], [6, 10], [11, 20]]) {
  const a = live.filter(r => r.ndt >= lo && r.ndt <= hi).map(r => r.h);
  console.log(`  ndt ${String(lo).padStart(2)}-${String(hi).padStart(2)}  ${stat(a)}`);
}
const inIframe = live.filter(r => r.ndt > 0);
console.log(`  无敌帧内命中 ${inIframe.length} 条, 其中水平 < 0.45 的 ${inIframe.filter(r => r.h < 0.45).length} 条`);

// 理论值对照
console.log('\n---- 理论锚点 ----');
console.log(`  基础            = ${BASE}`);
console.log(`  基础+攻击疾跑    = ${(BASE + ATK_EXTRA).toFixed(6)}`);
console.log(`  基础+受击疾跑    = ${(BASE + VIC_EXTRA).toFixed(6)}`);
console.log(`  三者相加(旧行为) = ${(BASE + ATK_EXTRA + VIC_EXTRA).toFixed(6)} → 旧实现被钳到 ${CAP}`);
