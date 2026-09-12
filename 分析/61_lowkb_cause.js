'use strict';
// 61: "多次攻击时 nokb" 定位 —— 列出低击退命中, 按标记组合与"攻击方朝向 vs 攻击方→受击方夹角"归因。
// 夹角接近/超过 90 度时, 沿朝向施加的疾跑加成会与沿位置方向的基础击退相消, 合成值可以掉到 0.1 附近。
const fs = require('fs');
const K = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\kb-log.csv';
const raw = fs.readFileSync(K, 'utf8').split(/\r?\n/).filter(Boolean);
const head = raw[0].split(',');
const I = {}; head.forEach((h, i) => I[h] = i);
const BASE = 0.527375, ATK = 0.4215, VIC = 0.3594;
const rows = raw.slice(1 + parseInt(process.argv[2] || '0', 10)).map(l => l.split(',')).filter(c => c.length === head.length).map(c => {
  const ax = +c[I.atk_x], az = +c[I.atk_z], vx = +c[I.vic_x], vz = +c[I.vic_z];
  const yaw = +c[I.atk_yaw];
  // 攻击方朝向单位向量(MC: yaw 0 = +Z, 90 = -X)
  const rad = yaw * Math.PI / 180;
  const fx = -Math.sin(rad), fz = Math.cos(rad);
  let dx = vx - ax, dz = vz - az;
  const d = Math.hypot(dx, dz) || 1e-9;
  dx /= d; dz /= d;
  const cosang = fx * dx + fz * dz;
  return {
    ts: +c[I.ts_ms], atk: c[I.attacker], vic: c[I.victim],
    atkS: c[I.atk_sprint] === 'true', atkE: c[I.atk_extra_kb] === 'true',
    vicS: c[I.vic_sprint] === 'true', ndt: +c[I.vic_ndt],
    h: +c[I.pkt_h], cosang, ang: Math.acos(Math.max(-1, Math.min(1, cosang))) * 180 / Math.PI,
  };
});

const dist = [0, 15, 30, 45, 60, 90, 120, 150, 181];
const bucketOf = a => dist.findIndex((lo, i) => i < dist.length - 1 && a >= lo && a < dist[i + 1]);
console.log('按"攻击方朝向 vs 攻击方→受击方"夹角分组(仅攻击方疾跑命中):');
console.log('  夹角区间      n     |v| med   |v| min   低于0.45');
const atkRows = rows.filter(r => r.atkS);
for (let i = 0; i < dist.length - 1; i++) {
  const a = atkRows.filter(r => bucketOf(r.ang) === i);
  if (!a.length) { console.log(`  [${String(dist[i]).padStart(3)},${String(dist[i + 1]).padStart(3)})  n=0`); continue; }
  const hs = a.map(r => r.h).sort((x, y) => x - y);
  console.log(`  [${String(dist[i]).padStart(3)},${String(dist[i + 1]).padStart(3)})  ${String(a.length).padStart(4)}   ${hs[hs.length >> 1].toFixed(4)}    ${hs[0].toFixed(4)}    ${hs.filter(v => v < 0.45).length}`);
}

console.log('\n低击退命中(<0.60)明细, 按出现顺序:');
const low = rows.filter(r => r.h < 0.60);
console.log(`  共 ${low.length}/${rows.length} (${(100 * low.length / rows.length).toFixed(1)}%)`);
const now = Date.now();
for (const r of low.slice(-25)) {
  console.log(`  ${new Date(r.ts).toLocaleTimeString()} ${r.atk}->${r.vic} |v|=${r.h.toFixed(4)} atkS=${r.atkS ? 'T' : 'F'} atkE=${r.atkE ? 'T' : 'F'} vicS=${r.vicS ? 'T' : 'F'} ndt=${String(r.ndt).padStart(2)} 夹角=${r.ang.toFixed(0)}°`);
}

console.log('\n低击退命中的标记构成:');
const combos = [
  ['仅攻击方疾跑(几何相消)', r => r.atkS && !r.vicS],
  ['双方疾跑(几何相消)', r => r.atkS && r.vicS],
  ['仅受击方疾跑', r => !r.atkS && r.vicS],
  ['双不疾跑(基础值 0.5274)', r => !r.atkS && !r.vicS],
];
for (const [n, f] of combos) {
  const a = low.filter(f);
  console.log(`  ${n.padEnd(26)} ${String(a.length).padStart(3)}  ${a.length ? '占低击退 ' + (100 * a.length / low.length).toFixed(0) + '%' : ''}`);
}
console.log('\n判定: 若低击退集中在"攻击方疾跑 + 夹角>90°", 则是沿朝向的加成与位置方向基础击退相消所致。');
