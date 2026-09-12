'use strict';
// 常驻服务端 + KB 诊断; 定期输出状态, 直到被显式停止
const { spawn } = require('child_process');
const fs = require('fs');
const DIR = 'F:\\open\\新服务器\\senven (2)';
const LOG = 'F:\\open\\新服务器\\PVP内核\\分析\\server_diag.log';
const log = fs.createWriteStream(LOG, { encoding: 'utf8' });
let buf = '', doneResolve, phase = 'boot';
const done = new Promise(r => (doneResolve = r));

const child = spawn('cmd.exe', ['/c', 'start (windspigot).bat'], { cwd: DIR, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
function onData(d) {
  log.write(d); buf += d; if (buf.length > 400000) buf = buf.slice(-200000);
  process.stdout.write(d);
  if (/Done \([\d.]+s\)! For help/.test(buf)) doneResolve();
}
child.stdout.on('data', onData); child.stderr.on('data', onData);
child.on('exit', c => { console.log(`\n[SERVER EXIT] code=${c}`); process.exit(0); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function send(cmd, wait) { child.stdin.write(cmd + '\n'); await sleep(wait || 800); }

(async () => {
  await Promise.race([done, sleep(300000)]);
  await sleep(2500); phase = 'ready';
  await send('kbprobe status', 1000);
  console.log('\n########## 诊断已就绪, 等待玩家进入 ##########');
  for (let i = 0; i < 240; i++) {          // 最多保活 2 小时
    await sleep(30000);
    await send('kbprobe status', 300);
  }
})();
