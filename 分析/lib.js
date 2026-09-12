'use strict';
// mmckb 拟合公共库：CSV 读取 / 向量工具 / 稳健统计
const fs = require('fs');

const R1 = 'F:\\open\\数据\\testtt\\player2\\20260830-123732\\samples.csv';       // 第一轮: player1(12345mmmm) 为攻击方, player2(Flandre_qwp) 为受击方
const R2 = 'F:\\open\\数据\\testtt\\player1\\20260830-130021\\20260830-130021\\samples.csv'; // 第二轮: player2(Flandre_qwp) 为攻击方, player1(12345mmmm) 为受击方

function loadCsv(path) {
  const txt = fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const lines = txt.split(/\r?\n/).filter(l => l.trim().length > 0);
  const head = lines[0].split(',');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    const o = {};
    for (let j = 0; j < head.length; j++) o[head[j]] = c[j];
    const num = k => (o[k] === undefined || o[k] === '' ? NaN : Number(o[k]));
    const bool = k => o[k] === 'true';
    rows.push({
      index: num('index'),
      epoch: num('epoch_ms'),
      tag: o.tag,
      hurt: bool('hurt_confirmed'),
      hurtAge: num('hurt_age_ms'),
      gap: num('previous_gap_ms'),
      victim: o.target,
      victimPing: num('target_ping'),
      tps: num('server_tps'),
      onGround: bool('on_ground'),
      victimSprint: bool('target_sprinting'),
      blocking: bool('blocking'),
      pre: [num('pre_x'), num('pre_y'), num('pre_z')],
      out: [num('out_x'), num('out_y'), num('out_z')],
      outH: num('out_horizontal'),
      attacker: o.attacker,
      attackerPing: num('attacker_ping'),
      attackerSprint: bool('attacker_sprinting'),
      cps1: num('observed_cps_1s'),
      cps2: num('observed_cps_2s'),
      kbLevel: num('kb_level'),
      distance: num('distance'),
      yaw: num('attacker_yaw'),
      swingAge: num('last_swing_age_ms'),
      corrCount: num('correction_count'),
      trajTicks: num('trajectory_ticks'),
    });
  }
  return rows;
}

// ---- 向量工具（MC yaw: 0=+Z(南), 90=-X(西)）----
const D2R = Math.PI / 180;
function lookDir(yawDeg) {           // 攻击者视线方向 = 引擎 sprint/附魔击退方向
  const r = yawDeg * D2R;
  return [-Math.sin(r), Math.cos(r)];
}
function hypot2(x, z) { return Math.sqrt(x * x + z * z); }
function dot2(a, b) { return a[0] * b[0] + a[1] * b[1]; }
function sub2(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
function scale2(a, s) { return [a[0] * s, a[1] * s]; }
function norm2(a) { const m = hypot2(a[0], a[1]); return m < 1e-12 ? [0, 0] : [a[0] / m, a[1] / m]; }
/** 带符号夹角(度): from a to b, 逆时针为正 */
function angBetween(a, b) {
  const na = norm2(a), nb = norm2(b);
  const c = Math.max(-1, Math.min(1, dot2(na, nb)));
  const s = na[0] * nb[1] - na[1] * nb[0];
  return Math.atan2(s, c) / D2R;
}

// ---- 稳健统计 ----
function sorted(a) { return a.slice().sort((x, y) => x - y); }
function median(a) { if (!a.length) return NaN; const s = sorted(a); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
function quantile(a, q) { if (!a.length) return NaN; const s = sorted(a); const p = (s.length - 1) * q; const lo = Math.floor(p), hi = Math.ceil(p); return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (p - lo); }
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function sd(a) { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1)); }
function mad(a) { const m = median(a); return median(a.map(v => Math.abs(v - m))); }
function fmt(x, n = 4) { return Number.isFinite(x) ? x.toFixed(n) : String(x); }

// ---- 取样过滤：保留可信的近战速度包 ----
function clean(rows) {
  return rows.filter(r =>
    r.hurt === true &&
    Number.isFinite(r.yaw) &&
    Number.isFinite(r.outH) &&
    r.kbLevel === 0 &&
    r.blocking === false &&
    Number.isFinite(r.pre[0]) && Number.isFinite(r.pre[2]) &&
    Number.isFinite(r.out[0]) && Number.isFinite(r.out[2])
  );
}

module.exports = { R1, R2, loadCsv, lookDir, hypot2, dot2, sub2, scale2, norm2, angBetween, median, quantile, mean, sd, mad, fmt, clean, sorted };
