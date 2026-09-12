'use strict';
// 52b: 监听值守(带命中检测)。每 10 秒采样一次在线人数与 kb/events 行数;
// 一旦出现新的对刀样本就打印一次进度摘要, 便于"监听中"实时掌握采集情况。
// 用法: node 52b_monitor.js [分钟] [kbBaseline]
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
const hist = a => { const m = {}; for (const v of a) m[v] = (m[v] || 0) + 1; return Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 5); };

(async () => {
  const minutes = parseInt(process.argv[2] || '30', 10);
  const base = parseInt(process.argv[3] || '0', 10);
  const end = Date.now() + minutes * 60000;
  let lastKb = -1, lastEv = -1;
  while (Date.now() < end) {
    let on = []; try { on = JSON.parse(await api('/online')); } catch (e) { }
    const kb = rows(K), ev = rows(E);
    if (kb !== lastKb || ev !== lastEv) {
      console.log(`${new Date().toLocaleTimeString()} online=[${on.map(p => p.username).join(',') || '-'}] 新增命中=${kb - base} events=${ev}`);
      if (kb > base) {
        // 简版实时摘要: 统计本窗口内的水平击退分布
        const raw = fs.readFileSync(K, 'utf8').split(/\r?\n/).filter(Boolean);
        const head = raw[0].split(',');
        const iH = head.indexOf('pkt_h'), iA = head.indexOf('atk_sprint'), iV = head.indexOf('vic_sprint'), iN = head.indexOf('vic_ndt');
        const win = raw.slice(1 + base).map(l => l.split(',')).filter(c => c.length === head.length);
        const hs = win.map(c => parseFloat(c[iH])).filter(Number.isFinite);
        const med = a => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
        console.log(`   |out| 中位数 ${med(hs).toFixed(4)}  顶上限 ${hs.filter(v => v > 0.94935).length}/${hs.length}` +
          `  双方疾跑 ${win.filter(c => c[iA] === 'true' && c[iV] === 'true').length}` +
          `  无敌帧内命中 ${win.filter(c => parseInt(c[iN], 10) > 0).length}`);
      }
      lastKb = kb; lastEv = ev;
    }
    await sleep(10000);
  }
  console.log('MONITOR_END ' + new Date().toLocaleTimeString());
})();
