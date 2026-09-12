'use strict';
// 常驻启动服务端(等价于 start (windspigot).bat), 启动后做一次控制台校验, 然后保持运行
const { spawn } = require('child_process');
const fs = require('fs');

const DIR = 'F:\\open\\新服务器\\senven (2)';
const BAT = 'start (windspigot).bat';
const LOG = 'F:\\open\\新服务器\\PVP内核\\分析\\server_live.log';
const log = fs.createWriteStream(LOG, { encoding: 'utf8' });

let buf = '';
let doneResolve;
const donePromise = new Promise(r => (doneResolve = r));

const child = spawn('cmd.exe', ['/c', BAT], { cwd: DIR, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
let phase = 'boot';
function onData(d, isErr) {
  log.write(d); buf += d; if (buf.length > 400000) buf = buf.slice(-200000);
  if (phase === 'boot') process.stdout.write(d);           // 启动阶段全量显示
  else if (/kb |Done|WARN|ERROR|Stopping|joined|left/i.test(d)) process.stdout.write(d);
  if (/Done \([\d.]+s\)! For help/.test(buf)) doneResolve();
}
child.stdout.on('data', d => onData(d, false));
child.stderr.on('data', d => onData(d, true));
child.on('exit', c => { console.log(`\n[服务端进程退出] code=${c}`); process.exit(0); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function send(cmd, wait = 900) { console.log(`\n>>> ${cmd}`); child.stdin.write(cmd + '\n'); await sleep(wait); }

(async () => {
  console.log(`启动: ${BAT}  cwd=${DIR}`);
  const t0 = Date.now();
  await Promise.race([donePromise, sleep(420000)]);
  console.log(`\n=== 启动完成 (${((Date.now() - t0) / 1000).toFixed(1)}s) ===`);
  await sleep(4000);
  phase = 'ready';

  console.log('\n########## 控制台实测校验 ##########');
  await send('kb get base-kb.horizontal.ground');
  await send('kb get base-kb.horizontal-limit');
  await send('kb get base-kb.horizontal-momentum');
  await send('kb get base-kb.vertical-momentum');
  await send('kb get horizontal.sprint-extra');
  await send('kb get victim-sprint-extra.horizontal');
  await send('kb get pvp.horizontal.sprint-extra');      // 引擎路径(对刀路由关键键)
  await send('kb get pvp.multiplier.horizontal-momentum');
  await send('kb get pvp.enabled');
  await send('kb list 系统开关');
  await send('kb profile list');
  console.log('\n########## 校验结束, 服务端保持运行 ##########');
  console.log('日志: ' + LOG);
})();
