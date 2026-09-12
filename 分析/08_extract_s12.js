'use strict';
// 从受击方 events.tsv 抽取 S12_VELOCITY 事件(含双方坐标), 输出 JSONL
const fs = require('fs'), readline = require('readline');

const JOBS = [
  { role: '第一轮', victim: 'Flandre_qwp', attacker: '12345mmmm', file: 'F:\\open\\数据\\testtt\\player2\\session\\victim-flandre_qwp-20260830-122413-606-36e03edc\\events.tsv', out: 'F:\\open\\新服务器\\PVP内核\\分析\\s12_r1.jsonl' },
  { role: '第二轮', victim: '12345mmmm', attacker: 'Flandre_qwp', file: 'F:\\open\\数据\\testtt\\player1\\session\\session\\victim-12345mmmm-20260830-123846-774-d8d3f971\\events.tsv', out: 'F:\\open\\新服务器\\PVP内核\\分析\\s12_r2.jsonl' },
];

const KEEP = ['seq', 'epoch_ms', 'client_tick', 'velocity_x', 'velocity_y', 'velocity_z',
  'self_x', 'self_y', 'self_z', 'self_motion_x', 'self_motion_y', 'self_motion_z',
  'self_yaw', 'self_on_ground', 'self_sprinting', 'self_key_forward', 'self_key_back',
  'self_key_sprint', 'self_kb_level', 'self_ping', 'self_collided_horizontal', 'self_hurt_time',
  'peer_x', 'peer_y', 'peer_z', 'peer_yaw', 'peer_sprinting', 'peer_ping', 'peer_distance',
  'server_tps', 'correlation_id', 'detail', 'raw_1', 'raw_2'];

async function run(job) {
  const rl = readline.createInterface({ input: fs.createReadStream(job.file, { encoding: 'utf8' }), crlfDelay: Infinity });
  const ws = fs.createWriteStream(job.out, { encoding: 'utf8' });
  let head = null, n = 0, kept = 0;
  for await (const line of rl) {
    if (!head) { head = line.split('\t'); continue; }
    n++;
    if (line.indexOf('S12_VELOCITY') < 0) continue;
    const c = line.split('\t'); const o = {};
    for (let i = 0; i < head.length; i++) o[head[i]] = c[i];
    if (o.direction !== 'IN' || o.packet !== 'S12_VELOCITY') continue;
    const rec = {};
    for (const k of KEEP) rec[k] = o[k];
    ws.write(JSON.stringify(rec) + '\n'); kept++;
  }
  await new Promise(r => ws.end(r));
  console.log(`${job.role}: 扫描 ${n} 行, 抽取 S12 ${kept} 条 → ${job.out}`);
}

(async () => { for (const j of JOBS) await run(j); })();
