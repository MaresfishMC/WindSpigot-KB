package dev.cobblesword.nachospigot.knockback;

import java.util.List;

import org.bukkit.entity.Player;

/**
 * 击退引擎对外 API（供竞技场等插件按玩家/场地动态切换 KB 配置）。
 *
 * 通过 ServicesManager 获取实例:
 * <pre>
 * KnockbackAPI api = Bukkit.getServicesManager().load(KnockbackAPI.class);
 * </pre>
 *
 * 说明: 玩家的个人模式同时影响旧版 profile 参数（投射物/附魔额外击退）与
 * 新版引擎参数覆盖（模式文件中出现的 base-kb/multiplier 等引擎键）。
 *
 * @author WindSpigot
 */
public interface KnockbackAPI {

	/**
	 * 获取玩家当前生效的击退模式名（未单独设置时返回全局当前模式）
	 */
	String getPlayerProfile(Player player);

	/**
	 * 为玩家应用指定击退模式
	 *
	 * @param durationTicks 有效期（tick），0 表示永久
	 * @return 是否成功（模式存在）
	 */
	boolean applyProfile(Player player, String profileName, int durationTicks);

	/**
	 * 移除玩家的个人模式（含临时模式），恢复全局默认
	 */
	void resetPlayerProfile(Player player);

	/**
	 * 注册配置切换监听器
	 */
	void registerListener(KnockbackSwitchListener listener);

	/**
	 * 获取所有可用模式名称
	 */
	List<String> getAvailableProfiles();
}
