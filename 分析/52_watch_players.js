'use strict';
// 等待测试员上线; 一旦有人且出现对刀样本, 打印进度。用于"监听窗口"值守。
const http = require('http');
const fs = require('fs');
const K = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\kb-log.csv';
const E = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\events.csv';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function api(p) {
  return new Promise((resolve) => {
    const q = http.request({ host: '127.0.0.1', port: 8081, path: '/api' + p }, s => {
      let d = ''; s.on('data', c => d += c); s.on('end', () => resolve(d));
    });
    q.on('error', () => resolve('[]'));
    q.setTimeout(5000, () => { q.destroy(); resolve('[]'); });
    q.end();
  });
}
const rows = f => { try { return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).length - 1; } catch (e) { return 0; } };
(async () => {
  const minutes = parseInt(process.argv[2] || '12', 10);
  const end = Date.now() + minutes * 60000;
  let last = '';
  while (Date.now() < end) {
    let on = []; try { on = JSON.parse(await api('/online')); } catch (e) { }
    const names = on.map(p => p.username).join(',') || '-';
    const line = `${new Date().toLocaleTimeString()} online=[${names}] kb=${rows(K)} events=${rows(E)}`;
    if (line.slice(11) !== last.slice(11)) { console.log(line); last = line; }
    await sleep(8000);
  }
  console.log('WATCH_END ' + new Date().toLocaleTimeString());
})();
