# WindSpigot-KB 引擎整改报告

> 日期：2026-08-28
> 范围：仅 KB 引擎核心 + 调试工具 + GUI
> 结论先行：**存在"本末倒置"致命 bug（已确认）**，另有 1 处"隐患性 bug"、1 处功能性缺口。

---

## 一、"基础KB"是否造成本末倒置（辩证判断）

### 1.1 现状事实（代码级证据）

| 攻击类型 | 计算路径 | 是否读取模式配置(profile) |
|---|---|---|
| **玩家近战(核心场景)** | `KnockbackEngine.applyBaseKnockback()` | ❌ **完全绕过** profile 的 horizontal/vertical，只读全局 `base-kb.*` |
| 投射物(rod/arrow/pearl/雪球/鸡蛋) | `EntityLiving.a()` 旧路径 | ✅ 读 profile |
| 非人类近战 | `EntityLiving.a()` 旧路径 | ✅ 读 profile |
| 疾跑/附魔阶段二 | `applySprintKnockback()` | ⚠️ 只读 profile 的 extra(附魔)，疾跑增量读全局 |

### 1.2 判断：是"本末倒置"

原核心的灵魂是**按模式(profile 文件)切换击退手感**。新版引擎加入全局"基础KB"后：

1. PVP 近战完全不受 profile 控制 → **"设为全局模式"按钮对近战手感几乎失效**；
2. 模式文件里改 `horizontal: 0.35` 只有打投射物才生效 → 用户按旧习惯改配置文件毫无效果；
3. 全局 base-kb 反而成了唯一主档 → **"另加的基础KB"取代了"配置文件基础KB"**，主次颠倒。

结论：**确认本末倒置，必须整改。**

### 1.3 整改原则（按用户指示）

- **配置文件（模式 profile）作为基础KB**：PVP 近战基础值优先读受害者 profile。
- **原先的配置文件将水平/空中KB分开**：profile 文件新增 `horizontal-ground` / `horizontal-air` / `vertical-ground` / `vertical-air` 四个键。
- **同时保持原核心内独有的KB调整项**（rod/arrow/pearl/snowball/egg、wtap、extra、friction、疾跑倍率、动态misplay…）并让它们在新引擎中**真正生效**（见第三节隐患修复）。
- 全局 `base-kb.*` 降级为**默认层/模板**：仅当 profile 未定义任何水平/垂直键时兜底，保证旧服务器、旧工具导出的 knockback.yml 不失效（合并语义不变）。
- 新增键向后兼容：旧 profile 文件缺新键时，用旧键 `horizontal`/`vertical` 作为地面=空中两值（手感与旧版一致，且旧配置立即重新控制近战——即整改目标）。

---

## 二、全局选项 vs 单模式(KV)调整 冲突检查表

| 全局引擎参数 | 与单模式冲突? | 判断依据 | 处理 |
|---|---|---|---|
| `base-kb.*`(近战基础值) | ✅ **致命冲突** | 见第一节，profile 被绕过 | 近战基础值改为"profile 分离键 → 全局默认"取值链 |
| `multiplier.*`(全局乘区) | 无冲突 | 乘区是全局手感缩放，且 profile 文件可写引擎键覆盖 | 保留全局；无需搬移 |
| `pvp.multiplier.*` | 无冲突 | 对刀独立乘区，同样支持引擎键覆盖 | 保留 |
| `horizontal/vertical.sprint-extra` | 无实质冲突 | profile 已有疾跑倍率字段可叠加微调 | 保留；并修复"疾跑倍率不生效"隐患(见三) |
| `stop-sprint` / `damage-increment` / `iframe-knockback` / `server-side-kb` / `hit-delay` / `lag-compensation.enabled` | 无冲突 | 系统机制开关，profile 无对应语义 | 保留全局；不搬移 |
| `y-limit.*` / `range-reduction.*` / `combo.*` / `gravity.*` / `air-ground.grace-ticks` / `sprint-reach.*` | 无冲突 | 引擎机制参数，profile 文件可引擎键覆盖 | 保留全局；不搬移 |
| `dynamic-misplay.*`(引擎) | ⚠️ **隐患性冲突** | profile 有同名字段(dynamic-misplay-enabled/target-misplay/misplay-compensation)但**引擎从不读取**，改模式文件无效 | 引擎优先读 profile 显式字段，全局兜底(见三) |
| profile 的 air/ground/sprint 倍率字段 | ⚠️ **隐患性冲突** | 字段存在、文档宣传，但新引擎**从不读取** | 引擎乘入对应倍率(见三) |

---

## 三、隐患性 bug 修复清单（"没有冲突则优化"部分）

1. **动态 misplay 字段失效**：`KnockbackEngine.getMisplayMultiplier()` 只读全局。修复：profile 文件显式写了 `dynamic-misplay-enabled/target-misplay/misplay-compensation` 时优先用 profile 值（`misplayExplicit` 标记），全局为默认。
2. **空中/地面/疾跑倍率字段失效**：`CraftKnockbackProfile` 的 `airHorizontalMultiplier` 等 4 个字段 + `sprintHorizontalMultiplier` 等 2 个字段从未被引擎读取。修复：
   - 阶段一：基础值 × 全局乘区 × profile 空中/地面倍率；
   - 阶段二：sprint-extra 与附魔 extra × profile 疾跑倍率（sprint-lenient-enabled 控制宽松判定是否允许宽限窗口参与）。
3. **模式页/分类页溢出丢失**：GUI 分类页超过 21 个参数时静默截断（`if (slot >= 44) break`），模式管理页同样。修复：**分页**（21 项/页 + 翻页按钮）。

---

## 四、功能性缺口：GUI 无"模式参数"编辑入口

profile 独有调整项（rod/arrow/pearl/wtap/friction/分离键/疾跑倍率/misplay）没有任何 GUI 入口，只能手改 YAML。整改：

- 主页新增 **「模式参数」** 分类（编辑**当前全局模式**的 profile 文件，改完即写回文件）；
- 子分类：`基础(地面/空中分离)`、`投射物`、`疾跑与附加`、`高级(动态misplay)`；
- 全部页面统一分页。

---

## 五、调试工具：旧kbm配置 → 新核心KB 转换 + 双模式并行

现状：旧版工具（`旧版kb调试工具/`，原版 kbm 参数 `horizontal.ground`、`y_limit.*`、`packet.misplace`…）与新版工具（`kb调试工具新版适配/`，新核心键 `base-kb.*`、`y-limit.*`…）互不相通。

整改（在 `kb调试工具新版适配/` 中实施，旧版工具保持原样不动）：

1. **双模式并行**：侧边栏顶部新增模式切换 [🔙 原版kbm] / [🔧 新核心KB]：
   - 原版kbm 模式：完整保留旧工具的参数表、packet.misplace/delay、y_limit 面板、旧导出格式（`horizontal:/vertical:/packet:/y_limit:/projectile:/potion:/hit_delay`），localStorage 键沿用旧工具的 `kbm_*`（旧进度自动迁移）；
   - 新核心模式：现行参数表/BOOLS 面板/knockback.yml 导出，localStorage 键 `kbcore_*` 不变；
   - 两模式状态完全隔离，切换即保存/恢复，互不污染。
2. **旧→新一键转换**：按映射表把原版kbm 模式方案A 的值转换到新核心模式：
   - `horizontal.ground→base-kb.horizontal.ground`、`horizontal.air→base-kb.horizontal.air`、`vertical.*` 同理；
   - `horizontal.sprint_extra→horizontal.sprint-extra`、`vertical.sprint_extra→vertical.sprint-extra`；
   - `hit_delay→hit-delay`、`y_limit.*→y-limit.*`、`y_limit.enabled→y-limit.enabled`；
   - `packet.delay.ticks→hit-delay`（语义近似：延迟tick→受击无敌帧）、`packet.misplace.distance→dynamic-misplay.target`（语义近似：misplace 值→补偿目标值）；
   - `stop_sprint→stop-sprint`；
   - 无法映射项（projectile.*、potion.*、packet.*.enabled、modern.*）→ **列出清单提示**，绝不静默丢弃。

---

## 六、实施清单

| # | 内容 | 文件 |
|---|---|---|
| 1 | profile 分离键(地面/空中) + 兼容旧键 + 保存/复制 | `KnockbackProfile`(API)、`CraftKnockbackProfile` |
| 2 | 引擎近战基础值取值链改为 profile 优先 | `KnockbackEngine` |
| 3 | 引擎乘入 profile 空中/地面/疾跑倍率 | `KnockbackEngine` |
| 4 | misplay 引擎读 profile 显式字段 | `KnockbackEngine`、`CraftKnockbackProfile`、`KnockbackConfig` |
| 5 | 默认模式文件写入分离键 | `KnockbackConfig` |
| 6 | GUI 分页(引擎分类/模式管理/模式参数) | `KnockbackGUI` |
| 7 | GUI「模式参数」分类页(编辑当前全局模式) | 新增 `ProfileParams` 注册表 + `KnockbackGUI` |
| 8 | 工具双模式 + 旧→新转换 | `kb调试工具新版适配/kbm调试仪.html` + `app.js` |
| 9 | 编译 + 运行时验证 + 上传 GitHub | — |

## 七、测试清单

- [ ] 旧 profile 文件(只有 horizontal/vertical)加载后，近战手感 = 旧值(地面=空中)；
- [ ] 新 profile 文件写地面/空中不同值，空中击退与地面击退确实分开；
- [ ] 无任何水平键的空 profile → 回落全局 base-kb（不报错）；
- [ ] profile 显式 dynamic-misplay 字段能改变补偿，全局字段仍兜底；
- [ ] 空中/地面倍率、疾跑倍率在引擎中真实生效（改 0.5 与 2.0 有可感知差异）；
- [ ] GUI 各页翻页不丢参数；模式参数页改值后 reload 仍生效（写回文件验证）；
- [ ] 工具切换模式后两边进度互不污染；旧→新转换后映射值正确、未映射项有提示。
