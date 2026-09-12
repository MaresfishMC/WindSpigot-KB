'use strict';
// 3 分钟实时监听: 边收边判, 重点验证"防相消"修复是否生效
const fs = require('fs');
const L = require('F:\\open\\新服务器\\PVP内核\\分析\\lib.js');
const CSV = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\kb-log.csv';
const OLD = 'F:\\open\\新服务器\\PVP内核\\分析\\kb-log_修复前.csv';
const DUR = Number(process.argv[2] || 180) * 1000;

function parse(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(s => s.trim());
  if (lines.length < 2) return [];
  const head = lines[0].split(',');
  return lines.slice(1).map(l => {
    const c = l.split(','); const o = {}; head.forEach((h, i) => o[h] = c[i]);
    const n = k => Number(o[k]); const b = k => o[k] === 'true';
    const r = { ts: n('ts_ms'), atk: o.attacker, vic: o.victim,
      aS: b('atk_sprint'), aX: b('atk_extra_kb'), vS: b('vic_sprint'),
      pktH: n('pkt_h'), yaw: n('atk_yaw'),
      ax: n('atk_x'), az: n('atk_z'), vx: n('vic_x'), vz: n('vic_z') };
    const dp = [r.vx - r.ax, r.vz - r.az]; r.geo = Math.hypot(dp[0], dp[1]);
    r.ang = r.geo > 1e-9 ? Math.abs(L.angBetween([dp[0]/r.geo, dp[1]/r.geo], L.lookDir(r.yaw))) : NaN;
    r.atkEff = r.aS || r.aX;        // 引擎判定口径
    return r;
  });
}
const LEV = { '0.5274': 0.527375, '0.8868': 0.886775, '0.9488': 0.948875, '0.9494': 0.949400 };
function tally(rows) {
  const t = { base: 0, vic: 0, atk: 0, both: 0, mid: 0, nokb: 0 };
  for (const r of rows) {
    const v = r.pktH;
    if (Math.abs(v - 0.9494) < 0.002) t.both++;
    else if (Math.abs(v - 0.886775) < 0.002) t.vic++;
    else if (Math.abs(v - 0.948875) < 0.002) t.atk++;
    else if (Math.abs(v - 0.527375) < 0.002) t.base++;
    else t.mid++;
    if (v < 0.45) t.nokb++;
  }
  return t;
}
function wideStats(rows) {
  const w = rows.filter(r => r.ang > 90);
  const bad = w.filter(r => r.pktH < 0.45);
  return { n: w.length, bad: bad.length, med: w.length ? L.median(w.map(r => r.pktH)) : NaN,
           minv: w.length ? Math.min(...w.map(r => r.pktH)) : NaN };
}

const before = parse(OLD), bT = tally(before), bW = wideStats(before);
console.log('══════════ 修复前基线 (653 条, 归档数据) ══════════');
console.log(`  档位: 基础 ${bT.base} / 仅受击方疾跑 ${bT.vic} / 仅攻击方疾跑 ${bT.atk} / 双疾跑 ${bT.both} / 中间值 ${bT.mid}`);
console.log(`  ⚠ 近乎无击退(|pkt|<0.45): ${bT.nokb} 条 (${L.fmt(100*bT.nokb/before.length,1)}%)`);
console.log(`  夹角>90° 的样本: ${bW.n} 条, 其中 <0.45 的 ${bW.bad} 条, |pkt| 中位 ${L.fmt(bW.med,4)}, 最低 ${L.fmt(bW.minv,4)}`);

console.log('\n══════════ 实时监听开始 (3 分钟) ══════════');
let last = parse(CSV).length;
let t0 = Date.now(), tick = 0;
const timer = setInterval(() => {
  tick++;
  const rows = parse(CSV);
  const t = tally(rows), w = wideStats(rows);
  const el = ((Date.now() - t0) / 1000).toFixed(0);
  const newOnes = rows.length - last; last = rows.length;
  const extraKb = rows.filter(r => r.aX && !r.aS).length;
  console.log(`[${String(el).padStart(3)}s] 样本 ${String(rows.length).padStart(4)} (+${newOnes})  `
    + `| 基础 ${t.base} 仅受击 ${t.vic} 仅攻击 ${t.atk} 双疾跑 ${t.both} 中间 ${t.mid} `
    + `| ⚠nokb ${t.nokb} | >90°样本 ${w.n} (其中<0.45: ${w.bad}) | extraKB标记 ${extraKb}`);

  if (Date.now() - t0 >= DUR) {
    clearInterval(timer);
    console.log('\n══════════ 监听结束 · 结果对账 ══════════');
    const rows2 = parse(CSV), t2 = tally(rows2), w2 = wideStats(rows2);
    console.log(`  本次采集 ${rows2.length} 条`);
    console.log(`  档位分布: 基础 ${t2.base} / 仅受击方疾跑 ${t2.vic} / 仅攻击方疾跑 ${t2.atk} / 双疾跑 ${t2.both} / 中间值 ${t2.mid}`);
    console.log(`  ⚠ 近乎无击退(|pkt|<0.45): 修复前 ${bT.nokb}/${before.length}  →  修复后 ${t2.nokb}/${rows2.length}`);
    console.log(`  夹角>90°: 修复前 ${bW.n} 条(其中 ${bW.bad} 条<0.45, 最低 ${L.fmt(bW.minv,4)})`);
    console.log(`             修复后 ${w2.n} 条(其中 ${w2.bad} 条<0.45, 最低 ${L.fmt(w2.minv,4)})`);
    fs.writeFileSync('F:\\open\\新服务器\\PVP内核\\分析\\_live_rows.json', JSON.stringify(rows2));
    process.exit(0);
  }
}, 15000);
