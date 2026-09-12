'use strict';
// 端内实测: 启动服务端 → 用 KBProbe 走真实 applyBaseKnockback → 验证基础值/垂直值/水平上限
const { spawn } = require('child_process');
const fs = require('fs');

const DIR = 'F:\\open\\新服务器\\senven (2)';
const LOG = 'F:\\open\\新服务器\\PVP内核\\分析\\server_probe.log';
const log = fs.createWriteStream(LOG, { encoding: 'utf8' });
let buf = '', doneResolve;
const done = new Promise(r => (doneResolve = r));

const child = spawn('cmd.exe', ['/c', 'start (windspigot).bat'], { cwd: DIR, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
let phase = 'boot';
function onData(d) {
  log.write(d); buf += d; if (buf.length > 400000) buf = buf.slice(-200000);
  if (phase === 'boot' || /KBProbe|base-kb|Done|ERROR|Stopping/i.test(d)) process.stdout.write(d);
  if (/Done \([\d.]+s\)! For help/.test(buf)) doneResolve();
}
child.stdout.on('data', onData); child.stderr.on('data', onData);
child.on('exit', c => { console.log(`\n[退出] code=${c}`); process.exit(0); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function send(cmd, wait = 1200) { console.log(`\n>>> ${cmd}`); child.stdin.write(cmd + '\n'); await sleep(wait); }

(async () => {
  await Promise.race([done, sleep(300000)]);
  console.log('\n=== 服务端就绪 ===');
  await sleep(3000); phase = 'ready';

  console.log('\n########## A. 模式解析 + 基础/垂直击退 ##########');
  await send('kbprobe', 1500);

  console.log('\n########## B. 水平上限钳制 (基础值临时改为 1.5, 应被钳到 0.9494) ##########');
  await send('kb set base-kb.horizontal.ground 1.5', 1500);
  await send('kbprobe', 1500);

  console.log('\n########## C. 再试 0.9 (低于上限, 应原样输出) ##########');
  await send('kb set base-kb.horizontal.ground 0.9', 1500);
  await send('kbprobe', 1500);

  console.log('\n########## D. 恢复 mmckb 基准值 ##########');
  await send('kb set base-kb.horizontal.ground 0.527375', 1500);
  await send('kbprobe', 1500);
  await send('kb get base-kb.horizontal.ground', 900);

  console.log('\n########## E. 受击方疾跑加成(gate 修正验证) ##########');
  await send('kb get victim-sprint-extra.horizontal', 900);
  await send('kb get horizontal.sprint-extra', 900);

  console.log('\n########## 停服 ##########');
  child.stdin.write('stop\n');
  await sleep(22000);
  try { child.kill(); } catch (e) { }
  log.end();
  console.log('=== 结束 ===');
  process.exit(0);
})();
