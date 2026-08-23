package com.windpvp.windspigot.knockback.gui;

import java.util.ArrayList;
import java.util.List;

import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import com.windpvp.windspigot.CorePluginBridge;
import com.windpvp.windspigot.knockback.KnockbackConfig;
import com.windpvp.windspigot.knockback.KnockbackEngineSettings;
import com.windpvp.windspigot.knockback.KnockbackEngineSettings.Param;

/**
 * 击退参数箱子 GUI（可直接点击编辑，改动即时生效并写回 knockback.yml）。
 *
 * 布局:
 * - 主页: 6 个参数分类 + 热更新/恢复默认按钮
 * - 分类页: 每个参数一个物品
 *   数值参数: 左键 +步长 / 右键 -步长 / Shift 10倍步长
 *   布尔参数: 点击切换
 *
 * @author WindSpigot
 */
public class KnockbackGUI implements Listener {

	private static final KnockbackGUI INSTANCE = new KnockbackGUI();
	private static boolean registered = false;

	private KnockbackGUI() {
	}

	/** 惰性注册监听器（确保 PluginManager 已就绪）。
	 *  注意: 不能用 registerEvents()（它会调用 plugin.getPluginLoader()），
	 *  核心内嵌插件桥没有 PluginLoader，因此用 registerEvent 直接注册。 */
	private static synchronized void ensureRegistered() {
		if (!registered) {
			Bukkit.getPluginManager().registerEvent(InventoryClickEvent.class, INSTANCE, EventPriority.NORMAL,
					(listener, event) -> {
						if (event instanceof InventoryClickEvent) {
							INSTANCE.onClick((InventoryClickEvent) event);
						}
					}, CorePluginBridge.get());
			Bukkit.getPluginManager().registerEvent(InventoryDragEvent.class, INSTANCE, EventPriority.NORMAL,
					(listener, event) -> {
						if (event instanceof InventoryDragEvent) {
							INSTANCE.onDrag((InventoryDragEvent) event);
						}
					}, CorePluginBridge.get());
			registered = true;
		}
	}

	// ==================== 页面标识 ====================

	private static final class GUIHolder implements InventoryHolder {
		final String category; // null = 主页

		GUIHolder(String category) {
			this.category = category;
		}

		@Override
		public Inventory getInventory() {
			return null;
		}
	}

	// ==================== 打开页面 ====================

	public static void openMain(Player player) {
		ensureRegistered();
		Inventory inv = Bukkit.createInventory(new GUIHolder(null), 27, "§8击退引擎参数 · 分类");

		List<String> cats = KnockbackEngineSettings.categories();
		Material[] icons = { Material.GOLD_SWORD, Material.ANVIL, Material.SUGAR, Material.DIAMOND_SWORD,
				Material.REDSTONE, Material.ENCHANTMENT_TABLE };
		int[] slots = { 10, 11, 12, 14, 15, 16 };
		for (int i = 0; i < cats.size() && i < slots.length; i++) {
			List<Param> params = KnockbackEngineSettings.byCategory(cats.get(i));
			inv.setItem(slots[i], item(icons[i % icons.length], "§e§l" + cats.get(i),
					"§7共 " + params.size() + " 个参数", "", "§a点击进入编辑"));
		}

		inv.setItem(18, item(Material.WATCH, "§b热更新配置", "§7重新加载 knockback.yml", "§7(合并语义: 只覆盖文件中存在的键)"));
		inv.setItem(26, item(Material.TNT, "§c恢复全部默认", "§7所有引擎参数重置为默认值"));

		player.openInventory(inv);
	}

	public static void openCategory(Player player, String category) {
		ensureRegistered();
		List<Param> params = KnockbackEngineSettings.byCategory(category);
		Inventory inv = Bukkit.createInventory(new GUIHolder(category), 54, "§8击退参数 · " + category);

		int slot = 10;
		for (Param p : params) {
			while (slot % 9 == 0 || slot % 9 == 8) {
				slot++; // 跳过边框列
			}
			if (slot >= 44) {
				break;
			}
			inv.setItem(slot++, paramItem(p));
		}

		inv.setItem(45, item(Material.ARROW, "§f返回分类"));
		inv.setItem(49, item(Material.WATCH, "§b热更新配置"));
		player.openInventory(inv);
	}

	// ==================== 物品构建 ====================

	private static ItemStack paramItem(Param p) {
		String value = formatValue(p);
		ItemStack stack;
		if (p.type == KnockbackEngineSettings.Type.BOOL) {
			stack = new ItemStack(Material.WOOL, 1, p.getBool() ? (short) 5 : (short) 14);
			setMeta(stack, "§e" + p.path, "§7" + p.desc, "", "§f当前值: " + value, "", "§a点击切换");
		} else {
			stack = new ItemStack(Material.PAPER);
			setMeta(stack, "§e" + p.path, "§7" + p.desc, "", "§f当前值: " + value, "", "§a左键 +" + p.step(),
					"§c右键 -" + p.step(), "§6Shift = 10倍步长");
		}
		return stack;
	}

	private static ItemStack item(Material material, String name, String... lore) {
		ItemStack stack = new ItemStack(material);
		setMeta(stack, name, lore);
		return stack;
	}

	private static void setMeta(ItemStack stack, String name, String... lore) {
		ItemMeta meta = stack.getItemMeta();
		meta.setDisplayName(name);
		List<String> loreList = new ArrayList<>();
		for (String line : lore) {
			loreList.add(line);
		}
		meta.setLore(loreList);
		stack.setItemMeta(meta);
	}

	private static String formatValue(Param p) {
		if (p.type == KnockbackEngineSettings.Type.BOOL) {
			return p.getBool() ? "§atrue" : "§cfalse";
		}
		if (p.type == KnockbackEngineSettings.Type.INT) {
			return "§e" + p.getInt();
		}
		return "§e" + String.format("%.6f", p.getDouble()).replaceAll("0+$", "").replaceAll("\\.$", ".0");
	}

	// ==================== 点击处理 ====================

	public void onClick(InventoryClickEvent event) {
		if (!(event.getInventory().getHolder() instanceof GUIHolder)) {
			return;
		}
		event.setCancelled(true);
		if (!(event.getWhoClicked() instanceof Player)) {
			return;
		}
		Player player = (Player) event.getWhoClicked();
		GUIHolder holder = (GUIHolder) event.getInventory().getHolder();
		int slot = event.getRawSlot();
		if (slot >= event.getInventory().getSize()) {
			return; // 玩家背包区域不处理
		}

		if (holder.category == null) {
			handleMainClick(player, slot);
		} else {
			handleCategoryClick(player, holder.category, slot, event.isLeftClick(), event.isShiftClick());
		}
	}

	public void onDrag(InventoryDragEvent event) {
		if (event.getInventory().getHolder() instanceof GUIHolder) {
			event.setCancelled(true);
		}
	}

	private void handleMainClick(Player player, int slot) {
		List<String> cats = KnockbackEngineSettings.categories();
		int[] slots = { 10, 11, 12, 14, 15, 16 };
		for (int i = 0; i < slots.length && i < cats.size(); i++) {
			if (slot == slots[i]) {
				openCategory(player, cats.get(i));
				return;
			}
		}
		if (slot == 18) {
			KnockbackConfig.reload();
			player.sendMessage("§a击退配置已热更新");
			openMain(player);
		} else if (slot == 26) {
			KnockbackEngineSettings.resetAll();
			KnockbackConfig.saveEngineSettings();
			player.sendMessage("§e所有引擎参数已恢复默认");
			openMain(player);
		}
	}

	private void handleCategoryClick(Player player, String category, int slot, boolean leftClick,
			boolean shift) {
		if (slot == 45) {
			openMain(player);
			return;
		}
		if (slot == 49) {
			KnockbackConfig.reload();
			player.sendMessage("§a击退配置已热更新");
			openCategory(player, category);
			return;
		}

		// 根据槽位定位参数（与 openCategory 的布局算法一致）
		List<Param> params = KnockbackEngineSettings.byCategory(category);
		int s = 10;
		for (Param p : params) {
			while (s % 9 == 0 || s % 9 == 8) {
				s++;
			}
			if (s >= 44) {
				break;
			}
			if (s == slot) {
				adjustParam(player, p, leftClick, shift);
				openCategory(player, category); // 刷新显示
				return;
			}
			s++;
		}
	}

	private void adjustParam(Player player, Param p, boolean leftClick, boolean shift) {
		if (p.type == KnockbackEngineSettings.Type.BOOL) {
			p.set(!p.getBool());
		} else {
			double delta = p.step() * (shift ? 10 : 1) * (leftClick ? 1 : -1);
			if (p.type == KnockbackEngineSettings.Type.INT) {
				p.set(Math.max(0, p.getInt() + (int) Math.round(delta)));
			} else {
				p.set(p.getDouble() + delta);
			}
		}
		KnockbackConfig.saveEngineSettings(); // 即时生效 + 持久化
		player.sendMessage("§a已更新 §f" + p.path + " §7→ " + formatValue(p));
	}
}
