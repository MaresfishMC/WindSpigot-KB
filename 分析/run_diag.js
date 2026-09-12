'use strict';
// 常驻: 启动服务端并保持运行, 收集 KB 诊断数据
const { spawn } = require('child_process');
const fs = require('fs');
const DIR = 'F:\\open\\新服务器\\senven (2)';
const LOG = 'F:\\open\\新服务器\\PVP内核\\分析\\server_diag.log';
const log = fs.createWriteStream(LOG, { encoding: 'utf8' });
let buf = '', doneResolve;
const done = new Promise(r => (doneResolve = r));
const child = spawn('cmd.exe', ['/c', 'start (windspigot).bat'], { cwd: DIR, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
function onData(d) {
  log.write(d); buf += d; if (buf.length > 400000) buf = buf.slice(-200000);
  if (phase === 'boot' || /KBProbe|joined the game|left the game|Done \(|ERROR|Stopping/i.test(d)) process.stdout.write(d);
  if (/Done \([\d.]+s\)! For help/.test(buf)) doneResolve();
}
let phase = 'boot';
child.stdout.on('data', onData); child.stderr.on('data', onData);
child.on('exit', c => { console.log(`\n[退出] code=${c}`); process.exit(0); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function send(cmd, wait = 1000) { console.log(`\n>>> ${cmd}`); child.stdin.write(cmd + '\n'); await sleep(wait); }
(async () => {
  await Promise.race([done, sleep(240000)]);
  await sleep(2500); phase = 'ready';
  await send('kbprobe status', 1200);
  console.log('\n===== 诊断就绪: 等待玩家进入并互相攻击 =====');
  // 每 30 秒报一次进度
  for (let i = 0; i < 60; i++) {
    await sleep(30000);
    child.stdin.write('kbprobe status\n');
  }
})();
