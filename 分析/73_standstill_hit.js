'use strict';
// 站定测试: 先播报要求, 等 N 秒让对方站住, 再施加一次带特征值的击退, 然后打印逐 tick 轨迹。
// 用法: node 73_standstill_hit.js <玩家> <垂直值> [等待秒数]
const http = require('http');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\traj.csv';
function exec(c) {
  return new Promise((resolve) => {
    const d = JSON.stringify({ command: c });
    const q = http.request({ host: '127.0.0.1', port: 8081, path: '/api/console/exec', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } },
      s => { let x = ''; s.on('data', k => x += k); s.on('end', () => resolve(x)); });
    q.on('error', e => resolve('ERR'));
    q.setTimeout(8000, () => { q.destroy(); resolve('TIMEOUT'); });
    q.write(d); q.end();
  });
}
const rows = () => { try { return fs.readFileSync(T, 'utf8').split(/\r?\n/).filter(Boolean).length; } catch (e) { return 0; } };

(async () => {
  const who = process.argv[2] || 'KBVictim';
  const vy = process.argv[3] || '0.361375';
  const wait = parseInt(process.argv[4] || '6', 10);

  await exec(`say §e[测试] §f${who} §e请§c站着不要动、不要跳§e, ${wait} 秒后施加击退`);
  await exec(`say §7(跳跃初速是 0.42, 击退初速是 ${vy}; 站着不动才能看出击退)`);
  const base = rows();
  await sleep(wait * 1000);
  await exec(`kbprobe hit ${who} 0.527375 ${vy} 0`);
  console.log(`已施加击退 ${who} vy=${vy}, traj 基线=${base}`);
  await sleep(2500);
  const raw = fs.readFileSync(T, 'utf8').split(/\r?\n/).filter(Boolean);
  const head = raw[0].split(',');
  const I = {}; head.forEach((h, i) => I[h] = i);
  const win = raw.slice(base).map(l => l.split(',')).filter(c => c.length === head.length);
  console.log('tick, y, dy, server_motY, onGround');
  for (const c of win) {
    console.log(`  t${String(c[I.tick]).padStart(2)}  y=${c[I.y]}  dy=${c[I.dy]}  motY=${c[I.mot_y]}  onGround=${c[I.on_ground]}`);
  }
  const dys = win.map(c => parseFloat(c[I.dy])).filter(Number.isFinite);
  if (dys.length) {
    const peak = Math.max(...win.map(c => parseFloat(c[I.y])));
    const start = parseFloat(win[0][I.y]);
    console.log(`\n顶点=${peak.toFixed(4)} 起点=${start.toFixed(4)} 升=${(peak - start).toFixed(4)} 格, 采样 ${dys.length} tick`);
    console.log(`首帧位移=${dys[0].toFixed(4)}  ${Math.abs(dys[0] - 0.42) < 0.01 ? '⚠ 0.42=跳跃, 说明对方在跳, 本次无效' : '✅ 不是跳跃初速, 是击退'}`);
  }
})();
