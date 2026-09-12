'use strict';
// 导出所有 jar 中包含非 ASCII 的常量池字符串(带来源), 供编码检测
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
const jars = process.argv.slice(2);
const out = [];
for (const jar of jars) {
  const tmp = 'F:\\open\\新服务器\\PVP内核\\分析\\_e';
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  try { execFileSync('C:\\Program Files\\Zulu\\zulu-8\\bin\\jar.exe', ['xf', jar], { cwd: tmp }); }
  catch (e) { out.push(['!!', jar, 'extract failed']); continue; }
  const files = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const q = path.join(d, e.name); e.isDirectory() ? walk(q) : files.push(q); } })(tmp);
  for (const f of files) {
    let cs;
    try { cs = f.endsWith('.class') ? u(fs.readFileSync(f)) : [fs.readFileSync(f, 'utf8')]; } catch (e) { continue; }
    for (const s of cs) {
      if (/[^\x00-\x7F]/.test(s) && s.length < 200) out.push([path.basename(jar), f.replace(tmp + path.sep, ''), s]);
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}
fs.writeFileSync('F:\\open\\新服务器\\PVP内核\\分析\\_jarstr.json', JSON.stringify(out), 'utf8');
console.log(`导出 ${out.length} 条非 ASCII 字符串 → _jarstr.json`);
