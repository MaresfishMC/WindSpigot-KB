# 自定义核心（WindSpigot-KB）

基于 WindSpigot 2.1.4 定制的 Minecraft 1.8.8 PVP 服务器核心，内置新版击退引擎。

## 目录结构

```
项目/WindSpigot-KB/      自定义核心源码（Maven 构建）
项目/使用说明.md          核心使用文档（参数语义、指令、GUI、调试工具配合）
项目/mmckb标定/           mmckb 标定报告 + 可直接部署的配置包
kb调试工具新版适配/        KB 调试工具前端（kbm调试仪.html）
分析/                     标定/诊断工具链（脚本 + 服务端探针 KBProbe）
  47_sprint_groups.js     按双方疾跑状态分组, 本服 vs MMC 对照
  51_after_fix.js         修复后复核(按列名解析, 兼容探针列布局变化)
  46_stubs2.js            生成 ProtocolLib 编译期桩类
  44_monitor_notice.js    监听开始/结束的游戏内播报
  49/50_probe_restart.js  修复版/探针版重启(播报 + 倒计时 + 停服)
  52_watch_players.js     值守: 等待测试员上线并统计采样量
build.bat / build.ps1    一键编译脚本（产物输出到 编译后文件/）
```

## 击退引擎特性

- 空中/地面击退完全分离（base-kb / multiplier 每层分 ground/air）
- 对刀（双方玩家）独立乘区 pvp.*
- 疾跑击退宽松判定（宽限 tick + 疾跑额外攻击距离）
- 动态 misplay：按目标玩家 ping 动态补偿击退
- 距离衰减 / 连击递增 / 防飞天限高 / 击退滞空自定义重力
- 配置文件多文件拆分（kb配置文件/ 基础击退、对刀PVP、系统开关、高级机制、模式/）
- /kb 指令全参数调整 + 箱子 GUI 点击编辑 + /kb reload 合并热更新
- 与 kb调试工具新版适配 导出的 knockback.yml 直接兼容（自动导入分类文件）

## mmckb 标定与端内实测（2026-09-12）

基于 as.minemen.club（Minemen Club）两轮对打采样（804 + 2001 个速度包）完成逆向标定，
并用服务端探针做端内实测复核，详见 `项目/mmckb标定/标定报告.md` 与 `分析/README.md`。

标定值（`项目/mmckb标定/kb配置文件/模式/mmckb.yml`）：

| 参数 | 值 | 实测依据 |
|---|---|---|
| base-kb.horizontal | 0.527375 | 4219/8000，双方不疾跑时 sd≈0.003 |
| base-kb.vertical | 0.361375 | 2891/8000，2783/2805 个样本恒等 |
| sprint-extra.horizontal | 0.4215 | 攻击方疾跑且受击方不疾跑时 0.948889 |
| victim-sprint-extra.horizontal | 0.3594 | 受击方疾跑时 0.886747（与运动朝向无关） |
| base-kb.horizontal-limit | 0.9494 | 硬上限，716/2805 个样本堆积于该值 |
| 动量保留（水平/垂直） | 0 | 原速度变化 9 倍时输出恒定 |

### 关键修复

1. **`resolveProfile`（严重）**——核心从不调用 `Entity.setKnockbackProfile()`（该字段只由插件 API 写入），
   导致 `getKnockbackProfile()` 对玩家恒为 null，引擎退回**硬编码默认值**（base 0.4 / 无上限 /
   无疾跑加成），**模式文件对击退完全失效**。现取值链为
   `实体显式绑定 → 玩家个人模式 → 全局当前模式`。
2. **水平冲量上限 `base-kb.horizontal-limit`（新增）**——MMC 实测硬上限 0.9494，
   且在**阶段一与阶段二末尾各钳一次**（只加在阶段一会被阶段二的疾跑加成绕过）。
3. **`sprint-bonus.no-cancel`（新增，默认 false）**——疾跑/附魔加成沿攻击者朝向施加，
   与沿位置方向的基础击退在夹角 >90° 时反向相消：实测夹角 120/150/180° 时
   \|速度包\| 掉到 0.483/0.266/0.106。开启后只保留不反向的分量，命中击退不再低于基础值。
   **2026-09-12 按线上反馈回调为 `false`**：MMC 本身也存在该相消（其 >90° 样本 25/87 低于 0.45，
   p10=0.5273、min=0.0149 的低值尾巴是其真实行为），抹掉它等于整体放大击退 ——
   开启后"双方疾跑"命中 66.2% 堆积在水平上限 0.9494（MMC 同组仅 7.7%）。
4. **`victim-sprint-extra` 门控**——去掉"必须朝攻击者运动"的点积条件（实测与朝向无关）。
5. **对刀路由**——`pvp.sprint-extra` 需与 `sprint-extra` 同值，否则引擎对刀路径
   优先读 pvp 分节会**静默丢失**疾跑加成。

### 第二轮线上修复（2026-09-12，据线上数据 + 原版源码定位）

6. **无敌帧吞击退（`nokb` 真凶）——`EntityLiving.damageEntity`**
   无敌帧内"伤害差值"分支无条件置 `flag = false`，使下方 `if (flag)` 整块被跳过：
   `this.ac()`（置 `velocityChanged`）与 `this.a(...)`（阶段一击退）都不执行。
   伤害照常结算并发出数字/音效，但**没有任何 S12 速度包** —— 这正是玩家反馈的
   "有伤害数字/音效却几乎不位移"，且旧探针只监听 `PlayerVelocityEvent`，完全看不到这些命中。
   现改为：`iframe-knockback: false` 时保持 `flag = true`，走标准击退流程；
   开启时才交给 `applyIframeKnockback` 并置 false 以免重复击退。

7. **W-Tap 连击击退过大——缺失原版 `setSprinting(false)`**
   原版 1.8.8 `EntityHuman.attack` 第 883 行在击退命中后调用 `this.setSprinting(false)`，
   WindSpigot 把它替换为只清 `setExtraKnockback(false)`。而
   `isSprintingEffective() = isExtraKnockback() || isSprinting()`，`isSprinting()` 从未被清
   ⇒ 疾跑额外击退会挂在**每一击**上，而不是只在玩家真正 W-Tap 重按疾跑后的那一击。
   已补回该行（`stop-sprint: true` 时生效），与原版/MMC 一致。

8. **取消疾跑加成叠加——`victim-sprint-extra` 不再叠在攻击方疾跑加成之上**
   按双方真实疾跑状态分组的 MMC 2805 样本显示，双方疾跑一组的中位数
   （0.8514）**低于**攻击方单独疾跑一组（0.9420），即受击方疾跑不会再加一份。
   本引擎沿同一条"攻击方→受击方"方向直接相加（0.527375+0.3594+0.4215=1.308275）
   必被水平上限钳制，故改为二者互斥。

分组对照（修复前线上 630 样本 vs MMC 2805 样本，水平 \|速度包\|）：

| 分组 | 本服（修复前） | MMC |
|---|---|---|
| 攻击方疾跑 · 受击方不疾跑 | med 0.9436 | med 0.9420 |
| 攻击方不疾跑 · 受击方疾跑 | med 0.8868（恒定） | med 0.8289（p10 0.5688） |
| 双方疾跑（W-Tap 连击） | med **0.9494**，66.2% 顶上限 | med **0.8514**，仅 7.7% 顶上限 |

### 重力/顶点丝滑与 1.8 的「客户端权威」约束（2026-09-12 晚）

**必须知道的架构事实**：1.8 里**玩家自己的位移由客户端模拟**。`PlayerConnection` 收到
`PacketPlayInFlying` 后直接 `setLocation(客户端坐标)`，服务端只做 moved-too-quickly 校验；
整条击退只发一次 S12 速度包，之后由**客户端用它自带的原版重力 0.08 / 阻力 0.98** 积分。

因此：

- `gravity.value` / `gravity.apex-scale` 只对**生物**生效（生物由服务端模拟），
  对**玩家受击方**的可见弹道**毫无影响**。
- 想让玩家按服务端重力曲线飞，1.8 下唯一手段是滞空期**逐 tick 补发速度包**覆盖客户端积分
  —— 即 `gravity.client-side`。它会带来每次击退约 8~14 个速度包，这是实现该效果的固有代价，
  与「无敌帧重复补发」那种 bug 性质不同（后者回归检查恒为 0）。

期间还修掉一个把该机制彻底废掉的 bug：`gravityFor()` 旧实现在 `entity.onGround` 为真时
无条件清 `kbGravityOverride`，而击退多发生在站地面的受击方身上、服务端 `onGround` 要到本 tick
`move()` 之后才变 false，`gravityFor()` 却在 `move()` 之前调用 ⇒ 标记在击退后第一 tick 就被清掉。
现在改为 `onGround && motY <= 0` 才解除。

**滞空接管实现要点**（`KnockbackEngine.beginClientFlight` / `tickClientFlight`）：

- 只覆写**竖直**分量；水平分量回填「客户端自己上一 tick 的位移」⇒ 不夺走空中转向/加速手感。
- 落地 / 死亡 / 超 `gravity.client-max-ticks` / 下坠已足够快(`my < -0.5`) / 传送级位移
  ⇒ 立即交回客户端，不产生拉扯。
- 同步写回 `p.motY`，使服务端 moved-too-quickly 校验与客户端真实运动一致。
- 仅在自定义重力或顶点过渡启用时生效（`gravityDiffersFromVanilla()`），回原版即自动关闭；
  `client-side: false` 可整体关闭。

**预期弹道**（`/kbprobe traj`，与 `EntityLiving` 同一公式与顺序）：

| | 原版 | 本配置 |
|---|---|---|
| 等效重力 | 32 m/s² | **25.0 m/s²** |
| 顶点 | 0.6062 格 / 第 4 tick | **0.8067 格 / 第 5 tick** |
| 过零步长 | 0.079（一步翻向） | **0.038 → 0.024**（过渡区 4 tick） |
| 滞空 | 约 8 tick | **12 tick（0.60 秒，+50%）** |

### 第三轮：线上监听复核（2026-09-12 晚，修复后新内核）


用新内核 + KBProbe v1.3 包层采集 396 个样本（测试员与 `/bot start god` 机器人对刀，
机器人 `sprint-reset=0.8` 会持续 W-Tap，正好覆盖出问题的场景）：

| 指标 | 修复前 | 修复后 | MMC |
|---|---|---|---|
| 相邻发包间隔 <480ms（连击窗口内重复发包） | **29.9%** | **0.0%**（min 498ms） | 最短 496ms |
| `ndt 11~20` 仍发包 | 86 条 | **0 条** | 原版此处无包 |
| 水平上限 0.9494 堆积率 | **66.2%** | **0.0%** | 7.7% |
| 双不疾跑 med | — | **0.5274**（与标定值逐位相同） | 0.5274 |
| 攻击疾跑 med | — | 0.9385 | 0.9420 |
| 仅受击方疾跑 med | — | 0.8868（恒定） | 0.8289 |
| 双方疾跑 med | 0.9494 | 0.9473 | 0.8514 |
| 低击退尾巴（<0.527） | 0.5% | 1.3% | 6.9% |
| 垂直击退 | — | 396/396 恒为 0.361375 | 0.361375 |

**W-Tap 语义验证**（把 `events.csv` 的疾跑切换流与 `kb-log.csv` 的命中按时间轴对齐）：
对同一受击方的相邻两次命中，统计攻击方在两次命中之间是否重新按下疾跑
（`stop-sprint` 会在每次命中时清标记，所以只有区间内重按过，本次才该吃加成）：

- 区间内**有**重按（真 W-Tap）：n=321 → **96%** 吃到加成，med 0.9461 ✅
- 区间内**没有**重按：n=27 → 10 条恰为基础值 0.527375、14 条恰为受击方加成值 0.886775（合法），
  仅 **3 条**仍带攻击方加成 —— 这 3 条是被 `damage-increment: false` 整体忽略的点击
  （`flag2=false` 且 `iframeKb=false`，不会走到清疾跑的那一步），与原版 `if (flag2)` 门控一致。

**遗留偏差（未改动，需受控实验才能定论）**：受击方疾跑项与双方疾跑组的中位数
比 MMC 高 0.06~0.10。原因是 MMC 参考数据里的攻击方/受击方疾跑状态取自**客户端上报**，
与服务端真实判定存在 1.8 固有的脱同步（本服探针记录的是服务端权威标记，
因此 `atk_sprint` 与是否吃到加成 100% 对应）；用客户端标记分组会把"服务端其实没疾跑"
的样本误算进疾跑组，从而把该组中位数压低。本服 0.8868 落在 MMC 同组的上沿（max 0.9495）
之内，且该值来自两轮受控采样标定，故保持不变。


### 诊断探针 KBProbe v1.3

在 Bukkit 层（`EntityDamageByEntityEvent` + `PlayerVelocityEvent`）之外增加 ProtocolLib 包层，
捕获原始左键出手包（含被无敌帧吞掉的）与疾跑切换，输出 `events.csv`。
注意 ProtocolLib 5.4.0 **没有** `PacketType.Play.Client.ATTACK`，左键出手是
`USE_ENTITY` + `EntityUseAction.ATTACK`，故用反射读取 action 枚举；
编译期桩类由 `分析/46_stubs2.js` 生成（`ProtocolManager` 必须是 interface，
否则运行时 `IncompatibleClassChangeError`），桩类不打包进 jar。

## 构建

```bat
build.bat
```
需要 Java 8（Zulu 8）与 Maven（tools/apache-maven-3.9.9）。

## 鸣谢 / Credits

- [Wind-Development/WindSpigot](https://github.com/Wind-Development/WindSpigot) — 核心基础
- [CobbleSword/NachoSpigot](https://github.com/CobbleSword/NachoSpigot) — 击退 profile 系统等上游代码
- PaperSpigot / TacoSpigot — 更上游
- [dw1e/KnockbackManager](https://github.com/dw1e/KnockbackManager) — 动态 misplay 与配置文件拆分思路（仅借鉴，未照搬）
- [Revethere 的博客](https://revethere.github.io/posts/academic@min-kb-click-freq-lower-bound/) — 击退运动公式与 MMC 击退算法分析
- [原作者主写，5090dv2主发](https://github.com/5090Dv2) — KB 调试工具（新版适配）与参数 schema

## ⚠️ 重大根因：WindSpigot 异步击退会把击退包发给错误的玩家（2026-09-13）

**这是"全场没有击退 / 有人被反向拉 / 有人收不到击退"的最终根因**，与击退引擎参数无关。

`windspigot.yml` 默认 `async.knockback: true`。开启后 `NetworkManager` 会把
`PacketPlayOutEntityVelocity` 转发到 `CombatThread`，而写出实现
`com.windpvp.windspigot.async.netty.Spigot404Write` 存在致命缺陷：

```java
private static Queue<PacketQueue> packetsQueue = ...;      // ★ static：全服共享队列
public static void writeThenFlush(Channel channel, Packet packet, ...) {
    packetsQueue.add(new PacketQueue(packet, listener));   // ★ 入队时不记录目标玩家
    ...
    channel.pipeline().lastContext().executor().execute(writer::writeQueueAndFlush);
}
public void writeQueueAndFlush() {
    while (packetsQueue.size() > 0)
        ChannelFuture future = this.channel.write(messages.getPacket());  // ★ 用"触发刷新的那个人"的 channel
}
```

⇒ 打给 A 的击退包会被写进 **B 的连接**：

| 玩家看到的 | 真实机制 |
|---|---|
| 「对方无 kb」「全场没有击退」 | A 的击退包发给了 B，A 自己的客户端什么也没收到 |
| 「负数 kb / 被往回拉」 | B 收到的是 **A 的击退向量**，方向自然相反 |
| 「连续发包 / 节奏怪」 | 异步线程按 `combat-thread-tps`(默认 40) 批量 flush |

**顺带解释了为什么诊断层一直看不见它**：该路径直接写 netty channel，**绕过了 ProtocolLib
与 ViaVersion** —— 服务端侧 `PlayerVelocityEvent` 正常触发、velocity 数值完全正确、事件也未被取消，
但任何出包监听都抓不到，客户端同样毫无位移。

**修复**：`windspigot.yml` → `async.knockback: false`（速度包回归正常发包路径）。

**真机验证**（原版 1.8.9 客户端 + 真实伤害路径 `EntityHuman.attack`）：

```
关闭前: 30 tick 内 X/Y/Z 零位移, S12 出包捕获恒为 0 条
关闭后: 水平位移 2.35 格, 顶点升 0.968 格, 滞空 11~12 tick
        S12 捕获: 113,KBVanilla,0.526625,0.361375,-0.027375
真实对打: 基础命中恒为 0.5274, 疾跑命中 med 0.9486 (MMC 0.9420), 零上限堆积
```

> 排查方法论教训：`PlayerVelocityEvent` 触发 ≠ 客户端收到包。事件在**发包之前**触发，
> 之后可能被取消、可能被改写、也可能在**传输层被投递到别处**。要验证"客户端到底收到什么"，
> 必须在出包层（ProtocolLib）或客户端侧取证，并在**前台聚焦的真实客户端**上做端到端复核。