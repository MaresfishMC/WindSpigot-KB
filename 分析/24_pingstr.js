'use strict';
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
function utf8Consts(buf) {
  let p = 8; const count = buf.readUInt16BE(p); p += 2; const out = [];
  for (let i = 1; i < count; i++) {
    const tag = buf[p++];
    switch (tag) {
      case 1: { const len = buf.readUInt16BE(p); p += 2; out.push(buf.slice(p, p + len).toString('utf8')); p += len; break; }
      case 7: case 8: case 16: case 19: case 20: p += 2; break;
      case 15: p += 3; break;
      case 3: case 4: case 9: case 10: case 11: case 12: case 17: case 18: p += 4; break;
      case 5: case 6: p += 8; i++; break;
      default: return out;
    }
  }
  return out;
}
const jar = process.argv[2];
const tmp = 'F:\\open\\新服务器\\PVP内核\\分析\\_jarx2';
fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
execFileSync('C:\\Program Files\\Zulu\\zulu-8\\bin\\jar.exe', ['xf', jar], { cwd: tmp });
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const q = path.join(d, e.name); e.isDirectory() ? walk(q) : (e.name.endsWith('.class') && files.push(q)); } })(tmp);
for (const f of files) {
  let cs; try { cs = utf8Consts(fs.readFileSync(f)); } catch (e) { continue; }
  const hits = cs.filter(s => /ping/i.test(s) && /[\u4e00-\u9fff]/.test(s));
  if (hits.length) { console.log('--- ' + f.replace(tmp + path.sep, '')); for (const h of hits) console.log('    ' + JSON.stringify(h)); }
}
fs.rmSync(tmp, { recursive: true, force: true });
