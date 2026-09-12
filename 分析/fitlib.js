'use strict';
// 几何分解: 已知双方坐标 ⇒ u_pos 精确; 已知 peer_yaw ⇒ u_yaw 精确
//   out = r*pre + k_b*u_pos + k_s*u_yaw*Sa + k_v*u_pos*Sv
const fs = require('fs');
const L = require('./lib');

function loadJsonl(p) {
  const rows = [];
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const o = JSON.parse(line);
    const n = k => Number(o[k]);
    const b = k => o[k] === 'true';
    const pre = [n('self_motion_x'), n('self_motion_z')];
    const out = [n('velocity_x'), n('velocity_z')];
    const dp = [n('self_x') - n('peer_x'), n('self_z') - n('peer_z')];   // 攻击者 -> 受击者
    const dpm = L.hypot2(dp[0], dp[1]);
    if (!Number.isFinite(dpm) || dpm < 1e-9) continue;
    const uPos = [dp[0] / dpm, dp[1] / dpm];
    const uYaw = L.lookDir(n('peer_yaw'));
    const toward = L.dot2(pre, uPos) > 0;      // 受击者朝攻击者运动
    rows.push({
      seq: n('seq'), epoch: n('epoch_ms'), pre, out, outH: L.hypot2(out[0], out[1]), outY: n('velocity_y'),
      preY: n('self_motion_y'), uPos, uYaw, toward,
      selfSprint: b('self_sprinting'), peerSprint: b('peer_sprinting'), onGround: b('self_on_ground'),
      keyFwd: b('self_key_forward'), kb: n('self_kb_level'), dist: n('peer_distance'),
      geoDist: dpm, yawErr: L.angBetween(uPos, uYaw),
      selfPing: n('self_ping'), peerPing: n('peer_ping'), tps: n('server_tps'),
    });
  }
  return rows;
}

/** 最小二乘: 解 A x = b (正规方程 + 高斯消元) */
function lstsq(A, b) {
  const n = A[0].length, m = A.length;
  const N = Array.from({ length: n }, () => new Float64Array(n + 1));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) N[j][k] += A[i][j] * A[i][k];
      N[j][n] += A[i][j] * b[i];
    }
  }
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(N[r][c]) > Math.abs(N[p][c])) p = r;
    const t = N[c]; N[c] = N[p]; N[p] = t;
    if (Math.abs(N[c][c]) < 1e-14) return null;
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = N[r][c] / N[c][c]; for (let k = c; k <= n; k++) N[r][k] -= f * N[c][k]; }
  }
  const x = [];
  for (let c = 0; c < n; c++) x.push(N[c][n] / N[c][c]);
  return x;
}

function design(rows, terms) {
  // terms: [{col: 1|-1, vec:'pre'|'uPos'|'uYaw'|'uPosV'|'uYawV',  gate: fn?}, ...]
  const A = [], b = [];
  for (const r of rows) {
    const cx = [], cz = [];
    for (const t of terms) {
      const g = t.gate ? (t.gate(r) ? 1 : 0) : 1;
      let v;
      if (t.vec === 'pre') v = r.pre;
      else if (t.vec === 'uPos') v = r.uPos;
      else if (t.vec === 'uYaw') v = r.uYaw;
      else if (t.vec === 'uPosV') v = [r.uPos[0] * g, r.uPos[1] * g];
      else if (t.vec === 'uYawV') v = [r.uYaw[0] * g, r.uYaw[1] * g];
      cx.push(g * v[0]); cz.push(g * v[1]);
    }
    A.push(cx); b.push(r.out[0]);
    A.push(cz); b.push(r.out[1]);
  }
  return { A, b };
}

function evaluate(rows, terms, x) {
  let sse = 0, sst = 0;
  const my = L.mean(rows.flatMap(r => [r.out[0], r.out[1]]));
  const res = [];
  for (const r of rows) {
    let px = 0, pz = 0;
    terms.forEach((t, i) => {
      const g = t.gate ? (t.gate(r) ? 1 : 0) : 1;
      let v = t.vec === 'pre' ? r.pre : t.vec === 'uPos' ? r.uPos : t.vec === 'uYaw' ? r.uYaw : null;
      if (t.vec === 'uPosV') v = [r.uPos[0] * g, r.uPos[1] * g];
      if (t.vec === 'uYawV') v = [r.uYaw[0] * g, r.uYaw[1] * g];
      if (t.vec !== 'uPosV' && t.vec !== 'uYawV') { v = [g * v[0], g * v[1]]; }
      px += x[i] * v[0]; pz += x[i] * v[1];
    });
    const dx = r.out[0] - px, dz = r.out[1] - pz;
    sse += dx * dx + dz * dz;
    sst += (r.out[0] - my) ** 2 + (r.out[1] - my) ** 2;
    res.push({ r, px, pz, err: Math.hypot(dx, dz) });
  }
  return { rmse: Math.sqrt(sse / (2 * rows.length)), r2: 1 - sse / sst, res };
}

function fit(rows, terms, label) {
  const { A, b } = design(rows, terms);
  const x = lstsq(A, b);
  if (!x) { console.log(label, '奇异'); return null; }
  const e = evaluate(rows, terms, x);
  const names = terms.map(t => t.name);
  console.log(`\n[拟合] ${label}  n=${rows.length}`);
  console.log('  ' + names.map((nm, i) => `${nm}=${L.fmt(x[i], 5)}`).join('  '));
  console.log(`  RMSE=${L.fmt(e.rmse, 5)}  R²=${L.fmt(e.r2, 5)}`);
  return { x, e, terms };
}

module.exports = { loadJsonl, lstsq, design, evaluate, fit, L };
