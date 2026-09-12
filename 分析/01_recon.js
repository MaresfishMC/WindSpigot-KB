'use strict';
// 侦察：定位受控段、统计各状态分布
const L = require('./lib');

function seg(rows, label) {
  const ok = L.clean(rows);
  console.log(`\n########## ${label}  总${rows.length} 可用${ok.length}`);
  console.log('index范围:', Math.min(...rows.map(r => r.index)), '~', Math.max(...rows.map(r => r.index)));

  // 状态交叉分布
  const tally = {};
  for (const r of ok) {
    const k = `A${r.attackerSprint ? 'S' : '-'} V${r.victimSprint ? 'S' : '-'} ${r.onGround ? 'G' : 'A'}`;
    tally[k] = (tally[k] || 0) + 1;
  }
  console.log('状态分布:', JSON.stringify(tally));

  // 按 100 个 index 分桶，看 attackerSprint / victimSprint 的连续段
  const buckets = {};
  for (const r of ok) {
    const b = Math.floor(r.index / 100) * 100;
    if (!buckets[b]) buckets[b] = { n: 0, aS: 0, vS: 0, g: 0, outH: [], outY: [] };
    const x = buckets[b];
    x.n++; if (r.attackerSprint) x.aS++; if (r.victimSprint) x.vS++; if (r.onGround) x.g++;
    x.outH.push(r.outH); x.outY.push(r.out[1]);
  }
  console.log('桶(index/100): n  aSprint%  vSprint%  ground%  medianOutH  medianOutY');
  for (const b of Object.keys(buckets).map(Number).sort((a, c) => a - c)) {
    const x = buckets[b];
    console.log(`  ${String(b).padStart(4)} : ${String(x.n).padStart(4)}  ${(100 * x.aS / x.n).toFixed(0).padStart(5)}%  ${(100 * x.vS / x.n).toFixed(0).padStart(5)}%  ${(100 * x.g / x.n).toFixed(0).padStart(5)}%  ${L.fmt(L.median(x.outH), 6)}  ${L.fmt(L.median(x.outY), 6)}`);
  }
  console.log('outY 全局:', 'median', L.fmt(L.median(ok.map(r => r.out[1])), 6), 'sd', L.fmt(L.sd(ok.map(r => r.out[1])), 6),
    'p01', L.fmt(L.quantile(ok.map(r => r.out[1]), 0.01), 6), 'p99', L.fmt(L.quantile(ok.map(r => r.out[1]), 0.99), 6));
  console.log('ping: victim', L.median(ok.map(r => r.victimPing)), 'attacker', L.median(ok.map(r => r.attackerPing)));
  console.log('gap ms: min', L.quantile(ok.map(r => r.gap).filter(v => v > 0), 0), 'p25', L.quantile(ok.map(r => r.gap).filter(v => v > 0), 0.25),
    'median', L.median(ok.map(r => r.gap).filter(v => v > 0)), 'p75', L.quantile(ok.map(r => r.gap).filter(v => v > 0), 0.75), 'max', Math.max(...ok.map(r => r.gap)));
  console.log('distance: p05', L.fmt(L.quantile(ok.map(r => r.distance), 0.05), 4), 'median', L.fmt(L.median(ok.map(r => r.distance)), 4), 'p95', L.fmt(L.quantile(ok.map(r => r.distance), 0.95), 4));
  console.log('trajTicks median', L.median(ok.map(r => r.trajTicks)), 'corrCount median', L.median(ok.map(r => r.corrCount)));
  return ok;
}

const r1 = seg(L.loadCsv(L.R1), '第一轮 player1为攻击方 (player2/.../123732)');
const r2 = seg(L.loadCsv(L.R2), '第二轮 player2为攻击方 (player1/.../130021)');
