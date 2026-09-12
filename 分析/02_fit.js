'use strict';
// 动量保留 r 与击退冲量 k 的联合拟合
// 模型(与核心引擎 KnockbackEngine 同构):
//   out_xz = r * pre_xz + k * u           u = 冲量方向(单位向量)
//   out_y  = rv * pre_y + kY              (再被 vertical-limit 钳制)
const L = require('./lib');

/** 全样本联合最小二乘: out = r*pre + k*u  (2N 方程, 2 未知数) */
function fitRK(rows, uOf) {
  let s_pp = 0, s_pu = 0, s_uu = 0, s_po = 0, s_uo = 0;
  for (const r of rows) {
    const u = uOf(r);
    const p = [r.pre[0], r.pre[2]], o = [r.out[0], r.out[2]];
    s_pp += L.dot2(p, p);
    s_pu += L.dot2(p, u);
    s_uu += L.dot2(u, u);
    s_po += L.dot2(p, o);
    s_uo += L.dot2(u, o);
  }
  const det = s_pp * s_uu - s_pu * s_pu;
  if (Math.abs(det) < 1e-12) return { r: NaN, k: NaN };
  return { r: (s_po * s_uu - s_uo * s_pu) / det, k: (s_pp * s_uo - s_pu * s_po) / det };
}

/** 垂直动量保留: out_y = rv*pre_y + kY (只在未被钳制的样本上可辨识) */
function fitVertical(rows) {
  let n = 0, s_x = 0, s_y = 0, s_xx = 0, s_xy = 0;
  for (const r of rows) {
    n++; s_x += r.pre[1]; s_y += r.out[1]; s_xx += r.pre[1] * r.pre[1]; s_xy += r.pre[1] * r.out[1];
  }
  const det = n * s_xx - s_x * s_x;
  if (Math.abs(det) < 1e-12) return { rv: NaN, kY: NaN, n };
  return { rv: (n * s_xy - s_x * s_y) / det, kY: (s_xx * s_y - s_x * s_xy) / det, n };
}

const uYaw = r => L.lookDir(r.yaw);

function groupKey(r) {
  return `${r.attackerSprint ? 'AS' : 'A-'} ${r.victimSprint ? 'VS' : 'V-'} ${r.onGround ? 'G' : 'Air'}`;
}

function report(rows, label) {
  const ok = L.clean(rows);
  console.log(`\n================ ${label} (n=${ok.length})`);

  // ---- 1. 动量保留 ----
  const g = fitRK(ok, uYaw);
  console.log(`[动量] 全体联合拟合  r=${L.fmt(g.r, 5)}  k=${L.fmt(g.k, 5)}`);
  const perp = [];
  for (const r of ok) {
    const u = L.lookDir(r.yaw), n = [-u[1], u[0]];
    const pn = L.dot2([r.pre[0], r.pre[2]], n), on = L.dot2([r.out[0], r.out[2]], n);
    if (Math.abs(pn) > 0.03) perp.push(on / pn);
  }
  console.log(`[动量] 垂直分量估计 r(median)=${L.fmt(L.median(perp), 5)}  n=${perp.length}  p25=${L.fmt(L.quantile(perp, .25), 4)}  p75=${L.fmt(L.quantile(perp, .75), 4)}`);

  // ---- 2. 垂直 ----
  const vy = fitVertical(ok);
  console.log(`[垂直] out_y = ${L.fmt(vy.rv, 4)}*pre_y + ${L.fmt(vy.kY, 6)}   (n=${vy.n})`);
  console.log(`[垂直] out_y: median=${L.fmt(L.median(ok.map(r => r.out[1])), 6)} sd=${L.fmt(L.sd(ok.map(r => r.out[1])), 6)} 唯一值=${new Set(ok.map(r => r.out[1].toFixed(6))).size}`);

  // ---- 3. 去掉动量后的冲量 ----
  const r = g.r;
  for (const x of ok) {
    const u = L.lookDir(x.yaw);
    x.imp = [x.out[0] - r * x.pre[0], x.out[2] - r * x.pre[2]];
    x.impMag = L.hypot2(x.imp[0], x.imp[1]);
    x.ang = L.angBetween(u, x.imp);                 // 冲量与攻击者视线夹角
    x.toward = L.dot2([x.pre[0], x.pre[2]], u) < 0; // 受击方正朝攻击者运动(pre·yaw<0)
  }

  const groups = {};
  for (const x of ok) (groups[groupKey(x)] ||= []).push(x);
  console.log('[冲量] 分组: key | n | medImpMag | p05 | p95 | medAng | medOutH');
  for (const k of Object.keys(groups).sort()) {
    const a = groups[k];
    if (a.length < 3) { console.log(`  ${k.padEnd(16)} | ${String(a.length).padStart(4)} | (样本过少)`); continue; }
    console.log(`  ${k.padEnd(16)} | ${String(a.length).padStart(4)} | ${L.fmt(L.median(a.map(x => x.impMag)), 5)} | ${L.fmt(L.quantile(a.map(x => x.impMag), .05), 4)} | ${L.fmt(L.quantile(a.map(x => x.impMag), .95), 4)} | ${L.fmt(L.median(a.map(x => x.ang)), 2)} | ${L.fmt(L.median(a.map(x => x.outH)), 5)}`);
  }

  // ---- 4. 受击方方向门控 ----
  const sub = groups['A- V- G'] || [];
  if (sub.length >= 6) {
    const toward = sub.filter(x => x.toward).map(x => x.impMag);
    const away = sub.filter(x => !x.toward).map(x => x.impMag);
    console.log(`[基础] 无疾跑段: 朝攻击者 ${L.fmt(L.median(toward), 5)}(n=${toward.length}) / 背离 ${L.fmt(L.median(away), 5)}(n=${away.length})`);
  }
  return { ok, groups, r, g };
}

const r1 = report(L.loadCsv(L.R1), '第一轮 player1为攻击方');
const r2 = report(L.loadCsv(L.R2), '第二轮 player2为攻击方');
module.exports = { fitRK, fitVertical };
