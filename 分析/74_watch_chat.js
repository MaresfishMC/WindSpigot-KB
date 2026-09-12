'use strict';
// 监听游戏内聊天: 轮询服务端日志中形如 "<玩家> 内容" 的行并实时打印。
// 用法: node 74_watch_chat.js [秒数]
const fs = require('fs');
const LOG = 'F:\\open\\新服务器\\PVP内核\\分析\\server_fixed.log';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const secs = parseInt(process.argv[2] || '150', 10);

function readLines() {
  try { return fs.readFileSync(LOG, 'utf8').split(/\r?\n/); } catch (e) { return []; }
}
function chatOf(line) {
  const m = line.match(/\]::?\s*|\]:\s*(<[^>]{1,20}>.*)$/);
  const m2 = line.match(/INFO\]:\s*(<[^>]{1,20}>\s*.+)$/);
  if (m2) return m2[1];
  const m3 = line.match(/INFO\]:\s*\[(?:Server|Notch)\]\s*(.+)$/);
  if (m3) return '[Server] ' + m3[1];
  const m4 = line.match(/INFO\]:\s*(?:\[[^\]]+\]\s*)?\[CHAT\]\s*(.+)$/);
  if (m4) return m4[1];
  return null;
}

(async () => {
  let seen = 0;
  const initial = readLines();
  seen = initial.length;
  console.log(`开始监听聊天(${secs}s), 日志当前 ${seen} 行...`);
  const end = Date.now() + secs * 1000;
  while (Date.now() < end) {
    await sleep(1500);
    const lines = readLines();
    if (lines.length > seen) {
      for (const l of lines.slice(seen)) {
        const c = chatOf(l);
        if (c) console.log(`${new Date().toLocaleTimeString()}  ${c}`);
      }
      seen = lines.length;
    }
  }
  console.log('监听结束');
})();
