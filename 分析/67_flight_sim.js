'use strict';
// 67: 客户端滞空接管逻辑仿真 —— 与 KnockbackEngine.tickClientFlight / effectiveGravity
// 逐行对应, 用于验证: 顶点高度 / 滞空 tick 数 / 每个击退会补发多少速度包 / 终止条件是否及时。
// 用法: node 67_flight_sim.js [gravity] [apexScale] [apexThreshold] [drag] [maxTicks]
const g0 = parseFloat(process.argv[2] || '0.0625');
const apexScale = parseFloat(process.argv[3] || '0.35');
const apexThr = parseFloat(process.argv[4] || '0.08');
const drag = parseFloat(process.argv[5] || '0.98');
const maxTicks = parseInt(process.argv[6] || '32', 10);
const V0 = 0.361375;

function effectiveGravity(vy) {
  let g = g0;
  if (apexScale < 1.0 && apexThr > 0) {
    const a = Math.abs(vy);
    if (a < apexThr) g *= apexScale + (1 - apexScale) * (a / apexThr);
  }
  return g;
}

// 接管循环: my 为服务端算出的竖直速度; 每 tick 补发一个速度包
let my = V0, ticks = 0, h = 0, peak = 0, peakTick = 0, packets = 0, stop = '';
const seq = [];
while (true) {
  if (ticks >= maxTicks) { stop = '超过 client-max-ticks'; break; }
  if (my < -0.5) { stop = '下坠已足够快(my<-0.5), 交回客户端'; break; }
  my = (my - effectiveGravity(my)) * drag;
  ticks++; packets++;
  h += my;
  if (h > peak) { peak = h; peakTick = ticks; }
  seq.push({ t: ticks, v: my, h });
  if (h <= 0) { stop = '落地(高度回到起点)'; break; }   // 服务端以 onGround 判定, 等效于此
}
console.log(`配置: g=${g0}(等效 ${(g0 / 0.0025).toFixed(1)} m/s²) apex-scale=${apexScale} apex-threshold=${apexThr} drag=${drag}`);
console.log(`初速 ${V0} → 顶点 ${peak.toFixed(4)} 格(第 ${peakTick} tick), 滞空 ${ticks} tick(${(ticks * 0.05).toFixed(2)}s)`);
console.log(`每次击退补发速度包: ${packets} 个 (上限 ${maxTicks})`);
console.log(`终止原因: ${stop}`);
console.log('\n逐 tick(前 8 / 后 4):');
const show = seq.length > 12 ? [...seq.slice(0, 8), { t: '...' }, ...seq.slice(-4)] : seq;
for (const s of show) {
  console.log(s.t === '...' ? '  ...' : `  t${String(s.t).padStart(2)}: v=${s.v >= 0 ? '+' : ''}${s.v.toFixed(4)}  h=${s.h.toFixed(4)}`);
}

// 对照: 不做接管(客户端原版重力)
let my2 = V0, t2 = 0, h2 = 0, peak2 = 0, peakTick2 = 0;
while (true) {
  my2 = (my2 - 0.08) * 0.98;
  t2++; h2 += my2;
  if (h2 > peak2) { peak2 = h2; peakTick2 = t2; }
  if (h2 <= 0) break;
}
console.log(`\n对照(不接管, 客户端原版重力): 顶点 ${peak2.toFixed(4)} 格(第 ${peakTick2} tick), 滞空 ${t2} tick`);
console.log(`=> 滞空 ${t2} -> ${ticks} tick (+${(100 * (ticks - t2) / t2).toFixed(0)}%), 顶点 ${peak2.toFixed(3)} -> ${peak.toFixed(3)} 格`);
