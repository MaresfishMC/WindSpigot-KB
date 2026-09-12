'use strict';
// 终局标定: 用攻击方疾跑真值 + 严格对齐, 确定 base / 攻击方疾跑加成 / 受击方疾跑加成 / 上限
const fs = require('fs');
const L = require('./lib');

const rows = fs.readFileSync('F:\\open\\新服务器\\PVP内核\\分析\\joined.jsonl', 'utf8').split('\n').filter(s => s.trim()).map(JSON.parse);
for (const x of rows) {
  x.mag = x.outH;
  x.Sa = x.atkSprintTrue ? 1 : 0;
  x.Ss = x.selfSprint ? 1 : 0;
  x.theta = Math.abs(L.angBetween(x.uPos, L.lookDir(Number(x.peer_yaw))));
  x.gnd = x.self_on_ground === 'true';
  x.ok = x.outY > 0.3613 && x.geoDist <= 3.6 && x.atkSprintTrue !== null;
}
const C = rows.filter(x => x.ok);
const T = C.filter(x => x.theta < 8);   // 严格对齐 ⇒ |out| ≈ 各分量之和
console.log('可用', C.length, ' 严格对齐', T.length);

const g = (f, d = T) => d.filter(f);
const med = a => L.median(a.map(x => x.mag));

console.log('\n================ 地面 (θ<8°) ================');
const G = T.filter(x => x.gnd);
console.log('  Sa0 Ss0 :', L.fmt(med(g(x => !x.Sa && !x.Ss, G), G), 6), ' n=' + g(x => !x.Sa && !x.Ss, G).length);
console.log('  Sa1 Ss0 :', L.fmt(med(g(x => x.Sa && !x.Ss, G), G), 6), ' n=' + g(x => x.Sa && !x.Ss, G).length);
console.log('  Sa0 Ss1 :', L.fmt(med(g(x => !x.Sa && x.Ss, G), G), 6), ' n=' + g(x => !x.Sa && x.Ss, G).length);
console.log('  Sa1 Ss1 :', L.fmt(med(g(x => x.Sa && x.Ss, G), G), 6), ' n=' + g(x => x.Sa && x.Ss, G).length);

// 精确基础值: 取 Sa0Ss0 且 θ<3° 的众数
const b0 = G.filter(x => !x.Sa && !x.Ss && x.theta < 3);
const h = {}; for (const x of b0) { const k = x.mag.toFixed(6); h[k] = (h[k] || 0) + 1; }
console.log('\n  基准精确值(θ<3°, n=' + b0.length + ') 众数 TOP:');
console.log('   ', Object.entries(h).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}x${n}`).join('  '));
console.log('   |out|*8000 众数:', Object.entries(b0.map(x => Math.round(x.mag * 8000)).reduce((a, v) => (a[v] = (a[v] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).slice(0, 5));

// 上限: Sa1Ss1 的上尾
const hiAll = C.filter(x => x.mag > 0.945);
console.log('\n================ 上限 ================');
console.log('  >0.945 样本:', hiAll.length, '/', C.length, ' max =', L.fmt(Math.max(...C.map(x => x.mag)), 6));
const hh = {}; for (const x of hiAll) { const k = x.mag.toFixed(4); hh[k] = (hh[k] || 0) + 1; }
console.log('  上尾众数:', Object.entries(hh).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}x${n}`).join('  '));
const sa1ss1 = G.filter(x => x.Sa && x.Ss);
console.log('  Sa1Ss1 中 >0.945 占比:', L.fmt(100 * sa1ss1.filter(x => x.mag > 0.945).length / sa1ss1.length, 1) + '%');

// 由锚点反解
const b = med(g(x => !x.Sa && !x.Ss, G));
const bsa = med(g(x => x.Sa && !x.Ss, G));
const bss = med(g(x => !x.Sa && x.Ss, G));
console.log('\n================ 反解 ================');
console.log('  base            =', L.fmt(b, 6));
console.log('  攻击方疾跑加成  =', L.fmt(bsa - b, 6), '(沿攻击者 yaw)');
console.log('  受击方疾跑加成  =', L.fmt(bss - b, 6), '(沿位置方向)');
console.log('  两者之和        =', L.fmt(b + (bsa - b) + (bss - b), 6), ' ⇒ 若 > 上限 则被钳制');

console.log('\n================ 空中/地面 ================');
const Air = T.filter(x => !x.gnd);
console.log('  空中 n =', Air.length);
console.log('  Sa1Ss1 空中:', L.fmt(med(x => x.Sa && x.Ss, Air), 5), 'n=' + Air.filter(x => x.Sa && x.Ss).length);
console.log('  Sa1Ss1 地面:', L.fmt(med(x => x.Sa && x.Ss, G), 5));
console.log('  Sa0Ss0 空中:', L.fmt(med(x => !x.Sa && !x.Ss, Air), 5), 'n=' + Air.filter(x => !x.Sa && !x.Ss).length);
console.log('  全部空中中位:', L.fmt(med(() => true, Air), 5));

console.log('\n================ 垂直 ================');
const vy = rows.filter(x => x.outY > 0.3613).map(x => x.outY);
console.log('  正常包 outY 唯一值:', [...new Set(vy.map(v => v.toFixed(6)))].slice(0, 6), ' (n=' + vy.length + ')');
console.log('  *8000 =', 0.361375 * 8000);
console.log('  异常包数:', rows.filter(x => x.outY < 0.3613).length, ' 其距离:', rows.filter(x => x.outY < 0.3613).map(x => x.geoDist.toFixed(1)).join(' '));

console.log('\n================ 动量 ================');
const ctrl = G.filter(x => !x.Sa && !x.Ss);
const pm = ctrl.map(x => L.hypot2(Number(x.self_motion_x), Number(x.self_motion_z)));
console.log('  基准段 |pre| 范围', L.fmt(Math.min(...pm), 3), '~', L.fmt(Math.max(...pm), 3), '  |out| sd =', L.fmt(L.sd(ctrl.map(x => x.mag)), 5));
console.log('  ⇒ |out| 与 |pre| 无关 ⇒ 水平动量保留 = 0');
