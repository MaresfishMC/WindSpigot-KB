'use strict';
// 重力/顶点丝滑过渡上线重启
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
    '§c§l【手感调整 · 重启通知】',
    '§a顶点丝滑 §7击退到最高点不再"一步砸下", 改为平滑悬停过渡',
    '§a滞空更久 §7击退后重力 = MMC 等效 25 m/s²(原版 32), 滞空约 +40%',
    '§7方便 jump tap / 空中 360 转圈等花式操作',
    '§e约 12 秒后自动重启, 重启后可直接测试手感',
  ]) { await exec('say ' + l); await sleep(430); }
  for (const s of [5, 3, 2, 1]) { await sleep(1000); await exec('say §c' + s + ' ...'); }
  await exec('save-all');
  await sleep(1800);
  console.log('stop =>', await exec('stop'));
  await sleep(10000);
  console.log('已停服');
})();
