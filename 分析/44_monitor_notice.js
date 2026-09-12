'use strict';
// 游戏内广播: 监听开始 / 结束
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function exec(cmd) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ command: cmd });
    const req = http.request({ host: '127.0.0.1', port: 8081, path: '/api/console/exec', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      res => { let s = ''; res.on('data', c => s += c); res.on('end', () => resolve(s)); });
    req.on('error', e => resolve('ERR ' + e.message));
    req.setTimeout(5000, () => { req.destroy(); resolve('TIMEOUT'); });
    req.write(data); req.end();
  });
}
const kind = process.argv[2] || 'start';
const lines = {
  start: [
    '§8§m-----------------------------',
    '§a§l【击退诊断 · 监听已开始】',
    '§e现在开始 §f3 分钟 §e实时采样, 请正常对刀',
    '§7重点: §f多打 W-tap §7与 §f大角度甩击 §7, 每档打二三十下',
    '§8§m-----------------------------',
  ],
  end: [
    '§8§m-----------------------------',
    '§c§l【击退诊断 · 监听已结束】',
    '§e本段采样完成, 数据正在分析中',
    '§7可继续对刀, 但不再计入本轮统计',
    '§8§m-----------------------------',
  ],
}[kind];
(async () => {
  for (const l of lines) { await exec('say ' + l); await sleep(400); }
  console.log(kind + ' 广播完成');
})();
