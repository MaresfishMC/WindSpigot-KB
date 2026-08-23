package dev.cobblesword.nachospigot.knockback;

import org.bukkit.entity.Player;

/**
 * 击退模式切换监听器
 *
 * @author WindSpigot
 */
public interface KnockbackSwitchListener {

	/**
	 * 玩家击退模式发生切换时触发
	 *
	 * @param player 玩家
	 * @param from   原模式名
	 * @param to     新模式名
	 */
	void onKnockbackSwitch(Player player, String from, String to);
}
