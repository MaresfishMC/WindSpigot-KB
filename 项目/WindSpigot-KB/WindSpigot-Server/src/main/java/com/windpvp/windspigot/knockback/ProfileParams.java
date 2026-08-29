package com.windpvp.windspigot.knockback;

import java.util.ArrayList;
import java.util.List;

/**
 * 模式配置(profile)参数注册表 - GUI「模式参数」分类页共用元数据。
 *
 * 配置文件作为基础KB: 基础击退/对刀PVP/疾跑加成已并入模式文件(KBM 式分节),
 * 加上原核心独有的KB调整项(投射物/wtap/extra/friction/疾跑倍率/misplay),
 * 全部通过本注册表读写 kb配置文件/模式/<名>.yml。
 *
 * @author WindSpigot
 */
public final class ProfileParams {

	private ProfileParams() {
	}

	public static final String CAT_BASE = "基础·地面空中分离";
	public static final String CAT_PVP = "对刀PVP";
	public static final String CAT_PROJ = "投射物";
	public static final String CAT_SPRINT = "疾跑与附加";
	public static final String CAT_ADV = "高级·动态misplay";

	/** 单个模式参数的元数据 */
	public static final class P {
		public final String key; // 文件键(分节点分路径)
		public final String cat;
		public final String desc;
		public final boolean bool;
		public final double step;
		private final Getter getter;
		private final Setter setter;

		P(String key, String cat, String desc, boolean bool, double step, Getter getter, Setter setter) {
			this.key = key;
			this.cat = cat;
			this.desc = desc;
			this.bool = bool;
			this.step = step;
			this.getter = getter;
			this.setter = setter;
		}

		public Object get(CraftKnockbackProfile p) {
			return getter.get(p);
		}

		public void set(CraftKnockbackProfile p, Object v) {
			setter.set(p, v);
		}
	}

	@FunctionalInterface
	public interface Getter {
		Object get(CraftKnockbackProfile p);
	}

	@FunctionalInterface
	public interface Setter {
		void set(CraftKnockbackProfile p, Object v);
	}

	public static final List<P> ALL = new ArrayList<>();

	private static void reg(String key, String cat, String desc, boolean bool, double step, Getter getter,
			Setter setter) {
		ALL.add(new P(key, cat, desc, bool, step, getter, setter));
	}

	private static Setter dbl(Setter s) {
		return s;
	}

	static {
		// ---------- 基础·地面空中分离(原全局 base-kb 并入, KBM 式分节) ----------
		reg("horizontal.ground", CAT_BASE, "基础水平击退(地面)", false, 0.015,
				CraftKnockbackProfile::getHorizontalGround, dbl((p, v) -> p.setHorizontalGround(((Number) v).doubleValue())));
		reg("horizontal.air", CAT_BASE, "基础水平击退(空中)", false, 0.015,
				CraftKnockbackProfile::getHorizontalAir, dbl((p, v) -> p.setHorizontalAir(((Number) v).doubleValue())));
		reg("vertical.ground", CAT_BASE, "基础垂直击退(地面)", false, 0.015,
				CraftKnockbackProfile::getVerticalGround, dbl((p, v) -> p.setVerticalGround(((Number) v).doubleValue())));
		reg("vertical.air", CAT_BASE, "基础垂直击退(空中)", false, 0.015,
				CraftKnockbackProfile::getVerticalAir, dbl((p, v) -> p.setVerticalAir(((Number) v).doubleValue())));
		reg("vertical-limit", CAT_BASE, "垂直击退上限(motY钳制)", false, 0.015,
				CraftKnockbackProfile::getVerticalLimit, dbl((p, v) -> p.setVerticalLimit(((Number) v).doubleValue())));
		reg("vertical-max", CAT_BASE, "垂直上限(旧路径)", false, 0.015, CraftKnockbackProfile::getVerticalMax,
				dbl((p, v) -> p.setVerticalMax(((Number) v).doubleValue())));
		reg("vertical-min", CAT_BASE, "垂直击退下限", false, 0.015, CraftKnockbackProfile::getVerticalMin,
				dbl((p, v) -> p.setVerticalMin(((Number) v).doubleValue())));
		reg("horizontal-momentum", CAT_BASE, "受击水平动量保留(0=完全覆盖)", false, 0.05,
				CraftKnockbackProfile::getHorizontalMomentum, dbl((p, v) -> p.setHorizontalMomentum(((Number) v).doubleValue())));
		reg("vertical-momentum", CAT_BASE, "受击垂直动量保留", false, 0.05, CraftKnockbackProfile::getVerticalMomentum,
				dbl((p, v) -> p.setVerticalMomentum(((Number) v).doubleValue())));
		reg("sprint-extra.horizontal", CAT_BASE, "疾跑额外水平击退(绝对值)", false, 0.025,
				CraftKnockbackProfile::getSprintExtraHorizontal, dbl((p, v) -> p.setSprintExtraHorizontal(((Number) v).doubleValue())));
		reg("sprint-extra.vertical", CAT_BASE, "疾跑额外垂直击退(绝对值)", false, 0.025,
				CraftKnockbackProfile::getSprintExtraVertical, dbl((p, v) -> p.setSprintExtraVertical(((Number) v).doubleValue())));
		reg("friction.horizontal", CAT_BASE, "水平摩擦系数", false, 0.05,
				CraftKnockbackProfile::getFrictionHorizontal, dbl((p, v) -> p.setFrictionHorizontal(((Number) v).doubleValue())));
		reg("friction.vertical", CAT_BASE, "垂直摩擦系数", false, 0.05, CraftKnockbackProfile::getFrictionVertical,
				dbl((p, v) -> p.setFrictionVertical(((Number) v).doubleValue())));
		reg("stop-sprint", CAT_BASE, "命中后取消疾跑标记", true, 1, CraftKnockbackProfile::isStopSprint,
				(p, v) -> p.setStopSprint(Boolean.TRUE.equals(v)));

		// ---------- 对刀PVP(原全局 pvp.* 并入) ----------
		reg("pvp.enabled", CAT_PVP, "对刀独立参数总开关", true, 1, CraftKnockbackProfile::isPvpEnabled,
				(p, v) -> p.setPvpEnabled(Boolean.TRUE.equals(v)));
		reg("pvp.horizontal.ground", CAT_PVP, "对刀水平乘区(地面)", false, 0.02,
				CraftKnockbackProfile::getPvpHorizontalGround, dbl((p, v) -> p.setPvpHorizontalGround(((Number) v).doubleValue())));
		reg("pvp.horizontal.air", CAT_PVP, "对刀水平乘区(空中)", false, 0.02,
				CraftKnockbackProfile::getPvpHorizontalAir, dbl((p, v) -> p.setPvpHorizontalAir(((Number) v).doubleValue())));
		reg("pvp.vertical.ground", CAT_PVP, "对刀垂直乘区(地面)", false, 0.02,
				CraftKnockbackProfile::getPvpVerticalGround, dbl((p, v) -> p.setPvpVerticalGround(((Number) v).doubleValue())));
		reg("pvp.vertical.air", CAT_PVP, "对刀垂直乘区(空中)", false, 0.02,
				CraftKnockbackProfile::getPvpVerticalAir, dbl((p, v) -> p.setPvpVerticalAir(((Number) v).doubleValue())));
		reg("pvp.vertical-limit", CAT_PVP, "对刀垂直上限乘区", false, 0.02, CraftKnockbackProfile::getPvpVerticalLimit,
				dbl((p, v) -> p.setPvpVerticalLimit(((Number) v).doubleValue())));
		reg("pvp.horizontal-momentum", CAT_PVP, "对刀水平动量乘区", false, 0.02,
				CraftKnockbackProfile::getPvpHorizontalMomentum, dbl((p, v) -> p.setPvpHorizontalMomentum(((Number) v).doubleValue())));
		reg("pvp.vertical-momentum", CAT_PVP, "对刀垂直动量乘区", false, 0.02,
				CraftKnockbackProfile::getPvpVerticalMomentum, dbl((p, v) -> p.setPvpVerticalMomentum(((Number) v).doubleValue())));
		reg("pvp.sprint-extra.horizontal", CAT_PVP, "对刀疾跑额外水平击退", false, 0.025,
				CraftKnockbackProfile::getPvpSprintExtraHorizontal, dbl((p, v) -> p.setPvpSprintExtraHorizontal(((Number) v).doubleValue())));
		reg("pvp.sprint-extra.vertical", CAT_PVP, "对刀疾跑额外垂直击退", false, 0.025,
				CraftKnockbackProfile::getPvpSprintExtraVertical, dbl((p, v) -> p.setPvpSprintExtraVertical(((Number) v).doubleValue())));

		// ---------- 投射物(原核心独有) ----------
		reg("projectiles.rod.horizontal", CAT_PROJ, "鱼竿水平击退", false, 0.015,
				CraftKnockbackProfile::getRodHorizontal, dbl((p, v) -> p.setRodHorizontal(((Number) v).doubleValue())));
		reg("projectiles.rod.vertical", CAT_PROJ, "鱼竿垂直击退", false, 0.015,
				CraftKnockbackProfile::getRodVertical, dbl((p, v) -> p.setRodVertical(((Number) v).doubleValue())));
		reg("projectiles.arrow.horizontal", CAT_PROJ, "箭水平击退", false, 0.015,
				CraftKnockbackProfile::getArrowHorizontal, dbl((p, v) -> p.setArrowHorizontal(((Number) v).doubleValue())));
		reg("projectiles.arrow.vertical", CAT_PROJ, "箭垂直击退", false, 0.015,
				CraftKnockbackProfile::getArrowVertical, dbl((p, v) -> p.setArrowVertical(((Number) v).doubleValue())));
		reg("projectiles.pearl.horizontal", CAT_PROJ, "末影珍珠水平击退", false, 0.015,
				CraftKnockbackProfile::getPearlHorizontal, dbl((p, v) -> p.setPearlHorizontal(((Number) v).doubleValue())));
		reg("projectiles.pearl.vertical", CAT_PROJ, "末影珍珠垂直击退", false, 0.015,
				CraftKnockbackProfile::getPearlVertical, dbl((p, v) -> p.setPearlVertical(((Number) v).doubleValue())));
		reg("projectiles.snowball.horizontal", CAT_PROJ, "雪球水平击退", false, 0.015,
				CraftKnockbackProfile::getSnowballHorizontal, dbl((p, v) -> p.setSnowballHorizontal(((Number) v).doubleValue())));
		reg("projectiles.snowball.vertical", CAT_PROJ, "雪球垂直击退", false, 0.015,
				CraftKnockbackProfile::getSnowballVertical, dbl((p, v) -> p.setSnowballVertical(((Number) v).doubleValue())));
		reg("projectiles.egg.horizontal", CAT_PROJ, "鸡蛋水平击退", false, 0.015,
				CraftKnockbackProfile::getEggHorizontal, dbl((p, v) -> p.setEggHorizontal(((Number) v).doubleValue())));
		reg("projectiles.egg.vertical", CAT_PROJ, "鸡蛋垂直击退", false, 0.015,
				CraftKnockbackProfile::getEggVertical, dbl((p, v) -> p.setEggVertical(((Number) v).doubleValue())));

		// ---------- 疾跑与附加(原核心独有) ----------
		reg("extra.horizontal", CAT_SPRINT, "附魔击退水平(每级)", false, 0.015,
				CraftKnockbackProfile::getExtraHorizontal, dbl((p, v) -> p.setExtraHorizontal(((Number) v).doubleValue())));
		reg("extra.vertical", CAT_SPRINT, "附魔击退垂直(每级)", false, 0.015,
				CraftKnockbackProfile::getExtraVertical, dbl((p, v) -> p.setExtraVertical(((Number) v).doubleValue())));
		reg("wtap-extra.horizontal", CAT_SPRINT, "W-Tap额外水平", false, 0.015,
				CraftKnockbackProfile::getWTapExtraHorizontal, dbl((p, v) -> p.setWTapExtraHorizontal(((Number) v).doubleValue())));
		reg("wtap-extra.vertical", CAT_SPRINT, "W-Tap额外垂直", false, 0.015,
				CraftKnockbackProfile::getWTapExtraVertical, dbl((p, v) -> p.setWTapExtraVertical(((Number) v).doubleValue())));
		reg("add.horizontal", CAT_SPRINT, "附加水平击退", false, 0.015, CraftKnockbackProfile::getAddHorizontal,
				dbl((p, v) -> p.setAddHorizontal(((Number) v).doubleValue())));
		reg("add.vertical", CAT_SPRINT, "附加垂直击退", false, 0.015, CraftKnockbackProfile::getAddVertical,
				dbl((p, v) -> p.setAddVertical(((Number) v).doubleValue())));
		reg("sprint-multiplier.horizontal", CAT_SPRINT, "疾跑水平倍率(乘入引擎)", false, 0.02,
				CraftKnockbackProfile::getSprintHorizontalMultiplier, dbl((p, v) -> p.setSprintHorizontalMultiplier(((Number) v).doubleValue())));
		reg("sprint-multiplier.vertical", CAT_SPRINT, "疾跑垂直倍率(乘入引擎)", false, 0.02,
				CraftKnockbackProfile::getSprintVerticalMultiplier, dbl((p, v) -> p.setSprintVerticalMultiplier(((Number) v).doubleValue())));
		reg("sprint-lenient-enabled", CAT_SPRINT, "疾跑宽松判定", true, 1,
				CraftKnockbackProfile::isSprintLenientEnabled, (p, v) -> p.setSprintLenientEnabled(Boolean.TRUE.equals(v)));
		reg("air-multiplier.horizontal", CAT_SPRINT, "空中水平倍率(乘入引擎)", false, 0.02,
				CraftKnockbackProfile::getAirHorizontalMultiplier, dbl((p, v) -> p.setAirHorizontalMultiplier(((Number) v).doubleValue())));
		reg("air-multiplier.vertical", CAT_SPRINT, "空中垂直倍率(乘入引擎)", false, 0.02,
				CraftKnockbackProfile::getAirVerticalMultiplier, dbl((p, v) -> p.setAirVerticalMultiplier(((Number) v).doubleValue())));
		reg("ground-multiplier.horizontal", CAT_SPRINT, "地面水平倍率(乘入引擎)", false, 0.02,
				CraftKnockbackProfile::getGroundHorizontalMultiplier, dbl((p, v) -> p.setGroundHorizontalMultiplier(((Number) v).doubleValue())));
		reg("ground-multiplier.vertical", CAT_SPRINT, "地面垂直倍率(乘入引擎)", false, 0.02,
				CraftKnockbackProfile::getGroundVerticalMultiplier, dbl((p, v) -> p.setGroundVerticalMultiplier(((Number) v).doubleValue())));

		// ---------- 高级·动态misplay ----------
		reg("dynamic-misplay.enabled", CAT_ADV, "动态misplay开关(模式优先)", true, 1,
				CraftKnockbackProfile::isDynamicMisplayEnabled, (p, v) -> p.setDynamicMisplayEnabled(Boolean.TRUE.equals(v)));
		reg("dynamic-misplay.target", CAT_ADV, "目标misplay值", false, 0.02,
				CraftKnockbackProfile::getTargetMisplay, dbl((p, v) -> p.setTargetMisplay(((Number) v).doubleValue())));
		reg("dynamic-misplay.compensation", CAT_ADV, "misplay补偿系数", false, 0.02,
				CraftKnockbackProfile::getMisplayCompensation, dbl((p, v) -> p.setMisplayCompensation(((Number) v).doubleValue())));
	}

	public static List<String> categories() {
		List<String> cats = new ArrayList<>();
		for (P p : ALL) {
			if (!cats.contains(p.cat)) {
				cats.add(p.cat);
			}
		}
		return cats;
	}

	public static List<P> byCategory(String category) {
		List<P> list = new ArrayList<>();
		for (P p : ALL) {
			if (p.cat.equals(category)) {
				list.add(p);
			}
		}
		return list;
	}

	/** 按模式文件分节键精确查找 */
	public static P byKey(String key) {
		for (P p : ALL) {
			if (p.key.equals(key)) {
				return p;
			}
		}
		return null;
	}
}
