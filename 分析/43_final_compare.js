'use strict';
const fs = require('fs');
const L = require('F:\\open\\新服务器\\PVP内核\\分析\\lib.js');
function parse(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(s => s.trim());
  const head = lines[0].split(',');
  return lines.slice(1).map(l => {
    const c = l.split(','); const o = {}; head.forEach((h, i) => o[h] = c[i]);
    const n = k => Number(o[k]); const b = k => o[k] === 'true';
    const r = { ts: n('ts_ms'), atk: o.attacker, vic: o.victim, aS: b('atk_sprint'), aX: b('atk_extra_kb'),
      vS: b('vic_sprint'), gnd: b('vic_ground'), ndt: n('vic_ndt'), lastDmg: n('vic_last_dmg'),
      pktH: n('pkt_h'), pktY: n('pkt_y'), yaw: n('atk_yaw'), pre: [n('pre_x'), n('pre_y'), n('pre_z')],
      ax: n('atk_x'), az: n('atk_z'), vx: n('vic_x'), vz: n('vic_z') };
    const dp = [r.vx - r.ax, r.vz - r.az]; r.geo = Math.hypot(dp[0], dp[1]);
    r.ang = r.geo > 1e-9 ? L.angBetween([dp[0]/r.geo, dp[1]/r.geo], L.lookDir(r.yaw)) : NaN;
    r.angAbs = Math.abs(r.ang);
    r.atkEff = r.aS || r.aX;
    return r;
  });
}
const after = parse('F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\kb-log.csv');
const before = parse('F:\\open\\新服务器\\PVP内核\\分析\\kb-log_修复前.csv');
const LEV = [['双方都不疾跑', 0.527375], ['仅受击方疾跑', 0.886775], ['仅攻击方疾跑', 0.948875], ['双方疾跑(上限)', 0.949400]];

console.log(`修复后样本 ${after.length} 条 | 修复前基线 ${before.length} 条\n`);
console.log('=== 一、四个标定档位是否被精确复现(修复后) ===');
for (const [name, v] of LEV) {
  const hit = after.filter(r => Math.abs(r.pktH - v) < 0.002);
  console.log(`  ${name.padEnd(14)} 期望 ${L.fmt(v,6)}  实测 ${String(hit.length).padStart(4)} 条`);
}
const mid = after.filter(r => !LEV.some(([, v]) => Math.abs(r.pktH - v) < 0.002));
console.log(`  矢量合成中间值 ${mid.length} 条, 范围 ${L.fmt(Math.min(...mid.map(r=>r.pktH)),4)} ~ ${L.fmt(Math.max(...mid.map(r=>r.pktH)),4)}`);

console.log('\n=== 二、核心指标: 近乎无击退 (|速度包| < 0.45) ===');
const bBad = before.filter(r => r.pktH < 0.45), aBad = after.filter(r => r.pktH < 0.45);
console.log(`  修复前 ${bBad.length}/${before.length} (${L.fmt(100*bBad.length/before.length,2)}%)  最低 ${L.fmt(Math.min(...before.map(r=>r.pktH)),4)}`);
console.log(`  修复后 ${aBad.length}/${after.length} (${L.fmt(100*aBad.length/after.length,2)}%)  最低 ${L.fmt(Math.min(...after.map(r=>r.pktH)),4)}`);

console.log('\n=== 三、夹角 >90° 时(相消高发区) ===');
for (const [tag, rows] of [['修复前', before], ['修复后', after]]) {
  const w = rows.filter(r => r.angAbs > 90);
  const bad = w.filter(r => r.pktH < 0.45);
  console.log(`  ${tag}: ${String(w.length).padStart(3)} 条  <0.45 的 ${bad.length} 条  |pkt| 中位 ${L.fmt(L.median(w.map(r=>r.pktH)),4)}  最低 ${L.fmt(Math.min(...w.map(r=>r.pktH)),4)}`);
}

console.log('\n=== 四、夹角 → |速度包| 曲线(修复前后) ===');
console.log('  夹角区间      修复前 中位(最低)        修复后 中位(最低)        理论(修复前)  理论(修复后)');
const base = 0.527375, sp = 0.4215;
function theoOld(d) { const c = Math.cos(d*Math.PI/180); return Math.min(Math.sqrt(base*base+sp*sp+2*base*sp*c), 0.9494); }
function theoNew(d) { const c = Math.cos(d*Math.PI/180);
  let hx = sp, hz = 0; if (c < 0) { hx = sp - c*sp; hz = sp*Math.sqrt(1-c*c); }   // 去掉反向分量
  return Math.min(Math.sqrt((base+hx)**2 + hz*hz), 0.9494); }
for (const [lo, hi] of [[0,30],[30,60],[60,90],[90,120],[120,150],[150,181]]) {
  const sel = r => r.angAbs >= lo && r.angAbs < hi;
  const b = before.filter(sel), a = after.filter(sel);
  const f = (rows) => rows.length ? `${L.fmt(L.median(rows.map(r=>r.pktH)),4)}(${L.fmt(Math.min(...rows.map(r=>r.pktH)),4)})` : '   -   ';
  const d = (lo + Math.min(hi, 180)) / 2;
  console.log(`  [${String(lo).padStart(3)},${String(hi).padStart(3)})°  n=${String(b.length).padStart(3)}/${String(a.length).padStart(3)}  ${f(b).padEnd(20)} ${f(a).padEnd(20)} ${L.fmt(theoOld(d),4)}        ${L.fmt(theoNew(d),4)}`);
}

console.log('\n=== 五、其它不变量 ===');
const yv = {}; for (const r of after) { const t = r.pktY.toFixed(6); yv[t] = (yv[t]||0)+1; }
console.log('  垂直分量:', Object.entries(yv).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([v,n])=>`${v}×${n}`).join('  '));
const b2 = after.filter(r => !r.atkEff && !r.vS);
if (b2.length) {
  const pm = b2.map(r => Math.hypot(r.pre[0], r.pre[2]));
  console.log(`  无疾跑组 n=${b2.length}  |pre| ${L.fmt(Math.min(...pm),3)}~${L.fmt(Math.max(...pm),3)}  |pkt| 唯一值 ${[...new Set(b2.map(r=>r.pktH.toFixed(6)))].join(',')}`);
}

console.log('\n=== 六、新列: 受击者无敌帧 (vic_ndt) 分布 —— 查短间隔命中 ===');
const nd = after.map(r => r.ndt);
const h = {}; for (const v of nd) { const k = Math.floor(v/5)*5; h[k] = (h[k]||0)+1; }
console.log('  vic_ndt 直方(5 一档):', Object.entries(h).sort((a,b)=>a[0]-b[0]).map(([k,n])=>`${k}:${n}`).join(' '));
console.log(`  vic_ndt >= 11 的(理论上应被无敌帧吞掉): ${after.filter(r=>r.ndt>10).length} 条`);
console.log(`  vic_ndt <= 10 的(正常可命中窗口): ${after.filter(r=>r.ndt<=10).length} 条`);
const inter = []; const byV = {};
for (const r of after) (byV[r.vic] ||= []).push(r);
for (const v of Object.keys(byV)) { const t = byV[v].sort((a,b)=>a.ts-b.ts); for (let i=1;i<t.length;i++) inter.push(t[i].ts-t[i-1].ts); }
if (inter.length) {
  const short = inter.filter(g => g < 490);
  console.log(`  打击间隔 n=${inter.length} 中位 ${L.median(inter)}ms  <490ms 的 ${short.length} 条 (${L.fmt(100*short.length/inter.length,1)}%)  最短 ${Math.min(...inter)}ms`);
  const shortOld = []; const byVo = {};
  for (const r of before) (byVo[r.vic] ||= []).push(r);
  for (const v of Object.keys(byVo)) { const t = byVo[v].sort((a,b)=>a.ts-b.ts); for (let i=1;i<t.length;i++) shortOld.push(t[i].ts-t[i-1].ts); }
  const so = shortOld.filter(g => g < 490);
  console.log(`  修复前对照: n=${shortOld.length}  <490ms 的 ${so.length} 条 (${L.fmt(100*so.length/shortOld.length,1)}%)`);
}
