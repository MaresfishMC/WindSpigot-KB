'use strict';
// 端内实测(修正版): 探针强制 onGround=true ⇒ 走 ground 分节
const { spawn } = require('child_process');
const fs = require('fs');
const DIR = 'F:\\open\\新服务器\\senven (2)';
const LOG = 'F:\\open\\新服务器\\PVP内核\\分析\\server_probe.log';
const log = fs.createWriteStream(LOG, { encoding: 'utf8' });
let buf = '', doneResolve;
const done = new Promise(r => (doneResolve = r));
const child = spawn('cmd.exe', ['/c', 'start (windspigot).bat'], { cwd: DIR, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
function onData(d) {
  log.write(d); buf += d; if (buf.length > 400000) buf = buf.slice(-200000);
  if (/KBProbe|base-kb|Done \(|ERROR|Stopping|已更新/i.test(d)) process.stdout.write(d);
  if (/Done \([\d.]+s\)! For help/.test(buf)) doneResolve();
}
child.stdout.on('data', onData); child.stderr.on('data', onData);
child.on('exit', c => { console.log(`\n[退出] code=${c}`); process.exit(0); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function send(cmd, wait = 1300) { console.log(`\n>>> ${cmd}`); child.stdin.write(cmd + '\n'); await sleep(wait); }

(async () => {
  await Promise.race([done, sleep(300000)]);
  await sleep(3000);
  console.log('\n########## A. 基准: 期望 0.527375 / 0.361375 (若为 0.4 则说明模式未生效) ##########');
  await send('kb get base-kb.horizontal.ground', 800);
  await send('kbprobe', 1600);
  console.log('\n########## B. 上限钳制: ground=1.5 ⇒ 期望 0.949400 ##########');
  await send('kb set base-kb.horizontal.ground 1.5', 1200);
  await send('kbprobe', 1600);
  console.log('\n########## C. ground=0.9 (低于上限) ⇒ 期望 0.900000 ##########');
  await send('kb set base-kb.horizontal.ground 0.9', 1200);
  await send('kbprobe', 1600);
  console.log('\n########## D. 上限改为 0.3 ⇒ 期望 0.300000 ##########');
  await send('kb set base-kb.horizontal-limit 0.3', 1200);
  await send('kbprobe', 1600);
  console.log('\n########## E. 恢复标定值 ##########');
  await send('kb set base-kb.horizontal-limit 0.9494', 1200);
  await send('kb set base-kb.horizontal.ground 0.527375', 1200);
  await send('kbprobe', 1600);
  console.log('\n########## 停服 ##########');
  child.stdin.write('stop\n'); await sleep(22000);
  try { child.kill(); } catch (e) { }
  log.end(); console.log('=== 结束 ==='); process.exit(0);
})();
