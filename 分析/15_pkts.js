'use strict';
// 列出 TSV 中所有 (direction, packet) 组合 + 各列清单
const fs = require('fs'), readline = require('readline');
const rl = readline.createInterface({ input: fs.createReadStream(process.argv[2], { encoding: 'utf8' }), crlfDelay: Infinity });
let head = null, n = 0; const cnt = {};
rl.on('line', l => {
  if (!head) { head = l.split('\t'); console.log('列:', head.join(' | ')); return; }
  n++; const c = l.split('\t');
  const d = c[head.indexOf('direction')], p = c[head.indexOf('packet')], a = c[head.indexOf('action')];
  const k = `${d}\t${p}\t${a}`; cnt[k] = (cnt[k] || 0) + 1;
  if (n > 600000) rl.close();
});
rl.on('close', () => {
  console.log('扫描行数', n);
  Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, v]) => console.log(`  ${v}\t${k}`));
});
