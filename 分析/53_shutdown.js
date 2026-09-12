'use strict';
// 优雅关服: save-all -> stop
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
  if (players.length) {
    await exec('say §c§l【服务器关闭】 §7管理员正在关闭服务端, 感谢测试!');
    await sleep(600);
  }
  console.log('save-all =>', await exec('save-all'));
  await sleep(2500);
  console.log('stop =>', await exec('stop'));
  await sleep(9000);
  console.log('关服指令已下发');
})();
