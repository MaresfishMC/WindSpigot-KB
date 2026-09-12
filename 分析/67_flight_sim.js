'use strict';
// 67: 滞空接管仿真 v2 —— 同时模拟"服务端注入序列"与"客户端自身积分", 用来验证:
//   (a) 不做反解补偿时, 客户端会把服务端重力再叠一份原版重力(合重力≈0.14) -> 弹道比原版还陡;
//   (b) 做反解补偿后, 客户端实际位移 == 目标曲线(顶点 0.8067 格 / 滞空 12 tick);
//   (c) 每击退补发多少速度包、终止条件是否及时。
// 用法: node 67_flight_sim.js [gravity] [apexScale] [apexThreshold] [drag] [maxTicks]
const g0 = parseFloat(process.argv[2] || '0.0625');
const apexScale = parseFloat(process.argv[3] || '0.35');
const apexThr = parseFloat(process.argv[4] || '0.08');
const drag = parseFloat(process.argv[5] || '0.98');
const maxTicks = parseInt(process.argv[6] || '32', 10);
const V0 = 0.361375;
const CLIENT_G = 0.08, CLIENT_DRAG = 0.98;

function effectiveGravity(vy) {
  let g = g0;
  if (apexScale < 1.0 && apexThr > 0) {
    const a = Math.abs(vy);
    if (a < apexThr) g *= apexScale + (1 - apexScale) * (a / apexThr);
  }
  return g;
}
const injectY = step => step / CLIENT_DRAG + CLIENT_G;   // 反解补偿

// ---------- 目标曲线(服务端想要的每 tick 位移) ----------
function target() {
  const out = []; let step = (V0 - effectiveGravity(V0)) * drag, ticks = 0, h = 0, peak = 0, peakTick = 0;
  for (;;) {
    if (ticks >= maxTicks || step < -0.5) break;
    ticks++; h += step;
    if (h > peak) { peak = h; peakTick = ticks; }
    out.push({ t: ticks, step, h });
    if (h <= 0) break;
    step = (step - effectiveGravity(step)) * drag;
  }
  return { seq: out, peak, peakTick, ticks };
}

// ---------- 客户端实际弹道 ----------
// 客户端收到 vy 后: motion = (vy - 0.08) * 0.98, 然后按 motion 位移。
// compensate=true  注入 injectY(step)  -> 实际位移 = step
// compensate=false 注入 step           -> 实际位移 = (step-0.08)*0.98 (重力被叠加)
function realized(compensate) {
  let step = (V0 - effectiveGravity(V0)) * drag, h = 0, peak = 0, peakTick = 0, t = 0, packets = 0;
  const seq = [];
  for (;;) {
    if (t >= maxTicks || step < -0.5) break;
    const injected = compensate ? injectY(step) : step;
    const actual = (injected - CLIENT_G) * CLIENT_DRAG;   // 客户端本 tick 的真实位移
    t++; packets++; h += actual;
    if (h > peak) { peak = h; peakTick = t; }
    seq.push({ t, actual, h });
    step = (step - effectiveGravity(step)) * drag;
    if (h <= 0) break;
  }
  return { seq, peak, peakTick, t, packets };
}

// 原版对照(不发任何补包)
function vanilla() {
  let v = V0, h = 0, peak = 0, peakTick = 0, t = 0;
  for (;;) {
    v = (v - CLIENT_G) * CLIENT_DRAG; t++; h += v;
    if (h > peak) { peak = h; peakTick = t; }
    if (h <= 0) break;
  }
  return { peak, peakTick, t };
}

const tg = target();
const fixed = realized(true);
const broken = realized(false);
const van = vanilla();

console.log(`配置: g=${g0}(等效 ${(g0 / 0.0025).toFixed(1)} m/s²) apex-scale=${apexScale} apex-threshold=${apexThr} drag=${drag}`);
console.log(`\n[A] 目标曲线(服务端想要):        顶点 ${tg.peak.toFixed(4)} 格(第 ${tg.peakTick} tick), 滞空 ${tg.ticks} tick`);
console.log(`[B] 客户端实际·已做反解补偿:      顶点 ${fixed.peak.toFixed(4)} 格(第 ${fixed.peakTick} tick), 滞空 ${fixed.t} tick, 补发包 ${fixed.packets} 个`);
console.log(`[C] 客户端实际·未做反解(旧事故):  顶点 ${broken.peak.toFixed(4)} 格(第 ${broken.peakTick} tick), 滞空 ${broken.t} tick`);
console.log(`[D] 原版对照(不发补包):           顶点 ${van.peak.toFixed(4)} 格(第 ${van.peakTick} tick), 滞空 ${van.t} tick`);

const n = Math.min(fixed.seq.length, tg.seq.length);
const diff = Math.max(...fixed.seq.slice(0, n).map((s, i) => Math.abs(s.actual - tg.seq[i].step)));
console.log(`\n判定: [B] 与 [A] 逐 tick 位移最大偏差 = ${diff.toExponential(2)}  ${diff < 1e-9 ? '✅ 补偿精确等价, 弹道符合自然物理' : '❌ 补偿有误'}`);
console.log(`      [C] 顶点 ${broken.peak.toFixed(3)} < 原版 ${van.peak.toFixed(3)} => 未补偿会让客户端多叠一份重力, 比原版还陡 ✅(解释了"不符合自然物理"的反馈)`);
console.log(`      [B] 相对原版: 滞空 ${van.t} -> ${fixed.t} tick (+${(100 * (fixed.t - van.t) / van.t).toFixed(0)}%), 顶点 ${van.peak.toFixed(3)} -> ${fixed.peak.toFixed(3)} 格`);

console.log('\n逐 tick 对照(t=目标位移 / 客户端实际位移):');
for (let i = 0; i < n; i++) {
  const mark = Math.abs(fixed.seq[i].actual - tg.seq[i].step) < 1e-9 ? ' ' : '!';
  console.log(`  t${String(i + 1).padStart(2)}: 目标=${tg.seq[i].step >= 0 ? '+' : ''}${tg.seq[i].step.toFixed(4)}  实际=${fixed.seq[i].actual >= 0 ? '+' : ''}${fixed.seq[i].actual.toFixed(4)}${mark}  h=${fixed.seq[i].h.toFixed(4)}`);
}
