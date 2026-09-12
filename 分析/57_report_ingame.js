'use strict';
// 游戏内播报本轮监听结论(逐条, 避免单次 say 过长)。
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function exec(c) {
  return new Promise((resolve) => {
    const d = JSON.stringify({ command: c });
    const q = http.request({ host: '127.0.0.1', port: 8081, path: '/api/console/exec', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } },
      s => { let x = ''; s.on('data', k => x += k); s.on('end', () => resolve(x)); });
    q.on('error', e => resolve('ERR ' + e.message));
    q.write(d); q.end();
  });
}
(async () => {
  const msgs = [
    '§a§l【监听结果 · 本轮修复已验证】',
    '§7连续发包: §c29.9% §7-> §a0.0%',
    '§7水平上限堆积: §c66.2% §7-> §a0% §7(MMC 为 7.7%)',
    '§7无敌帧内命中 259 次: §a仅 1 次低击退 §7(不再有伤害无位移)',
    '§7W-Tap 语义: §a96% 的真 W-Tap 命中才吃疾跑加成',
    '§e新一轮监听已开启, 请继续对刀',
  ];
  for (const m of msgs) { await exec('say ' + m); await sleep(420); }
  console.log('播报完成 ' + msgs.length + ' 条');
})();
