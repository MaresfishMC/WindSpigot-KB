package com.windpvp.windspigot.knockback;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import dev.cobblesword.nachospigot.knockback.KnockbackProfile;
import net.minecraft.server.AxisAlignedBB;
import net.minecraft.server.ChatComponentText;
import net.minecraft.server.Entity;
import net.minecraft.server.EntityHuman;
import net.minecraft.server.EntityLiving;
import net.minecraft.server.EntityPlayer;
import net.minecraft.server.MathHelper;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.PacketPlayOutChat;
import net.minecraft.server.PacketPlayOutEntityVelocity;

/**
 * 击退引擎（以原核心引擎为基础优化）。
 *
 * 击退分两个阶段（与原版一致）:
 * - 阶段一 {@link #applyBaseKnockback}：仅与双方 XZ 相对位置相关，
 *   最终击退 = 基础值(模式分节显式 → 全局默认) × 乘区（对刀走 pvp 乘区），
 *   附加距离衰减(MMC式)、连击递增、防飞天限高、垂直上限钳制。
 * - 阶段二 {@link #applySprintKnockback}：仅与攻击者 yaw 和疾跑状态相关，
 *   sprint-extra 为绝对值累加（模式分节显式 → 全局默认），击退附魔按等级叠加。
 *
 * 取值链（配置文件作为基础KB, 基础击退/对刀PVP/疾跑加成已并入模式文件）:
 *   模式文件分节键(显式) → 引擎全局参数(隐藏兼容默认层) → 硬编码默认
 *
 * 运行速率优化: 引擎热路径使用静态缓存的 {@link KnockbackEngineSettings.Param} 引用,
 * 原每次 3 次 HashMap 查找 → 1 次; 每次击退只取一次受害者 profile 引用。
 *
 * @author WindSpigot
 */
public final class KnockbackEngine {

	private KnockbackEngine() {
	}

	// ==================== 热路径参数缓存（运行速率优化） ====================

	/** 静态缓存 Param 引用, 避免热路径反复 PARAMS.get(path) 哈希查找 */
	private static final class P {
		static final KnockbackEngineSettings.Param PVP_ENABLED = KnockbackEngineSettings.param("pvp.enabled");
		static final KnockbackEngineSettings.Param BASE_H_G = KnockbackEngineSettings.param("base-kb.horizontal.ground");
		static final KnockbackEngineSettings.Param BASE_H_A = KnockbackEngineSettings.param("base-kb.horizontal.air");
		static final KnockbackEngineSettings.Param BASE_V_G = KnockbackEngineSettings.param("base-kb.vertical.ground");
		static final KnockbackEngineSettings.Param BASE_V_A = KnockbackEngineSettings.param("base-kb.vertical.air");
		static final KnockbackEngineSettings.Param BASE_V_LIMIT = KnockbackEngineSettings.param("base-kb.vertical-limit");
		static final KnockbackEngineSettings.Param BASE_H_MOM = KnockbackEngineSettings.param("base-kb.horizontal-momentum");
		static final KnockbackEngineSettings.Param BASE_V_MOM = KnockbackEngineSettings.param("base-kb.vertical-momentum");
		static final KnockbackEngineSettings.Param MULT_H_G = KnockbackEngineSettings.param("multiplier.horizontal.ground");
		static final KnockbackEngineSettings.Param MULT_H_A = KnockbackEngineSettings.param("multiplier.horizontal.air");
		static final KnockbackEngineSettings.Param MULT_V_G = KnockbackEngineSettings.param("multiplier.vertical.ground");
		static final KnockbackEngineSettings.Param MULT_V_A = KnockbackEngineSettings.param("multiplier.vertical.air");
		static final KnockbackEngineSettings.Param MULT_V_LIMIT = KnockbackEngineSettings.param("multiplier.vertical-limit");
		static final KnockbackEngineSettings.Param MULT_H_MOM = KnockbackEngineSettings.param("multiplier.horizontal-momentum");
		static final KnockbackEngineSettings.Param MULT_V_MOM = KnockbackEngineSettings.param("multiplier.vertical-momentum");
		static final KnockbackEngineSettings.Param SPRINT_H = KnockbackEngineSettings.param("horizontal.sprint-extra");
		static final KnockbackEngineSettings.Param SPRINT_V = KnockbackEngineSettings.param("vertical.sprint-extra");
		static final KnockbackEngineSettings.Param PVP_MULT_H_G = KnockbackEngineSettings.param("pvp.multiplier.horizontal.ground");
		static final KnockbackEngineSettings.Param PVP_MULT_H_A = KnockbackEngineSettings.param("pvp.multiplier.horizontal.air");
		static final KnockbackEngineSettings.Param PVP_MULT_V_G = KnockbackEngineSettings.param("pvp.multiplier.vertical.ground");
		static final KnockbackEngineSettings.Param PVP_MULT_V_A = KnockbackEngineSettings.param("pvp.multiplier.vertical.air");
		static final KnockbackEngineSettings.Param PVP_MULT_V_LIMIT = KnockbackEngineSettings.param("pvp.multiplier.vertical-limit");
		static final KnockbackEngineSettings.Param PVP_MULT_H_MOM = KnockbackEngineSettings.param("pvp.multiplier.horizontal-momentum");
		static final KnockbackEngineSettings.Param PVP_MULT_V_MOM = KnockbackEngineSettings.param("pvp.multiplier.vertical-momentum");
		static final KnockbackEngineSettings.Param PVP_SPRINT_H = KnockbackEngineSettings.param("pvp.horizontal.sprint-extra");
		static final KnockbackEngineSettings.Param PVP_SPRINT_V = KnockbackEngineSettings.param("pvp.vertical.sprint-extra");
		static final KnockbackEngineSettings.Param Y_LIMIT_ENABLED = KnockbackEngineSettings.param("y-limit.enabled");
		static final KnockbackEngineSettings.Param Y_LIMIT_MAX = KnockbackEngineSettings.param("y-limit.max-y-height");
		static final KnockbackEngineSettings.Param Y_LIMIT_AFTER = KnockbackEngineSettings.param("y-limit.vertical-kb-after-limit");
		static final KnockbackEngineSettings.Param RANGE_ENABLED = KnockbackEngineSettings.param("range-reduction.enabled");
		static final KnockbackEngineSettings.Param RANGE_START = KnockbackEngineSettings.param("range-reduction.start-range");
		static final KnockbackEngineSettings.Param RANGE_FACTOR = KnockbackEngineSettings.param("range-reduction.factor");
		static final KnockbackEngineSettings.Param RANGE_MAX = KnockbackEngineSettings.param("range-reduction.max-reduction");
		static final KnockbackEngineSettings.Param COMBO_ENABLED = KnockbackEngineSettings.param("combo.enabled");
		static final KnockbackEngineSettings.Param COMBO_INC = KnockbackEngineSettings.param("combo.increment");
		static final KnockbackEngineSettings.Param COMBO_MAX = KnockbackEngineSettings.param("combo.max");
		static final KnockbackEngineSettings.Param COMBO_RESET = KnockbackEngineSettings.param("combo.reset-ticks");
		static final KnockbackEngineSettings.Param GRAVITY = KnockbackEngineSettings.param("gravity.value");
		static final KnockbackEngineSettings.Param AIR_RESIST = KnockbackEngineSettings.param("gravity.air-resistance");
		static final KnockbackEngineSettings.Param AIR_GROUND_GRACE = KnockbackEngineSettings.param("air-ground.grace-ticks");
		static final KnockbackEngineSettings.Param SPRINT_REACH_ENABLED = KnockbackEngineSettings.param("sprint-reach.enabled");
		static final KnockbackEngineSettings.Param SPRINT_REACH_GRACE = KnockbackEngineSettings.param("sprint-reach.grace-ticks");
		static final KnockbackEngineSettings.Param SPRINT_REACH_FEEDBACK = KnockbackEngineSettings.param("sprint-reach.feedback");
		static final KnockbackEngineSettings.Param SERVER_SIDE_KB = KnockbackEngineSettings.param("server-side-kb");
		static final KnockbackEngineSettings.Param DM_ENABLED = KnockbackEngineSettings.param("dynamic-misplay.enabled");
		static final KnockbackEngineSettings.Param DM_TARGET = KnockbackEngineSettings.param("dynamic-misplay.target");
		static final KnockbackEngineSettings.Param DM_COMP = KnockbackEngineSettings.param("dynamic-misplay.compensation");
		static final KnockbackEngineSettings.Param DM_MAX = KnockbackEngineSettings.param("dynamic-misplay.max-compensation");
		static final KnockbackEngineSettings.Param DM_ANTICHEAT = KnockbackEngineSettings.param("dynamic-misplay.anti-cheat-compatible");
	}

	// ==================== 模式覆盖查询（受害者个人模式中的引擎键优先于全局） ====================

	/**
	 * 数值参数取值：受害者被设置了个人模式且模式文件覆盖该引擎键时，用覆盖值；否则用全局值。
	 * 布尔开关保持全局（避免同场玩家规则不一致）。
	 */
	private static double d(Entity victim, KnockbackEngineSettings.Param p) {
		return d(craftOf(victim), p);
	}

	/**
	 * 热路径变体：调用方已持有受害者 profile，直接传入避免重复 instanceof 与字段查找。
	 */
	private static double d(CraftKnockbackProfile craft, KnockbackEngineSettings.Param p) {
		if (craft != null) {
			Object override = craft.getEngineOverride(p.path);
			if (override instanceof Number) {
				return ((Number) override).doubleValue();
			}
		}
		return p.getDouble();
	}

	private static CraftKnockbackProfile craftOf(Entity victim) {
		if (victim == null) {
			return null;
		}
		KnockbackProfile profile = victim.getKnockbackProfile();
		return profile instanceof CraftKnockbackProfile ? (CraftKnockbackProfile) profile : null;
	}

	/**
	 * 布尔开关取值：模式文件可携带该引擎键覆盖(如 range-reduction.enabled 随模式生效)，
	 * 否则用全局值。仅对"手感类"开关使用; 规则一致性开关(如 stop-sprint)保持全局。
	 */
	private static boolean b(CraftKnockbackProfile craft, KnockbackEngineSettings.Param p) {
		if (craft != null) {
			Object override = craft.getEngineOverride(p.path);
			if (override instanceof Boolean) {
				return ((Boolean) override).booleanValue();
			}
		}
		return p.getBool();
	}

	// ==================== 连击追踪 ====================

	private static final class ComboData {
		int count;
		int lastTick;
	}

	/** 以受害者为键的连击计数（被打得越连贯，击退越强） */
	private static final Map<UUID, ComboData> COMBOS = new ConcurrentHashMap<>();

	private static int nextCombo(Entity victim) {
		// 长时间运行防内存膨胀: 连击表超过上限时整体清空(极端情况下的安全网)
		if (COMBOS.size() > 10000) {
			COMBOS.clear();
		}
		ComboData data = COMBOS.computeIfAbsent(victim.getUniqueID(), k -> new ComboData());
		int now = MinecraftServer.currentTick;
		if (now - data.lastTick > P.COMBO_RESET.getInt()) {
			data.count = 0;
		}
		data.lastTick = now;
		return data.count++;
	}

	/** 清空连击缓存（reload 时调用） */
	public static void clearCombos() {
		COMBOS.clear();
	}

	// ==================== 疾跑击退宽松判定 ====================

	/**
	 * 疾跑宽松判定：客户端 START_SPRINTING 包驱动的 extraKnockback 标记，
	 * 加上 sprint-reach.grace-ticks 的宽限窗口（疾跑停止后 N tick 内仍视为疾跑），
	 * 解决客户端显示疾跑但服务端已取消造成的击退丢失问题。
	 */
	public static boolean isSprintingEffective(EntityHuman attacker) {
		if (attacker.isExtraKnockback() || attacker.isSprinting()) {
			return true;
		}
		return isInSprintGrace(attacker);
	}

	/** 是否处于疾跑宽限窗口内（仅当 sprint-reach.enabled 开启） */
	private static boolean isInSprintGrace(EntityHuman attacker) {
		if (!P.SPRINT_REACH_ENABLED.getBool()) {
			return false;
		}
		return MinecraftServer.currentTick - attacker.kbLastSprintStopTick <= P.SPRINT_REACH_GRACE.getInt();
	}

	// ==================== 动态 misplay（借鉴 KnockbackManager 思想，按 ping 补偿） ====================

	/** 贴墙检测：水平外扩 0.05 格的包围盒是否与实心方块相交（方向无关） */
	private static boolean isAgainstWall(Entity victim) {
		AxisAlignedBB box = victim.getBoundingBox().grow(0.05D, 0.0D, 0.05D);
		return !victim.world.getCubes(victim, box).isEmpty();
	}

	/**
	 * 基于目标玩家延迟计算击退补偿系数（速度补偿，不改动位置）。
	 * 模式文件显式包含 dynamic-misplay 分节时以模式值为准; 全局兜底。
	 * 反作弊兼容：补偿倍率封顶 1+max-compensation；目标正贴墙碰撞时回退本次补偿。
	 *
	 * @return 1.0 表示无补偿
	 */
	public static double getMisplayMultiplier(Entity victim) {
		// 模式文件显式包含 misplay 字段时, 以模式值为准(配置文件作为基础KB); 全局兜底
		KnockbackProfile profile = victim.getKnockbackProfile();
		boolean enabled = P.DM_ENABLED.getBool();
		double target = P.DM_TARGET.getDouble();
		double compensation = P.DM_COMP.getDouble();
		if (profile instanceof CraftKnockbackProfile && ((CraftKnockbackProfile) profile).isMisplayExplicit()) {
			CraftKnockbackProfile cp = (CraftKnockbackProfile) profile;
			enabled = cp.isDynamicMisplayEnabled();
			target = cp.getTargetMisplay();
			compensation = cp.getMisplayCompensation();
		}
		if (!enabled || !(victim instanceof EntityPlayer)) {
			return 1.0D;
		}
		// 反作弊兼容：目标贴住实心方块(贴墙/被卡)时不补偿，避免误触发移动检测。
		// 1.8.8 NMS 无 collidedHorizontally 字段, 且 positionChanged 在每次水平移动 tick 均为 true,
		// 故用轻微外扩包围盒做方向无关的贴墙检测(仅 misplay 开启时每击一次, 开销可忽略)
		if (P.DM_ANTICHEAT.getBool() && isAgainstWall(victim)) {
			return 1.0D;
		}
		int ping = ((EntityPlayer) victim).ping;
		// 100ms ping -> 1.0，封顶 1.0
		double factor = Math.min(ping / 100.0D, 1.0D);
		if (target > 0) {
			factor = Math.min(factor * (1.0D + target), 1.0D);
		}
		double multiplier = 1.0D + target * compensation * factor;
		// 反作弊兼容：补偿上限（默认 1.3 倍）
		double maxMultiplier = 1.0D + P.DM_MAX.getDouble();
		return Math.min(multiplier, maxMultiplier);
	}

	// ==================== 阶段一：基础击退 ====================

	/**
	 * 施加基础击退（近战）。调用前需已完成 knockbackResistance 判定与 ai 标记。
	 *
	 * @param victim   受击者
	 * @param x        攻击者->受击者 X 方向向量
	 * @param z        攻击者->受击者 Z 方向向量
	 * @param attacker 攻击者（可能为 null，如非生物来源）
	 */
	public static void applyBaseKnockback(EntityLiving victim, double x, double z, EntityHuman attacker) {
		double magnitude = Math.sqrt(x * x + z * z);
		if (magnitude < 1.0E-4D) {
			return;
		}

		boolean air = !victim.onGround;
		// 空中/地面判定宽限：服务端 onGround 与客户端存在 1~2 tick 延迟，
		// 落地后 air-ground.grace-ticks 内仍按地面计算，避免摩擦/乘区突变导致"吸地/飘移"
		int groundGrace = P.AIR_GROUND_GRACE.getInt();
		if (air && groundGrace > 0 && MinecraftServer.currentTick - victim.kbLastGroundTick <= groundGrace) {
			air = false;
		}

		// 每击退只取一次受害者 profile 引用（运行速率优化）
		CraftKnockbackProfile craft = victim.getKnockbackProfile() instanceof CraftKnockbackProfile
				? (CraftKnockbackProfile) victim.getKnockbackProfile() : null;

		// 对刀判定: 模式显式 → 全局
		boolean pvp;
		if (craft != null && craft.isPvpExplicit()) {
			pvp = craft.isPvpEnabled() && victim instanceof EntityHuman && attacker != null;
		} else {
			pvp = P.PVP_ENABLED.getBool() && victim instanceof EntityHuman && attacker != null;
		}

		String state = air ? "air" : "ground";

		// ---- 基础值（模式分节显式 → 全局默认） ----
		double horizontal;
		double vertical;
		if (craft != null && craft.isBaseExplicit()) {
			horizontal = air ? craft.getHorizontalAir() : craft.getHorizontalGround();
			vertical = air ? craft.getVerticalAir() : craft.getVerticalGround();
		} else {
			horizontal = d(craft, air ? P.BASE_H_A : P.BASE_H_G);
			vertical = d(craft, air ? P.BASE_V_A : P.BASE_V_G);
		}

		// ---- 乘区（对刀走 pvp 乘区; 模式显式 → 全局） × 原核心独有空中/地面倍率 ----
		double multH;
		double multV;
		if (pvp && craft != null && craft.isPvpExplicit()) {
			multH = air ? craft.getPvpHorizontalAir() : craft.getPvpHorizontalGround();
			multV = air ? craft.getPvpVerticalAir() : craft.getPvpVerticalGround();
		} else if (pvp) {
			multH = d(craft, air ? P.PVP_MULT_H_A : P.PVP_MULT_H_G);
			multV = d(craft, air ? P.PVP_MULT_V_A : P.PVP_MULT_V_G);
		} else if (craft != null && craft.isMultiplierExplicit()) {
			// 全局乘区已并入模式文件: 模式显式 → 全局默认兜底
			multH = air ? craft.getMultHorizontalAir() : craft.getMultHorizontalGround();
			multV = air ? craft.getMultVerticalAir() : craft.getMultVerticalGround();
		} else {
			multH = d(craft, air ? P.MULT_H_A : P.MULT_H_G);
			multV = d(craft, air ? P.MULT_V_A : P.MULT_V_G);
		}
		if (craft != null) {
			multH *= air ? craft.getAirHorizontalMultiplier() : craft.getGroundHorizontalMultiplier();
			multV *= air ? craft.getAirVerticalMultiplier() : craft.getGroundVerticalMultiplier();
		}
		horizontal *= multH;
		vertical *= multV;

		// ---- 距离衰减（借鉴 MMC：远距离命中减免击退; 开关可随模式文件覆盖） ----
		if (b(craft, P.RANGE_ENABLED) && attacker != null) {
			double startRange = d(craft, P.RANGE_START);
			if (magnitude > startRange) {
				double reduction = Math.min((magnitude - startRange) * d(craft, P.RANGE_FACTOR),
						d(craft, P.RANGE_MAX));
				horizontal = Math.max(0.0D, horizontal - reduction);
			}
		}

		// ---- 连击递增（连续命中有额外击退） ----
		if (P.COMBO_ENABLED.getBool()) {
			int combo = nextCombo(victim);
			horizontal += Math.min(combo * d(craft, P.COMBO_INC), d(craft, P.COMBO_MAX));
		}

		// ---- 防飞天限高（受击者高出攻击者过多时改用超限垂直击退） ----
		if (P.Y_LIMIT_ENABLED.getBool() && attacker != null
				&& victim.locY - attacker.locY > d(craft, P.Y_LIMIT_MAX)) {
			vertical = d(craft, P.Y_LIMIT_AFTER);
		}

		// ---- 动量保留（模式显式 → 全局; 再乘对刀/全局动量乘区） ----
		double momentumH;
		double momentumV;
		if (craft != null && craft.isClampExplicit()) {
			momentumH = craft.getHorizontalMomentum();
			momentumV = craft.getVerticalMomentum();
		} else {
			momentumH = d(craft, P.BASE_H_MOM);
			momentumV = d(craft, P.BASE_V_MOM);
		}
		double momMultH;
		double momMultV;
		if (pvp && craft != null && craft.isPvpExplicit()) {
			momMultH = craft.getPvpHorizontalMomentum();
			momMultV = craft.getPvpVerticalMomentum();
		} else if (pvp) {
			momMultH = d(craft, P.PVP_MULT_H_MOM);
			momMultV = d(craft, P.PVP_MULT_V_MOM);
		} else if (craft != null && craft.isMultiplierExplicit()) {
			// 全局乘区已并入模式文件: 模式显式 → 全局默认兜底
			momMultH = craft.getMultHorizontalMomentum();
			momMultV = craft.getMultVerticalMomentum();
		} else {
			momMultH = d(craft, P.MULT_H_MOM);
			momMultV = d(craft, P.MULT_V_MOM);
		}
		momentumH *= momMultH;
		momentumV *= momMultV;

		victim.motX *= momentumH;
		victim.motY *= momentumV;
		victim.motZ *= momentumH;

		victim.motX -= x / magnitude * horizontal;
		victim.motY += vertical;
		victim.motZ -= z / magnitude * horizontal;

		// ---- 垂直上限钳制（模式显式 → 全局; 再乘上限乘区） ----
		double verticalLimit;
		if (craft != null && craft.isClampExplicit()) {
			verticalLimit = craft.getVerticalLimit();
		} else {
			verticalLimit = d(craft, P.BASE_V_LIMIT);
		}
		double limitMult;
		if (pvp && craft != null && craft.isPvpExplicit()) {
			limitMult = craft.getPvpVerticalLimit();
		} else if (pvp) {
			limitMult = d(craft, P.PVP_MULT_V_LIMIT);
		} else if (craft != null && craft.isMultiplierExplicit()) {
			// 全局乘区已并入模式文件: 模式显式 → 全局默认兜底
			limitMult = craft.getMultVerticalLimit();
		} else {
			limitMult = d(craft, P.MULT_V_LIMIT);
		}
		verticalLimit *= limitMult;
		if (victim.motY > verticalLimit) {
			victim.motY = verticalLimit;
		}

		// ---- 击退滞空期间的自定义重力标记 ----
		markGravityOverride(victim);
	}

	// ==================== 阶段二：疾跑/附魔额外击退 ====================

	/**
	 * 施加疾跑/击退附魔的额外击退（基于攻击者 yaw）。
	 * sprint-extra 为绝对值累加（模式分节显式 → 全局默认）；击退附魔按等级沿用 profile 的 extra 值。
	 *
	 * @return 是否施加了任何额外击退
	 */
	public static boolean applySprintKnockback(EntityHuman attacker, Entity victim, int enchantLevel,
			KnockbackProfile profile) {
		boolean realSprint = attacker.isExtraKnockback() || attacker.isSprinting();
		boolean graceSprint = !realSprint && isInSprintGrace(attacker);
		boolean sprintKb = realSprint || graceSprint;
		if (!sprintKb && enchantLevel <= 0) {
			return false;
		}

		CraftKnockbackProfile craft = profile instanceof CraftKnockbackProfile
				? (CraftKnockbackProfile) profile : null;
		boolean pvp;
		if (craft != null && craft.isPvpExplicit()) {
			pvp = craft.isPvpEnabled() && victim instanceof EntityHuman;
		} else {
			pvp = P.PVP_ENABLED.getBool() && victim instanceof EntityHuman;
		}
		double dynamicMultiplier = getMisplayMultiplier(victim);

		double sin = -MathHelper.sin((float) (attacker.yaw * Math.PI / 180.0D));
		double cos = MathHelper.cos((float) (attacker.yaw * Math.PI / 180.0D));

		boolean applied = false;

		// 疾跑额外击退（绝对值累加, 模式分节显式 → 全局默认）
		if (sprintKb) {
			double sprintExtraH;
			double sprintExtraV;
			if (craft != null && craft.isSprintExtraExplicit()) {
				sprintExtraH = pvp ? craft.getPvpSprintExtraHorizontal() : craft.getSprintExtraHorizontal();
				sprintExtraV = pvp ? craft.getPvpSprintExtraVertical() : craft.getSprintExtraVertical();
			} else if (pvp) {
				sprintExtraH = d(victim, P.PVP_SPRINT_H);
				sprintExtraV = d(victim, P.PVP_SPRINT_V);
			} else {
				sprintExtraH = d(victim, P.SPRINT_H);
				sprintExtraV = d(victim, P.SPRINT_V);
			}
			// 原核心独有调整项: 模式疾跑倍率乘入引擎
			if (craft != null) {
				sprintExtraH *= craft.getSprintHorizontalMultiplier();
				sprintExtraV *= craft.getSprintVerticalMultiplier();
			}
			if (sprintExtraH != 0.0D || sprintExtraV != 0.0D) {
				victim.g(sin * sprintExtraH * dynamicMultiplier, sprintExtraV * dynamicMultiplier,
						cos * sprintExtraH * dynamicMultiplier);
				applied = true;
				// 疾跑宽限视觉反馈：宽限生效时通过 ActionBar 提示攻击者
				if (graceSprint && P.SPRINT_REACH_FEEDBACK.getBool() && attacker instanceof EntityPlayer) {
					int remaining = P.SPRINT_REACH_GRACE.getInt()
							- (MinecraftServer.currentTick - attacker.kbLastSprintStopTick);
					((EntityPlayer) attacker).playerConnection.sendPacket(new PacketPlayOutChat(
							new ChatComponentText("§e疾跑宽限生效 §7(剩余 " + Math.max(0, remaining) + " tick)"),
							(byte) 2));
				}
			}
		}

		// 击退附魔（按等级叠加，沿用 profile 的 extra 参数）
		if (enchantLevel > 0) {
			victim.g(sin * enchantLevel * profile.getExtraHorizontal() * dynamicMultiplier,
					profile.getExtraVertical() * dynamicMultiplier,
					cos * enchantLevel * profile.getExtraHorizontal() * dynamicMultiplier);
			applied = true;
		}

		return applied;
	}

	// ==================== 击退后自定义重力 ====================

	/** 击退施加后调用：若重力参数与原版不同，则标记该实体在滞空期间使用自定义重力 */
	private static void markGravityOverride(EntityLiving victim) {
		if (gravityDiffersFromVanilla()) {
			victim.kbGravityOverride = true;
		}
	}

	/** 每 tick 缓存一次重力差异判定（EntityLiving 逐实体逐 tick 调用，避免重复快照+哈希查找） */
	private static int gravityCacheTick = -1;
	private static boolean gravityDiffersCached;

	private static boolean gravityDiffersFromVanilla() {
		int now = MinecraftServer.currentTick;
		if (now != gravityCacheTick) {
			gravityCacheTick = now;
			gravityDiffersCached = P.GRAVITY.getDouble() != 0.08D || P.AIR_RESIST.getDouble() != 0.98D;
		}
		return gravityDiffersCached;
	}

	/** EntityLiving 每 tick 重力取值（落地自动解除覆写） */
	public static double gravityFor(EntityLiving entity) {
		if (entity.onGround) {
			entity.kbGravityOverride = false;
		}
		if (entity.kbGravityOverride && gravityDiffersFromVanilla()) {
			return P.GRAVITY.getDouble();
		}
		return 0.08D;
	}

	/** EntityLiving 每 tick 空气阻力取值 */
	public static double airResistanceFor(EntityLiving entity) {
		if (entity.kbGravityOverride && !entity.onGround && gravityDiffersFromVanilla()) {
			return P.AIR_RESIST.getDouble();
		}
		return 0.9800000190734863D;
	}

	// ==================== 速度同步 ====================

	/**
	 * 向玩家受害者立即发送击退速度包并处理服务端权威语义。
	 * server-side-kb=false 时保持原版行为（服务端回滚 mot，客户端权威）。
	 */
	public static void syncVelocity(EntityPlayer victim, double preMotX, double preMotY, double preMotZ) {
		victim.playerConnection.sendPacket(new PacketPlayOutEntityVelocity(victim));
		victim.velocityChanged = false;
		if (!P.SERVER_SIDE_KB.getBool()) {
			// 原版语义：服务端回滚，由客户端模拟击退运动
			victim.motX = preMotX;
			victim.motY = preMotY;
			victim.motZ = preMotZ;
		}
	}
}
