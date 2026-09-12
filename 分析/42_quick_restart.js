'use strict';
// 简短关服提示 -> 保存 -> 停服
const http = require('http');
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
const exec = c => api('/console/exec', 'POST', { command: c });
(async () => {
  const on = await api('/online');
  let players = []; try { players = JSON.parse(on); } catch (e) { }
  console.log('在线:', players.map(p => p.username).join(', ') || '(空)');
  const lines = [
    '§c§l【重 启 通 知】',
    '§e15 秒后重启服务端, 重新开始击退诊断采样',
    '§7(开发人员误操作, 本次为干净重启)',
    '§7重启约 5 秒, 请稍后重连并继续对刀',
  ];
  for (const l of lines) { await exec('say ' + l); await sleep(350); }
  for (const s of [10, 5, 3, 2, 1]) {
    await sleep(s === 10 ? 5000 : 1000);
    await exec('say §c' + s + '...');
  }
  await exec('say §6正在保存并重启...');
  await exec('save-all');
  await sleep(2500);
  console.log('stop =>', await exec('stop'));
  await sleep(11000);
  console.log('已停服');
})();
