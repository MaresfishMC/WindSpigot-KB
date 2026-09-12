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
 *   附加受击方疾跑加成、距离衰减(MMC式)、连击递增、防飞天限高、垂直上限与水平上限钳制。
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

	/** 位置重合时重掷方向用(Entity.random 为 protected, 引擎不在此包内) */
	private static final java.util.Random RANDOM = new java.util.Random();

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
		static final KnockbackEngineSettings.Param BASE_H_LIMIT = KnockbackEngineSettings.param("base-kb.horizontal-limit");
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
		static final KnockbackEngineSettings.Param VICTIM_SPRINT_H = KnockbackEngineSettings.param("victim-sprint-extra.horizontal");
		static final KnockbackEngineSettings.Param VICTIM_SPRINT_V = KnockbackEngineSettings.param("victim-sprint-extra.vertical");
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
		static final KnockbackEngineSettings.Param APEX_SCALE = KnockbackEngineSettings.param("gravity.apex-scale");
		static final KnockbackEngineSettings.Param APEX_THRESHOLD = KnockbackEngineSettings.param("gravity.apex-threshold");
		static final KnockbackEngineSettings.Param CLIENT_SIDE = KnockbackEngineSettings.param("gravity.client-side");
		static final KnockbackEngineSettings.Param CLIENT_MAX_TICKS = KnockbackEngineSettings.param("gravity.client-max-ticks");
		static final KnockbackEngineSettings.Param AIR_GROUND_GRACE = KnockbackEngineSettings.param("air-ground.grace-ticks");
		static final KnockbackEngineSettings.Param SPRINT_REACH_ENABLED = KnockbackEngineSettings.param("sprint-reach.enabled");
		static final KnockbackEngineSettings.Param SPRINT_REACH_GRACE = KnockbackEngineSettings.param("sprint-reach.grace-ticks");
		static final KnockbackEngineSettings.Param SPRINT_REACH_FEEDBACK = KnockbackEngineSettings.param("sprint-reach.feedback");
		static final KnockbackEngineSettings.Param SPRINT_NO_CANCEL = KnockbackEngineSettings.param("sprint-bonus.no-cancel");		static final KnockbackEngineSettings.Param SERVER_SIDE_KB = KnockbackEngineSettings.param("server-side-kb");
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

	/**
	 * 解析受击者实际生效的击退模式。
	 *
	 * 核心从不调用 {@code Entity.setKnockbackProfile()}（该字段只由插件 API 写入），
	 * 因此原版实体与玩家的 {@code getKnockbackProfile()} 恒为 null。
	 * 若不在此兜底，引擎会退化为读取引擎参数的**硬编码默认值**
	 * （base 0.4 / 无水平上限 / sprint-extra 0），模式文件完全失效。
	 *
	 * 取值链: 实体显式绑定 profile → 玩家个人模式 → 全局当前模式(currentKb)
	 */
	private static KnockbackProfile resolveProfile(Entity victim) {
		KnockbackProfile profile = victim.getKnockbackProfile();
		if (profile != null) {
			return profile;
		}
		if (victim instanceof EntityPlayer) {
			KnockbackProfile personal = KnockbackConfig
					.getPlayerProfileByName(((EntityPlayer) victim).getName());
			if (personal != null) {
				return personal;
			}
		}
		return KnockbackConfig.getCurrentKb();
	}

	private static CraftKnockbackProfile craftOf(Entity victim) {
		if (victim == null) {
			return null;
		}
		KnockbackProfile profile = resolveProfile(victim);
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
		int lastStop = attacker.kbLastSprintStopTick;
		// 从未疾跑(初始值 MIN_VALUE)时无宽限: 否则 currentTick - MIN_VALUE 整型溢出成负数,
		// 导致从未疾跑的攻击者永远满足宽限, 白吃疾跑额外击退
		return lastStop != Integer.MIN_VALUE
				&& MinecraftServer.currentTick - lastStop <= P.SPRINT_REACH_GRACE.getInt();
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
		KnockbackProfile profile = resolveProfile(victim);
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
			// WindSpigot start - 原版一致性: 攻受位置几乎重合时重掷随机小方向, 击退照常施加。
			// 原版 1.8.8 EntityLiving.damageEntity 用 for 循环重掷 distanceX/distanceZ 直到
			// 平方和 >= 1.0E-4, 之后 EntityLiving.a() 会自行归一化, 因此击退强度不受影响、
			// 只有方向被随机化。旧实现此处直接 return ⇒ 贴脸/同格命中"有伤害却零击退"(nokb 的一种形态),
			// 且会连带跳过水平上限钳制与重力覆写标记。
			do {
				x = (RANDOM.nextDouble() - RANDOM.nextDouble()) * 0.01D;
				z = (RANDOM.nextDouble() - RANDOM.nextDouble()) * 0.01D;
				magnitude = Math.sqrt(x * x + z * z);
			} while (magnitude < 1.0E-4D);
			// WindSpigot end
		}

		boolean air = !victim.onGround;
		// 空中/地面判定宽限：服务端 onGround 与客户端存在 1~2 tick 延迟，
		// 落地后 air-ground.grace-ticks 内仍按地面计算，避免摩擦/乘区突变导致"吸地/飘移"
		int groundGrace = P.AIR_GROUND_GRACE.getInt();
		if (air && groundGrace > 0 && MinecraftServer.currentTick - victim.kbLastGroundTick <= groundGrace) {
			air = false;
		}

		// 每击退只取一次受害者 profile 引用（运行速率优化）
		CraftKnockbackProfile craft = craftOf(victim);

		// 对刀判定: 模式显式 → 全局
		boolean pvp;
		if (craft != null && craft.isPvpExplicit()) {
			pvp = craft.isPvpEnabled() && victim instanceof EntityHuman && attacker != null;
		} else {
			pvp = P.PVP_ENABLED.getBool() && victim instanceof EntityHuman && attacker != null;
		}

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

		// ---- 受击方疾跑额外击退（MMC式: 受击者疾跑且朝攻击者移动时承受更多击退; 模式显式 → 全局默认） ----
		// 实测(2026-08-30 受控采样): base 0.527 + 受击方疾跑 0.25(仅当受击者朝攻击者运动) + 攻击方疾跑 0.12
		// ---- 受击方疾跑额外击退（原为 MMC式"朝攻击者运动时"，实测无方向依赖 →
		//      仅以"受击方疾跑"为门控。testtt 受控采样: 朝攻击者 n=208 med=0.8915 / 背离 n=19 med=0.8908 一致）
		double victimSprintExtraH;
		double victimSprintExtraV;
		if (craft != null && craft.isVictimSprintExtraExplicit()) {
			victimSprintExtraH = craft.getVictimSprintExtraHorizontal();
			victimSprintExtraV = craft.getVictimSprintExtraVertical();
		} else {
			victimSprintExtraH = d(craft, P.VICTIM_SPRINT_H);
			victimSprintExtraV = d(craft, P.VICTIM_SPRINT_V);
		}
		// WindSpigot start - 受击方疾跑加成与攻击方疾跑加成互斥(不同时叠加)
		// 实测(MMC 2805 样本, 已用双方真实疾跑状态分组):
		//   攻击方疾跑 + 受击方不疾跑: med 0.9420
		//   攻击方不疾跑 + 受击方疾跑: med 0.8289
		//   双方都疾跑:               med 0.8514  (< 攻击方单独疾跑那一组)
		// 即受击方疾跑并不会在攻击方疾跑加成之上再加一份; 本引擎把两者沿同一条
		// "攻击方→受击方" 方向直接相加(0.527375+0.3594+0.4215=1.308275)会被水平上限
		// 钳制成 0.9494, 实测线上 66.2% 的命中堆积在上限(MMC 仅 7.7%), 表现为
		// "W-Tap 连击击退过大 / 每一击都把对手打飞"。故攻击方拿到疾跑加成时不再叠加受击方加成。
		boolean attackerSprintBonus = attacker != null && isSprintingEffective(attacker);
		if ((victimSprintExtraH != 0.0D || victimSprintExtraV != 0.0D) && victim instanceof EntityHuman
				&& !attackerSprintBonus
				&& isSprintingEffective((EntityHuman) victim)) {
			horizontal += victimSprintExtraH;
			vertical += victimSprintExtraV;
		}
		// WindSpigot end

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

		// ---- 水平冲量上限（MMC 实测硬上限） ----
		// 注意: 阶段二(applySprintKnockback)还会再累加疾跑/附魔分量, 故两阶段末尾都要钳制,
		// 否则"双方疾跑"会输出 1.31 而不是 0.9494。
		applyHorizontalLimit(victim, craft);

		// ---- 击退滞空期间的自定义重力标记 ----
		markGravityOverride(victim);
	}

	/**
	 * 水平冲量上限钳制（MMC 实测硬上限 0.9494）。
	 * 基础 + 攻击方疾跑 + 受击方疾跑三分量相加会达到 1.31，但实测输出被钳制在 0.9494
	 * （716/2805 个样本堆积于该值）；模式值 <=0 表示不限。
	 * 必须在阶段一与阶段二末尾各调用一次（阶段二会继续累加速度）。
	 */
	private static void applyHorizontalLimit(Entity victim, CraftKnockbackProfile craft) {
		double horizontalLimit = craft != null && craft.isClampExplicit()
				? craft.getHorizontalLimit() : d(craft, P.BASE_H_LIMIT);
		if (horizontalLimit <= 0.0D) {
			return;
		}
		double mag = Math.sqrt(victim.motX * victim.motX + victim.motZ * victim.motZ);
		if (mag > horizontalLimit) {
			double scale = horizontalLimit / mag;
			victim.motX *= scale;
			victim.motZ *= scale;
		}
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
				// 对刀路径优先读 pvp.sprint-extra, 但仅当模式文件显式给出 pvp 分节时;
				// 否则回落到基础 sprint-extra(避免只配了基础节的模式在对刀路径静默丢失疾跑加成)
				if (pvp && craft.isPvpExplicit()) {
					sprintExtraH = craft.getPvpSprintExtraHorizontal();
					sprintExtraV = craft.getPvpSprintExtraVertical();
				} else {
					sprintExtraH = craft.getSprintExtraHorizontal();
					sprintExtraV = craft.getSprintExtraVertical();
				}
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
				double[] h = horizontalBonus(victim, sin, cos, sprintExtraH);
				victim.g(h[0] * dynamicMultiplier, sprintExtraV * dynamicMultiplier,
						h[1] * dynamicMultiplier);
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
			double[] h = horizontalBonus(victim, sin, cos,
					enchantLevel * profile.getExtraHorizontal());
			victim.g(h[0] * dynamicMultiplier, profile.getExtraVertical() * dynamicMultiplier,
					h[1] * dynamicMultiplier);
			applied = true;
		}

		// 阶段二累加完毕后再次钳制水平上限（阶段一末尾的钳制在本次累加之前已失效）
		if (applied) {
			applyHorizontalLimit(victim, craft);
		}

		return applied;
	}

	/**
	 * 计算水平额外击退的向量，并在 sprint-bonus.no-cancel 开启时去掉与当前冲量反向的分量。
	 *
	 * 背景：疾跑/附魔加成按攻击者朝向 (sin,cos) 施加，而基础击退按"攻击者→受击者"方向施加。
	 * 实测（本服 599 个发包样本）当两者夹角 &gt;90° 时会互相抵消：|速度包| 从 0.949 掉到
	 * 0.106~0.47（夹角 120/150/180° 的理论值 0.483/0.266/0.106 与实测逐条吻合），
	 * 表现就是"打中了但几乎不击退"。开启后只保留不与基础击退相反的分量，
	 * 保证命中击退不低于基础值；夹角 &lt;90° 时行为完全不变。
	 *
	 * @return {x, z} 水平增量
	 */
	private static double[] horizontalBonus(Entity victim, double sin, double cos, double magnitude) {
		double hx = sin * magnitude;
		double hz = cos * magnitude;
		if (P.SPRINT_NO_CANCEL.getBool()) {
			double ix = victim.motX;
			double iz = victim.motZ;
			double len2 = ix * ix + iz * iz;
			if (len2 > 1.0E-8D) {
				double along = (hx * ix + hz * iz) / len2;   // 沿当前冲量方向的分量系数
				if (along < 0.0D) {
					hx -= along * ix;                         // 去掉反向分量(保留垂直分量)
					hz -= along * iz;
				}
			}
		}
		return new double[] { hx, hz };
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
			// 顶点丝滑过渡也属于"非原版重力", 必须一起判定, 否则只配顶点参数时覆写不会生效
			gravityDiffersCached = P.GRAVITY.getDouble() != 0.08D
					|| P.AIR_RESIST.getDouble() != 0.98D
					|| (P.APEX_SCALE.getDouble() < 1.0D && P.APEX_THRESHOLD.getDouble() > 0.0D);
		}
		return gravityDiffersCached;
	}

	/** EntityLiving 每 tick 重力取值（落地自动解除覆写） */
	public static double gravityFor(EntityLiving entity) {
		// WindSpigot start - 解除条件必须排除"刚被击退的那一 tick"
		// 旧实现: if (entity.onGround) 就清标记。但击退是在地面命中时施加的, 服务端 onGround
		// 要到本 tick 的 move() 之后才变 false, 而 gravityFor() 在 move() 之前调用 ⇒
		// 标记在击退后的第一 tick 就被清掉, 整段滞空都退回原版 0.08 重力,
		// 自定义重力与顶点丝滑过渡对"站在地上被打飞"这一最常见情形**完全不生效**
		// (实机接线自检: kbGravityOverride=true 但 gravityFor=0.08000)。
		// 现在只有"确实停在地面上且没有上升速度"才解除; 击退带来的 motY>0 会保留覆写。
		if (entity.onGround && entity.motY <= 0.0D) {
			entity.kbGravityOverride = false;
		}
		// WindSpigot end
		if (!entity.kbGravityOverride || !gravityDiffersFromVanilla()) {
			return 0.08D;
		}
		return effectiveGravity(entity.motY);
	}

	/**
	 * 击退滞空期的有效重力（含顶点丝滑过渡），供服务端实体与客户端滞空接管共用。
	 *   顶点(|vy|=0)     -> g * apex-scale
	 *   |vy|>=threshold  -> g
	 * 中间线性插值 ⇒ 竖直速度穿过 0 的那几 tick 步长很小, 顶点前后都平滑。
	 */
	private static double effectiveGravity(double vy) {
		double g = P.GRAVITY.getDouble();
		double scale = P.APEX_SCALE.getDouble();
		double threshold = P.APEX_THRESHOLD.getDouble();
		if (scale < 1.0D && threshold > 0.0D) {
			double a = Math.abs(vy);
			if (a < threshold) {
				g *= scale + (1.0D - scale) * (a / threshold);
			}
		}
		return g;
	}

	/** EntityLiving 每 tick 空气阻力取值 */
	public static double airResistanceFor(EntityLiving entity) {
		// 与重力同理: 击退当 tick 服务端 onGround 仍是 true, 但 motY>0 说明已离地, 应视为滞空
		if (entity.kbGravityOverride && (!entity.onGround || entity.motY > 0.0D) && gravityDiffersFromVanilla()) {
			return P.AIR_RESIST.getDouble();
		}
		return 0.9800000190734863D;
	}

	// ==================== 客户端滞空接管(当前默认关闭, 见下) ====================
	//
	// ⚠️ 事故记录(2026-09-12 23:00): 本机制第一版上线后**把水平击退也吃掉了** —— 玩家反馈
	//   "无垂直kb / kb全都没有了"。原因是本版把水平分量回填成"客户端上一 tick 的位移差",
	//   但对一个被击退的玩家, 那个位移差≈他本 tick 的残速(站立时接近 0), 于是每 tick 都用
	//   近零水平速度覆盖了击退冲量。已整体回滚(配置 client-side: false + gravity 回原版)。
	//
	// 若要重新启用, 必须先改成: 水平分量由服务端自己积分(用击退初速 + 客户端摩擦 0.91),
	//   而不是回填客户端位移; 并且只在"竖直"确实需要接管时才发包。
	//   ⚠️ 在重新验证之前请保持 gravity.client-side: false。
	//
	// 背景(必须理解才能改这块): 1.8 里"玩家自己的位移由客户端模拟"。
	//   PlayerConnection 收到 PacketPlayInFlying 后直接 setLocation(客户端坐标), 服务端只做
	//   "moved too quickly" 校验。整条击退只发一次 S12 速度包, 之后客户端用它自己的
	//   **原版重力 0.08 / 阻力 0.98** 积分。⇒ 服务端改 gravity.value / apex-scale
	//   对"玩家受击方"的可见弹道**完全没有影响**(只对生物生效, 因为生物由服务端模拟)。
	// 还想让玩家按自定义重力飞, 唯一手段是滞空期逐 tick 补发 S12, 且必须做两件事:
	//   1) 反解补偿: 客户端会做 (vy-0.08)*0.98, 故应发 vy = 目标位移/0.98 + 0.08;
	//   2) 水平分量必须服务端自行积分, 不能回填客户端位移差(否则击退被自身残速覆盖)。
	private static final Map<Integer, Flight> FLIGHTS = new ConcurrentHashMap<>();

	/** 客户端自己的积分常量(EntityLiving.m(): motY -= 0.08; motY *= 0.98), 用于反解注入值 */
	private static final double CLIENT_GRAVITY = 0.08D;
	private static final double CLIENT_DRAG = 0.98D;

	private static final class Flight {
		double step;
		double lastX, lastZ;
		int ticks;
	}

	/**
	 * 把"想要的每 tick 位移"反解成应发给客户端的 vy:
	 *   客户端实际位移 = (vy - 0.08) * 0.98  ⇒  vy = 目标位移 / 0.98 + 0.08
	 * 重新实现滞空接管时必须用这个反解, 否则客户端会在服务端重力之上再叠一份原版重力。
	 */
	private static double clientInjectY(double desiredStep) {
		return desiredStep / CLIENT_DRAG + CLIENT_GRAVITY;
	}

	/**
	 * 客户端滞空接管 —— **当前停用(硬开关)**。
	 *
	 * 第一版上线即造成"击退整体消失"事故: 它把水平分量回填成客户端上一 tick 的位移差,
	 * 而被击退玩家那一格的水平位移≈其自身残速(站立时≈0), 于是每 tick 都用近零水平速度
	 * 覆盖了击退冲量 ⇒ 玩家反馈"无垂直kb / kb全都没有了"。
	 *
	 * 重新启用前必须完成:
	 *   1) 水平分量由服务端自行积分(击退初速 + 客户端空中摩擦 0.91), **不得**回填客户端位移;
	 *   2) 竖直用 clientInjectY 反解补偿;
	 *   3) 先在单人环境用 traj.csv 核对整条弹道(顶点/滞空/水平位移)再放量。
	 * 目前直接返回, 保证无论配置如何都不会影响击退。
	 */
	public static void beginClientFlight(EntityPlayer victim) {
		// 停用: 见方法注释。保留签名以便 EntityHuman 的调用点不变。
	}

	/** 诊断: 当前接管中的滞空玩家数量(停用期间恒为 0) */
	public static int activeFlights() {
		FLIGHTS.clear();
		return 0;
	}

	/** 每个玩家 tick 调用一次 —— 停用期间为空操作, 仅清理可能残留的条目 */
	public static void tickClientFlight(EntityHuman human) {
		if (!FLIGHTS.isEmpty()) {
			FLIGHTS.clear();
		}
	}

	/** 供 EntityHuman 调用点使用的编译占位(停用期间不会执行到这里) */
	private static void unusedTickClientFlight(EntityHuman human) {
		// 事故版本实现已删除。重新实现时必须:
		//   1) 水平分量由服务端自行积分(击退初速 + 客户端空中摩擦 0.91), 不得回填客户端位移;
		//   2) 竖直用 clientInjectY 反解补偿;
		//   3) 落地/死亡/超 client-max-ticks/竖直下坠足够快 时交回客户端。
		// 详见 beginClientFlight 的注释。
		// 说明: 保留空方法体, 避免把未验证的物理逻辑留在可执行路径上。
		if (!FLIGHTS.isEmpty()) {
			FLIGHTS.clear();
		}
	}

	// ==================== 速度同步 ====================

	/**
	 * 向玩家受害者立即发送击退速度包并处理服务端权威语义。
	 * server-side-kb=false 时保持原版行为（服务端回滚 mot，客户端权威）。
	 */
	public static void syncVelocity(EntityPlayer victim, double preMotX, double preMotY, double preMotZ) {
		victim.playerConnection.sendPacket(new PacketPlayOutEntityVelocity(victim));
		victim.velocityChanged = false;
		beginClientFlight(victim); // WindSpigot - 登记滞空接管(逐 tick 覆盖客户端原版重力)
		if (!P.SERVER_SIDE_KB.getBool()) {
			// 原版语义：服务端回滚，由客户端模拟击退运动
			victim.motX = preMotX;
			victim.motY = preMotY;
			victim.motZ = preMotZ;
		}
	}
}
