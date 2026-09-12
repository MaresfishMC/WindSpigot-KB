'use strict';
// 77: 定位"多次发包后卡在空中" —— 找出所有 >24 tick 的连续滞空段并逐 tick 打印位移,
// 判定是"连击持续抛飞"还是"悬停卡空"(dy≈0 却一直 onGround=false)。
const fs = require('fs');
const T = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\traj.csv';
const K = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\kb-log.csv';
const raw = fs.readFileSync(T, 'utf8').split(/\r?\n/).filter(Boolean);
const head = raw[0].split(',');
const I = {}; head.forEach((h, i) => I[h] = i);
const rows = raw.slice(1).map(l => l.split(',')).filter(c => c.length === head.length).map(c => ({
  ts: +c[I.ts_ms], vic: c[I.victim], tick: +c[I.tick],
  x: +c[I.x], y: +c[I.y], z: +c[I.z],
  dx: +c[I.dx], dy: +c[I.dy], dz: +c[I.dz], motY: +c[I.mot_y], g: c[I.on_ground] === 'true',
}));
const kbRaw = fs.readFileSync(K, 'utf8').split(/\r?\n/).filter(Boolean);
const kh = kbRaw[0].split(','); const KI = {}; kh.forEach((h, i) => KI[h] = i);
const hits = kbRaw.slice(1).map(l => l.split(',')).filter(c => c.length === kh.length).map(c => ({
  ts: +c[KI.ts_ms], atk: c[KI.attacker], vic: c[KI.victim], h: +c[KI.pkt_h], vy: +c[KI.pkt_y],
}));

const byVic = {};
for (const r of rows) (byVic[r.vic] = byVic[r.vic] || []).push(r);

let found = 0;
for (const [vic, arr] of Object.entries(byVic)) {
  arr.sort((a, b) => a.ts - b.ts);
  let i = 0;
  while (i < arr.length) {
    if (!arr[i].g) {
      let j = i; while (j < arr.length && !arr[j].g) j++;
      const seg = arr.slice(i, j);
      if (seg.length > 24) {
        found++;
        const startY = (arr[i - 1] || seg[0]).y;
        const peak = Math.max(...seg.map(s => s.y));
        const hover = seg.filter(s => Math.abs(s.dy) < 0.01).length;
        console.log(`\n=== 长滞空段 #${found}: ${vic}  ${new Date(seg[0].ts).toLocaleTimeString()}  ${seg.length} tick ===`);
        console.log(`  起点Y=${startY.toFixed(3)} 顶点Y=${peak.toFixed(3)} 升${(peak - startY).toFixed(3)}  |dy|<0.01 的 tick 数=${hover}`);
        const segHits = hits.filter(h => h.vic === vic && h.ts >= seg[0].ts - 300 && h.ts <= seg[seg.length - 1].ts + 300);
        console.log(`  期间命中 ${segHits.length} 次: ${segHits.map(h => `|v|=${h.h.toFixed(3)} vy=${h.vy.toFixed(3)}`).join('  ')}`);
        // 逐 tick(压缩: 只打前 6 与后 6, 中间若 dy 恒定则折叠)
        const showAll = seg.length <= 40;
        const list = showAll ? seg : [...seg.slice(0, 8), null, ...seg.slice(-8)];
        for (const s of list) {
          if (!s) { console.log('  ...'); continue; }
          console.log(`   t${String(s.tick).padStart(2)}  y=${s.y.toFixed(4)}  dy=${s.dy >= 0 ? '+' : ''}${s.dy.toFixed(4)}  dx=${s.dx.toFixed(3)}  motY=${s.motY.toFixed(4)}${Math.abs(s.dy) < 0.01 ? '  ← 悬停' : ''}`);
        }
      }
      i = j;
    } else i++;
  }
}
console.log(`\n共发现 ${found} 段 >24 tick 的滞空`);
