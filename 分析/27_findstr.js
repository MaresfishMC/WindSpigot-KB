'use strict';
// 在所有插件 jar 中按字符串定位类
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
const P = 'F:\\open\\新服务器\\senven (2)\\plugins';
const needle = process.argv[2];
const tmp = 'F:\\open\\新服务器\\PVP内核\\分析\\_sc';
let hits = 0;
for (const jar of fs.readdirSync(P).filter(f => f.endsWith('.jar') || f.endsWith('.disable'))) {
  const full = path.join(P, jar);
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  try { execFileSync('C:\\Program Files\\Zulu\\zulu-8\\bin\\jar.exe', ['xf', full], { cwd: tmp }); } catch (e) { continue; }
  const files = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const q = path.join(d, e.name); e.isDirectory() ? walk(q) : (e.name.endsWith('.class') && files.push(q)); } })(tmp);
  for (const f of files) {
    let cs; try { cs = u(fs.readFileSync(f)); } catch (e) { continue; }
    for (const s of cs) {
      if (s.includes(needle)) { console.log(`${jar} :: ${f.replace(tmp + path.sep, '')}\n    ${JSON.stringify(s)}`); hits++; }
    }
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n命中 ${hits} 处`);
