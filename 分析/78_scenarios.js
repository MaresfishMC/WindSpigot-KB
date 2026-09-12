'use strict';
// 78: 场景矩阵自动测试 —— 在对局内用真实伤害路径覆盖多种攻击/受击状态, 并逐项判定。
// 场景: 地面不疾跑 / 地面疾跑 / 空中被击 / 双连击 / 受击方跳跃中
const http = require('http');
const fs = require('fs');
const DIR = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\';
const K = DIR + 'kb-log.csv', T = DIR + 'traj.csv';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function exec(c) {
  return new Promise((resolve) => {
    const d = JSON.stringify({ command: c });
    const q = http.request({ host: '127.0.0.1', port: 8081, path: '/api/console/exec', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } },
      s => { let x = ''; s.on('data', k => x += k); s.on('end', () => resolve(x)); });
    q.on('error', () => resolve('ERR')); q.setTimeout(8000, () => { q.destroy(); resolve('TO'); });
    q.write(d); q.end();
  });
}
const rows = f => { try { return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean); } catch (e) { return []; } };
function loadKb() {
  const raw = rows(K); if (raw.length < 2) return [];
  const h = raw[0].split(','); const I = {}; h.forEach((x, i) => I[x] = i);
  return raw.slice(1).map(l => l.split(',')).filter(c => c.length === h.length).map(c => ({
    ts: +c[I.ts_ms], atk: c[I.attacker], vic: c[I.victim], h: +c[I.pkt_h], vy: +c[I.pkt_y],
    atkS: c[I.atk_sprint] === 'true', vicG: c[I.vic_ground] === 'true', ndt: +c[I.vic_ndt],
    dist: +c[I.dist], cancelled: c[I.cancelled] === 'true',
  }));
}
function loadTraj() {
  const raw = rows(T); if (raw.length < 2) return [];
  const h = raw[0].split(','); const I = {}; h.forEach((x, i) => I[x] = i);
  return raw.slice(1).map(l => l.split(',')).filter(c => c.length === h.length).map(c => ({
    ts: +c[I.ts_ms], vic: c[I.victim], tick: +c[I.tick], y: +c[I.y], x: +c[I.x], z: +c[I.z],
    dy: +c[I.dy], dx: +c[I.dx], dz: +c[I.dz], g: c[I.on_ground] === 'true',
  }));
}
const BASE = 0.527375, SPRINT = 0.948875, VY = 0.361375;

async function scenario(name, cmds, victim, expect) {
  const k0 = loadKb().length, t0 = loadTraj().length;
  for (const c of cmds) { await exec(c); await sleep(350); }
  await sleep(2600);
  const kb = loadKb().slice(k0);
  const tr = loadTraj().slice(t0).filter(r => r.vic === victim);
  const hs = kb.map(r => r.h);
  const vys = kb.map(r => r.vy);
  const seg = tr.filter(r => !r.g);
  const apex = seg.length ? Math.max(...seg.map(s => s.y)) : NaN;
  const start = tr.length ? tr[0].y : NaN;
  // 只看"飞行中段"的悬停(起飞首帧与落地前后 onGround 上报有延迟, 不算)
  const mid = seg.slice(2, Math.max(2, seg.length - 2));
  const hover = mid.filter(s => Math.abs(s.dy) < 0.0005 && Math.abs(s.dx) < 0.0005 && Math.abs(s.dz) < 0.0005).length;
  const v = [];
  v.push(`命中 ${kb.length} 条 |v|=[${hs.map(x => x.toFixed(4)).join(', ')}] vy=[${vys.map(x => x.toFixed(4)).join(', ')}]`);
  if (seg.length) v.push(`实机: 滞空 ${seg.length} tick, 顶点升 ${(apex - start).toFixed(3)} 格, 悬停tick ${hover}`);
  const bad = [];
  if (kb.some(r => r.cancelled)) bad.push('事件被取消');
  if (vys.some(y => Math.abs(y - VY) > 1e-6)) bad.push('垂直非 0.361375');
  const minExp = expect === SPRINT ? BASE - 0.005 : expect - 0.005;   // 疾跑组受朝向几何影响, 只要求 >= 基础值
  if (expect && !hs.some(h => h >= minExp - 0.005 && h <= expect + 0.005)) bad.push(`数值超出 [${minExp.toFixed(4)}, ${expect}] 期望区间`);
  if (hover > 1) bad.push(`飞行中段悬停 ${hover} tick(疑似卡空)`);
  console.log(`\n【${name}】`);
  v.forEach(x => console.log('  ' + x));
  console.log(bad.length ? `  ❌ ${bad.join(' / ')}` : '  ✅ 通过');
  return { name, ok: bad.length === 0, bad };
}

(async () => {
  const A = 'KBV1', B = 'KBV2';
  const results = [];
  results.push(await scenario('场景1 地面 · 攻击方不疾跑', [
    `kbprobe attack ${A} ${B} 1`,
  ], B, BASE));
  results.push(await scenario('场景2 地面 · 攻击方疾跑', [
    `kbprobe attack ${A} ${B} 1 on`,
  ], B, SPRINT));
  results.push(await scenario('场景3 双连击(两次攻击包)', [
    `kbprobe attack ${A} ${B} 2`,
  ], B, BASE));
  results.push(await scenario('场景4 受击方跳跃中被击(先起跳 0.42)', [
    `kbprobe hit ${B} 0 0.42 0`,
    `kbprobe attack ${A} ${B} 1`,
  ], B, BASE));
  results.push(await scenario('场景5 受击方下落中被击', [
    `tp ${B} 605.29 11 1166.51`,
    `kbprobe attack ${A} ${B} 1`,
  ], B, BASE));

  console.log('\n================ 汇总 ================');
  for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.ok ? '' : '  -> ' + r.bad.join(' / ')}`);
  console.log(`通过 ${results.filter(r => r.ok).length}/${results.length}`);
})();
