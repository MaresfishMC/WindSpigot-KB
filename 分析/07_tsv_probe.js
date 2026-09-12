'use strict';
// 侦察 TSV: 找出速度包行, 导出带双方坐标的紧凑事件表
const fs = require('fs'), readline = require('readline');
const path = process.argv[2];
const limit = Number(process.argv[3] || 400000);

const rl = readline.createInterface({ input: fs.createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
let head = null, n = 0;
const combos = {}, velSamples = [];
rl.on('line', line => {
  if (!head) { head = line.split('\t'); return; }
  n++;
  if (n > limit) { rl.close(); return; }
  const c = line.split('\t');
  const o = {}; for (let i = 0; i < head.length; i++) o[head[i]] = c[i];
  if (o.direction === 'IN' && o.velocity_x && o.velocity_x !== '') {
    const key = o.packet + '|' + o.detail;
    combos[key] = (combos[key] || 0) + 1;
    if (velSamples.length < 3) velSamples.push(o);
  }
});
rl.on('close', () => {
  console.log('扫描行数', n, ' 列数', head ? head.length : 0);
  console.log('IN + 有速度 的 packet 组合:');
  for (const [k, v] of Object.entries(combos).sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${k}  x${v}`);
  for (const s of velSamples) {
    console.log('\n样本行:');
    for (const k of ['seq', 'epoch_ms', 'direction', 'packet', 'velocity_x', 'velocity_y', 'velocity_z', 'self_name', 'self_x', 'self_z', 'self_motion_x', 'self_motion_z', 'self_sprinting', 'self_on_ground', 'peer_name', 'peer_x', 'peer_z', 'peer_yaw', 'peer_sprinting', 'peer_distance', 'self_key_forward', 'correlation_id'])
      console.log(`   ${k} = ${s[k]}`);
  }
});
