'use strict';
// 验证: 无敌帧差值分支(vic_ndt>10) 的样本, 速度包是否只有"疾跑加成"而没有"基础击退"
const fs = require('fs');
const L = require('F:\\open\\新服务器\\PVP内核\\分析\\lib.js');
function parse(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(s => s.trim());
  const head = lines[0].split(',');
  return lines.slice(1).map(l => {
    const c = l.split(','); const o = {}; head.forEach((h, i) => o[h] = c[i]);
    const n = k => Number(o[k]); const b = k => o[k] === 'true';
    return { ts: n('ts_ms'), atk: o.attacker, vic: o.victim, aS: b('atk_sprint'), aX: b('atk_extra_kb'),
      vS: b('vic_sprint'), ndt: n('vic_ndt'), pktH: n('pkt_h'), pktY: n('pkt_y'),
      dmg: n('vic_last_dmg'), maxNdt: n('atk_max_ndt'), pre: [n('pre_x'), n('pre_y'), n('pre_z')],
      ax: n('atk_x'), az: n('atk_z'), vx: n('vic_x'), vz: n('vic_z') };
  });
}
const rows = parse('F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\kb-log.csv');
console.log(`样本 ${rows.length}\n`);

// 基础击退=0.527375, 只要包值明显低于它, 就说明"基础击退被跳过"
const BASE = 0.527375;
const iframe = rows.filter(r => r.ndt > 10);
const normal = rows.filter(r => r.ndt <= 10);
console.log('=== 按"是否处于无敌帧窗口"(vic_ndt>10) 分组 ===');
for (const [tag, a] of [['无敌帧内 ndt>10', iframe], ['正常窗口 ndt<=10', normal]]) {
  if (!a.length) { console.log(`  ${tag}: 0 条`); continue; }
  const v = a.map(r => r.pktH);
  console.log(`  ${tag.padEnd(18)} n=${String(a.length).padStart(3)}  |pkt| 中位=${L.fmt(L.median(v),4)}  最小=${L.fmt(Math.min(...v),4)}  最大=${L.fmt(Math.max(...v),4)}`);
  const below = a.filter(r => r.pktH < BASE - 0.002);
  console.log(`     其中 |pkt| < 基础值 0.5274 的: ${below.length} 条  (⇒ 基础击退被跳过)`);
}
console.log('\n=== 无敌帧内样本逐条 ===');
for (const r of iframe) {
  const kind = r.pktH < BASE - 0.002 ? '★基础击退缺失' : (Math.abs(r.pktH - 0.9494) < 0.002 ? '双疾跑上限' : Math.abs(r.pktH - 0.948875) < 0.002 ? '仅攻击方疾跑' : Math.abs(r.pktH - 0.886775) < 0.002 ? '含受击方疾跑' : '其它');
  console.log(`  ndt=${String(r.ndt).padStart(2)} |pkt|=${L.fmt(r.pktH,4)} aS=${r.aS?1:0} aX=${r.aX?1:0} vS=${r.vS?1:0}  ${kind}`);
}
console.log('\n=== 关键推论检查: 若基础击退被跳过, 攻击方不疾跑时应完全没有包(探针看不到) ===');
const inWindowNoSprint = rows.filter(r => r.ndt > 10 && !r.aS && !r.aX && !r.vS);
console.log(`  无敌帧内 且 攻击方未疾跑 的"有包"样本: ${inWindowNoSprint.length} 条`);
console.log('  ⇒ 这些是"攻击方疾跑但受击方不疾跑"或更复杂的情况; 攻击方完全没疾跑时应无包(探针盲区)');
console.log('\n=== 统计推演: 估计有多少次命中是"有伤害无击退" ===');
console.log(`  已采样的生效包中, 基础击退缺失的: ${rows.filter(r => r.pktH < BASE - 0.002).length} 条`);
const ndtAll = rows.map(r => r.ndt);
const inWin = ndtAll.filter(v => v > 10).length;
console.log(`  vic_ndt>10 占比: ${L.fmt(100*inWin/rows.length,1)}%  (这些命中全部走了差值分支 ⇒ 全部缺少基础击退)`);
