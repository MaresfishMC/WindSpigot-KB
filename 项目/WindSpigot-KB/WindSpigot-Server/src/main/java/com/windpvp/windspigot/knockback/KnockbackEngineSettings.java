package com.windpvp.windspigot.knockback;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.bukkit.configuration.file.YamlConfiguration;

/**
 * 击退引擎全局参数（新版 schema，与 KB 调试工具「新版适配」的 knockback.yml 一一对应）。
 *
 * 设计说明:
 * - 所有参数统一注册在 {@link #PARAMS} 注册表中，指令 / GUI / 配置文件共用同一份元数据，
 *   保证「所有参数均可通过指令调整」且井然有序。
 * - 热更新采用「合并」语义：reload 时只覆盖文件中【显式存在】的键，
 *   这样调试工具导出的 YAML（只含工具认识的键）不会冲掉核心扩展参数（如 dynamic-misplay）。
 * - 击退语义（与调试工具注释一致）:
 *   最终击退 = base-kb × multiplier；sprint-extra 为绝对值累加。
 *
 * @author WindSpigot
 */
public class KnockbackEngineSettings {

	/** 参数类型 */
	public enum Type {
		DOUBLE, INT, BOOL
	}

	/** 单个参数的元数据 + 存取器 */
	public static final class Param {
		public final String path; // yml 路径（点分）
		public final Type type;
		public final Object def; // 默认值
		public final String category; // GUI/指令分组
		public final String desc; // 中文说明
		private Object value;

		Param(String path, Type type, Object def, String category, String desc) {
			this.path = path;
			this.type = type;
			this.def = def;
			this.category = category;
			this.desc = desc;
			this.value = def;
		}

		public Object get() {
			return value;
		}

		public double getDouble() {
			return ((Number) value).doubleValue();
		}

		public int getInt() {
			return ((Number) value).intValue();
		}

		public boolean getBool() {
			return (Boolean) value;
		}

		@SuppressWarnings("incomplete-switch")
		public void set(Object v) {
			switch (type) {
			case DOUBLE:
				this.value = ((Number) v).doubleValue();
				break;
			case INT:
				this.value = ((Number) v).intValue();
				break;
			case BOOL:
				this.value = (Boolean) v;
				break;
			}
		}

		public void reset() {
			this.value = def;
		}

		/** GUI 点击调整的推荐步长 */
		public double step() {
			String p = path;
			if (type == Type.INT) return 1;
			if (p.contains("momentum")) return 0.05;
			if (p.contains("multiplier")) return 0.02;
			if (p.contains("gravity")) return 0.005;
			if (p.contains("vertical-limit")) return 0.02;
			if (p.contains("sprint-extra")) return 0.025;
			if (p.contains("range-reduction.factor")) return 0.005;
			if (p.contains("range-reduction.start-range")) return 0.25;
			if (p.contains("range-reduction.max-reduction")) return 0.05;
			if (p.contains("y-limit.max-y-height")) return 0.25;
			if (p.contains("combo.")) return 0.05;
			return 0.015;
		}
	}

	// ==================== 参数注册表（井然有序，按调试工具 YAML_ORDER 排列） ====================
	public static final Map<String, Param> PARAMS = new LinkedHashMap<>();

	private static Param reg(String path, Type type, Object def, String category, String desc) {
		Param p = new Param(path, type, def, category, desc);
		PARAMS.put(path, p);
		return p;
	}

	public static final String CAT_BASE = "基础击退";
	public static final String CAT_MULT = "全局乘区";
	public static final String CAT_SPRINT = "疾跑加成";
	public static final String CAT_PVP = "对刀PVP";
	public static final String CAT_SYSTEM = "系统开关";
	public static final String CAT_ADVANCED = "高级机制";

	static {
		// ---------- 基础击退 base-kb ----------
		reg("base-kb.horizontal.ground", Type.DOUBLE, 0.4D, CAT_BASE, "基础水平击退(地面)");
		reg("base-kb.horizontal.air", Type.DOUBLE, 0.4D, CAT_BASE, "基础水平击退(空中)");
		reg("base-kb.vertical.ground", Type.DOUBLE, 0.4D, CAT_BASE, "基础垂直击退(地面)");
		reg("base-kb.vertical.air", Type.DOUBLE, 0.4D, CAT_BASE, "基础垂直击退(空中)");
		reg("base-kb.vertical-limit", Type.DOUBLE, 0.4D, CAT_BASE, "垂直击退上限(motY钳制)");
		reg("base-kb.horizontal-momentum", Type.DOUBLE, 0.5D, CAT_BASE, "受击水平动量保留(0=完全覆盖)");
		reg("base-kb.vertical-momentum", Type.DOUBLE, 0.5D, CAT_BASE, "受击垂直动量保留");

		// ---------- 全局乘区 multiplier ----------
		reg("multiplier.horizontal.ground", Type.DOUBLE, 1.0D, CAT_MULT, "水平乘区(地面)");
		reg("multiplier.horizontal.air", Type.DOUBLE, 1.0D, CAT_MULT, "水平乘区(空中)");
		reg("multiplier.vertical.ground", Type.DOUBLE, 1.0D, CAT_MULT, "垂直乘区(地面)");
		reg("multiplier.vertical.air", Type.DOUBLE, 1.0D, CAT_MULT, "垂直乘区(空中)");
		reg("multiplier.vertical-limit", Type.DOUBLE, 1.0D, CAT_MULT, "垂直上限乘区");
		reg("multiplier.horizontal-momentum", Type.DOUBLE, 1.0D, CAT_MULT, "水平动量乘区");
		reg("multiplier.vertical-momentum", Type.DOUBLE, 1.0D, CAT_MULT, "垂直动量乘区");

		// ---------- 疾跑加成 sprint-extra（绝对值累加） ----------
		reg("horizontal.sprint-extra", Type.DOUBLE, 0.0D, CAT_SPRINT, "疾跑额外水平击退(绝对值)");
		reg("vertical.sprint-extra", Type.DOUBLE, 0.0D, CAT_SPRINT, "疾跑额外垂直击退(绝对值)");
		reg("sprint-reach.enabled", Type.BOOL, false, CAT_SPRINT, "疾跑宽松判定总开关");
		reg("sprint-reach.grace-ticks", Type.INT, 5, CAT_SPRINT, "疾跑宽限(tick内仍视为疾跑)");
		reg("sprint-reach.extra", Type.DOUBLE, 0.5D, CAT_SPRINT, "疾跑时额外攻击距离(格)");

		// ---------- 对刀 PVP 独立参数 ----------
		reg("pvp.enabled", Type.BOOL, true, CAT_PVP, "对刀独立参数总开关");
		reg("pvp.multiplier.horizontal.ground", Type.DOUBLE, 1.0D, CAT_PVP, "对刀水平乘区(地面)");
		reg("pvp.multiplier.horizontal.air", Type.DOUBLE, 1.0D, CAT_PVP, "对刀水平乘区(空中)");
		reg("pvp.multiplier.vertical.ground", Type.DOUBLE, 1.0D, CAT_PVP, "对刀垂直乘区(地面)");
		reg("pvp.multiplier.vertical.air", Type.DOUBLE, 1.0D, CAT_PVP, "对刀垂直乘区(空中)");
		reg("pvp.multiplier.vertical-limit", Type.DOUBLE, 1.0D, CAT_PVP, "对刀垂直上限乘区");
		reg("pvp.multiplier.horizontal-momentum", Type.DOUBLE, 1.0D, CAT_PVP, "对刀水平动量乘区");
		reg("pvp.multiplier.vertical-momentum", Type.DOUBLE, 1.0D, CAT_PVP, "对刀垂直动量乘区");
		reg("pvp.horizontal.sprint-extra", Type.DOUBLE, 0.0D, CAT_PVP, "对刀疾跑额外水平击退");
		reg("pvp.vertical.sprint-extra", Type.DOUBLE, 0.0D, CAT_PVP, "对刀疾跑额外垂直击退");

		// ---------- 系统开关 ----------
		reg("stop-sprint", Type.BOOL, true, CAT_SYSTEM, "命中后取消疾跑标记(防不同步)");
		reg("damage-increment", Type.BOOL, true, CAT_SYSTEM, "无敌帧内更高伤害结算差值");
		reg("iframe-knockback", Type.BOOL, true, CAT_SYSTEM, "无敌帧内仍然产生击退");
		reg("server-side-kb", Type.BOOL, false, CAT_SYSTEM, "服务端权威击退(不回滚mot)");
		reg("hit-delay", Type.INT, 0, CAT_SYSTEM, "受击无敌帧(tick, 0=无)");
		reg("lag-compensation.enabled", Type.BOOL, false, CAT_SYSTEM, "延迟补偿命中判定");

		// ---------- 高级机制 ----------
		reg("y-limit.enabled", Type.BOOL, true, CAT_ADVANCED, "防连击飞天开关");
		reg("y-limit.max-y-height", Type.DOUBLE, 1.25D, CAT_ADVANCED, "防飞天触发高度差");
		reg("y-limit.vertical-kb-after-limit", Type.DOUBLE, 0.1D, CAT_ADVANCED, "超限后的垂直击退(可为负)");
		reg("range-reduction.enabled", Type.BOOL, false, CAT_ADVANCED, "远距离击退衰减开关");
		reg("range-reduction.start-range", Type.DOUBLE, 3.0D, CAT_ADVANCED, "衰减起始距离(格)");
		reg("range-reduction.factor", Type.DOUBLE, 0.035D, CAT_ADVANCED, "每格衰减量");
		reg("range-reduction.max-reduction", Type.DOUBLE, 0.4D, CAT_ADVANCED, "最大衰减量");
		reg("combo.enabled", Type.BOOL, false, CAT_ADVANCED, "连击递增开关");
		reg("combo.increment", Type.DOUBLE, 0.05D, CAT_ADVANCED, "每次连击水平递增");
		reg("combo.max", Type.DOUBLE, 0.4D, CAT_ADVANCED, "连击递增上限");
		reg("combo.reset-ticks", Type.INT, 40, CAT_ADVANCED, "连击重置间隔(tick)");
		reg("gravity.value", Type.DOUBLE, 0.08D, CAT_ADVANCED, "击退后重力(仅击退滞空时)");
		reg("gravity.air-resistance", Type.DOUBLE, 0.98D, CAT_ADVANCED, "击退后空气阻力");
		// 核心扩展（调试工具不含此节，合并热更新不会丢失）
		reg("dynamic-misplay.enabled", Type.BOOL, false, CAT_ADVANCED, "动态misplay开关(按目标ping补偿)");
		reg("dynamic-misplay.target", Type.DOUBLE, 0.0D, CAT_ADVANCED, "目标misplay值");
		reg("dynamic-misplay.compensation", Type.DOUBLE, 0.5D, CAT_ADVANCED, "misplay补偿系数");
	}

	// ==================== 便捷存取 ====================

	public static Param param(String path) {
		return PARAMS.get(path);
	}

	public static double d(String path) {
		Param p = PARAMS.get(path);
		return p == null ? 0.0D : p.getDouble();
	}

	public static int i(String path) {
		Param p = PARAMS.get(path);
		return p == null ? 0 : p.getInt();
	}

	public static boolean b(String path) {
		Param p = PARAMS.get(path);
		return p != null && p.getBool();
	}

	public static List<String> categories() {
		List<String> cats = new ArrayList<>();
		for (Param p : PARAMS.values()) {
			if (!cats.contains(p.category)) {
				cats.add(p.category);
			}
		}
		return cats;
	}

	public static List<Param> byCategory(String category) {
		List<Param> list = new ArrayList<>();
		for (Param p : PARAMS.values()) {
			if (p.category.equals(category)) {
				list.add(p);
			}
		}
		return list;
	}

	public static void resetAll() {
		for (Param p : PARAMS.values()) {
			p.reset();
		}
	}

	// ==================== 配置文件读写（合并语义） ====================

	/**
	 * 从配置加载：只覆盖文件中【显式存在】的键，其余保持当前值（合并热更新）。
	 *
	 * @return 实际被覆盖的键数量
	 */
	public static int loadFrom(YamlConfiguration config) {
		int loaded = 0;
		for (Param p : PARAMS.values()) {
			if (!config.contains(p.path)) {
				continue; // 文件未显式给出 -> 保留当前值，避免工具导出的 YAML 冲掉核心扩展参数
			}
			switch (p.type) {
			case DOUBLE:
				p.set(config.getDouble(p.path));
				break;
			case INT:
				p.set(config.getInt(p.path));
				break;
			case BOOL:
				p.set(config.getBoolean(p.path));
				break;
			}
			loaded++;
		}
		return loaded;
	}

	/** 将全部参数按注册顺序写入配置（生成模板 / 持久化当前值） */
	public static void saveTo(YamlConfiguration config) {
		for (Param p : PARAMS.values()) {
			config.set(p.path, p.get());
		}
	}

	/** 检查配置文件中是否存在引擎参数节（用于判断是否需要生成模板） */
	public static boolean hasEngineKeys(YamlConfiguration config) {
		return config.contains("base-kb.horizontal.ground");
	}

	/** 参数路径补全列表（指令 tab 补全用） */
	public static List<String> paths() {
		return Collections.unmodifiableList(new ArrayList<>(PARAMS.keySet()));
	}
}
