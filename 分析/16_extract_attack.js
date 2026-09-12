'use strict';
// 从攻击方会话抽取 C02_ATTACK(自身真实疾跑/yaw/坐标), 与受击方 S12 事件按时间对齐
const fs = require('fs'), readline = require('readline');

const JOBS = [
  { round: 1, atk: 'F:\\open\\数据\\testtt\\player1\\session\\session\\attacker-12345mmmm-20260830-122358-629-6b4ad359\\events.tsv', out: 'F:\\open\\新服务器\\PVP内核\\分析\\atk_r1.jsonl' },
  { round: 2, atk: 'F:\\open\\数据\\testtt\\player2\\session\\attacker-flandre_qwp-20260830-123847-954-5781a839\\events.tsv', out: 'F:\\open\\新服务器\\PVP内核\\分析\\atk_r2.jsonl' },
];
const KEEP = ['seq', 'epoch_ms', 'self_x', 'self_z', 'self_y', 'self_yaw', 'self_sprinting', 'self_on_ground',
  'self_motion_x', 'self_motion_z', 'peer_x', 'peer_z', 'peer_distance', 'self_key_forward', 'self_key_sprint',
  'self_kb_level', 'correlation_id', 'server_tps'];

async function run(job) {
  const rl = readline.createInterface({ input: fs.createReadStream(job.atk, { encoding: 'utf8' }), crlfDelay: Infinity });
  const ws = fs.createWriteStream(job.out, { encoding: 'utf8' });
  let head = null, n = 0, kept = 0;
  for await (const line of rl) {
    if (!head) { head = line.split('\t'); continue; }
    n++;
    if (line.indexOf('C02_ATTACK') < 0) continue;
    const c = line.split('\t'); const o = {};
    for (let i = 0; i < head.length; i++) o[head[i]] = c[i];
    if (o.direction !== 'OUT' || o.packet !== 'C02_ATTACK') continue;
    const rec = {}; for (const k of KEEP) rec[k] = o[k];
    ws.write(JSON.stringify(rec) + '\n'); kept++;
  }
  await new Promise(r => ws.end(r));
  console.log(`第${job.round}轮 攻击方: 扫描 ${n} 行, C02_ATTACK ${kept} 条 → ${job.out}`);
}
(async () => { for (const j of JOBS) await run(j); })();
