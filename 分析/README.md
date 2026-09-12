# 击退标定与端内诊断（工具链说明）

本目录是 mmckb 参数标定与端内诊断所用的**可复现工具链**。采样数据本身（数 MB 的 jsonl / 日志）
不入库，只入库脚本与探针源码。

## 一、数据来源

标定基于真实服务器 **as.minemen.club（Minemen Club 亚洲区）** 的两轮对打采样：

| 项 | 第一轮 | 第二轮 |
|---|---|---|
| 攻击方 | player1 `12345mmmm` | player2 `Flandre_qwp` |
| 受击方 | player2 `Flandre_qwp` | player1 `12345mmmm` |
| S12 速度包 | 804 | 2001 |
| 受控段 | — | idx≈1200 死按 W 不疾跑重置 / idx≈1300 起全程不疾跑 |

原始数据为 `events.tsv`（客户端逐 tick trace，含双方真实坐标、速度包、按键、ping）。

## 二、方法：为什么能精确分解

关键不是只看速度包的模长，而是把**方向**也解出来：

1. `S12_VELOCITY` 是服务端最终发出的向量 ⇒ 引擎输出 `out`
2. 双方真实坐标 `self_x/z`、`peer_x/z` ⇒ **基础击退方向** `u_pos = normalize(受击方 − 攻击方)`
3. 攻击方 `peer_yaw` ⇒ **疾跑加成方向** `u_yaw = (−sin yaw, cos yaw)`
4. 攻击方会话里的 `C02_ATTACK`（攻击方自身点击）⇒ **疾跑真值**

> ⚠️ 踩过的坑：受击方记录的 `attacker_sprinting` 与攻击方自身真值**只有 69% 一致**
> （真1记1=858 / 真0记1=273 / 真1记0=157 / 真0记0=109）。早期几版结论的偏差主要来自这里，
> 必须用攻击方自己的会话取疾跑状态。

由此得到 `out = base·u_pos + sprint·u_yaw·[疾跑] + victim·u_pos·[受击方疾跑]`，
再用严格对齐子集（`u_pos` 与 `u_yaw` 夹角 <8°）读离散档位，用全样本读夹角连续谱。

## 三、脚本清单（按执行顺序）

| 脚本 | 作用 |
|---|---|
| `lib.js` / `fitlib.js` | CSV/JSONL 读取、向量工具、稳健统计、最小二乘 |
| `01_recon.js` | 侦察：状态分布、按 index 分桶找受控段 |
| `02_fit.js` `03_measure.js` | 动量保留 `r` 与冲量 `k` 的联合拟合 |
| `04_hist.js` | `\|out\|` 直方图 ⇒ 找离散档位与硬上限 |
| `05_structure.js` `06_momentum.js` | 结构性假说检验；扫描 `r` 使冲量方差最小 |
| `07_tsv_probe.js` `08_extract_s12.js` | 定位并抽取带双方坐标的 S12 事件 |
| `09_fit_geom.js` `10_decompose.js` | 几何分解：沿 `u_pos`/`u_yaw` 的双基投影 |
| `11_gates.js` `12_model.js` `13_angle.js` | 门控分析、参数搜索、夹角混合假说检验 |
| `14_residual.js` `16_extract_attack.js` `17_join.js` | 残差分析、抽取攻击方点击、双端时间对齐 |
| `18_final_fit.js` `19_calibrate.js` `20_air.js` `21_gaps.js` | 终局标定：四档位 + 垂直 + 打击间隔 |
| `22_verify_keys.js` | 校验配置文件每个键都能被核心识别 |
| `23`–`28` | 编码事故排查：class 常量池 UTF-8 提取、jar 字符串扫描 |
| `29_mojibake.ps1` | **通用乱码检测器**：UTF-8 被当 GBK 读再存回 UTF-8 的精确判据 |
| `31_jarchk.ps1` | 对 jar 常量池跑同一判据 |
| `33`–`38` | 端内实测分析：分组对账、打击间隔、"nokb" 相消定位 |
| `run_*.js` | 服务端启动/停服/诊断编排（含游戏内关服广播） |

## 四、端内探针 `kbprobe/`

服务端侧的实测探针（不依赖 ProtocolLib）：

- `EntityDamageByEntityEvent`（**击退计算之前**触发）→ 记录命中前上下文
- `PlayerVelocityEvent`（CraftBukkit 在**发出 S12 包之前**触发，`getVelocity()` 即即将写入网络包的向量）
  → 记录服务端**实际施加**的击退

```bash
# 编译（需 javac 8 + 服务端 jar）
javac -encoding UTF-8 -cp WindSpigot-KB-Enhanced.jar -d classes src/kbprobe/KBProbe.java
# 打包（plugin.yml + kbprobe/*.class，不要带 classes/ 目录本身）
cd classes && jar cf ../KBProbe.jar .
```

指令：`/kbprobe`（基础值探针）、`/kbprobe status`、`/kbprobe text`
输出：`plugins/KBProbe/kb-log.csv`

> 注意：`EntityLiving.java:797` 的无敌帧抑制分支会在 CraftBukkit 伤害事件**之前** `return false`，
> 所以被无敌帧吞掉的攻击**不会**进入采样 —— 探针记录的都是真实生效的命中。

## 五、标定结论（详见 `项目/mmckb标定/标定报告.md`）

```
基础水平击退   0.527375    (4219/8000, 实测 sd≈0.003)
垂直击退       0.361375    (2891/8000, 2783/2805 个样本恒等)
攻击方疾跑加成 +0.4215      (沿攻击者朝向)
受击方疾跑加成 +0.3594      (沿位置方向, 与运动朝向无关)
水平硬上限     0.9494
动量保留       0           (水平与垂直都是完全覆盖)
打击间隔       10 tick     ⇒ hit-delay 20 + iframe-knockback false
```
