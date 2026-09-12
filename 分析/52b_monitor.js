'use strict';
// 52b: 在线监听值守(带回归自检)。每 10 秒采样一次, 一旦出现新命中就输出摘要;
// 同时对本窗口做四项回归检查, 命中任一异常就打印 !!! ALERT 行, 便于长时间无人值守监听。
// 用法: node 52b_monitor.js [分钟] [kbBaseline行号]
const http = require('http');
const fs = require('fs');
const K = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\kb-log.csv';
const E = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\events.csv';
const BASE = 0.527375, CAP = 0.9494;
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
const med = a => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };

function windowRows(base) {
  const raw = fs.readFileSync(K, 'utf8').split(/\r?\n/).filter(Boolean);
  const head = raw[0].split(',');
  const I = {}; head.forEach((h, i) => I[h] = i);
  return raw.slice(1 + base).map(l => l.split(',')).filter(c => c.length === head.length).map(c => ({
    ts: +c[I.ts_ms], atk: c[I.attacker], vic: c[I.victim],
    atkS: c[I.atk_sprint] === 'true', vicS: c[I.vic_sprint] === 'true',
    ndt: +c[I.vic_ndt], h: parseFloat(c[I.pkt_h]), vy: parseFloat(c[I.pkt_y]),
  }));
}

(async () => {
  const minutes = parseInt(process.argv[2] || '30', 10);
  const base = parseInt(process.argv[3] || '0', 10);
  const end = Date.now() + minutes * 60000;
  let lastKb = -1, lastEv = -1;
  console.log(`监听值守启动 基线=${base} 时长=${minutes}min  ${new Date().toLocaleTimeString()}`);
  while (Date.now() < end) {
    let on = []; try { on = JSON.parse(await api('/online')); } catch (e) { }
    const kb = rows(K), ev = rows(E);
    if (kb !== lastKb || ev !== lastEv) {
      console.log(`${new Date().toLocaleTimeString()} online=[${on.map(p => p.username).join(',') || '-'}] 新增命中=${kb - base} events=${ev}`);
      if (kb > base) {
        try {
          const win = windowRows(base);
          const hs = win.map(r => r.h);
          // 回归检查 1: 连击窗口内重复发包(相邻同受击方间隔 <480ms)
          const byVic = {};
          for (const r of win) (byVic[r.vic] = byVic[r.vic] || []).push(r);
          let fast = 0, pairs = 0;
          for (const arr of Object.values(byVic)) {
            arr.sort((a, b) => a.ts - b.ts);
            for (let i = 0; i < arr.length - 1; i++) { pairs++; if (arr[i + 1].ts - arr[i].ts < 480) fast++; }
          }
          // 回归检查 2: 无敌帧窗口内仍发包(ndt 11~20 应恒为 0)
          const iframe = win.filter(r => r.ndt >= 11).length;
          // 回归检查 3: 水平上限堆积(修复前 66.2%)
          const capped = hs.filter(v => v > CAP - 0.00005).length;
          // 回归检查 4: 垂直击退漂移
          const vyBad = win.filter(r => Math.abs(r.vy - 0.361375) > 1e-6).length;
          console.log(`   |out| med=${med(hs).toFixed(4)} 顶上限=${capped}/${win.length}` +
            ` 双方疾跑=${win.filter(r => r.atkS && r.vicS).length} 基础值=${hs.filter(v => Math.abs(v - BASE) < 0.005).length}` +
            ` 近零(<0.2)=${hs.filter(v => v < 0.2).length}`);
          const alerts = [];
          if (fast > 0) alerts.push(`连击窗口内重复发包 ${fast}/${pairs} (应 0)`);
          if (iframe > 0) alerts.push(`ndt 11~20 仍发包 ${iframe} 条 (应 0)`);
          if (capped > win.length * 0.15) alerts.push(`水平上限堆积 ${(100 * capped / win.length).toFixed(1)}% (>15%)`);
          if (vyBad > 0) alerts.push(`垂直击退漂移 ${vyBad} 条`);
          if (alerts.length) console.log('   !!! ALERT: ' + alerts.join(' | '));
        } catch (e) { console.log('   摘要失败: ' + e.message); }
      }
      lastKb = kb; lastEv = ev;
    }
    await sleep(10000);
  }
  console.log('MONITOR_END ' + new Date().toLocaleTimeString());
})();
