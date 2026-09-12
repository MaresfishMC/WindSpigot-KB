'use strict';
const fs = require('fs');
const L = require('./lib');
const rows = fs.readFileSync('F:\\open\\新服务器\\PVP内核\\分析\\joined.jsonl', 'utf8').split('\n').filter(s => s.trim()).map(JSON.parse);
for (const x of rows) {
  x.mag = x.outH; x.Sa = x.atkSprintTrue ? 1 : 0; x.Ss = x.selfSprint ? 1 : 0;
  x.theta = Math.abs(L.angBetween(x.uPos, L.lookDir(Number(x.peer_yaw))));
  x.gnd = x.self_on_ground === 'true';
  x.preMag = Math.hypot(Number(x.self_motion_x), Number(x.self_motion_z));
  x.preToward = -L.dot2([Number(x.self_motion_x), Number(x.self_motion_z)], x.uPos);
  x.ok = x.outY > 0.3613 && x.geoDist <= 3.6 && x.atkSprintTrue !== null;
}
const C = rows.filter(x => x.ok);
const md = a => L.median(a.map(x => x.mag));
console.log('=== 空中 vs 地面 (全部可用样本, θ<12°) ===');
for (const [lab, f] of [['Sa0Ss0', x => !x.Sa && !x.Ss], ['Sa1Ss0', x => x.Sa && !x.Ss], ['Sa0Ss1', x => !x.Sa && x.Ss], ['Sa1Ss1', x => x.Sa && x.Ss], ['全部', () => true]]) {
  const a = C.filter(x => Math.abs(x.theta) < 12 && f(x));
  const g = a.filter(x => x.gnd), ai = a.filter(x => !x.gnd);
  console.log(`  ${lab.padEnd(7)} 地面 n=${String(g.length).padStart(4)} med=${g.length ? L.fmt(md(g), 4) : '-'}   空中 n=${String(ai.length).padStart(3)} med=${ai.length >= 3 ? L.fmt(md(ai), 4) : '-'}`);
}
console.log('\n=== 基准段 |out| 与 |pre| 独立性 (动量=0 验证) ===');
const ctrl = C.filter(x => !x.Sa && !x.Ss && x.gnd && x.theta < 12);
console.log('  n=' + ctrl.length, ' |pre| 范围', L.fmt(Math.min(...ctrl.map(x => x.preMag)), 3), '~', L.fmt(Math.max(...ctrl.map(x => x.preMag)), 3),
  ' |out| sd=', L.fmt(L.sd(ctrl.map(x => x.mag)), 5));
const A = ctrl.map(x => x.preMag), B = ctrl.map(x => x.mag);
const mA = L.mean(A), mB = L.mean(B);
let sxy = 0, sxx = 0, syy = 0;
for (let i = 0; i < A.length; i++) { sxy += (A[i] - mA) * (B[i] - mB); sxx += (A[i] - mA) ** 2; syy += (B[i] - mB) ** 2; }
console.log('  corr(|pre|,|out|) =', L.fmt(sxy / Math.sqrt(sxx * syy), 4));
console.log('\n=== 受击方疾跑加成是否依赖朝向(正确符号: preToward>0 = 朝攻击者) ===');
const vs = C.filter(x => !x.Sa && x.Ss && x.gnd && Math.abs(x.theta) < 12);
const tw = vs.filter(x => x.preToward > 0), aw = vs.filter(x => x.preToward <= 0);
console.log(`  朝攻击者 n=${tw.length} med=${L.fmt(md(tw), 4)}  背离 n=${aw.length} med=${L.fmt(md(aw), 4)}`);
console.log('\n=== 上限再确认 ===');
const hi = C.filter(x => x.mag > 0.945);
console.log('  max =', L.fmt(Math.max(...C.map(x => x.mag)), 6), ' >0.945:', hi.length, '/', C.length);
const sa1ss1 = C.filter(x => x.Sa && x.Ss && x.gnd);
console.log('  Sa1Ss1 地面 n=' + sa1ss1.length, ' med=' + L.fmt(md(sa1ss1), 4), ' >0.945 占比 ' + L.fmt(100 * sa1ss1.filter(x => x.mag > 0.945).length / sa1ss1.length, 1) + '%');
console.log('  Sa1Ss1 但在 >0.945 以下者的 theta 中位:', L.fmt(L.median(sa1ss1.filter(x => x.mag <= 0.945).map(x => x.theta)), 2), '°');
console.log('  Sa1Ss1 且 >0.945 者的 theta 中位:', L.fmt(L.median(sa1ss1.filter(x => x.mag > 0.945).map(x => x.theta)), 2), '°');
