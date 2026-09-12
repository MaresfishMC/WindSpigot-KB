'use strict';
// 内核更新重启: 播报本轮两项修复 -> save-all -> stop
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
    '§c§l【修复 · 内核更新重启】',
    '§a已修 §7多次攻击时的 nokb §8-> 夹角>150°的合成击退 min 0.106 -> 0.527(不再近乎零)',
    '§a已修 §7负数kb §8-> 贴脸/同格命中不再"零击退", 按原版重掷随机方向',
    '§e约 12 秒后自动重启, 重启后监听继续, 请继续对刀',
  ]) { await exec('say ' + l); await sleep(440); }
  for (const s of [5, 3, 2, 1]) { await sleep(1000); await exec('say §c' + s + ' ...'); }
  await exec('save-all');
  await sleep(1800);
  console.log('stop =>', await exec('stop'));
  await sleep(10000);
  console.log('已停服');
})();
