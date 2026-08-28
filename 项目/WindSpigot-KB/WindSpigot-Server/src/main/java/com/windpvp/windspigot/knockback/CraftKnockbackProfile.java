package com.windpvp.windspigot.knockback;

import java.io.File;
import java.io.IOException;

import org.bukkit.configuration.file.YamlConfiguration;

import dev.cobblesword.nachospigot.knockback.KnockbackProfile;

/**
 * 增强版击退配置实现
 *
 * 基于WindSpigot核心引擎，新增:
 * - 疾跑击退宽松判定
 * - 空中/地面分开判定
 * - 动态misplay调整
 *
 * 存储：每个模式一个文件 kb配置文件/模式/<名>.yml（扁平键，借鉴 dw1e/KnockbackManager 的多文件结构）
 *
 * @author WindSpigot
 */
public class CraftKnockbackProfile implements KnockbackProfile {

	private String name;

	// ==================== 基础击退参数 ====================
	private double horizontal = 0.4D;
	private double vertical = 0.4D;
	// ==================== 近战基础击退: 地面/空中分离(配置文件作为基础KB) ====================
	// 缺分离键时由加载器回落旧键 horizontal/vertical; 两者皆无时引擎回落全局 base-kb
	private double horizontalGround = 0.4D;
	private double horizontalAir = 0.4D;
	private double verticalGround = 0.4D;
	private double verticalAir = 0.4D;
	private boolean groundSplitSet = false;
	private boolean baseExplicit = false;

	// ==================== 垂直钳制与动量(原全局 base-kb 并入) ====================
	private double verticalLimit = 0.4D;
	private double horizontalMomentum = 0.5D;
	private double verticalMomentum = 0.5D;
	private boolean clampExplicit = false;

	// ==================== 疾跑额外击退(原全局 sprint-extra 并入, 绝对值) ====================
	private double sprintExtraHorizontal = 0.0D;
	private double sprintExtraVertical = 0.0D;
	private boolean sprintExtraExplicit = false;

	// ==================== 对刀PVP独立乘区(原全局 pvp.* 并入) ====================
	private boolean pvpEnabled = true;
	private double pvpHorizontalGround = 1.0D;
	private double pvpHorizontalAir = 1.0D;
	private double pvpVerticalGround = 1.0D;
	private double pvpVerticalAir = 1.0D;
	private double pvpVerticalLimit = 1.0D;
	private double pvpHorizontalMomentum = 1.0D;
	private double pvpVerticalMomentum = 1.0D;
	private double pvpSprintExtraHorizontal = 0.0D;
	private double pvpSprintExtraVertical = 0.0D;
	private boolean pvpExplicit = false;

	// 模式文件显式包含 dynamic-misplay 字段(引擎优先读该模式值, 全局兜底)
	private boolean misplayExplicit = false;
	private double verticalMin = -1.0D;
	private double verticalMax = 0.4D;
	private double extraHorizontal = 0.5D;
	private double extraVertical = 0.1D;
	private double frictionHorizontal = 2.0D;
	private double frictionVertical = 2.0D;
	private boolean stopSprint = true;

	// ==================== 投射物击退 ====================
	private double rodHorizontal = 0.4D;
	private double rodVertical = 0.4D;
	private double arrowHorizontal = 0.4D;
	private double arrowVertical = 0.4D;
	private double pearlHorizontal = 0.4D;
	private double pearlVertical = 0.4D;
	private double snowballHorizontal = 0.4D;
	private double snowballVertical = 0.4D;
	private double eggHorizontal = 0.4D;
	private double eggVertical = 0.4D;

	// ==================== W-Tap击退 ====================
	private double wTapHorizontal = 0.5;
	private double wTapVertical = 0.1;

	// ==================== 附加击退 ====================
	private double addHorizontal = 0;
	private double addVertical = 0;

	// ==================== 疾跑击退宽松判定 ====================
	private double sprintHorizontalMultiplier = 1.0D;
	private double sprintVerticalMultiplier = 1.0D;
	private boolean sprintLenientEnabled = true;

	// ==================== 空中/地面分开判定 ====================
	private double airHorizontalMultiplier = 1.0D;
	private double airVerticalMultiplier = 1.0D;
	private double groundHorizontalMultiplier = 1.0D;
	private double groundVerticalMultiplier = 1.0D;

	// ==================== 动态Misplay调整 ====================
	private boolean dynamicMisplayEnabled = false;
	private double targetMisplay = 0.0D;
	private double misplayCompensation = 0.5D;

	// ==================== 引擎参数覆盖（模式文件中的引擎键，优先级高于全局引擎参数） ====================
	private final java.util.Map<String, Object> engineOverrides = new java.util.HashMap<>();

	/** 获取该模式对引擎参数的覆盖值（无覆盖返回 null） */
	public Object getEngineOverride(String path) {
		return engineOverrides.get(path);
	}

	void setEngineOverride(String path, Object value) {
		engineOverrides.put(path, value);
	}

	void clearEngineOverrides() {
		engineOverrides.clear();
	}

	/** 复制另一个配置的所有字段到本配置（含引擎覆盖） */
	public void copyFrom(CraftKnockbackProfile other) {
		this.name = other.name;
		// 基础
		this.horizontal = other.horizontal;
		this.vertical = other.vertical;
		this.horizontalGround = other.horizontalGround;
		this.horizontalAir = other.horizontalAir;
		this.verticalGround = other.verticalGround;
		this.verticalAir = other.verticalAir;
		this.groundSplitSet = other.groundSplitSet;
		this.baseExplicit = other.baseExplicit;
		// 垂直钳制与动量
		this.verticalLimit = other.verticalLimit;
		this.horizontalMomentum = other.horizontalMomentum;
		this.verticalMomentum = other.verticalMomentum;
		this.clampExplicit = other.clampExplicit;
		// 疾跑额外击退
		this.sprintExtraHorizontal = other.sprintExtraHorizontal;
		this.sprintExtraVertical = other.sprintExtraVertical;
		this.sprintExtraExplicit = other.sprintExtraExplicit;
		// 对刀PVP
		this.pvpEnabled = other.pvpEnabled;
		this.pvpHorizontalGround = other.pvpHorizontalGround;
		this.pvpHorizontalAir = other.pvpHorizontalAir;
		this.pvpVerticalGround = other.pvpVerticalGround;
		this.pvpVerticalAir = other.pvpVerticalAir;
		this.pvpVerticalLimit = other.pvpVerticalLimit;
		this.pvpHorizontalMomentum = other.pvpHorizontalMomentum;
		this.pvpVerticalMomentum = other.pvpVerticalMomentum;
		this.pvpSprintExtraHorizontal = other.pvpSprintExtraHorizontal;
		this.pvpSprintExtraVertical = other.pvpSprintExtraVertical;
		this.pvpExplicit = other.pvpExplicit;
		this.misplayExplicit = other.misplayExplicit;
		this.verticalMin = other.verticalMin;
		this.verticalMax = other.verticalMax;
		this.extraHorizontal = other.extraHorizontal;
		this.extraVertical = other.extraVertical;
		this.frictionHorizontal = other.frictionHorizontal;
		this.frictionVertical = other.frictionVertical;
		this.stopSprint = other.stopSprint;
		// 投射物
		this.rodHorizontal = other.rodHorizontal;
		this.rodVertical = other.rodVertical;
		this.arrowHorizontal = other.arrowHorizontal;
		this.arrowVertical = other.arrowVertical;
		this.pearlHorizontal = other.pearlHorizontal;
		this.pearlVertical = other.pearlVertical;
		this.snowballHorizontal = other.snowballHorizontal;
		this.snowballVertical = other.snowballVertical;
		this.eggHorizontal = other.eggHorizontal;
		this.eggVertical = other.eggVertical;
		// W-Tap
		this.wTapHorizontal = other.wTapHorizontal;
		this.wTapVertical = other.wTapVertical;
		// 附加
		this.addHorizontal = other.addHorizontal;
		this.addVertical = other.addVertical;
		// 疾跑宽松判定
		this.sprintHorizontalMultiplier = other.sprintHorizontalMultiplier;
		this.sprintVerticalMultiplier = other.sprintVerticalMultiplier;
		this.sprintLenientEnabled = other.sprintLenientEnabled;
		// 空中/地面
		this.airHorizontalMultiplier = other.airHorizontalMultiplier;
		this.airVerticalMultiplier = other.airVerticalMultiplier;
		this.groundHorizontalMultiplier = other.groundHorizontalMultiplier;
		this.groundVerticalMultiplier = other.groundVerticalMultiplier;
		// 动态Misplay
		this.dynamicMisplayEnabled = other.dynamicMisplayEnabled;
		this.targetMisplay = other.targetMisplay;
		this.misplayCompensation = other.misplayCompensation;
		// 引擎覆盖
		this.engineOverrides.clear();
		this.engineOverrides.putAll(other.engineOverrides);
	}

	/** 获取引擎覆盖映射（只读副本） */
	public java.util.Map<String, Object> getEngineOverrides() {
		return java.util.Collections.unmodifiableMap(engineOverrides);
	}

	public CraftKnockbackProfile(String name) {
		this.name = name;
	}

	@Override
	public void save() {
		save(false);
	}

	@Override
	public void save(boolean projectiles) {
		// 保存到独立的模式文件: kb配置文件/模式/<名>.yml（KBM 式分节）
		File file = KnockbackConfig.profileFile(this.name);
		file.getParentFile().mkdirs();
		YamlConfiguration yml = new YamlConfiguration();

		// ==== 近战基础击退(地面/空中分离) ====
		yml.set("horizontal.ground", this.horizontalGround);
		yml.set("horizontal.air", this.horizontalAir);
		yml.set("vertical.ground", this.verticalGround);
		yml.set("vertical.air", this.verticalAir);
		// ==== 垂直钳制与动量 ====
		yml.set("vertical-limit", this.verticalLimit);
		yml.set("vertical-max", this.verticalMax);
		yml.set("vertical-min", this.verticalMin);
		yml.set("horizontal-momentum", this.horizontalMomentum);
		yml.set("vertical-momentum", this.verticalMomentum);
		// ==== 疾跑额外击退(绝对值) ====
		yml.set("sprint-extra.horizontal", this.sprintExtraHorizontal);
		yml.set("sprint-extra.vertical", this.sprintExtraVertical);
		// ==== 对刀PVP独立乘区 ====
		yml.set("pvp.enabled", this.pvpEnabled);
		yml.set("pvp.horizontal.ground", this.pvpHorizontalGround);
		yml.set("pvp.horizontal.air", this.pvpHorizontalAir);
		yml.set("pvp.vertical.ground", this.pvpVerticalGround);
		yml.set("pvp.vertical.air", this.pvpVerticalAir);
		yml.set("pvp.vertical-limit", this.pvpVerticalLimit);
		yml.set("pvp.horizontal-momentum", this.pvpHorizontalMomentum);
		yml.set("pvp.vertical-momentum", this.pvpVerticalMomentum);
		yml.set("pvp.sprint-extra.horizontal", this.pvpSprintExtraHorizontal);
		yml.set("pvp.sprint-extra.vertical", this.pvpSprintExtraVertical);
		// ==== 摩擦 ====
		yml.set("friction.horizontal", this.frictionHorizontal);
		yml.set("friction.vertical", this.frictionVertical);
		yml.set("stop-sprint", this.stopSprint);
		// ==== 击退附魔与W-Tap ====
		yml.set("extra.horizontal", this.extraHorizontal);
		yml.set("extra.vertical", this.extraVertical);
		yml.set("wtap-extra.horizontal", this.wTapHorizontal);
		yml.set("wtap-extra.vertical", this.wTapVertical);
		yml.set("add.horizontal", this.addHorizontal);
		yml.set("add.vertical", this.addVertical);
		// ==== 疾跑倍率与宽松判定 ====
		yml.set("sprint-multiplier.horizontal", this.sprintHorizontalMultiplier);
		yml.set("sprint-multiplier.vertical", this.sprintVerticalMultiplier);
		yml.set("sprint-lenient-enabled", this.sprintLenientEnabled);
		// ==== 空中/地面倍率 ====
		yml.set("air-multiplier.horizontal", this.airHorizontalMultiplier);
		yml.set("air-multiplier.vertical", this.airVerticalMultiplier);
		yml.set("ground-multiplier.horizontal", this.groundHorizontalMultiplier);
		yml.set("ground-multiplier.vertical", this.groundVerticalMultiplier);
		// ==== 动态Misplay ====
		yml.set("dynamic-misplay.enabled", this.dynamicMisplayEnabled);
		yml.set("dynamic-misplay.target", this.targetMisplay);
		yml.set("dynamic-misplay.compensation", this.misplayCompensation);

		if (projectiles) {
			yml.set("projectiles.rod.horizontal", this.rodHorizontal);
			yml.set("projectiles.rod.vertical", this.rodVertical);
			yml.set("projectiles.arrow.horizontal", this.arrowHorizontal);
			yml.set("projectiles.arrow.vertical", this.arrowVertical);
			yml.set("projectiles.pearl.horizontal", this.pearlHorizontal);
			yml.set("projectiles.pearl.vertical", this.pearlVertical);
			yml.set("projectiles.snowball.horizontal", this.snowballHorizontal);
			yml.set("projectiles.snowball.vertical", this.snowballVertical);
			yml.set("projectiles.egg.horizontal", this.eggHorizontal);
			yml.set("projectiles.egg.vertical", this.eggVertical);
			// 引擎参数覆盖（模式文件中的引擎键对该模式受害者优先生效）
			for (java.util.Map.Entry<String, Object> entry : this.engineOverrides.entrySet()) {
				yml.set(entry.getKey(), entry.getValue());
			}
		}

		try {
			yml.save(file);
		} catch (IOException ex) {
			throw new RuntimeException("无法保存模式配置: " + file.getPath(), ex);
		}
	}

	// ==================== 基础方法实现 ====================

	@Override
	public String getName() {
		return name;
	}

	@Override
	public void setName(String name) {
		this.name = name;
	}

	@Override
	public double getHorizontal() {
		return horizontal;
	}

	@Override
	public void setHorizontal(double horizontal) {
		this.horizontal = horizontal;
	}

	@Override
	public double getVertical() {
		return vertical;
	}

	@Override
	public void setVertical(double vertical) {
		this.vertical = vertical;
	}

	// ==================== 近战基础击退: 地面/空中分离实现 ====================

	@Override
	public double getHorizontalGround() {
		return horizontalGround;
	}

	@Override
	public void setHorizontalGround(double horizontalGround) {
		this.horizontalGround = horizontalGround;
		this.groundSplitSet = true;
	}

	@Override
	public double getHorizontalAir() {
		return horizontalAir;
	}

	@Override
	public void setHorizontalAir(double horizontalAir) {
		this.horizontalAir = horizontalAir;
		this.groundSplitSet = true;
	}

	@Override
	public double getVerticalGround() {
		return verticalGround;
	}

	@Override
	public void setVerticalGround(double verticalGround) {
		this.verticalGround = verticalGround;
		this.groundSplitSet = true;
	}

	@Override
	public double getVerticalAir() {
		return verticalAir;
	}

	@Override
	public void setVerticalAir(double verticalAir) {
		this.verticalAir = verticalAir;
		this.groundSplitSet = true;
	}

	@Override
	public boolean isGroundSplitSet() {
		return groundSplitSet;
	}

	@Override
	public void setGroundSplitSet(boolean splitSet) {
		this.groundSplitSet = splitSet;
	}

	/** 模式文件是否显式包含 dynamic-misplay 字段 */
	public boolean isMisplayExplicit() {
		return misplayExplicit;
	}

	public void setMisplayExplicit(boolean misplayExplicit) {
		this.misplayExplicit = misplayExplicit;
	}

	// ==================== 垂直钳制与动量(原全局 base-kb 并入) ====================

	public boolean isBaseExplicit() {
		return baseExplicit;
	}

	public void setBaseExplicit(boolean baseExplicit) {
		this.baseExplicit = baseExplicit;
	}

	public double getVerticalLimit() {
		return verticalLimit;
	}

	public void setVerticalLimit(double verticalLimit) {
		this.verticalLimit = verticalLimit;
		this.clampExplicit = true;
	}

	public double getHorizontalMomentum() {
		return horizontalMomentum;
	}

	public void setHorizontalMomentum(double horizontalMomentum) {
		this.horizontalMomentum = horizontalMomentum;
		this.clampExplicit = true;
	}

	public double getVerticalMomentum() {
		return verticalMomentum;
	}

	public void setVerticalMomentum(double verticalMomentum) {
		this.verticalMomentum = verticalMomentum;
		this.clampExplicit = true;
	}

	public boolean isClampExplicit() {
		return clampExplicit;
	}

	public void setClampExplicit(boolean clampExplicit) {
		this.clampExplicit = clampExplicit;
	}

	// ==================== 疾跑额外击退(原全局 sprint-extra 并入) ====================

	public double getSprintExtraHorizontal() {
		return sprintExtraHorizontal;
	}

	public void setSprintExtraHorizontal(double v) {
		this.sprintExtraHorizontal = v;
		this.sprintExtraExplicit = true;
	}

	public double getSprintExtraVertical() {
		return sprintExtraVertical;
	}

	public void setSprintExtraVertical(double v) {
		this.sprintExtraVertical = v;
		this.sprintExtraExplicit = true;
	}

	public boolean isSprintExtraExplicit() {
		return sprintExtraExplicit;
	}

	public void setSprintExtraExplicit(boolean explicit) {
		this.sprintExtraExplicit = explicit;
	}

	// ==================== 对刀PVP独立乘区(原全局 pvp.* 并入) ====================

	public boolean isPvpExplicit() {
		return pvpExplicit;
	}

	public void setPvpExplicit(boolean pvpExplicit) {
		this.pvpExplicit = pvpExplicit;
	}

	public boolean isPvpEnabled() {
		return pvpEnabled;
	}

	public void setPvpEnabled(boolean pvpEnabled) {
		this.pvpEnabled = pvpEnabled;
		this.pvpExplicit = true;
	}

	public double getPvpHorizontalGround() {
		return pvpHorizontalGround;
	}

	public void setPvpHorizontalGround(double v) {
		this.pvpHorizontalGround = v;
		this.pvpExplicit = true;
	}

	public double getPvpHorizontalAir() {
		return pvpHorizontalAir;
	}

	public void setPvpHorizontalAir(double v) {
		this.pvpHorizontalAir = v;
		this.pvpExplicit = true;
	}

	public double getPvpVerticalGround() {
		return pvpVerticalGround;
	}

	public void setPvpVerticalGround(double v) {
		this.pvpVerticalGround = v;
		this.pvpExplicit = true;
	}

	public double getPvpVerticalAir() {
		return pvpVerticalAir;
	}

	public void setPvpVerticalAir(double v) {
		this.pvpVerticalAir = v;
		this.pvpExplicit = true;
	}

	public double getPvpVerticalLimit() {
		return pvpVerticalLimit;
	}

	public void setPvpVerticalLimit(double v) {
		this.pvpVerticalLimit = v;
		this.pvpExplicit = true;
	}

	public double getPvpHorizontalMomentum() {
		return pvpHorizontalMomentum;
	}

	public void setPvpHorizontalMomentum(double v) {
		this.pvpHorizontalMomentum = v;
		this.pvpExplicit = true;
	}

	public double getPvpVerticalMomentum() {
		return pvpVerticalMomentum;
	}

	public void setPvpVerticalMomentum(double v) {
		this.pvpVerticalMomentum = v;
		this.pvpExplicit = true;
	}

	public double getPvpSprintExtraHorizontal() {
		return pvpSprintExtraHorizontal;
	}

	public void setPvpSprintExtraHorizontal(double v) {
		this.pvpSprintExtraHorizontal = v;
		this.pvpExplicit = true;
	}

	public double getPvpSprintExtraVertical() {
		return pvpSprintExtraVertical;
	}

	public void setPvpSprintExtraVertical(double v) {
		this.pvpSprintExtraVertical = v;
		this.pvpExplicit = true;
	}

	@Override
	public double getVerticalMin() {
		return verticalMin;
	}

	@Override
	public void setVerticalMin(double verticalMin) {
		this.verticalMin = verticalMin;
	}

	@Override
	public double getVerticalMax() {
		return verticalMax;
	}

	@Override
	public void setVerticalMax(double verticalMax) {
		this.verticalMax = verticalMax;
	}

	@Override
	public double getExtraHorizontal() {
		return extraHorizontal;
	}

	@Override
	public void setExtraHorizontal(double extraHorizontal) {
		this.extraHorizontal = extraHorizontal;
	}

	@Override
	public double getExtraVertical() {
		return extraVertical;
	}

	@Override
	public void setExtraVertical(double extraVertical) {
		this.extraVertical = extraVertical;
	}

	@Override
	public double getFrictionHorizontal() {
		return frictionHorizontal;
	}

	@Override
	public void setFrictionHorizontal(double frictionHorizontal) {
		this.frictionHorizontal = frictionHorizontal;
	}

	@Override
	public double getFrictionVertical() {
		return frictionVertical;
	}

	@Override
	public void setFrictionVertical(double frictionVertical) {
		this.frictionVertical = frictionVertical;
	}

	@Override
	public boolean isStopSprint() {
		return stopSprint;
	}

	@Override
	public void setStopSprint(boolean stopSprint) {
		this.stopSprint = stopSprint;
	}

	// ==================== 投射物击退实现 ====================

	@Override
	public double getRodHorizontal() {
		return rodHorizontal;
	}

	@Override
	public void setRodHorizontal(double rodHorizontal) {
		this.rodHorizontal = rodHorizontal;
	}

	@Override
	public double getRodVertical() {
		return rodVertical;
	}

	@Override
	public void setRodVertical(double rodVertical) {
		this.rodVertical = rodVertical;
	}

	@Override
	public double getArrowHorizontal() {
		return arrowHorizontal;
	}

	@Override
	public void setArrowHorizontal(double arrowHorizontal) {
		this.arrowHorizontal = arrowHorizontal;
	}

	@Override
	public double getArrowVertical() {
		return arrowVertical;
	}

	@Override
	public void setArrowVertical(double arrowVertical) {
		this.arrowVertical = arrowVertical;
	}

	@Override
	public double getPearlHorizontal() {
		return pearlHorizontal;
	}

	@Override
	public void setPearlHorizontal(double pearlHorizontal) {
		this.pearlHorizontal = pearlHorizontal;
	}

	@Override
	public double getPearlVertical() {
		return pearlVertical;
	}

	@Override
	public void setPearlVertical(double pearlVertical) {
		this.pearlVertical = pearlVertical;
	}

	@Override
	public double getSnowballHorizontal() {
		return snowballHorizontal;
	}

	@Override
	public void setSnowballHorizontal(double snowballHorizontal) {
		this.snowballHorizontal = snowballHorizontal;
	}

	@Override
	public double getSnowballVertical() {
		return snowballVertical;
	}

	@Override
	public void setSnowballVertical(double snowballVertical) {
		this.snowballVertical = snowballVertical;
	}

	@Override
	public double getEggHorizontal() {
		return eggHorizontal;
	}

	@Override
	public void setEggHorizontal(double eggHorizontal) {
		this.eggHorizontal = eggHorizontal;
	}

	@Override
	public double getEggVertical() {
		return eggVertical;
	}

	@Override
	public void setEggVertical(double eggVertical) {
		this.eggVertical = eggVertical;
	}

	// ==================== W-Tap击退实现 ====================

	@Override
	public double getWTapExtraHorizontal() {
		return wTapHorizontal;
	}

	@Override
	public void setWTapExtraHorizontal(double wtapHorizontal) {
		this.wTapHorizontal = wtapHorizontal;
	}

	@Override
	public double getWTapExtraVertical() {
		return wTapVertical;
	}

	@Override
	public void setWTapExtraVertical(double wTapVertical) {
		this.wTapVertical = wTapVertical;
	}

	// ==================== 附加击退实现 ====================

	@Override
	public double getAddHorizontal() {
		return addHorizontal;
	}

	@Override
	public void setAddHorizontal(double addHorizontal) {
		this.addHorizontal = addHorizontal;
	}

	@Override
	public double getAddVertical() {
		return addVertical;
	}

	@Override
	public void setAddVertical(double addVertical) {
		this.addVertical = addVertical;
	}

	// ==================== 疾跑击退宽松判定实现 ====================

	@Override
	public double getSprintHorizontalMultiplier() {
		return sprintHorizontalMultiplier;
	}

	@Override
	public void setSprintHorizontalMultiplier(double multiplier) {
		this.sprintHorizontalMultiplier = multiplier;
	}

	@Override
	public double getSprintVerticalMultiplier() {
		return sprintVerticalMultiplier;
	}

	@Override
	public void setSprintVerticalMultiplier(double multiplier) {
		this.sprintVerticalMultiplier = multiplier;
	}

	@Override
	public boolean isSprintLenientEnabled() {
		return sprintLenientEnabled;
	}

	@Override
	public void setSprintLenientEnabled(boolean enabled) {
		this.sprintLenientEnabled = enabled;
	}

	// ==================== 空中/地面分开判定实现 ====================

	@Override
	public double getAirHorizontalMultiplier() {
		return airHorizontalMultiplier;
	}

	@Override
	public void setAirHorizontalMultiplier(double multiplier) {
		this.airHorizontalMultiplier = multiplier;
	}

	@Override
	public double getAirVerticalMultiplier() {
		return airVerticalMultiplier;
	}

	@Override
	public void setAirVerticalMultiplier(double multiplier) {
		this.airVerticalMultiplier = multiplier;
	}

	@Override
	public double getGroundHorizontalMultiplier() {
		return groundHorizontalMultiplier;
	}

	@Override
	public void setGroundHorizontalMultiplier(double multiplier) {
		this.groundHorizontalMultiplier = multiplier;
	}

	@Override
	public double getGroundVerticalMultiplier() {
		return groundVerticalMultiplier;
	}

	@Override
	public void setGroundVerticalMultiplier(double multiplier) {
		this.groundVerticalMultiplier = multiplier;
	}

	// ==================== 动态Misplay调整实现 ====================

	@Override
	public boolean isDynamicMisplayEnabled() {
		return dynamicMisplayEnabled;
	}

	@Override
	public void setDynamicMisplayEnabled(boolean enabled) {
		this.dynamicMisplayEnabled = enabled;
	}

	@Override
	public double getTargetMisplay() {
		return targetMisplay;
	}

	@Override
	public void setTargetMisplay(double targetMisplay) {
		this.targetMisplay = targetMisplay;
	}

	@Override
	public double getMisplayCompensation() {
		return misplayCompensation;
	}

	@Override
	public void setMisplayCompensation(double compensation) {
		this.misplayCompensation = compensation;
	}

	// ==================== 显示值实现 ====================

	@Override
	public String[] getKnockbackValues() {
		return new String[] { "Horizontal§7: " + this.horizontal, "Vertical§7: " + this.vertical,
				"H-Ground§7: " + this.horizontalGround, "H-Air§7: " + this.horizontalAir,
				"V-Ground§7: " + this.verticalGround, "V-Air§7: " + this.verticalAir,
				"Vertical-Max§7: " + this.verticalMax, "Vertical-Min§7: " + this.verticalMin,
				"Extra-Horizontal§7: " + this.extraHorizontal, "Extra-Vertical§7: " + this.extraVertical,
				"Friction-Horizontal§7: " + this.frictionHorizontal, "Friction-Vertical§7: " + this.frictionVertical,
				"Stop-Sprint§7: " + this.stopSprint, "Wtap-Extra-Horizontal§7: " + this.wTapHorizontal,
				"Wtap-Extra-Vertical§7: " + this.wTapVertical, "Add-Horizontal§7: " + this.addHorizontal,
				"Add-Vertical§7: " + this.addVertical };
	}

	@Override
	public String[] getProjectilesValues() {
		return new String[] { "Rod-Horizontal§7: " + this.rodHorizontal, "Rod-Vertical§7: " + this.rodVertical,
				"Arrow-Horizontal§7: " + this.arrowHorizontal, "Arrow-Vertical§7: " + this.arrowVertical,
				"Pearl-Horizontal§7: " + this.pearlHorizontal, "Pearl-Vertical§7: " + this.pearlVertical,
				"Snowball-Horizontal§7: " + this.snowballHorizontal, "Snowball-Vertical§7: " + this.snowballVertical,
				"Egg-Horizontal§7: " + this.eggHorizontal, "Egg-Vertical§7: " + this.eggVertical, };
	}

	@Override
	public String[] getAdvancedValues() {
		return new String[] {
				// 疾跑宽松判定
				"Sprint-Horizontal-Multiplier§7: " + this.sprintHorizontalMultiplier,
				"Sprint-Vertical-Multiplier§7: " + this.sprintVerticalMultiplier,
				"Sprint-Lenient-Enabled§7: " + this.sprintLenientEnabled,
				// 空中/地面判定
				"Air-Horizontal-Multiplier§7: " + this.airHorizontalMultiplier,
				"Air-Vertical-Multiplier§7: " + this.airVerticalMultiplier,
				"Ground-Horizontal-Multiplier§7: " + this.groundHorizontalMultiplier,
				"Ground-Vertical-Multiplier§7: " + this.groundVerticalMultiplier,
				// 动态Misplay
				"Dynamic-Misplay-Enabled§7: " + this.dynamicMisplayEnabled,
				"Target-Misplay§7: " + this.targetMisplay,
				"Misplay-Compensation§7: " + this.misplayCompensation };
	}
}