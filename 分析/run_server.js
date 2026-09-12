'use strict';
// 启动服务端(等价于 start (windspigot).bat), 通过 stdin 下发控制台指令做实测校验
const { spawn } = require('child_process');
const fs = require('fs');

const DIR = 'F:\\open\\新服务器\\senven (2)';
const BAT = 'start (windspigot).bat';
const LOG = 'F:\\open\\新服务器\\PVP内核\\分析\\server_run.log';
const TAKEOVER = Number(process.argv[2] || 0);   // 1 = 不启动, 只连已运行实例(不支持); 保留

const log = fs.createWriteStream(LOG, { encoding: 'utf8' });
let buf = '';
let doneResolve;
const donePromise = new Promise(r => (doneResolve = r));

const child = spawn('cmd.exe', ['/c', BAT], { cwd: DIR, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
function onData(d, tag) {
  log.write(d);
  buf += d;
  if (buf.length > 400000) buf = buf.slice(-200000);
  process.stdout.write(tag ? `[err] ${d}` : d);
  if (/Done \([\d.]+s\)! For help/.test(buf)) doneResolve();
  if (/\[Fatal\]|Exception in thread "main"|Failed to start/.test(d)) { console.log('\n*** 启动失败标记 ***'); doneResolve(); }
}
child.stdout.on('data', d => onData(d, false));
child.stderr.on('data', d => onData(d, true));
child.on('exit', (c, s) => { console.log(`\n[进程退出] code=${c} signal=${s}`); doneResolve(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function send(cmd, wait = 1200) {
  console.log(`\n>>> ${cmd}`);
  child.stdin.write(cmd + '\n');
  await sleep(wait);
}

(async () => {
  console.log(`启动: ${BAT}  (cwd=${DIR})`);
  const t0 = Date.now();
  const timeout = new Promise(r => setTimeout(() => r('TIMEOUT'), 420000));
  const which = await Promise.race([donePromise, timeout]);
  console.log(`\n=== 启动阶段结束 (${((Date.now() - t0) / 1000).toFixed(1)}s, ${which || 'Done'}) ===`);

  if (which !== 'TIMEOUT') {
    await sleep(3000);
    const cmds = [
      'kb',
      'kb get base-kb.horizontal.ground',
      'kb get base-kb.horizontal-momentum',
      'kb get base-kb.vertical-momentum',
      'kb get base-kb.vertical-limit',
      'kb get base-kb.horizontal-limit',
      'kb get horizontal.sprint-extra',
      'kb get victim-sprint-extra.horizontal',
      'kb get pvp.sprint-extra.horizontal',
      'kb get pvp.horizontal-momentum',
      'kb get iframe-knockback',
      'kb get hit-delay',
      'kb get y-limit.enabled',
      'kb get range-reduction.enabled',
      'kb get combo.enabled',
      'kb get sprint-reach.enabled',
    ];
    for (const c of cmds) await send(c, 700);
  }

  console.log('\n=== 下发 stop ===');
  child.stdin.write('stop\n');
  await sleep(25000);
  try { child.kill(); } catch (e) { }
  log.end();
  console.log('=== 结束 ===');
  process.exit(0);
})();
