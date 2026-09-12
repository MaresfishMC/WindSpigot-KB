'use strict';
// 查询 /ping 指令归属
const { spawn } = require('child_process');
const fs = require('fs');
const DIR = 'F:\\open\\新服务器\\senven (2)';
const LOG = 'F:\\open\\新服务器\\PVP内核\\分析\\server_help.log';
const log = fs.createWriteStream(LOG, { encoding: 'utf8' });
let buf = '', doneResolve;
const done = new Promise(r => (doneResolve = r));
const child = spawn('cmd.exe', ['/c', 'start (windspigot).bat'], { cwd: DIR, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
function onData(d) {
  log.write(d); buf += d; if (buf.length > 300000) buf = buf.slice(-150000);
  if (/Done \(|ping|PING|Plugins|插件/i.test(d)) process.stdout.write(d);
  if (/Done \([\d.]+s\)! For help/.test(buf)) doneResolve();
}
child.stdout.on('data', onData); child.stderr.on('data', onData);
child.on('exit', c => { console.log(`\n[退出] code=${c}`); process.exit(0); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function send(cmd, wait = 1200) { console.log(`\n>>> ${cmd}`); child.stdin.write(cmd + '\n'); await sleep(wait); }
(async () => {
  await Promise.race([done, sleep(240000)]);
  await sleep(2500);
  await send('help ping', 1500);
  await send('help', 1500);
  await send('plugins', 1500);
  child.stdin.write('stop\n'); await sleep(20000);
  try { child.kill(); } catch (e) { }
  log.end(); console.log('=== 结束 ==='); process.exit(0);
})();
