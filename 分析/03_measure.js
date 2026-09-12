'use strict';
// 精确冲量测量：先无偏估计动量保留 r，再按状态分组测量冲量模长
const L = require('./lib');

/** 无偏 r: r = Σ(pre·out)/Σ(pre·pre)  —— 不约束冲量方向，仅要求冲量与 pre 不相关 */
function rProjection(rows) {
  let num = 0, den = 0;
  for (const x of rows) {
    const p = [x.pre[0], x.pre[2]], o = [x.out[0], x.out[2]];
    num += L.dot2(p, o); den += L.dot2(p, p);
  }
  return num / den;
}

/** 分轴回归 r: out_x ~ r*pre_x, out_z ~ r*pre_z (pooled) */
function rPooled(rows) {
  const s = [];
  for (const x of rows) {
    if (Math.abs(x.pre[0]) > 1e-6) s.push(x.out[0] / x.pre[0]);
    if (Math.abs(x.pre[2]) > 1e-6) s.push(x.out[2] / x.pre[2]);
  }
  return { median: L.median(s), p25: L.quantile(s, .25), p75: L.quantile(s, .75), n: s.length, mean: L.mean(s) };
}

function gates(x, u) {
  // 受击方是否朝攻击者运动: pre · (victim->attacker = -u) > 0
  return L.dot2([x.pre[0], x.pre[2]], u) < 0;
}

function analyze(rows, label, uOf) {
  const ok = L.clean(rows);
  console.log(`\n================ ${label}  n=${ok.length}`);
  const rp = rProjection(ok), rq = rPooled(ok);
  console.log(`[r] 投影估计=${L.fmt(rp, 5)}   分轴中位=${L.fmt(rq.median, 5)} (p25 ${L.fmt(rq.p25, 3)} / p75 ${L.fmt(rq.p75, 3)}, n=${rq.n})`);

  for (const x of ok) {
    const u = uOf(x);
    x.u = u;
    x.imp = [x.out[0], x.out[2]];              // r≈0 假设下冲量 = 输出
    x.mag = x.outH;
    x.ang = L.angBetween(u, x.imp);
    x.toward = gates(x, u);
    x.preMag = L.hypot2(x.pre[0], x.pre[2]);
  }

  // |out| 与 |pre| 的相关性 —— 若 r=0 应无关
  const A = ok.map(x => x.mag), B = ok.map(x => x.preMag);
  const mA = L.mean(A), mB = L.mean(B);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < A.length; i++) { sxy += (A[i] - mA) * (B[i] - mB); sxx += (B[i] - mB) ** 2; syy += (A[i] - mA) ** 2; }
  console.log(`[验证] corr(|out|,|pre|) = ${L.fmt(sxy / Math.sqrt(sxx * syy), 4)}   (r=0 ⇒ 应≈0)`);

  const G = {};
  for (const x of ok) {
    const k = `${x.attackerSprint ? 'AS' : 'A-'}|${x.victimSprint ? 'VS' : 'V-'}|${x.onGround ? 'G' : 'Air'}|${x.toward ? 'T' : 'F'}`;
    (G[k] ||= []).push(x);
  }
  console.log('[冲量模长] group | n | median | p10 | p90 | sd | medAng(冲量 vs yaw) | medPre');
  for (const k of Object.keys(G).sort()) {
    const a = G[k];
    if (a.length < 3) continue;
    console.log(`  ${k.padEnd(22)} | ${String(a.length).padStart(4)} | ${L.fmt(L.median(a.map(x => x.mag)), 5)} | ${L.fmt(L.quantile(a.map(x => x.mag), .1), 4)} | ${L.fmt(L.quantile(a.map(x => x.mag), .9), 4)} | ${L.fmt(L.sd(a.map(x => x.mag)), 4)} | ${L.fmt(L.median(a.map(x => x.ang)), 2).padStart(6)} | ${L.fmt(L.median(a.map(x => x.preMag)), 3)}`);
  }

  // 汇总: 攻击者疾跑 / 受击者疾跑+朝攻击者 的边际效应
  const pick = f => ok.filter(f).map(x => x.mag);
  const m = a => (a.length >= 3 ? `${L.fmt(L.median(a), 5)} (n=${a.length})` : `n=${a.length} 太少`);
  console.log('[边际] A- V-          :', m(pick(x => !x.attackerSprint && !x.victimSprint)));
  console.log('[边际] A- V- T        :', m(pick(x => !x.attackerSprint && !x.victimSprint && x.toward)));
  console.log('[边际] AS V-          :', m(pick(x => x.attackerSprint && !x.victimSprint)));
  console.log('[边际] A- VS          :', m(pick(x => !x.attackerSprint && x.victimSprint)));
  console.log('[边际] A- VS T        :', m(pick(x => !x.attackerSprint && x.victimSprint && x.toward)));
  console.log('[边际] A- VS F        :', m(pick(x => !x.attackerSprint && x.victimSprint && !x.toward)));
  console.log('[边际] AS VS          :', m(pick(x => x.attackerSprint && x.victimSprint)));
  console.log('[边际] AS VS T        :', m(pick(x => x.attackerSprint && x.victimSprint && x.toward)));
  console.log('[边际] AS VS F        :', m(pick(x => x.attackerSprint && x.victimSprint && !x.toward)));
  console.log('[边际] AS V- T        :', m(pick(x => x.attackerSprint && !x.victimSprint && x.toward)));
  return { ok, rp };
}

const a = analyze(L.loadCsv(L.R1), '第一轮 player1为攻击方', x => L.lookDir(x.yaw));
const b = analyze(L.loadCsv(L.R2), '第二轮 player2为攻击方', x => L.lookDir(x.yaw));

// 硬上限检测：全体 |out| 的上尾部
const all = [...a.ok, ...b.ok].map(x => x.mag);
console.log('\n[硬上限] 全体 |out|: p90', L.fmt(L.quantile(all, .90), 5), 'p95', L.fmt(L.quantile(all, .95), 5),
  'p99', L.fmt(L.quantile(all, .99), 5), 'max', L.fmt(Math.max(...all), 5));
const hi = all.filter(v => v > 0.94);
console.log('[硬上限] >0.94 的样本数', hi.length, '其最大值', L.fmt(Math.max(...hi), 6), '中位', L.fmt(L.median(hi), 6));
