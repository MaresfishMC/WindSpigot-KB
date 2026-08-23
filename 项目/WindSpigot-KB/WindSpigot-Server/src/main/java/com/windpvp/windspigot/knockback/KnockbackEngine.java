package com.windpvp.windspigot.knockback;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import dev.cobblesword.nachospigot.knockback.KnockbackProfile;
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
 *   最终击退 = base-kb × multiplier（空中/地面分开，对刀走 pvp 乘区），
 *   附加距离衰减(MMC式)、连击递增、防飞天限高、垂直上限钳制。
 * - 阶段二 {@link #applySprintKnockback}：仅与攻击者 yaw 和疾跑状态相关，
 *   sprint-extra 为绝对值累加，击退附魔按等级叠加（沿用 profile 的 extra 值）。
 *
 * 借鉴点（均已按本核心重写，未照搬）:
 * - MMC: 距离衰减 range-reduction、动量归零语义(friction=0 -> momentum=0)
 * - dw1e/KnockbackManager: 动态 misplay（按目标 ping 动态补偿击退，借鉴思想）
 * - Revethere 运动公式: 动量保留/空气阻力/重力逐项可配
 *
 * @author WindSpigot
 */
public final class KnockbackEngine {

	private KnockbackEngine() {
	}

	// ==================== 模式覆盖查询（受害者个人模式中的引擎键优先于全局） ====================

	/**
	 * 数值参数取值：受害者被设置了个人模式且模式文件覆盖该引擎键时，用覆盖值；否则用全局值。
	 * 布尔开关保持全局（避免同场玩家规则不一致）。
	 */
	private static double d(Entity victim, String path) {
		if (victim != null) {
			KnockbackProfile profile = victim.getKnockbackProfile();
			if (profile instanceof CraftKnockbackProfile) {
				Object override = ((CraftKnockbackProfile) profile).getEngineOverride(path);
				if (override instanceof Number) {
					return ((Number) override).doubleValue();
				}
			}
		}
		return KnockbackEngineSettings.d(path);
	}

	// ==================== 连击追踪 ====================

	private static final class ComboData {
		int count;
		int lastTick;
	}

	/** 以受害者为键的连击计数（被打得越连贯，击退越强） */
	private static final Map<UUID, ComboData> COMBOS = new ConcurrentHashMap<>();

	private static int nextCombo(Entity victim) {
		ComboData data = COMBOS.computeIfAbsent(victim.getUniqueID(), k -> new ComboData());
		int now = MinecraftServer.currentTick;
		if (now - data.lastTick > KnockbackEngineSettings.i("combo.reset-ticks")) {
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
		if (!KnockbackEngineSettings.b("sprint-reach.enabled")) {
			return false;
		}
		int grace = KnockbackEngineSettings.i("sprint-reach.grace-ticks");
		return MinecraftServer.currentTick - attacker.kbLastSprintStopTick <= grace;
	}

	// ==================== 动态 misplay（借鉴 KnockbackManager 思想，按 ping 补偿） ====================

	/**
	 * 基于目标玩家延迟计算击退补偿系数（速度补偿，不改动位置）。
	 * 延迟越高，目标客户端实际位置越滞后于服务端，击退按系数放大以补偿"misplay"。
	 * 反作弊兼容：补偿倍率封顶 1+max-compensation；目标正贴墙碰撞时回退本次补偿。
	 *
	 * @return 1.0 表示无补偿
	 */
	public static double getMisplayMultiplier(Entity victim) {
		if (!KnockbackEngineSettings.b("dynamic-misplay.enabled") || !(victim instanceof EntityPlayer)) {
			return 1.0D;
		}
		// 反作弊兼容：目标正在水平碰撞（贴墙/被卡）时不补偿，避免误触发移动检测
		if (KnockbackEngineSettings.b("dynamic-misplay.anti-cheat-compatible") && victim.positionChanged) {
			return 1.0D;
		}
		int ping = ((EntityPlayer) victim).ping;
		// 100ms ping -> 1.0，封顶 1.0
		double factor = Math.min(ping / 100.0D, 1.0D);
		double target = KnockbackEngineSettings.d("dynamic-misplay.target");
		if (target > 0) {
			factor = Math.min(factor * (1.0D + target), 1.0D);
		}
		double compensation = KnockbackEngineSettings.d("dynamic-misplay.compensation");
		double multiplier = 1.0D + target * compensation * factor;
		// 反作弊兼容：补偿上限（默认 1.3 倍）
		double maxMultiplier = 1.0D + KnockbackEngineSettings.d("dynamic-misplay.max-compensation");
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
		int groundGrace = KnockbackEngineSettings.i("air-ground.grace-ticks");
		if (air && groundGrace > 0
				&& MinecraftServer.currentTick - victim.kbLastGroundTick <= groundGrace) {
			air = false;
		}

		boolean pvp = KnockbackEngineSettings.b("pvp.enabled") && victim instanceof EntityHuman
				&& attacker != null;

		// ---- 基础值 × 乘区（空中/地面分开，对刀走独立乘区，模式文件可覆盖） ----
		String state = air ? "air" : "ground";
		String multPrefix = pvp ? "pvp.multiplier." : "multiplier.";

		double horizontal = d(victim, "base-kb.horizontal." + state) * d(victim, multPrefix + "horizontal." + state);
		double vertical = d(victim, "base-kb.vertical." + state) * d(victim, multPrefix + "vertical." + state);

		// ---- 距离衰减（借鉴 MMC：远距离命中减免击退） ----
		if (KnockbackEngineSettings.b("range-reduction.enabled") && attacker != null) {
			double startRange = d(victim, "range-reduction.start-range");
			if (magnitude > startRange) {
				double reduction = Math.min(
						(magnitude - startRange) * d(victim, "range-reduction.factor"),
						d(victim, "range-reduction.max-reduction"));
				horizontal = Math.max(0.0D, horizontal - reduction);
			}
		}

		// ---- 连击递增（连续命中有额外击退） ----
		if (KnockbackEngineSettings.b("combo.enabled")) {
			int combo = nextCombo(victim);
			horizontal += Math.min(combo * d(victim, "combo.increment"), d(victim, "combo.max"));
		}

		// ---- 防飞天限高（受击者高出攻击者过多时改用超限垂直击退） ----
		if (KnockbackEngineSettings.b("y-limit.enabled") && attacker != null
				&& victim.locY - attacker.locY > d(victim, "y-limit.max-y-height")) {
			vertical = d(victim, "y-limit.vertical-kb-after-limit");
		}

		// ---- 动量保留（momentum=保留比例, 0=完全覆盖原有速度, 原版=0.5） ----
		double momentumH = d(victim, "base-kb.horizontal-momentum") * d(victim, multPrefix + "horizontal-momentum");
		double momentumV = d(victim, "base-kb.vertical-momentum") * d(victim, multPrefix + "vertical-momentum");

		victim.motX *= momentumH;
		victim.motY *= momentumV;
		victim.motZ *= momentumH;

		victim.motX -= x / magnitude * horizontal;
		victim.motY += vertical;
		victim.motZ -= z / magnitude * horizontal;

		// ---- 垂直上限钳制 ----
		double verticalLimit = d(victim, "base-kb.vertical-limit") * d(victim, multPrefix + "vertical-limit");
		if (victim.motY > verticalLimit) {
			victim.motY = verticalLimit;
		}

		// ---- 击退滞空期间的自定义重力标记 ----
		markGravityOverride(victim);
	}

	// ==================== 阶段二：疾跑/附魔额外击退 ====================

	/**
	 * 施加疾跑/击退附魔的额外击退（基于攻击者 yaw）。
	 * sprint-extra 为绝对值累加；击退附魔按等级沿用 profile 的 extra-horizontal/extra-vertical。
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

		boolean pvp = KnockbackEngineSettings.b("pvp.enabled") && victim instanceof EntityHuman;
		double dynamicMultiplier = getMisplayMultiplier(victim);

		double sin = -MathHelper.sin((float) (attacker.yaw * Math.PI / 180.0D));
		double cos = MathHelper.cos((float) (attacker.yaw * Math.PI / 180.0D));

		boolean applied = false;

		// 疾跑额外击退（绝对值累加，模式文件可覆盖）
		if (sprintKb) {
			double sprintExtraH = pvp ? d(victim, "pvp.horizontal.sprint-extra")
					: d(victim, "horizontal.sprint-extra");
			double sprintExtraV = pvp ? d(victim, "pvp.vertical.sprint-extra")
					: d(victim, "vertical.sprint-extra");
			if (sprintExtraH != 0.0D || sprintExtraV != 0.0D) {
				victim.g(sin * sprintExtraH * dynamicMultiplier, sprintExtraV * dynamicMultiplier,
						cos * sprintExtraH * dynamicMultiplier);
				applied = true;
				// 疾跑宽限视觉反馈：宽限生效时通过 ActionBar 提示攻击者
				if (graceSprint && KnockbackEngineSettings.b("sprint-reach.feedback")
						&& attacker instanceof EntityPlayer) {
					int remaining = KnockbackEngineSettings.i("sprint-reach.grace-ticks")
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

	private static boolean gravityDiffersFromVanilla() {
		return KnockbackEngineSettings.d("gravity.value") != 0.08D
				|| KnockbackEngineSettings.d("gravity.air-resistance") != 0.98D;
	}

	/** EntityLiving 每 tick 重力取值（落地自动解除覆写） */
	public static double gravityFor(EntityLiving entity) {
		if (entity.onGround) {
			entity.kbGravityOverride = false;
		}
		if (entity.kbGravityOverride && gravityDiffersFromVanilla()) {
			return KnockbackEngineSettings.d("gravity.value");
		}
		return 0.08D;
	}

	/** EntityLiving 每 tick 空气阻力取值 */
	public static double airResistanceFor(EntityLiving entity) {
		if (entity.kbGravityOverride && !entity.onGround && gravityDiffersFromVanilla()) {
			return KnockbackEngineSettings.d("gravity.air-resistance");
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
		if (!KnockbackEngineSettings.b("server-side-kb")) {
			// 原版语义：服务端回滚，由客户端模拟击退运动
			victim.motX = preMotX;
			victim.motY = preMotY;
			victim.motZ = preMotZ;
		}
	}
}
