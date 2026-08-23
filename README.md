# 自定义核心（WindSpigot-KB）

基于 WindSpigot 2.1.4 定制的 Minecraft 1.8.8 PVP 服务器核心，内置新版击退引擎。

## 目录结构

```
项目/WindSpigot-KB/      自定义核心源码（Maven 构建）
kb调试工具新版适配/        KB 调试工具前端（kbm调试仪.html）
build.bat / build.ps1    一键编译脚本（产物输出到 编译后文件/）
项目/使用说明.md          核心使用文档（参数语义、指令、GUI、调试工具配合）
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
