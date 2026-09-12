'use strict';
// 通知测试员: 已回滚, 请重新测试击退
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function exec(c) {
  return new Promise((resolve) => {
    const d = JSON.stringify({ command: c });
    const q = http.request({ host: '127.0.0.1', port: 8081, path: '/api/console/exec', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } },
      s => { let x = ''; s.on('data', k => x += k); s.on('end', () => resolve(x)); });
    q.on('error', e => resolve('ERR'));
    q.write(d); q.end();
  });
}
(async () => {
  const msgs = [
    '§a§l【已回滚 · 击退已恢复正常】',
    '§7原因: 我为"垂直动画"加的滞空接管把水平冲量覆盖成了客户端自身残速',
    '§7现已整体关闭(滞空接管 + 自定义重力 + 顶点过渡全部停用)',
    '§a当前击退 = 标定值原样: 水平 0.5274 / 疾跑 0.9489 / 垂直 0.3614',
    '§e请再对打两下确认手感已恢复, 谢谢!',
  ];
  for (const m of msgs) { await exec('say ' + m); await sleep(420); }
  console.log('已播报回滚通知');
})();
