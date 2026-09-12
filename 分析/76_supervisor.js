'use strict';
// 76: 自治值守台 —— 同时做三件事
//   1) 抓游戏内聊天(使用者的反馈)
//   2) 逐条播报新命中(含场景: 地面/空中、疾跑、连击间隔)
//   3) 多维异常自检 + "包头值 vs 客户端实际位移"对照
// 用法: node 76_supervisor.js [分钟] [每轮分析秒数]
const fs = require('fs');
const LOG = 'F:\\open\\新服务器\\PVP内核\\分析\\server_fixed.log';
const DIR = 'F:\\open\\新服务器\\senven (2)\\plugins\\KBProbe\\';
const K = DIR + 'kb-log.csv', T = DIR + 'traj.csv', S = DIR + 's12.csv';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const minutes = parseInt(process.argv[2] || '60', 10);
const auditEvery = parseInt(process.argv[3] || '30', 10);

const BASE = 0.527375, CAP = 0.9494;
const num = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : NaN; };
const med = a => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
const f4 = v => Number.isFinite(v) ? v.toFixed(4) : '  -   ';
const rowsOf = f => { try { return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean); } catch (e) { return []; } };

function loadKb() {
  const raw = rowsOf(K);
  if (raw.length < 2) return { head: [], rows: [] };
  const head = raw[0].split(',');
  const I = {}; head.forEach((h, i) => I[h] = i);
  const rows = raw.slice(1).map(l => l.split(',')).filter(c => c.length === head.length).map(c => ({
    ts: +c[I.ts_ms], atk: c[I.attacker], vic: c[I.victim],
    atkS: c[I.atk_sprint] === 'true', atkE: c[I.atk_extra_kb] === 'true',
    vicS: c[I.vic_sprint] === 'true', vicG: c[I.vic_ground] === 'true',
    ndt: +c[I.vic_ndt], h: num(c[I.pkt_h]), vy: num(c[I.pkt_y]), yaw: num(c[I.atk_yaw]),
    cancelled: c[I.cancelled] === 'true',
    atkY: num(c[I.atk_y]), vicY: num(c[I.vic_y]), dist: num(c[I.dist]),
  }));
  return { head, rows };
}

function loadTraj() {
  const raw = rowsOf(T);
  if (raw.length < 2) return [];
  const head = raw[0].split(',');
  const I = {}; head.forEach((h, i) => I[h] = i);
  return raw.slice(1).map(l => l.split(',')).filter(c => c.length === head.length).map(c => ({
    ts: +c[I.ts_ms], vic: c[I.victim], tick: +c[I.tick],
    x: num(c[I.x]), y: num(c[I.y]), z: num(c[I.z]),
    dx: num(c[I.dx]), dy: num(c[I.dy]), dz: num(c[I.dz]),
    motY: num(c[I.mot_y]), onGround: c[I.on_ground] === 'true',
  }));
}

// ---- 异常自检 ----
function audit(rows, traj) {
  const out = [], alerts = [];
  if (!rows.length) { out.push('暂无命中样本'); return { out, alerts }; }
  const hs = rows.map(r => r.h);
  out.push(`样本 ${rows.length}  |v| med=${f4(med(hs))} min=${f4(Math.min(...hs))} max=${f4(Math.max(...hs))}`);

  const g = (n, f) => { const a = rows.filter(f); if (a.length) out.push(`  ${n}  n=${String(a.length).padStart(4)} med=${f4(med(a.map(r => r.h)))}`); };
  g('双不疾跑    ', r => !r.atkS && !r.vicS);
  g('攻击疾跑    ', r => r.atkS && !r.vicS);
  g('仅受击疾跑  ', r => !r.atkS && r.vicS);
  g('双方疾跑    ', r => r.atkS && r.vicS);
  g('受击方在空中', r => !r.vicG);
  g('受击方在地面', r => r.vicG);

  const capped = hs.filter(v => v > CAP - 0.00005).length;
  const low = hs.filter(v => v < 0.45).length;
  const iframe = rows.filter(r => r.ndt >= 11).length;
  const canc = rows.filter(r => r.cancelled).length;
  const vyBad = rows.filter(r => Math.abs(r.vy - 0.361375) > 1e-6).length;
  const baseNotExact = rows.filter(r => !r.atkS && !r.vicS && Math.abs(r.h - BASE) > 0.005).length;
  out.push(`  上限堆积=${capped}  低击退(<0.45)=${low}  ndt>=11 发包=${iframe}  事件被取消=${canc}  垂直异常=${vyBad}  基础值偏离=${baseNotExact}`);

  if (canc > 0) alerts.push(`有 ${canc} 条 PlayerVelocityEvent 被取消(不会发包)`);
  if (iframe > 0) alerts.push(`ndt>=11 仍发包 ${iframe} 条(应在 6~10 之外不发)`);
  if (vyBad > 0) alerts.push(`垂直击退异常 ${vyBad} 条(应恒为 0.361375)`);
  if (baseNotExact > 0) alerts.push(`双不疾跑组偏离基础值 0.527375 共 ${baseNotExact} 条`);
  if (capped > rows.length * 0.15) alerts.push(`水平上限堆积 ${(100 * capped / rows.length).toFixed(1)}% (>15%)`);

  // 连击/发包间隔(同一受击方)
  const byVic = {};
  for (const r of rows) (byVic[r.vic] = byVic[r.vic] || []).push(r);
  let fast = 0, pairs = 0, gaps = [];
  for (const arr of Object.values(byVic)) {
    arr.sort((a, b) => a.ts - b.ts);
    for (let i = 0; i < arr.length - 1; i++) { const gp = arr[i + 1].ts - arr[i].ts; pairs++; gaps.push(gp); if (gp < 480) fast++; }
  }
  if (pairs) {
    out.push(`  相邻命中间隔: n=${pairs} med=${med(gaps)}ms  <480ms 的 ${fast} (${(100 * fast / pairs).toFixed(1)}%)`);
    if (fast > 0) out.push(`    (其中 ndt<11 属合法快速连击, 需与有效命中对照)`);
  }

  // ---- 包头值 vs 客户端实际位移 对照 ----
  if (traj.length) {
    // 每个受击方: 取一段连续轨迹的首末位移, 与同期命中的包值比较
    const byVicT = {};
    for (const t of traj) (byVicT[t.vic] = byVicT[t.vic] || []).push(t);
    let checked = 0, maxErr = 0, samples = [];
    for (const [vic, arr] of Object.entries(byVicT)) {
      arr.sort((a, b) => a.ts - b.ts);
      // 找"从地面起飞到落地"的完整弧
      let i = 0;
      while (i < arr.length) {
        if (!arr[i].onGround) {
          let j = i; while (j < arr.length && !arr[j].onGround) j++;
          if (j < arr.length) {
            const seg = arr.slice(i, j + 1);
            const rise = Math.max(...seg.map(s => s.y)) - arr[i - 1 >= 0 ? i - 1 : i].y;
            const horiz = Math.hypot(seg[seg.length - 1].x - (arr[i - 1] || seg[0]).x, seg[seg.length - 1].z - (arr[i - 1] || seg[0]).z);
            samples.push({ vic, ts: seg[0].ts, ticks: seg.length, rise, horiz });
          }
          i = j;
        }
        i++;
      }
      checked++;
    }
    if (samples.length) {
      out.push(`  实机弹道对照(${samples.length} 段完整滞空):`);
      for (const s of samples.slice(-4)) out.push(`    ${s.vic}: 滞空 ${s.ticks} tick, 顶点升 ${s.rise.toFixed(3)} 格, 水平位移 ${s.horiz.toFixed(3)} 格`);
      const nowMs = Date.now();
      const fresh = samples.filter(s => s.ts && nowMs - s.ts < 180000);
      const shallow = fresh.filter(s => s.rise < 0.35).length;
      const longAir = fresh.filter(s => s.ticks > 24).length;
      if (shallow > 0) alerts.push(`有 ${shallow} 段滞空顶点升幅 <0.35 格(疑似击退过小/被吞)`);
      if (longAir > 0) alerts.push(`有 ${longAir} 段滞空 >24 tick(疑似连击持续抛飞或卡空)`);
    } else {
      out.push('  实机弹道对照: 暂无完整滞空段');
    }
  }
  return { out, alerts };
}

(async () => {
  let seenLog = rowsOf(LOG).length;
  let seenKb = 0;
  const { rows: r0 } = loadKb(); seenKb = r0.length;
  console.log(`值守台启动: 已有命中 ${seenKb} 条, 日志 ${seenLog} 行, 时长 ${minutes} 分钟`);
  const end = Date.now() + minutes * 60000;
  let lastAudit = 0;

  while (Date.now() < end) {
    await sleep(4000);
    // 1) 聊天
    const logLines = rowsOf(LOG);
    if (logLines.length > seenLog) {
      for (const l of logLines.slice(seenLog)) {
        const m = l.match(/INFO\]:\s*(<[^>]{1,20}>\s*.+)$/);
        if (m) console.log(`\n💬 玩家反馈  ${new Date().toLocaleTimeString()}  ${m[1]}`);
      }
      seenLog = logLines.length;
    }
    // 2) 新命中
    const { rows } = loadKb();
    if (rows.length > seenKb) {
      for (const r of rows.slice(seenKb)) {
        const air = r.vicG ? '地' : '空';
        console.log(`⚔ ${new Date(r.ts).toLocaleTimeString()} ${r.atk}→${r.vic} |v|=${f4(r.h)} vy=${f4(r.vy)} atkSprint=${r.atkS ? 'T' : 'F'} vicSprint=${r.vicS ? 'T' : 'F'} vic${air} ndt=${String(r.ndt).padStart(2)} dist=${f4(r.dist)}${r.cancelled ? ' ⚠事件被取消' : ''}`);
      }
      seenKb = rows.length;
    }
    // 3) 周期自检
    if (Date.now() - lastAudit > auditEvery * 1000 && rows.length) {
      lastAudit = Date.now();
      const traj = loadTraj();
      const { out, alerts } = audit(rows.slice(-400), traj.slice(-2000));
      console.log(`\n===== 自检 ${new Date().toLocaleTimeString()} =====`);
      out.forEach(l => console.log(l));
      if (alerts.length) alerts.forEach(a => console.log(`  !!! ALERT: ${a}`));
      else console.log('  ✅ 无异常');
    }
  }
  console.log('值守结束');
})();
