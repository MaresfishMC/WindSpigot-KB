package com.windpvp.windspigot.knockback;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.apache.logging.log4j.Level;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.bukkit.configuration.InvalidConfigurationException;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import org.sugarcanemc.sugarcane.util.yaml.YamlCommenter;

import com.google.common.base.Throwables;
import com.windpvp.windspigot.WindSpigot;

import dev.cobblesword.nachospigot.knockback.KnockbackProfile;

/**
 * 击退配置管理器 - 支持热更新与多文件拆分（借鉴 dw1e/KnockbackManager 的结构）
 *
 * 文件结构:
 * - knockback.yml          指针文件(knockback.current/players) + 调试工具导入层
 * - kb配置文件/基础击退.yml  基础KB配置(base-kb/multiplier/疾跑加成)
 * - kb配置文件/对刀PVP.yml   对刀独立参数(pvp.*)
 * - kb配置文件/系统开关.yml  系统开关(stop-sprint/hit-delay等)
 * - kb配置文件/高级机制.yml  高级机制(y-limit/range-reduction/combo/gravity/dynamic-misplay)
 * - kb配置文件/模式/<名>.yml 各模式KB调整(旧版profile，每个模式一个文件)
 *
 * 调试工具导出的 knockback.yml 放服务端根目录后 /kb reload，
 * 其中的引擎参数会被自动导入 kb配置文件/ 并从原文件移除。
 *
 * @author WindSpigot
 */
public class KnockbackConfig {
	private static final Logger LOGGER = LogManager.getLogger(KnockbackConfig.class);
	private static File CONFIG_FILE;
	protected static final YamlCommenter c = new YamlCommenter();
	private static final String HEADER = "WindSpigot 击退配置文件\n"
			+ "引擎参数已拆分到 kb配置文件/ 目录(基础击退/对刀PVP/系统开关/高级机制/模式)\n"
			+ "本文件仅保留 knockback.current 与 knockback.players 指针\n"
			+ "调试工具导出的 knockback.yml 放根目录后 /kb reload 会自动导入到 kb配置文件/\n"
			+ "热更新: /kb reload （合并语义: 只覆盖文件中显式存在的键）";
	static YamlConfiguration config;

	private static volatile KnockbackProfile currentKb;
	private static volatile Set<KnockbackProfile> kbProfiles = new HashSet<>();

	// 世界 -> 该世界使用的配置名（玩家切换世界时自动切换手感）
	private static final Map<String, String> worldProfiles = new ConcurrentHashMap<>();

	// 玩家个人击退配置缓存
	private static final Map<String, KnockbackProfile> playerProfiles = new ConcurrentHashMap<>();

	// 配置文件最后修改时间（用于热更新检测）
	private static long lastModified = 0;

	// ==================== 配置文件拆分（借鉴 KnockbackManager 多文件结构） ====================

	/** 引擎配置目录（与服务端根目录 knockback.yml 同级） */
	private static File KB_DIR;
	/** 各模式KB调整目录 */
	private static File MODE_DIR;

	/**
	 * 引擎参数分类 -> 文件名。
	 * 基础击退(base-kb/sprint-extra)、对刀PVP、全局乘区(multiplier)已全部并入模式文件, 不再生成全局文件;
	 * 全局仅剩: 系统开关 / 高级机制(含疾跑宽判)。
	 */
	private static final Map<String, List<String>> CATEGORY_FILES = new LinkedHashMap<>();
	static {
		CATEGORY_FILES.put("系统开关.yml", Arrays.asList(KnockbackEngineSettings.CAT_SYSTEM));
		CATEGORY_FILES.put("高级机制.yml",
				Arrays.asList(KnockbackEngineSettings.CAT_ADVANCED, KnockbackEngineSettings.CAT_SPRINT));
	}

	/** 已并入模式的引擎键 → 模式文件分节键（旧 knockback.yml 导入层路由 + 旧全局文件迁移共用） */
	private static final String[][] MERGED_KEY_MAP = {
			{ "base-kb.horizontal.ground", "horizontal.ground" },
			{ "base-kb.horizontal.air", "horizontal.air" },
			{ "base-kb.vertical.ground", "vertical.ground" },
			{ "base-kb.vertical.air", "vertical.air" },
			{ "base-kb.vertical-limit", "vertical-limit" },
			{ "base-kb.horizontal-momentum", "horizontal-momentum" },
			{ "base-kb.vertical-momentum", "vertical-momentum" },
			{ "horizontal.sprint-extra", "sprint-extra.horizontal" },
			{ "vertical.sprint-extra", "sprint-extra.vertical" },
			{ "pvp.enabled", "pvp.enabled" },
			{ "pvp.multiplier.horizontal.ground", "pvp.horizontal.ground" },
			{ "pvp.multiplier.horizontal.air", "pvp.horizontal.air" },
			{ "pvp.multiplier.vertical.ground", "pvp.vertical.ground" },
			{ "pvp.multiplier.vertical.air", "pvp.vertical.air" },
			{ "pvp.multiplier.vertical-limit", "pvp.vertical-limit" },
			{ "pvp.multiplier.horizontal-momentum", "pvp.horizontal-momentum" },
			{ "pvp.multiplier.vertical-momentum", "pvp.vertical-momentum" },
			{ "pvp.horizontal.sprint-extra", "pvp.sprint-extra.horizontal" },
			{ "pvp.vertical.sprint-extra", "pvp.sprint-extra.vertical" },
			{ "multiplier.horizontal.ground", "multiplier.horizontal.ground" },
			{ "multiplier.horizontal.air", "multiplier.horizontal.air" },
			{ "multiplier.vertical.ground", "multiplier.vertical.ground" },
			{ "multiplier.vertical.air", "multiplier.vertical.air" },
			{ "multiplier.vertical-limit", "multiplier.vertical-limit" },
			{ "multiplier.horizontal-momentum", "multiplier.horizontal-momentum" },
			{ "multiplier.vertical-momentum", "multiplier.vertical-momentum" } };

	public static void init(File configFile) {
		CONFIG_FILE = configFile;
		File parent = CONFIG_FILE.getParentFile();
		KB_DIR = new File(parent == null ? new File(".") : parent, "kb配置文件");
		MODE_DIR = new File(KB_DIR, "模式");
		config = new YamlConfiguration();
		loadConfig();
		lastModified = CONFIG_FILE.lastModified();
	}

	/**
	 * 加载配置文件
	 */
	public static void loadConfig() {
		try {
			WindSpigot.LOGGER.info("加载击退配置文件: " + CONFIG_FILE.getName());
			config.load(CONFIG_FILE);
		} catch (IOException ignored) {
		} catch (InvalidConfigurationException ex) {
			LOGGER.log(Level.ERROR, "无法加载 knockback.yml，请检查语法错误", ex);
			throw Throwables.propagate(ex);
		}
		config.options().copyDefaults(true);
		c.setHeader(HEADER);

		// 旧全局文件迁移(基础击退.yml/对刀PVP.yml → 模式文件分节), 必须在加载模式前执行
		migrateLegacyEngineFiles();

		// 加载所有配置
		loadProfiles();

		// 设置当前使用的击退配置(导入层路由需要, 先于引擎参数加载)
		currentKb = getKbProfileByName(getString("knockback.current", "kohi"));
		if (currentKb == null) {
			WindSpigot.LOGGER.warn("未找到指定的击退配置，使用默认配置 'kohi'");
			currentKb = getKbProfileByName("kohi");
			set("knockback.current", "kohi");
		}

		// 击退引擎全局参数（kb配置文件/ 多文件 + 调试工具导入层）
		loadEngineSettings();

		// 世界 -> 配置映射
		loadWorlds();

		save();
	}

	/**
	 * 热更新配置 - 供 /kb reload 调用
	 */
	public static void reload() {
		WindSpigot.LOGGER.info("热更新击退配置...");
		kbProfiles.clear();
		playerProfiles.clear();
		KnockbackEngine.clearCombos(); // 清空连击缓存，避免旧参数下的连击计数残留
		loadConfig();
		WindSpigot.LOGGER.info("击退配置热更新完成，共加载 " + kbProfiles.size() + " 个配置");
	}

	/**
	 * 检查配置文件是否有更新（自动热更新）
	 */
	public static void checkForUpdates() {
		long currentModified = CONFIG_FILE.lastModified();
		if (currentModified != lastModified) {
			lastModified = currentModified;
			reload();
		}
	}

	/**
	 * 加载所有击退配置（各模式KB调整：kb配置文件/模式/<名>.yml，每个模式一个文件）
	 */
	private static void loadProfiles() {
		MODE_DIR.mkdirs();
		migrateLegacyProfiles();
		ensureDefaultProfileFiles();

		File[] files = MODE_DIR.listFiles((dir, name) -> name.endsWith(".yml"));
		if (files == null) {
			return;
		}
		Arrays.sort(files);
		for (File file : files) {
			loadProfileFromFile(file);
		}
	}

	/** 旧版迁移：knockback.yml 中的 knockback.profiles.* 拆分为 模式/<名>.yml 并移除旧节点 */
	private static void migrateLegacyProfiles() {
		if (!config.isConfigurationSection("knockback.profiles")) {
			return;
		}
		File[] existing = MODE_DIR.listFiles((dir, name) -> name.endsWith(".yml"));
		if (existing != null && existing.length > 0) {
			return; // 已有模式文件，不做迁移
		}
		Set<String> keys = config.getConfigurationSection("knockback.profiles").getKeys(false);
		int migrated = 0;
		for (String key : keys) {
			org.bukkit.configuration.ConfigurationSection section = config
					.getConfigurationSection("knockback.profiles." + key);
			if (section == null) {
				continue;
			}
			YamlConfiguration yml = new YamlConfiguration();
			for (String subKey : section.getKeys(true)) {
				yml.set(subKey, section.get(subKey));
			}
			try {
				yml.save(profileFile(key));
				migrated++;
			} catch (IOException ex) {
				LOGGER.log(Level.ERROR, "迁移模式配置失败: " + key, ex);
			}
		}
		if (migrated > 0) {
			config.set("knockback.profiles", null);
			WindSpigot.LOGGER.info("已将 " + migrated + " 个旧版击退配置迁移到 " + MODE_DIR.getPath());
		}
	}

	/** 默认模式配置（首次运行时生成，每个模式一个文件） */
	private static void ensureDefaultProfileFiles() {
		if (!profileFile("vanilla").exists()) {
			new CraftKnockbackProfile("vanilla").save(true);
		}

		if (!profileFile("windpvp").exists()) {
			final CraftKnockbackProfile windpvpProfile = new CraftKnockbackProfile("windpvp");
			windpvpProfile.setHorizontal(0.35);
			windpvpProfile.setHorizontalGround(0.35);
			windpvpProfile.setHorizontalAir(0.35);
			windpvpProfile.setVerticalGround(0.35);
			windpvpProfile.setVerticalAir(0.35);
			windpvpProfile.setRodHorizontal(0.425);
			windpvpProfile.setArrowHorizontal(0.425);
			windpvpProfile.setPearlHorizontal(0.35);
			windpvpProfile.setSnowballHorizontal(0.425);
			windpvpProfile.setEggHorizontal(0.425);
			windpvpProfile.setExtraHorizontal(0.425);
			windpvpProfile.setWTapExtraHorizontal(0.425);
			windpvpProfile.setVertical(0.35);
			windpvpProfile.setRodVertical(0.425);
			windpvpProfile.setArrowVertical(0.425);
			windpvpProfile.setPearlVertical(0.35);
			windpvpProfile.setSnowballVertical(0.425);
			windpvpProfile.setEggVertical(0.425);
			windpvpProfile.setExtraVertical(0.085);
			windpvpProfile.setWTapExtraVertical(0.085);
			windpvpProfile.save(true);
		}

		if (!profileFile("hypixel").exists()) {
			final CraftKnockbackProfile hypixelProfile = new CraftKnockbackProfile("hypixel");
			hypixelProfile.setVertical(0.36);
			hypixelProfile.setVerticalGround(0.36);
			hypixelProfile.setVerticalAir(0.36);
			hypixelProfile.setVerticalMax(0.43075);
			hypixelProfile.save(true);
		}

		if (!profileFile("kohi").exists()) {
			final CraftKnockbackProfile kohiProfile = new CraftKnockbackProfile("kohi");
			kohiProfile.setHorizontal(0.35);
			kohiProfile.setHorizontalGround(0.35);
			kohiProfile.setHorizontalAir(0.35);
			kohiProfile.setVerticalGround(0.35);
			kohiProfile.setVerticalAir(0.35);
			kohiProfile.setRodHorizontal(0.35);
			kohiProfile.setArrowHorizontal(0.35);
			kohiProfile.setPearlHorizontal(0.35);
			kohiProfile.setSnowballHorizontal(0.35);
			kohiProfile.setEggHorizontal(0.35);
			kohiProfile.setExtraHorizontal(0.425);
			kohiProfile.setWTapExtraHorizontal(0.425);
			kohiProfile.setVertical(0.35);
			kohiProfile.setRodVertical(0.35);
			kohiProfile.setArrowVertical(0.35);
			kohiProfile.setPearlVertical(0.35);
			kohiProfile.setSnowballVertical(0.35);
			kohiProfile.setEggVertical(0.35);
			kohiProfile.setExtraVertical(0.085);
			kohiProfile.setWTapExtraVertical(0.085);
			kohiProfile.save(true);
		}
	}

	/** 模式配置文件路径 */
	public static File profileFile(String name) {
		return new File(MODE_DIR, name + ".yml");
	}

	/** 删除模式配置文件 */
	public static void deleteProfileFile(String name) {
		File file = profileFile(name);
		if (file.exists() && !file.delete()) {
			LOGGER.warn("无法删除模式配置文件: " + file.getPath());
		}
	}

	/**
	 * 基于模板创建新配置（三层合并：硬编码默认值 → 模板文件值 → 完整写出）。
	 * 硬编码默认值在 CraftKnockbackProfile 构造器中体现，loadProfileFromFile 补全缺键，
	 * 因此只需加载模板后 copyFrom 即可得到全部参数的完整副本。
	 * @return 成功返回 true
	 */
	public static boolean createProfileFromTemplate(String templateName, String newName) {
		KnockbackProfile tpl = getKbProfileByName(templateName);
		if (!(tpl instanceof CraftKnockbackProfile)) {
			LOGGER.error("模板不存在或类型错误: " + templateName);
			return false;
		}
		CraftKnockbackProfile source = (CraftKnockbackProfile) tpl;
		CraftKnockbackProfile target = new CraftKnockbackProfile(newName);
		target.copyFrom(source);
		target.setName(newName);
		try {
			target.save(true); // 写出全部参数 + 引擎覆盖
			reload();
			return true;
		} catch (Exception ex) {
			LOGGER.error("创建配置失败: " + newName, ex);
			return false;
		}
	}

	/**
	 * 从模式文件加载单个击退配置。
	 * 双格式兼容: 新版 KBM 式分节(horizontal.ground/air 等) + 旧版扁平键(horizontal/horizontal-ground 等)。
	 */
	private static void loadProfileFromFile(File file) {
		String key = file.getName().substring(0, file.getName().length() - ".yml".length());
		YamlConfiguration yml = loadYaml(file);

		CraftKnockbackProfile profile = (CraftKnockbackProfile) getKbProfileByName(key);
		if (profile == null) {
			profile = new CraftKnockbackProfile(key);
			kbProfiles.add(profile);
		}

		// ---- 近战基础击退: 地面/空中分离 ----
		// 新版分节 horizontal.ground/air; 旧版扁平 horizontal-ground/horizontal(地面=空中)
		boolean hasNewBase = yml.contains("horizontal.ground") || yml.contains("horizontal.air")
				|| yml.contains("vertical.ground") || yml.contains("vertical.air");
		boolean hasLegacyBase = yml.contains("horizontal") || yml.contains("vertical")
				|| yml.contains("horizontal-ground") || yml.contains("horizontal-air")
				|| yml.contains("vertical-ground") || yml.contains("vertical-air");
		double legacyH = yml.getDouble("horizontal", yml.getDouble("horizontal.ground",
				yml.getDouble("horizontal-ground", 0.4D)));
		double legacyV = yml.getDouble("vertical", yml.getDouble("vertical.ground",
				yml.getDouble("vertical-ground", 0.4D)));
		profile.setHorizontalGround(yml.getDouble("horizontal.ground", legacyH));
		profile.setHorizontalAir(yml.getDouble("horizontal.air", yml.getDouble("horizontal-air", legacyH)));
		profile.setVerticalGround(yml.getDouble("vertical.ground", legacyV));
		profile.setVerticalAir(yml.getDouble("vertical.air", yml.getDouble("vertical-air", legacyV)));
		profile.setGroundSplitSet(hasNewBase || hasLegacyBase);
		profile.setBaseExplicit(hasNewBase || hasLegacyBase);
		profile.setHorizontal(legacyH);
		profile.setVertical(legacyV);

		// ---- 垂直钳制与动量(原全局 base-kb 并入) ----
		profile.setVerticalLimit(yml.getDouble("vertical-limit", 0.4D));
		profile.setHorizontalMomentum(yml.getDouble("horizontal-momentum", 0.5D));
		profile.setVerticalMomentum(yml.getDouble("vertical-momentum", 0.5D));
		profile.setClampExplicit(yml.contains("vertical-limit") || yml.contains("horizontal-momentum")
				|| yml.contains("vertical-momentum"));

		// ---- 疾跑额外击退(原全局 sprint-extra 并入) ----
		profile.setSprintExtraHorizontal(yml.getDouble("sprint-extra.horizontal", 0.0D));
		profile.setSprintExtraVertical(yml.getDouble("sprint-extra.vertical", 0.0D));
		profile.setSprintExtraExplicit(yml.contains("sprint-extra.horizontal") || yml.contains("sprint-extra.vertical"));

		// ---- 对刀PVP独立乘区(原全局 pvp.* 并入) ----
		profile.setPvpEnabled(yml.getBoolean("pvp.enabled", true));
		profile.setPvpHorizontalGround(yml.getDouble("pvp.horizontal.ground", 1.0D));
		profile.setPvpHorizontalAir(yml.getDouble("pvp.horizontal.air", 1.0D));
		profile.setPvpVerticalGround(yml.getDouble("pvp.vertical.ground", 1.0D));
		profile.setPvpVerticalAir(yml.getDouble("pvp.vertical.air", 1.0D));
		profile.setPvpVerticalLimit(yml.getDouble("pvp.vertical-limit", 1.0D));
		profile.setPvpHorizontalMomentum(yml.getDouble("pvp.horizontal-momentum", 1.0D));
		profile.setPvpVerticalMomentum(yml.getDouble("pvp.vertical-momentum", 1.0D));
		profile.setPvpSprintExtraHorizontal(yml.getDouble("pvp.sprint-extra.horizontal", 0.0D));
		profile.setPvpSprintExtraVertical(yml.getDouble("pvp.sprint-extra.vertical", 0.0D));
		profile.setPvpExplicit(yml.contains("pvp.enabled") || yml.contains("pvp.horizontal.ground"));

		// ---- 乘区(原全局 multiplier.* 并入, 模式显式 → 全局默认兜底) ----
		profile.setMultHorizontalGround(yml.getDouble("multiplier.horizontal.ground", 1.0D));
		profile.setMultHorizontalAir(yml.getDouble("multiplier.horizontal.air", 1.0D));
		profile.setMultVerticalGround(yml.getDouble("multiplier.vertical.ground", 1.0D));
		profile.setMultVerticalAir(yml.getDouble("multiplier.vertical.air", 1.0D));
		profile.setMultVerticalLimit(yml.getDouble("multiplier.vertical-limit", 1.0D));
		profile.setMultHorizontalMomentum(yml.getDouble("multiplier.horizontal-momentum", 1.0D));
		profile.setMultVerticalMomentum(yml.getDouble("multiplier.vertical-momentum", 1.0D));
		profile.setMultiplierExplicit(yml.contains("multiplier.horizontal.ground")
				|| yml.contains("multiplier.vertical.ground") || yml.contains("multiplier.vertical-limit")
				|| yml.contains("multiplier.horizontal-momentum") || yml.contains("multiplier.vertical-momentum"));

		// ---- 基础/摩擦 ----
		profile.setStopSprint(yml.getBoolean("stop-sprint", true));
		profile.setFrictionHorizontal(yml.getDouble("friction.horizontal", yml.getDouble("friction-horizontal", 2.0D)));
		profile.setFrictionVertical(yml.getDouble("friction.vertical", yml.getDouble("friction-vertical", 2.0D)));
		profile.setVerticalMax(yml.getDouble("vertical-max", 0.4D));
		profile.setVerticalMin(yml.getDouble("vertical-min", -1.0D));

		// ---- 击退附魔与W-Tap ----
		profile.setExtraHorizontal(yml.getDouble("extra.horizontal", yml.getDouble("extra-horizontal", 0.5D)));
		profile.setExtraVertical(yml.getDouble("extra.vertical", yml.getDouble("extra-vertical", 0.1D)));
		profile.setWTapExtraHorizontal(yml.getDouble("wtap-extra.horizontal", yml.getDouble("wtap-extra-horizontal", 0.5D)));
		profile.setWTapExtraVertical(yml.getDouble("wtap-extra.vertical", yml.getDouble("wtap-extra-vertical", 0.1D)));
		profile.setAddHorizontal(yml.getDouble("add.horizontal", yml.getDouble("add-horizontal", 0.0D)));
		profile.setAddVertical(yml.getDouble("add.vertical", yml.getDouble("add-vertical", 0.0D)));

		// ---- 疾跑倍率与宽松判定 ----
		profile.setSprintHorizontalMultiplier(
				yml.getDouble("sprint-multiplier.horizontal", yml.getDouble("sprint-horizontal-multiplier", 1.0D)));
		profile.setSprintVerticalMultiplier(
				yml.getDouble("sprint-multiplier.vertical", yml.getDouble("sprint-vertical-multiplier", 1.0D)));
		profile.setSprintLenientEnabled(yml.getBoolean("sprint-lenient-enabled", true));

		// ---- 空中/地面倍率 ----
		profile.setAirHorizontalMultiplier(
				yml.getDouble("air-multiplier.horizontal", yml.getDouble("air-horizontal-multiplier", 1.0D)));
		profile.setAirVerticalMultiplier(
				yml.getDouble("air-multiplier.vertical", yml.getDouble("air-vertical-multiplier", 1.0D)));
		profile.setGroundHorizontalMultiplier(
				yml.getDouble("ground-multiplier.horizontal", yml.getDouble("ground-horizontal-multiplier", 1.0D)));
		profile.setGroundVerticalMultiplier(
				yml.getDouble("ground-multiplier.vertical", yml.getDouble("ground-vertical-multiplier", 1.0D)));

		// ---- 动态Misplay(模式显式优先, 全局兜底) ----
		profile.setDynamicMisplayEnabled(
				yml.getBoolean("dynamic-misplay.enabled", yml.getBoolean("dynamic-misplay-enabled", false)));
		profile.setTargetMisplay(yml.getDouble("dynamic-misplay.target", yml.getDouble("target-misplay", 0.0D)));
		profile.setMisplayCompensation(
				yml.getDouble("dynamic-misplay.compensation", yml.getDouble("misplay-compensation", 0.5D)));
		profile.setMisplayExplicit(yml.contains("dynamic-misplay.enabled") || yml.contains("dynamic-misplay.target")
				|| yml.contains("dynamic-misplay.compensation") || yml.contains("dynamic-misplay-enabled")
				|| yml.contains("target-misplay") || yml.contains("misplay-compensation"));

		// ---- 投射物击退 ----
		profile.setRodHorizontal(yml.getDouble("projectiles.rod.horizontal", 0.4D));
		profile.setRodVertical(yml.getDouble("projectiles.rod.vertical", 0.4D));
		profile.setArrowHorizontal(yml.getDouble("projectiles.arrow.horizontal", 0.4D));
		profile.setArrowVertical(yml.getDouble("projectiles.arrow.vertical", 0.4D));
		profile.setPearlHorizontal(yml.getDouble("projectiles.pearl.horizontal", 0.4D));
		profile.setPearlVertical(yml.getDouble("projectiles.pearl.vertical", 0.4D));
		profile.setSnowballHorizontal(yml.getDouble("projectiles.snowball.horizontal", 0.4D));
		profile.setSnowballVertical(yml.getDouble("projectiles.snowball.vertical", 0.4D));
		profile.setEggHorizontal(yml.getDouble("projectiles.egg.horizontal", 0.4D));
		profile.setEggVertical(yml.getDouble("projectiles.egg.vertical", 0.4D));

		// ---- 引擎参数覆盖（模式文件中出现的引擎键对该模式受害者优先生效） ----
		// 已并入模式的键(base-kb.*/pvp.*/sprint-extra)跳过: 其模式分节键与引擎路径同名,
		// 若加载为引擎覆盖会在 save 时反向覆盖模式字段写入值(如 pvp.enabled 永远回到文件旧值)
		profile.clearEngineOverrides();
		for (KnockbackEngineSettings.Param p : KnockbackEngineSettings.PARAMS.values()) {
			if (KnockbackConfig.isMergedEnginePath(p.path)) {
				continue;
			}
			if (!yml.contains(p.path)) {
				continue;
			}
			switch (p.type) {
			case DOUBLE:
				profile.setEngineOverride(p.path, yml.getDouble(p.path));
				break;
			case INT:
				profile.setEngineOverride(p.path, yml.getInt(p.path));
				break;
			case BOOL:
				profile.setEngineOverride(p.path, yml.getBoolean(p.path));
				break;
			}
		}
	}

	// ==================== 引擎参数多文件 IO ====================

	/**
	 * 加载 yml 文件并剥离 UTF-8 BOM（记事本等编辑器保存的带 BOM 文件会导致首个键名损坏）
	 */
	public static YamlConfiguration loadYaml(File file) {
		YamlConfiguration yml = new YamlConfiguration();
		try {
			String content = new String(java.nio.file.Files.readAllBytes(file.toPath()),
					java.nio.charset.StandardCharsets.UTF_8);
			if (content.startsWith("\uFEFF")) {
				content = content.substring(1);
			}
			yml.loadFromString(content);
		} catch (IOException | InvalidConfigurationException ex) {
			LOGGER.log(Level.ERROR, "无法加载 " + file.getPath(), ex);
		}
		return yml;
	}

	/**
	 * 旧全局文件迁移:
	 * 1) 基础击退.yml 中的 base-kb(垂直钳制/动量)与 sprint-extra → 各模式文件新分节(仅补缺失键, 不覆盖模式已有值);
	 * 2) 对刀PVP.yml 的 pvp 组 → 各模式文件 pvp 分节;
	 * 3) 全局乘区.yml 的 multiplier 组 → 各模式文件 multiplier 分节(仅补缺失键);
	 * 4) sprint-reach.* 搬运到 高级机制.yml;
	 * 5) 删除旧文件(不再生成)。
	 */
	private static void migrateLegacyEngineFiles() {
		if (KB_DIR == null) {
			return;
		}
		File legacyBase = new File(KB_DIR, "基础击退.yml");
		File legacyPvp = new File(KB_DIR, "对刀PVP.yml");
		File legacyMult = new File(KB_DIR, "全局乘区.yml");
		if (!legacyBase.exists() && !legacyPvp.exists() && !legacyMult.exists()) {
			return;
		}
		WindSpigot.LOGGER.warn("检测到旧全局文件(基础击退.yml/对刀PVP.yml/全局乘区.yml)，开始迁移到模式文件分节...");
		MODE_DIR.mkdirs();
		YamlConfiguration base = legacyBase.exists() ? loadYaml(legacyBase) : new YamlConfiguration();
		YamlConfiguration pvp = legacyPvp.exists() ? loadYaml(legacyPvp) : new YamlConfiguration();
		YamlConfiguration mult = legacyMult.exists() ? loadYaml(legacyMult) : new YamlConfiguration();

		// 旧文件中的键 → 模式分节键(仅补缺失, 不覆盖模式已有值)
		String[][] mergeMap = {
				{ "base-kb.vertical-limit", "vertical-limit" },
				{ "base-kb.horizontal-momentum", "horizontal-momentum" },
				{ "base-kb.vertical-momentum", "vertical-momentum" },
				{ "horizontal.sprint-extra", "sprint-extra.horizontal" },
				{ "vertical.sprint-extra", "sprint-extra.vertical" },
				{ "pvp.enabled", "pvp.enabled" },
				{ "pvp.multiplier.horizontal.ground", "pvp.horizontal.ground" },
				{ "pvp.multiplier.horizontal.air", "pvp.horizontal.air" },
				{ "pvp.multiplier.vertical.ground", "pvp.vertical.ground" },
				{ "pvp.multiplier.vertical.air", "pvp.vertical.air" },
				{ "pvp.multiplier.vertical-limit", "pvp.vertical-limit" },
				{ "pvp.multiplier.horizontal-momentum", "pvp.horizontal-momentum" },
				{ "pvp.multiplier.vertical-momentum", "pvp.vertical-momentum" },
				{ "pvp.horizontal.sprint-extra", "pvp.sprint-extra.horizontal" },
				{ "pvp.vertical.sprint-extra", "pvp.sprint-extra.vertical" },
				{ "multiplier.horizontal.ground", "multiplier.horizontal.ground" },
				{ "multiplier.horizontal.air", "multiplier.horizontal.air" },
				{ "multiplier.vertical.ground", "multiplier.vertical.ground" },
				{ "multiplier.vertical.air", "multiplier.vertical.air" },
				{ "multiplier.vertical-limit", "multiplier.vertical-limit" },
				{ "multiplier.horizontal-momentum", "multiplier.horizontal-momentum" },
				{ "multiplier.vertical-momentum", "multiplier.vertical-momentum" } };

		File[] files = MODE_DIR.listFiles((dir, name) -> name.endsWith(".yml"));
		if (files != null) {
			for (File f : files) {
				YamlConfiguration yml = loadYaml(f);
				boolean changed = false;
				for (String[] m : mergeMap) {
					if (yml.contains(m[1])) {
						continue; // 模式已有该键(模式优先), 不覆盖
					}
					Object src = base.contains(m[0]) ? base.get(m[0]) : pvp.get(m[0]);
					if (src == null) {
						src = mult.get(m[0]);
					}
					if (src == null) {
						continue;
					}
					yml.set(m[1], src);
					changed = true;
				}
				if (changed) {
					try {
						yml.save(f);
					} catch (IOException ex) {
						LOGGER.log(Level.ERROR, "迁移模式文件失败: " + f.getPath(), ex);
					}
				}
			}
		}

		// 全局保留项搬运: sprint-reach → 高级机制.yml (multiplier 已并入模式文件, 不再搬运全局)
		saveGlobalKeysFrom(base, "sprint-reach.");

		if (legacyBase.exists() && legacyBase.delete()) {
			WindSpigot.LOGGER.info("已迁移并删除旧文件: 基础击退.yml");
		}
		if (legacyPvp.exists() && legacyPvp.delete()) {
			WindSpigot.LOGGER.info("已迁移并删除旧文件: 对刀PVP.yml");
		}
		if (legacyMult.exists() && legacyMult.delete()) {
			WindSpigot.LOGGER.info("已迁移并删除旧文件: 全局乘区.yml");
		}
	}

	/** 把旧文件中某前缀的引擎键搬运到对应的新全局分类文件(若新文件缺失) */
	private static void saveGlobalKeysFrom(YamlConfiguration legacy, String prefix) {
		String targetFile = "高级机制.yml";
		File file = new File(KB_DIR, targetFile);
		YamlConfiguration yml = file.exists() ? loadYaml(file) : new YamlConfiguration();
		boolean changed = false;
		for (KnockbackEngineSettings.Param p : KnockbackEngineSettings.PARAMS.values()) {
			if (!p.path.startsWith(prefix)) {
				continue;
			}
			if (legacy.contains(p.path) && !yml.contains(p.path)) {
				yml.set(p.path, legacy.get(p.path));
				changed = true;
			}
		}
		if (changed) {
			try {
				yml.save(file);
			} catch (IOException ex) {
				LOGGER.log(Level.ERROR, "搬运全局键失败: " + file.getPath(), ex);
			}
		}
	}

	/**
	 * 已并入键(基础击退/对刀PVP/疾跑加成) → 当前全局模式文件分节的读写。
	 * /kb set|get 对并入键重定向到这里, 保证"改了真生效且重启不丢"(配置文件作为基础KB)。
	 */

	/** 引擎键 → 模式文件分节键; 非并入键返回 null */
	public static String mergedProfileKey(String enginePath) {
		for (String[] pair : MERGED_KEY_MAP) {
			if (pair[0].equals(enginePath)) {
				return pair[1];
			}
		}
		return null;
	}

	/** 该引擎路径是否属于已并入模式的键(与模式文件分节键同名, 不参与引擎覆盖机制) */
	public static boolean isMergedEnginePath(String enginePath) {
		return mergedProfileKey(enginePath) != null;
	}

	/** 读取当前全局模式该并入键的实际生效值(非并入键或模式无效返回 null) */
	public static Object getMergedValue(String enginePath) {
		String key = mergedProfileKey(enginePath);
		if (key == null) {
			return null;
		}
		ProfileParams.P pp = ProfileParams.byKey(key);
		if (pp == null) {
			return null;
		}
		KnockbackProfile kb = getCurrentKb();
		if (!(kb instanceof CraftKnockbackProfile)) {
			return null;
		}
		return pp.get((CraftKnockbackProfile) kb);
	}

	/**
	 * 把并入键的值写入当前全局模式文件分节并更新内存(即时生效+落盘)。
	 *
	 * @return null 表示成功; 否则返回错误描述
	 */
	public static String setMergedValue(String enginePath, Object value) {
		String key = mergedProfileKey(enginePath);
		if (key == null) {
			return "该键不属于已并入模式的参数";
		}
		ProfileParams.P pp = ProfileParams.byKey(key);
		if (pp == null) {
			return "内部错误: 无此分节键 " + key;
		}
		KnockbackProfile kb = getCurrentKb();
		if (!(kb instanceof CraftKnockbackProfile)) {
			return "当前全局模式无效";
		}
		CraftKnockbackProfile profile = (CraftKnockbackProfile) kb;
		if (pp.bool) {
			if (!(value instanceof Boolean)) {
				return "布尔参数只接受 true/false";
			}
		} else {
			double num = ((Number) value).doubleValue();
			if (Double.isNaN(num) || Double.isInfinite(num)) {
				return "非法数值(NaN/Infinity)";
			}
			// 仅动量保留键限制 [0,1]; multiplier.*-momentum 是乘区, 允许大于 1
			boolean isRetention = key.equals("horizontal-momentum") || key.equals("vertical-momentum");
			if (isRetention && (num < 0.0D || num > 1.0D)) {
				return "动量保留必须在0~1之间";
			}
			if (num < 0.0D && !key.equals("vertical-min") && !key.equals("dynamic-misplay.target")) {
				return "参数不允许为负数";
			}
			value = num;
		}
		pp.set(profile, value);
		profile.save(true);
		return null;
	}

	/**
	 * 加载引擎参数：kb配置文件/ 下各分类文件（合并语义）。
	 * 缺失的分类文件用默认值单独生成, 绝不 resetAll 覆盖已有文件(避免旧服务器部分文件缺失时
	 * 用户自定义的系统开关/高级机制被默认值冲掉)。
	 * 随后检查根目录 knockback.yml 是否含引擎键（调试工具导出）：
	 * 已并入模式的键路由到当前全局模式文件分节，其余导入到分类文件并移除。
	 */
	private static void loadEngineSettings() {
		if (KB_DIR == null) {
			return;
		}
		int total = 0;
		int created = 0;
		for (Map.Entry<String, List<String>> entry : CATEGORY_FILES.entrySet()) {
			File file = new File(KB_DIR, entry.getKey());
			if (!file.exists()) {
				YamlConfiguration yml = new YamlConfiguration();
				for (KnockbackEngineSettings.Param p : KnockbackEngineSettings.PARAMS.values()) {
					if (entry.getValue().contains(p.category)) {
						yml.set(p.path, p.def);
					}
				}
				try {
					yml.save(file);
					created++;
				} catch (IOException ex) {
					LOGGER.log(Level.ERROR, "无法生成 " + file.getPath(), ex);
				}
			} else {
				total += KnockbackEngineSettings.loadFrom(loadYaml(file));
			}
		}
		WindSpigot.LOGGER.info("击退引擎参数加载: " + total + " 个键来自 " + KB_DIR.getPath()
				+ (created > 0 ? "（生成缺失文件 " + created + " 个）" : ""));

		// 调试工具导入层：knockback.yml 中的引擎键 → 分类文件(全局) + 当前模式文件(并入键)
		boolean hasEngine = false;
		for (String path : KnockbackEngineSettings.paths()) {
			if (config.contains(path)) {
				hasEngine = true;
				break;
			}
		}
		if (hasEngine) {
			// 1) 并入模式的键 → 当前全局模式文件分节
			if (currentKb != null) {
				File profileFile = profileFile(currentKb.getName());
				YamlConfiguration pyml = profileFile.exists() ? loadYaml(profileFile) : new YamlConfiguration();
				int merged = 0;
				for (String[] pair : MERGED_KEY_MAP) {
					if (config.contains(pair[0])) {
						pyml.set(pair[1], config.get(pair[0]));
						config.set(pair[0], null);
						merged++;
					}
				}
				if (merged > 0) {
					try {
						pyml.save(profileFile);
						loadProfileFromFile(profileFile); // 重新加载到内存
						WindSpigot.LOGGER.info("已从 knockback.yml 导入 " + merged + " 个并入键到模式 '"
								+ currentKb.getName() + "'");
					} catch (IOException ex) {
						LOGGER.log(Level.ERROR, "导入并入键失败: " + profileFile.getPath(), ex);
					}
				}
			}
			// 2) 其余引擎键 → 分类文件
			int imported = KnockbackEngineSettings.loadFrom(config);
			if (imported > 0) {
				saveEngineSettings();
			}
			int stripped = 0;
			for (String path : KnockbackEngineSettings.paths()) {
				if (config.contains(path)) {
					config.set(path, null);
					stripped++;
				}
			}
			// 清理剥离后残留的空节（如 base-kb: {}）
			for (String topKey : new ArrayList<>(config.getKeys(false))) {
				if (!topKey.equals("knockback") && config.isConfigurationSection(topKey)
						&& config.getConfigurationSection(topKey).getKeys(true).isEmpty()) {
					config.set(topKey, null);
				}
			}
			WindSpigot.LOGGER.info("已从 knockback.yml 导入 " + imported + " 个全局引擎键（原文件已移除 "
					+ stripped + " 个引擎键）");
		}
	}

	/** 持久化引擎参数到 kb配置文件/ 各分类文件（指令/GUI 修改后调用，即时生效无需 reload） */
	public static void saveEngineSettings() {
		if (KB_DIR == null) {
			return;
		}
		KB_DIR.mkdirs();
		for (Map.Entry<String, List<String>> entry : CATEGORY_FILES.entrySet()) {
			File file = new File(KB_DIR, entry.getKey());
			YamlConfiguration yml = file.exists() ? loadYaml(file) : new YamlConfiguration();
			for (KnockbackEngineSettings.Param p : KnockbackEngineSettings.PARAMS.values()) {
				if (entry.getValue().contains(p.category)) {
					yml.set(p.path, p.get());
				}
			}
			try {
				yml.save(file);
			} catch (IOException ex) {
				LOGGER.log(Level.ERROR, "无法保存 " + file.getPath(), ex);
			}
		}
	}

	// ==================== 玩家个人击退配置 ====================

	/**
	 * 获取玩家的击退配置（个人配置优先）
	 */
	public static KnockbackProfile getPlayerProfile(Player player) {
		String playerName = player.getName().toLowerCase();
		KnockbackProfile profile = playerProfiles.get(playerName);
		if (profile == null) {
			// 检查是否有自定义配置
			String customProfileName = getString("knockback.players." + playerName, null);
			if (customProfileName != null) {
				profile = getKbProfileByName(customProfileName);
				if (profile != null) {
					playerProfiles.put(playerName, profile);
				}
			}
		}
		return profile != null ? profile : currentKb;
	}

	/**
	 * 设置玩家的个人击退配置
	 */
	public static void setPlayerProfile(Player player, String profileName) {
		KnockbackProfile profile = getKbProfileByName(profileName);
		if (profile != null) {
			playerProfiles.put(player.getName().toLowerCase(), profile);
			set("knockback.players." + player.getName().toLowerCase(), profileName);
		}
	}

	/**
	 * 清除玩家的个人击退配置
	 */
	public static void clearPlayerProfile(Player player) {
		playerProfiles.remove(player.getName().toLowerCase());
		set("knockback.players." + player.getName().toLowerCase(), null);
	}

	// ==================== 世界配置映射 ====================

	/**
	 * 加载 knockback.worlds 映射: world_name -> profile_name
	 * 格式: knockback.worlds.world_pvp: windpvp
	 */
	private static void loadWorlds() {
		worldProfiles.clear();
		if (!config.isConfigurationSection("knockback.worlds")) {
			return;
		}
		for (String worldName : config.getConfigurationSection("knockback.worlds").getKeys(false)) {
			String profileName = config.getString("knockback.worlds." + worldName, null);
			if (profileName != null && !profileName.isEmpty()) {
				worldProfiles.put(worldName, profileName);
			}
		}
		if (!worldProfiles.isEmpty()) {
			WindSpigot.LOGGER.info("已加载 " + worldProfiles.size() + " 个世界配置映射: " + worldProfiles);
		}
	}

	/**
	 * 玩家切换世界时自动切换击退配置
	 * 由 KnockbackGUI.registerAll() 中注册的 PlayerChangedWorldEvent 处理器调用
	 */
	public static void applyWorldProfile(Player player) {
		String worldName = player.getWorld().getName();
		String profileName = worldProfiles.get(worldName);
		if (profileName != null) {
			KnockbackProfile profile = getKbProfileByName(profileName);
			if (profile != null) {
				playerProfiles.put(player.getName().toLowerCase(), profile);
				return;
			}
			LOGGER.warn("世界 '" + worldName + "' 映射的配置 '" + profileName + "' 不存在");
		}
		// 无映射时清除玩家的个人配置，回退到全局
		playerProfiles.remove(player.getName().toLowerCase());
	}

	// ==================== 基础方法 ====================

	public static KnockbackProfile getCurrentKb() {
		if (currentKb == null) {
			setCurrentKb(getKbProfileByName("vanilla"));
		}
		return currentKb;
	}

	public static void setCurrentKb(KnockbackProfile kb) {
		currentKb = kb;
	}

	public static KnockbackProfile getKbProfileByName(String name) {
		for (KnockbackProfile profile : kbProfiles) {
			if (profile.getName().equalsIgnoreCase(name)) {
				return profile;
			}
		}
		return null;
	}

	public static Set<KnockbackProfile> getKbProfiles() {
		return kbProfiles;
	}

	public static void save() {
		try {
			config.save(CONFIG_FILE);
		} catch (IOException ex) {
			LOGGER.log(Level.ERROR, "无法保存 " + CONFIG_FILE, ex);
		}
	}

	public static void set(String path, Object val) {
		config.set(path, val);
		save();
	}

	public static Set<String> getKeys(String path) {
		if (!config.isConfigurationSection(path)) {
			config.createSection(path);
			return new HashSet<>();
		}
		return config.getConfigurationSection(path).getKeys(false);
	}

	private static boolean getBoolean(String path, boolean def) {
		config.addDefault(path, def);
		return config.getBoolean(path, config.getBoolean(path));
	}

	private static double getDouble(String path, double def) {
		config.addDefault(path, def);
		return config.getDouble(path, config.getDouble(path));
	}

	private static float getFloat(String path, float def) {
		config.addDefault(path, def);
		return config.getFloat(path, config.getFloat(path));
	}

	private static int getInt(String path, int def) {
		config.addDefault(path, def);
		return config.getInt(path, config.getInt(path));
	}

	private static <T> List<T> getList(String path, T def) {
		config.addDefault(path, def);
		return (List<T>) config.getList(path, config.getList(path));
	}

	private static String getString(String path, String def) {
		config.addDefault(path, def);
		return config.getString(path, config.getString(path));
	}
}