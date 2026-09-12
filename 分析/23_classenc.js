'use strict';
// 从 .class 常量池提取 CONSTANT_Utf8 字符串(按真正的 UTF-8 解码), 并检测是否存在编码错乱
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function utf8Consts(buf) {
  // 解析 class 文件常量池
  let p = 8;
  const count = buf.readUInt16BE(p); p += 2;
  const out = [];
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

// 判定: 是否像"UTF-8 字节被当 GBK 读"的典型错乱(出现大量生僻字/连续乱码)
function suspicious(s) {
  if (!/[\u4e00-\u9fff]/.test(s)) return false;
  if (/[�]/.test(s)) return true;
  // 典型的 UTF8->GBK 错乱会产出 锟斤拷 / 浣犲ソ 一类
  if (/锟斤拷|锟拷|烫烫/.test(s)) return true;
  return false;
}

const jar = process.argv[2];
const jdk = 'C:\\Program Files\\Zulu\\zulu-8\\bin\\jar.exe';
const tmp = 'F:\\open\\新服务器\\PVP内核\\分析\\_jarx';
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
execFileSync(jdk, ['xf', jar], { cwd: tmp });

const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const q = path.join(d, e.name); e.isDirectory() ? walk(q) : (e.name.endsWith('.class') && files.push(q)); } })(tmp);

let total = 0, cjk = 0, bad = [];
for (const f of files) {
  let consts;
  try { consts = utf8Consts(fs.readFileSync(f)); } catch (e) { continue; }
  for (const s of consts) {
    if (!/[\u4e00-\u9fff]/.test(s)) continue;
    total++; cjk++;
    if (suspicious(s)) bad.push([f.replace(tmp + path.sep, ''), s]);
  }
}
console.log(`扫描 ${files.length} 个 class, 含中文的字符串 ${total} 条`);
console.log(`可疑(编码错乱特征) ${bad.length} 条`);
for (const [f, s] of bad.slice(0, 40)) console.log(`  [${f}]\n     ${s}`);
fs.rmSync(tmp, { recursive: true, force: true });
