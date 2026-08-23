package com.windpvp.windspigot.knockback;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.scheduler.BukkitTask;

import com.windpvp.windspigot.CorePluginBridge;

import dev.cobblesword.nachospigot.knockback.KnockbackAPI;
import dev.cobblesword.nachospigot.knockback.KnockbackProfile;
import dev.cobblesword.nachospigot.knockback.KnockbackSwitchListener;
import net.minecraft.server.EntityPlayer;

/**
 * {@link KnockbackAPI} 的核心实现。
 * 通过 ServicesManager 注册，供竞技场等插件按玩家/场地动态切换击退模式。
 *
 * @author WindSpigot
 */
public class CraftKnockbackAPI implements KnockbackAPI {

	/** 临时模式到期任务（玩家 UUID -> 恢复任务） */
	private final Map<UUID, BukkitTask> expiryTasks = new ConcurrentHashMap<>();
	private final List<KnockbackSwitchListener> listeners = new CopyOnWriteArrayList<>();

	@Override
	public String getPlayerProfile(Player player) {
		KnockbackProfile profile = getHandle(player).getKnockbackProfile();
		return profile != null ? profile.getName() : KnockbackConfig.getCurrentKb().getName();
	}

	@Override
	public boolean applyProfile(Player player, String profileName, int durationTicks) {
		KnockbackProfile profile = KnockbackConfig.getKbProfileByName(profileName);
		if (profile == null) {
			return false;
		}
		String from = getPlayerProfile(player);

		// 取消旧的到期任务
		BukkitTask old = expiryTasks.remove(player.getUniqueId());
		if (old != null) {
			old.cancel();
		}

		getHandle(player).setKnockbackProfile(profile);
		fireSwitch(player, from, profile.getName());

		if (durationTicks > 0) {
			BukkitTask task = Bukkit.getScheduler().runTaskLater(CorePluginBridge.get(), () -> {
				expiryTasks.remove(player.getUniqueId());
				String before = getPlayerProfile(player);
				getHandle(player).setKnockbackProfile(null);
				fireSwitch(player, before, KnockbackConfig.getCurrentKb().getName());
			}, durationTicks);
			expiryTasks.put(player.getUniqueId(), task);
		}
		return true;
	}

	@Override
	public void resetPlayerProfile(Player player) {
		BukkitTask old = expiryTasks.remove(player.getUniqueId());
		if (old != null) {
			old.cancel();
		}
		String from = getPlayerProfile(player);
		getHandle(player).setKnockbackProfile(null);
		KnockbackConfig.clearPlayerProfile(player);
		fireSwitch(player, from, KnockbackConfig.getCurrentKb().getName());
	}

	@Override
	public void registerListener(KnockbackSwitchListener listener) {
		listeners.add(listener);
	}

	@Override
	public List<String> getAvailableProfiles() {
		List<String> names = new ArrayList<>();
		for (KnockbackProfile profile : KnockbackConfig.getKbProfiles()) {
			names.add(profile.getName());
		}
		return names;
	}

	private void fireSwitch(Player player, String from, String to) {
		for (KnockbackSwitchListener listener : listeners) {
			try {
				listener.onKnockbackSwitch(player, from, to);
			} catch (Throwable t) {
				t.printStackTrace();
			}
		}
	}

	private static EntityPlayer getHandle(Player player) {
		return ((org.bukkit.craftbukkit.entity.CraftPlayer) player).getHandle();
	}
}
