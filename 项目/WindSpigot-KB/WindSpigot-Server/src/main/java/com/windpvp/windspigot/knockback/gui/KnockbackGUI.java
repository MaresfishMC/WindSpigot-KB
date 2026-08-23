package com.windpvp.windspigot.knockback.gui;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.event.inventory.InventoryType;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import com.windpvp.windspigot.CorePluginBridge;
import com.windpvp.windspigot.knockback.CraftKnockbackProfile;
import com.windpvp.windspigot.knockback.KnockbackConfig;
import com.windpvp.windspigot.knockback.KnockbackEngineSettings;
import com.windpvp.windspigot.knockback.KnockbackEngineSettings.Param;

import dev.cobblesword.nachospigot.knockback.KnockbackProfile;

/**
 * 击退参数箱子 GUI（可直接点击编辑，改动即时生效并写回配置文件）。
 *
 * 页面:
 * - 主页: 6 个参数分类 + 模式管理 + 新建模式 + 热更新/恢复默认按钮
 * - 分类页: 每个参数一个物品（数值: 左键+步长/右键-步长/Shift 10倍；布尔: 点击切换）
 * - 模式页: 每个模式一个物品（左键=设为全局, 右键=删除, Shift+左键=复制）
 * - 新建模式: 铁砧 GUI 输入名称，默认复制当前全局模式
 *
 * @author WindSpigot
 */
public class KnockbackGUI implements Listener {

	private static final KnockbackGUI INSTANCE = new KnockbackGUI();
	private static boolean registered = false;

	/** 正在铁砧界面输入新模式名称的玩家 */
	private static final Set<UUID> pendingAnvil = new HashSet<>();

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
			Bukkit.getPluginManager().registerEvent(InventoryCloseEvent.class, INSTANCE, EventPriority.NORMAL,
					(listener, event) -> {
						if (event instanceof InventoryCloseEvent) {
							pendingAnvil.remove(((InventoryCloseEvent) event).getPlayer().getUniqueId());
						}
					}, CorePluginBridge.get());
			registered = true;
		}
	}

	// ==================== 页面标识 ====================

	private static final class GUIHolder implements InventoryHolder {
		final String category; // null = 主页, "模式管理" = 模式页, 其余 = 参数分类页

		GUIHolder(String category) {
			this.category = category;
		}

		@Override
		public Inventory getInventory() {
			return null;
		}
	}

	private static final String PAGE_MODES = "模式管理";

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

		inv.setItem(18, item(Material.WATCH, "§b热更新配置", "§7重新加载 kb配置文件/ 与 knockback.yml",
				"§7(合并语义: 只覆盖文件中存在的键)"));
		inv.setItem(20, item(Material.BOOKSHELF, "§6模式管理", "§7各模式KB调整(kb配置文件/模式/)",
				"", "§a左键=设为全局 §c右键=删除", "§6Shift+左键=复制"));
		inv.setItem(24, item(Material.NETHER_STAR, "§d新建模式", "§7以当前全局模式为模板创建新模式"));
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

	/** 模式管理页：每个模式一个物品 */
	private static void openModes(Player player) {
		ensureRegistered();
		Inventory inv = Bukkit.createInventory(new GUIHolder(PAGE_MODES), 54, "§8击退模式管理");

		String current = KnockbackConfig.getCurrentKb().getName();
		int slot = 10;
		for (KnockbackProfile profile : KnockbackConfig.getKbProfiles()) {
			while (slot % 9 == 0 || slot % 9 == 8) {
				slot++;
			}
			if (slot >= 44) {
				break;
			}
			boolean isCurrent = profile.getName().equalsIgnoreCase(current);
			inv.setItem(slot++, item(isCurrent ? Material.DIAMOND_SWORD : Material.IRON_SWORD,
					(isCurrent ? "§a§l" : "§e") + profile.getName(),
					isCurrent ? "§a✔ 当前全局模式" : "§7点击设为全局模式",
					"", "§a左键 = 设为全局", "§c右键 = 删除", "§6Shift+左键 = 复制"));
		}

		inv.setItem(45, item(Material.ARROW, "§f返回分类"));
		inv.setItem(49, item(Material.NETHER_STAR, "§d新建模式", "§7以当前全局模式为模板创建"));
		inv.setItem(53, item(Material.WATCH, "§b热更新配置"));
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
		// 铁砧新建模式流程
		if (handleAnvilClick(event)) {
			return;
		}

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
		} else if (holder.category.equals(PAGE_MODES)) {
			handleModesClick(player, slot, event.isLeftClick(), event.isShiftClick());
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
		} else if (slot == 20) {
			openModes(player);
		} else if (slot == 24) {
			openCreateAnvil(player);
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
			Object newValue = p.type == KnockbackEngineSettings.Type.INT
					? Math.max(0, p.getInt() + (int) Math.round(delta)) : p.getDouble() + delta;
			// 一致性自检：非法值拒绝写入
			String error = KnockbackEngineSettings.checkValue(p, newValue);
			if (error != null) {
				player.sendMessage("§c参数校验失败，已拒绝: " + error);
				return;
			}
			p.set(newValue);
		}
		KnockbackConfig.saveEngineSettings(); // 即时生效 + 持久化
		player.sendMessage("§a已更新 §f" + p.path + " §7→ " + formatValue(p));
	}

	// ==================== 模式管理 ====================

	private void handleModesClick(Player player, int slot, boolean leftClick, boolean shift) {
		if (slot == 45) {
			openMain(player);
			return;
		}
		if (slot == 49) {
			openCreateAnvil(player);
			return;
		}
		if (slot == 53) {
			KnockbackConfig.reload();
			player.sendMessage("§a击退配置已热更新");
			openModes(player);
			return;
		}

		// 根据槽位定位模式（与 openModes 的布局算法一致）
		List<KnockbackProfile> profiles = new ArrayList<>(KnockbackConfig.getKbProfiles());
		int s = 10;
		for (KnockbackProfile profile : profiles) {
			while (s % 9 == 0 || s % 9 == 8) {
				s++;
			}
			if (s >= 44) {
				break;
			}
			if (s == slot) {
				handleModeAction(player, profile, leftClick, shift);
				openModes(player); // 刷新显示
				return;
			}
			s++;
		}
	}

	private void handleModeAction(Player player, KnockbackProfile profile, boolean leftClick, boolean shift) {
		String name = profile.getName();
		if (leftClick && shift) {
			// 复制模式
			String copyName = uniqueProfileName(name + "_copy");
			java.io.File src = KnockbackConfig.profileFile(name);
			java.io.File dest = KnockbackConfig.profileFile(copyName);
			try {
				if (src.exists()) {
					java.nio.file.Files.copy(src.toPath(), dest.toPath());
				} else {
					new CraftKnockbackProfile(copyName).save(true);
				}
				KnockbackConfig.reload();
				player.sendMessage("§a已复制模式: §f" + name + " §7→ §f" + copyName);
			} catch (IOException ex) {
				player.sendMessage("§c复制失败: " + ex.getMessage());
			}
		} else if (leftClick) {
			// 设为全局模式
			KnockbackConfig.setCurrentKb(profile);
			KnockbackConfig.set("knockback.current", name);
			player.sendMessage("§a当前全局击退模式: §f" + name);
		} else {
			// 删除模式（不允许删除当前使用的）
			if (profile == KnockbackConfig.getCurrentKb()) {
				player.sendMessage("§c不能删除正在使用的模式");
				return;
			}
			KnockbackConfig.getKbProfiles().remove(profile);
			KnockbackConfig.deleteProfileFile(name);
			player.sendMessage("§c已删除模式: " + name);
		}
	}

	private static String uniqueProfileName(String base) {
		String name = base;
		int i = 2;
		while (KnockbackConfig.getKbProfileByName(name) != null) {
			name = base + i++;
		}
		return name;
	}

	// ==================== 铁砧新建模式 ====================

	private static void openCreateAnvil(Player player) {
		pendingAnvil.add(player.getUniqueId());
		Inventory anvil = Bukkit.createInventory(player, InventoryType.ANVIL);
		anvil.setItem(0, item(Material.PAPER, "新模式名称"));
		player.openInventory(anvil);
		player.sendMessage("§e请在铁砧中输入新模式名称（以当前全局模式 §f"
				+ KnockbackConfig.getCurrentKb().getName() + " §e为模板）");
	}

	/** 处理铁砧点击，返回 true 表示事件已被消费 */
	private boolean handleAnvilClick(InventoryClickEvent event) {
		if (!(event.getWhoClicked() instanceof Player)) {
			return false;
		}
		Player player = (Player) event.getWhoClicked();
		if (!pendingAnvil.contains(player.getUniqueId())) {
			return false;
		}
		if (event.getInventory().getType() != InventoryType.ANVIL) {
			return false;
		}
		event.setCancelled(true);
		if (event.getRawSlot() != 2) { // 结果槽
			return true;
		}
		ItemStack result = event.getCurrentItem();
		if (result == null || !result.hasItemMeta() || !result.getItemMeta().hasDisplayName()) {
			return true;
		}
		pendingAnvil.remove(player.getUniqueId());
		player.closeInventory();

		String name = result.getItemMeta().getDisplayName().replaceAll("[^\\w\\u4e00-\\u9fa5-]", "");
		if (name.isEmpty() || name.equals("新模式名称")) {
			player.sendMessage("§c模式名称无效");
			return true;
		}
		if (KnockbackConfig.getKbProfileByName(name) != null) {
			player.sendMessage("§c模式已存在: " + name);
			return true;
		}

		// 以当前全局模式为模板复制文件
		java.io.File src = KnockbackConfig.profileFile(KnockbackConfig.getCurrentKb().getName());
		java.io.File dest = KnockbackConfig.profileFile(name);
		try {
			if (src.exists()) {
				java.nio.file.Files.copy(src.toPath(), dest.toPath());
			} else {
				new CraftKnockbackProfile(name).save(true);
			}
			KnockbackConfig.reload();
			player.sendMessage("§a已创建模式: §f" + name + " §7(模板: " + KnockbackConfig.getCurrentKb().getName() + ")");
		} catch (IOException ex) {
			player.sendMessage("§c创建失败: " + ex.getMessage());
		}
		return true;
	}
}
