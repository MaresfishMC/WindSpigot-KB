# 基础KB调整失效 排查报告

> 日期：2026-08-29
> 现象：用户按旧习惯调整"基础KB"（全局 base-kb 参数）后，击退手感不变。
> 辩证结论：**既不是纯服务器故障，也不是用户操作错误——是"模式并入"整改后旧入口没有同步，导致"改了没生效"+"提示已保存其实是假的"双重失效。属实是核心的配套 bug，必须修。**

---

## 一、辩证分析：谁的问题？

**用户侧**：沿用旧习惯——通过 `/kb set base-kb.horizontal.ground`、GUI"基础击退"分类、或手工编辑 `kb配置文件/基础击退.yml` 来调基础KB。
**服务器侧**：上一轮整改（模式并入）后：

| 入口 | 现状 | 结果 |
|---|---|---|
| GUI"基础击退"分类 | 已删除（并入"模式参数"页） | 用户找不到入口 |
| `/kb set base-kb.*` | 仍可用，但**只改内存快照，不落盘**（saveEngineSettings 已排除并入键的分类文件） | **重启丢失** |
| 近战引擎取值 | 模式文件分节显式时**永远优先 profile**，全局 base-kb 只是兜底默认层 | **改了也不影响近战** |
| 手工编辑 基础击退.yml | 该文件已不再被读取（且迁移时被删除） | **完全无效** |

结论：三个旧入口要么消失、要么假生效、要么假持久化——**"调整不起作用"是真实的配套 bug**。

## 二、根因（代码级）

1. **R1 假持久化**：`KnockbackConfig.CATEGORY_FILES` 只含 全局乘区/系统开关/高级机制，`saveEngineSettings()` 遍历 PARAMS 时跳过 CAT_BASE/CAT_PVP 键 → `/kb set base-kb.*` 提示"已保存"但无文件写入。
2. **R2 假生效**：`KnockbackEngine.applyBaseKnockback` 取值链"模式显式 → 全局"，而所有模式文件（含迁移后的旧文件）都有 `horizontal`/`horizontal-ground` 键 → `isBaseExplicit()=true` → 全局 base-kb 永不生效。
3. **R3 入口缺失**：GUI 全局分类只剩 3 个；`/kb get base-kb.*` 显示的是**内存默认值**，不是当前模式的实际生效值——进一步误导。
4. **R4 连带隐患（真 bug 场景）**：`loadEngineSettings` 的 firstRun 判定只看"全局乘区.yml 是否存在"：若旧服务器删了旧文件但 `saveGlobalKeysFrom` 没生成 全局乘区.yml（旧文件缺少 multiplier 节时），会走 `resetAll()+saveEngineSettings()` → **用默认值覆盖用户已有的 系统开关.yml/高级机制.yml 自定义值**。
5. **R5 同名键冲突（本次排查新发现的真 bug）**：模式文件新分节键与引擎参数路径同名（`pvp.enabled`、`stop-sprint`、`dynamic-misplay.enabled/target/compensation`），加载模式文件时被误当作"引擎覆盖"存入 engineOverrides；`save(true)` 末尾写回引擎覆盖时**反向覆盖**了模式字段刚写入的值——实测：`/kb set pvp.enabled false` 内存生效但文件永远是 true，重启后失效。**这正是"基础KB调整不起作用"的另一半根因。**

## 三、修复方案（保持"配置文件作为基础KB"原则）

| # | 修复 | 效果 |
|---|---|---|
| F1 | `/kb set <并入键>` **重定向**：按 MERGED_KEY_MAP 写入**当前全局模式文件**对应分节 + 更新内存 profile + 落盘；消息改为"已写入模式 X 的 <分节键>" | 旧命令真正生效且持久 |
| F2 | `/kb get <并入键>` 显示**当前模式实际生效值** + 标注"已并入模式 X" | 不再误导 |
| F3 | `loadEngineSettings` 改为**逐文件**加载：缺失的全局文件用默认值生成，**绝不 resetAll 覆盖已有文件** | 消除 R4 |
| F4 | `/kb list` 并入键标注"并入模式，/kb set 将写入当前模式" | 明确指引 |
| F5 | 全局 base-kb 保留为"模式未显式定义时的默认层"（不动） | 老模式文件兼容 |
| F6 | **修复同名键冲突**：并入键跳过引擎覆盖加载与写回（`isMergedEnginePath`） | 消除 R5，`pvp.enabled/stop-sprint/dynamic-misplay` 的 set 真正落盘 |

## 修复验证记录（实测）

- [x] `/kb set pvp.enabled false` → 运行中文件即为 `pvp.enabled: false`；重启后 `/kb get` 仍为 false
- [x] `/kb set base-kb.horizontal.ground 0.6` → 文件 `horizontal.ground: 0.6`；重启后仍生效
- [x] `/kb set base-kb.horizontal-momentum 1.5` → 校验拒绝
- [x] `/kb get base-kb.horizontal.ground` → 显示模式实际值并标注"已并入模式 kohi"
- [ ] 仅缺失 全局乘区.yml 的旧服务器：系统开关/高级机制 自定义值不被覆盖（逐文件生成逻辑，待场景复测）

正确调整基础KB的三种方式（修复后均有效）：
1. GUI「模式参数」→「基础·地面空中分离」（编辑当前全局模式，分节落盘）；
2. `/kb set base-kb.horizontal.ground 0.5`（自动重定向到当前模式）；
3. 直接编辑 `kb配置文件/模式/<名>.yml` 的 `horizontal/vertical` 分节后 `/kb reload`。

## 四、测试清单

- [ ] `/kb set base-kb.horizontal.ground 0.5` → 模式文件 `horizontal.ground: 0.5` + 重启后仍生效
- [ ] `/kb get base-kb.horizontal.ground` → 显示模式实际值并标注
- [ ] `/kb set pvp.enabled false` → 模式文件 pvp.enabled: false
- [ ] 仅缺失 全局乘区.yml 的旧服务器：系统开关/高级机制 自定义值不被覆盖
- [ ] 无任何水平键的老模式文件：仍回落全局默认层
