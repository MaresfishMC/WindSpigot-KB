'use strict';
// 打印指定 class 的全部常量池字符串(自带 UTF-8 解码, 不受控制台代码页影响)
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
const [jar, inner] = process.argv.slice(2);
const tmp = 'F:\\open\\新服务器\\PVP内核\\分析\\_jx4';
fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
execFileSync('C:\\Program Files\\Zulu\\zulu-8\\bin\\jar.exe', ['xf', jar], { cwd: tmp });
const cs = u(fs.readFileSync(path.join(tmp, inner)));
const lines = cs.map((s, i) => `#${i} ${JSON.stringify(s)}`);
fs.writeFileSync('F:\\open\\新服务器\\PVP内核\\分析\\_strings.txt', lines.join('\n'), 'utf8');
console.log(`共 ${cs.length} 条字符串, 已写入 _strings.txt`);
fs.rmSync(tmp, { recursive: true, force: true });
