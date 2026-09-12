'use strict';
// 常驻服务端(修复版): 不再轮询控制台(避免异步派发告警刷日志), 只负责保活
const { spawn } = require('child_process');
const fs = require('fs');
const DIR = 'F:\\open\\新服务器\\senven (2)';
const LOG = 'F:\\open\\新服务器\\PVP内核\\分析\\server_fixed.log';
const log = fs.createWriteStream(LOG, { encoding: 'utf8' });
let buf = '';
const child = spawn('cmd.exe', ['/c', 'start (windspigot).bat'], { cwd: DIR, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
function onData(d) {
  log.write(d); buf += d; if (buf.length > 200000) buf = buf.slice(-100000);
  process.stdout.write(d);
}
child.stdout.on('data', onData); child.stderr.on('data', onData);
child.on('exit', c => { console.log(`\n[SERVER EXIT] code=${c}`); log.end(); process.exit(0); });
console.log(`启动: start (windspigot).bat  cwd=${DIR}`);
setInterval(() => { }, 1 << 30);   // 保活
