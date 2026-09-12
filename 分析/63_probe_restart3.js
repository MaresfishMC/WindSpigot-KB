'use strict';
// 探针升级重启(合成测试命令): 播报 -> save-all -> stop
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function api(p, method, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port: 8081, path: '/api' + p, method: method || 'GET',
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
  for (const l of [
    '§c§l【重启通知 §7· §c诊断探针升级】',
    '§7新增合成自检: 不依赖第二名玩家也能校验引擎输出',
    '§e10 秒后重启, 重启后监听继续',
  ]) { await exec('say ' + l); await sleep(420); }
  for (const s of [5, 3, 2, 1]) { await sleep(1000); await exec('say §c' + s + ' ...'); }
  await exec('save-all');
  await sleep(1800);
  console.log('stop =>', await exec('stop'));
  await sleep(10000);
  console.log('已停服');
})();
