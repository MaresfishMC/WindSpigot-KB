'use strict';
// 修复版重启: 播报本次三项修复 -> 倒计时 -> 保存 -> 停服 (由外层脚本随后拉起新核心)
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
  const lines = [
    '§c§l【击退修复 · 重启通知】',
    '§a修复1 §7无敌帧吞击退 §8(有伤害数字却几乎不位移)',
    '§a修复2 §7W-Tap 连击击退过大 §8(疾跑加成曾挂到每一击上)',
    '§a修复3 §7恢复 MMC 相消 §8(取消"防相消"带来的整体放大)',
    '§e20 秒后重启, 重启后自动开始 3 分钟监听采样',
    '§7请稍后重连并继续对刀, 谢谢!',
  ];
  for (const l of lines) { await exec('say ' + l); await sleep(400); }
  for (const [d, s] of [[5000, 10], [1000, 5], [1000, 3], [1000, 2], [1000, 1]]) {
    await sleep(d);
    await exec('say §c重启倒计时 ' + s + ' ...');
  }
  await exec('say §6正在保存并重启...');
  await exec('save-all');
  await sleep(2500);
  console.log('stop =>', await exec('stop'));
  await sleep(11000);
  console.log('已停服');
})();
