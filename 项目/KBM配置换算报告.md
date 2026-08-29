# KBM(原版)配置 → 新核心KB 换算报告

> 日期：2026-08-28
> 依据：https://github.com/dw1e/KnockbackManager 源码（VelocityListener.java / PotionListener.java / KBProfile.java / knockback/default.yml）
> 范围：调试工具「旧kbm配置 → 新核心KB」转换功能整改

---

## 一、插件作者(dw1e/KnockbackManager)击退公式梳理

### 1.1 近战基础击退（VelocityListener.computeVelocity）

```
velocity = 单位向量(dx/dist, 1.0, dz/dist)
velocity.x *= hor ; velocity.y *= ver ; velocity.z *= hor
hor/ver = 按数据包地面状态取 (ground | air)
```

**结论：KBM 的 horizontal/vertical 值与新核心引擎 `motX -= x/mag * horizontal` 的数值尺度完全一致（m/tick 级）→ 直接 1:1 换算，无需系数。**

### 1.2 疾跑/附魔击退

```
kbLevel = 击退附魔等级 + (疾跑 ? 1 : 0)
horizontal = kbLevel × HORIZONTAL_SPRINT_EXTRA
velocity.x -= sinYaw × horizontal ; velocity.y += VERTICAL_SPRINT_EXTRA ; velocity.z += cosYaw × horizontal
```

- 疾跑成分（+1 级）→ 新核心 `horizontal.sprint-extra` / `vertical.sprint-extra`（绝对值叠加，语义一致）→ **1:1**
- 附魔成分 → 新核心由模式文件 `extra-horizontal/extra-vertical` 控制（KBM 配置中无独立键，**换算时保持默认，报告中说明**）

### 1.3 投射物击退

```
velocity = (基础 hor/ver 单位向量) × PROJECTILE_HORIZONTAL_MULTIPLIER / PROJECTILE_VERTICAL_MULTIPLIER
箭: multiplier = 1.0 + (冲击等级 × 0.6) / 水平距离
```

**新核心的投射物击退在模式文件(profile)中按 rod/arrow/pearl/snowball/egg 分别配置，没有全局倍率键。按作者公式移植：**

```
模式文件 projectiles.<rod|arrow|pearl|snowball|egg>.horizontal = KBM horizontal.ground × projectile.horizontal_multiplier
模式文件 projectiles.<...>.vertical                              = KBM vertical.ground   × projectile.vertical_multiplier
```

（以地面为基准：KBM 中投射物同样按地面/空中取基础值，新核心模式文件无地面/空中之分，取地面值为主场景基准。）
`projectile.enabled=false` → 旧配置未启用投射物修改 → 模式文件投射物保持默认 0.4，转换提示中说明。
`projectile.direction_override` → 新核心投射物方向统一按攻击者→受害者位置向量计算（引擎内建），无开关，**忽略并提示**。

### 1.4 药水(potion.*)

**源码确认：potion 是"投掷型药水(喷溅药水)的投掷运动修改"**（掷出速度倍率 + 命中自身强度补偿，PotionListener），**不是受害者击退**。新核心引擎无药水系统 → **无法换算，忽略并提示**。

### 1.5 modern.*

`cooldown_affects_kb` / `netherite_kb_resistance` 均为 **1.16+ 机制**（攻击冷却 / 下界合金抗性）。本核心为 **1.8.8** → 机制不存在 → **忽略并提示**。

### 1.6 y_limit / hit_delay / packet

| KBM | 语义 | 新核心 | 换算 |
|---|---|---|---|
| `y_limit.max_y_height` / `vertical_kb_after_limit` / `enabled` | 触顶状态机(触顶后到落地持续负击退) | `y-limit.*`(本击高度差判定) | 1:1（语义近似，提示） |
| `hit_delay` | 最大无敌帧(攻击间隔) | `hit-delay`(受击无敌帧) | **1:1 直接对应** |
| `packet.delay.ticks` | 延迟发送位置更新包 | 无对应(引擎无位置包机制) | 近似 → `hit-delay`(仅当 hit_delay 缺失时)；提示"位置包延迟无对应" |
| `packet.misplace.distance` | 位置包错位(格) | `dynamic-misplay.target`(ping补偿目标值) | 1:1 近似；`misplace.enabled=true` → 同时开启 `dynamic-misplay.enabled` |
| `stop_sprint` | 攻击后重置疾跑 | `stop-sprint`(命中后取消疾跑标记) | 1:1 |

### 1.7 vertical-max 补全

KBM 无垂直上限键（上限由 y_limit 状态机承担）。换算生成模式文件时 `vertical-max = max(vertical.ground, vertical.air)`，`vertical-min = -1.0`（新核心默认）。

---

## 二、换算总表

> 更新(2026-08-28)：基础击退/对刀PVP/疾跑加成已并入模式文件（见《模式并入整改报告》），
> 以下换算目标中的近战基础类键现写入 **模式文件(KBM式分节)**，knockback.yml 仅含全局乘区/机制键。

| 原KBM键 | 新核心目标 | 公式 | 类别 |
|---|---|---|---|
| horizontal.ground / air | 模式文件 `horizontal.ground/air` | ×1 | 精确 |
| vertical.ground / air | 模式文件 `vertical.ground/air` | ×1 | 精确 |
| horizontal.sprint_extra / vertical.sprint_extra | 模式文件 `sprint-extra.horizontal/vertical` | ×1 | 精确 |
| hit_delay | knockback.yml `hit-delay` | ×1 | 精确 |
| y_limit.* | knockback.yml `y-limit.*` + BOOLS | ×1 | 精确(机制近似) |
| stop_sprint | 模式文件 `stop-sprint` + BOOLS `stop-sprint` | = | 精确 |
| packet.misplace.distance(+enabled) | 模式文件+全局 `dynamic-misplay.target`(+`enabled`) | ×1 | 近似 |
| packet.delay.ticks | `hit-delay`（仅 hit_delay 缺失时） | ×1 | 近似 |
| projectile.horizontal_multiplier / vertical_multiplier | 模式文件 projectiles.*.horizontal/vertical | 基础值×倍率 | **作者公式** |
| projectile.enabled | 模式文件投射物是否保持默认 | =false→保持默认 | 提示 |
| projectile.direction_override | 无对应(引擎内建) | — | 忽略提示 |
| potion.* | 无对应(1.8.8无药水系统) | — | 忽略提示 |
| packet.delay.enabled / packet.misplace.enabled(开关本身) | 并入上述近似 | — | 提示 |
| modern.* | 无对应(1.8.8无此机制) | — | 忽略提示 |
| 模式文件 horizontal-ground/air、vertical-ground/air | 由 KBM horizontal/vertical 1:1 生成 | ×1 | 精确 |

**同时生成两个文件（均为下载）：**
1. `knockback.yml` —— 全局引擎键（放服务端根目录 `/kb reload` 生效）
2. `模式<名>.yml` —— 模式配置（含地面/空中分离键 + 投射物换算值，放 `kb配置文件/模式/`，用 GUI/指令设为全局）

---

## 三、交互 bug 修复

**现状**：点击「🔄 旧kbm配置 → 新核心KB」直接转换工具内原版kbm模式的方案值——没有"导入配置"环节（"没有配置点击"）。

**修复**：点击按钮 → 弹出**文件选择器**（.yml/.yaml）→ 解析所选 KBM 配置文件 → 按上表换算 → 下载 knockback.yml + 模式文件 → 应用到新核心模式并切换 → 弹出换算摘要（精确/近似/忽略分类）。取消选择 → 提示"已取消，未选择配置"。

---

## 四、测试清单

- [ ] 点击转换按钮弹出文件选择器；取消有提示
- [ ] 导入 dw1e 默认配置(default.yml) → 下载两文件；knockback.yml 键值正确(1:1)；模式文件投射物 = 0.4×1.0
- [ ] 投射物倍率 2.0 → 模式文件投射物 0.8；enabled=false → 保持 0.4 并提示
- [ ] packet.misplace.enabled=true → dynamic-misplay.enabled=true
- [ ] potion.* / modern.* / direction_override → 忽略项提示
- [ ] 转换后自动切换新核心模式且 schemeA/B 已填充
