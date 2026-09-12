# 自定义核心（WindSpigot-KB）

基于 WindSpigot 2.1.4 定制的 Minecraft 1.8.8 PVP 服务器核心，内置新版击退引擎。

## 目录结构

```
项目/WindSpigot-KB/      自定义核心源码（Maven 构建）
项目/使用说明.md          核心使用文档（参数语义、指令、GUI、调试工具配合）
项目/mmckb标定/           mmckb 标定报告 + 可直接部署的配置包
kb调试工具新版适配/        KB 调试工具前端（kbm调试仪.html）
分析/                     标定/诊断工具链（脚本 + 服务端探针 KBProbe）
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
3. **`sprint-bonus.no-cancel`（新增，防 "nokb"）**——疾跑/附魔加成沿攻击者朝向施加，
   与沿位置方向的基础击退在夹角 >90° 时反向相消：实测夹角 120/150/180° 时
   \|速度包\| 掉到 0.483/0.266/0.106（打中却几乎不击退）。开启后只保留不反向的分量，
   夹角 <90° 时行为不变。
4. **`victim-sprint-extra` 门控**——去掉"必须朝攻击者运动"的点积条件（实测与朝向无关）。
5. **对刀路由**——`pvp.sprint-extra` 需与 `sprint-extra` 同值，否则引擎对刀路径
   优先读 pvp 分节会**静默丢失**疾跑加成。

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
