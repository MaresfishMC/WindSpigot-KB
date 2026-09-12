'use strict';
// 通过 WebPanel 执行控制台命令: node 70_exec.js "command with spaces" ["another"]
// 用 argv 传参, 避免内联 node -e 的引号/转义问题。
const http = require('http');
function exec(c) {
  return new Promise((resolve) => {
    const d = JSON.stringify({ command: c });
    const q = http.request({ host: '127.0.0.1', port: 8081, path: '/api/console/exec', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } },
      s => { let x = ''; s.on('data', k => x += k); s.on('end', () => resolve(x)); });
    q.on('error', e => resolve('ERR ' + e.message));
    q.setTimeout(8000, () => { q.destroy(); resolve('TIMEOUT'); });
    q.write(d); q.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const cmds = process.argv.slice(2);
  if (!cmds.length) { console.log('用法: node 70_exec.js "命令" ["命令2" ...]'); return; }
  for (const c of cmds) {
    const r = await exec(c);
    console.log(`> ${c}  =>  ${r || '(ok)'}`);
    await sleep(300);
  }
})();
