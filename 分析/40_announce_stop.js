'use strict';
// 关服前: 先在游戏内广播提示, 再优雅停服
const http = require('http');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function api(path, method, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port: 8081, path: '/api' + path, method: method || 'GET',
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} },
      res => { let s = ''; res.on('data', c => s += c); res.on('end', () => resolve(s)); });
    req.on('error', e => resolve('ERR ' + e.message));
    req.setTimeout(6000, () => { req.destroy(); resolve('TIMEOUT'); });
    if (data) req.write(data);
    req.end();
  });
}
function exec(cmd) { return api('/console/exec', 'POST', { command: cmd }); }

(async () => {
  const online = await api('/online');
  console.log('在线:', online);
  let players = [];
  try { players = JSON.parse(online); } catch (e) { }
  if (!players.length) { console.log('无人在线, 直接停服'); }
  else {
    const warn = [
      '§c§l【服务器维护通知】',
      '§e将在 §c45秒 §e后重启, 以应用击退引擎修复',
      '§7修复内容: 疾跑加成与基础击退反向相消导致的 "打中却不击退"',
      '§7请打完当前这一局, 重启约 5 秒即可重连',
    ];
    for (const line of warn) { await exec('say ' + line); await sleep(400); }

    const marks = [[30, '§e30秒后重启...'], [20, '§e20秒...'], [10, '§c10秒...'],
                   [5, '§c5...'], [4, '§c4...'], [3, '§c3...'], [2, '§c2...'], [1, '§c1...']];
    for (const [sec, msg] of marks) {
      const elapsed = 45 - sec;
      await sleep(Math.max(500, (sec === 30 ? 15000 - 10000 : 0) + 1000));
      await exec('say ' + msg);
    }
    await exec('say §6正在保存并重启...');
    await exec('save-all');
    await sleep(3000);
  }
  console.log('下发 stop');
  console.log(await exec('stop'));
  await sleep(12000);
  console.log('完成');
})();
