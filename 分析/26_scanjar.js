'use strict';
// 全 jar 字符串扫描: 找出所有含关键字的常量池字符串(自带 UTF-8 解码)
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
function u(buf) {
  let p = 8; const c = buf.readUInt16BE(p); p += 2; const o = [];
  for (let i = 1; i < c; i++) {
    const t = buf[p++];
    switch (t) {
      case 1: { const l = buf.readUInt16BE(p); p += 2; o.push(buf.slice(p, p + l).toString('utf8')); p += l; break; }
      case 7: case 8: case 16: case 19: case 20: p += 2; break;
      case 15: p += 3; break;
      case 3: case 4: case 9: case 10: case 11: case 12: case 17: case 18: p += 4; break;
      case 5: case 6: p += 8; i++; break;
      default: return o;
    }
  }
  return o;
}
const jar = process.argv[2];
const kw = new RegExp(process.argv[3], 'i');
const tmp = 'F:\\open\\新服务器\\PVP内核\\分析\\_jx5';
fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
execFileSync('C:\\Program Files\\Zulu\\zulu-8\\bin\\jar.exe', ['xf', jar], { cwd: tmp });
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const q = path.join(d, e.name); e.isDirectory() ? walk(q) : (e.name.endsWith('.class') && files.push(q)); } })(tmp);
const out = [];
for (const f of files) {
  let cs; try { cs = u(fs.readFileSync(f)); } catch (e) { continue; }
  const hits = cs.filter(s => kw.test(s) && s.length < 300 && !/^[\(\[]/.test(s) && !s.includes('/'));
  if (hits.length) out.push('=== ' + f.replace(tmp + path.sep, '') + '\n' + hits.map(h => '    ' + JSON.stringify(h)).join('\n'));
}
fs.writeFileSync('F:\\open\\新服务器\\PVP内核\\分析\\_hits.txt', out.join('\n'), 'utf8');
console.log(`命中 ${out.length} 个 class → _hits.txt`);
fs.rmSync(tmp, { recursive: true, force: true });
