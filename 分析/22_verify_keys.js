'use strict';
// 校验: 配置文件中每个键都能被核心识别(引擎参数注册表 / 模式分节键 / 已并入映射)
const fs = require('fs');
const J = 'F:\\open\\新服务器\\PVP内核\\项目\\WindSpigot-KB\\WindSpigot-Server\\src\\main\\java\\com\\windpvp\\windspigot\\knockback\\';

const es = fs.readFileSync(J + 'KnockbackEngineSettings.java', 'utf8');
const engineParams = new Set([...es.matchAll(/reg\("([^"]+)"/g)].map(m => m[1]));
const pp = fs.readFileSync(J + 'ProfileParams.java', 'utf8');
const profileKeys = new Set([...pp.matchAll(/reg\("([^"]+)"/g)].map(m => m[1]));
const kc = fs.readFileSync(J + 'KnockbackConfig.java', 'utf8');
const ck = fs.readFileSync(J + 'CraftKnockbackProfile.java', 'utf8');
const saved = new Set([...ck.matchAll(/yml\.set\("([^"]+)"/g)].map(m => m[1]));
const mergedFrom = new Set([...kc.matchAll(/\{ "([^"]+)", "([^"]+)" \}/g)].map(m => m[1]));

console.log('引擎参数注册表:', engineParams.size, ' 模式分节键:', profileKeys.size, ' 保存键:', saved.size);

// 简易 YAML -> 点分键
function flatten(text) {
  const keys = []; const stack = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.match(/^ */)[0].length;
    const m = raw.match(/^\s*([^:\s][^:]*):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim(), val = m[2].trim();
    while (stack.length && stack[stack.length - 1][0] >= indent) stack.pop();
    const path = stack.map(s => s[1]).concat(key).join('.');
    if (val === '' ) stack.push([indent, key]);
    else keys.push(path);
  }
  return keys;
}

const F = 'F:\\open\\新服务器\\配置文件\\';
const files = [
  ['kb配置文件\\模式\\mmckb.yml', 'profile'],
  ['kb配置文件\\系统开关.yml', 'engine'],
  ['kb配置文件\\高级机制.yml', 'engine'],
];
let bad = 0;
for (const [rel, kind] of files) {
  const keys = flatten(fs.readFileSync(F + rel, 'utf8'));
  console.log(`\n=== ${rel}  (${keys.length} 个键)`);
  const unknown = [];
  for (const k of keys) {
    let ok;
    if (kind === 'profile') ok = profileKeys.has(k) || saved.has(k) || mergedFrom.has('base-kb.' + k);
    else ok = engineParams.has(k) || engineParams.has(k.replace(/\.enabled$/, '.enabled'));
    if (!ok) unknown.push(k);
  }
  if (unknown.length) { console.log('  ✗ 核心未识别的键:', unknown.join(', ')); bad += unknown.length; }
  else console.log('  ✓ 全部键可被核心识别');
}
console.log(bad === 0 ? '\n全部通过' : `\n有 ${bad} 个键未识别`);
