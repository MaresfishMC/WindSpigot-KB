package com.windpvp.windspigot.knockback.gui;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.block.Block;
import org.bukkit.craftbukkit.CraftWorld;
import org.bukkit.craftbukkit.entity.CraftPlayer;
import org.bukkit.entity.Player;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.SignChangeEvent;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.event.player.PlayerChangedWorldEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.scheduler.BukkitTask;

import com.windpvp.windspigot.CorePluginBridge;
import com.windpvp.windspigot.knockback.CraftKnockbackProfile;
import com.windpvp.windspigot.knockback.KnockbackConfig;
import com.windpvp.windspigot.knockback.KnockbackEngineSettings;
import com.windpvp.windspigot.knockback.KnockbackEngineSettings.Param;

import dev.cobblesword.nachospigot.knockback.KnockbackProfile;
import net.minecraft.server.BlockPosition;
import net.minecraft.server.PacketPlayOutOpenSignEditor;
import net.minecraft.server.TileEntity;
import net.minecraft.server.TileEntitySign;

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

	/** 正在告示牌界面输入新模式名称的玩家会话 */
	private static final Map<UUID, SignSession> pendingSigns = new HashMap<>();

	private static final class SignSession {
		final org.bukkit.World world;
		final BlockPosition pos;
		final int origTypeId;
		final byte origData;
		final BukkitTask timeoutTask;

		SignSession(org.bukkit.World world, BlockPosition pos, int origTypeId, byte origData,
				BukkitTask timeoutTask) {
			this.world = world;
			this.pos = pos;
			this.origTypeId = origTypeId;
			this.origData = origData;
			this.timeoutTask = timeoutTask;
		}
	}

	private KnockbackGUI() {
	}

	/** 注册全部监听器（启动时由 WindSpigot 调用，GUI 打开时兜底调用）。
	 *  注意: 不能用 registerEvents()（它会调用 plugin.getPluginLoader()），
	 *  核心内嵌插件桥没有 PluginLoader，因此用 registerEvent 直接注册。 */
	public static synchronized void registerAll() {
		if (registered) {
			return;
		}
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
		Bukkit.getPluginManager().registerEvent(SignChangeEvent.class, INSTANCE, EventPriority.NORMAL,
				(listener, event) -> {
					if (event instanceof SignChangeEvent) {
						INSTANCE.onSignChange((SignChangeEvent) event);
					}
				}, CorePluginBridge.get());
		Bukkit.getPluginManager().registerEvent(PlayerQuitEvent.class, INSTANCE, EventPriority.NORMAL,
				(listener, event) -> {
					if (event instanceof PlayerQuitEvent) {
						restoreSign(((PlayerQuitEvent) event).getPlayer().getUniqueId());
					}
				}, CorePluginBridge.get());
		Bukkit.getPluginManager().registerEvent(PlayerChangedWorldEvent.class, INSTANCE, EventPriority.NORMAL,
				(listener, event) -> {
					if (event instanceof PlayerChangedWorldEvent) {
						KnockbackConfig.applyWorldProfile(((PlayerChangedWorldEvent) event).getPlayer());
					}
				}, CorePluginBridge.get());
		registered = true;
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
		registerAll();
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
		registerAll();
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
		registerAll();
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
			openCreateSign(player);
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
			openCreateSign(player);
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

	// ==================== 告示牌新建模式 ====================
	// 相比铁砧 GUI：不依赖占位物品、天然支持文本输入、触发事件明确。
	// 原理：在玩家所在区块 y=255 临时放置真实告示牌（1.8.8 中 SignChangeEvent 需要服务端存在
	// 对应 TileEntitySign），发送打开编辑器数据包；完成/超时/退出后恢复原方块。

	private static void openCreateSign(Player player) {
		UUID uuid = player.getUniqueId();
		if (pendingSigns.containsKey(uuid)) {
			player.sendMessage("§c你已有进行中的新建模式操作");
			return;
		}

		int x = player.getLocation().getBlockX();
		int z = player.getLocation().getBlockZ();
		Block block = player.getWorld().getBlockAt(x, 255, z);
		int origTypeId = block.getTypeId();
		byte origData = block.getData();

		// 放置临时告示牌并标记可编辑（1.8.8 需要，否则 SignChangeEvent 不会触发）
		block.setTypeIdAndData(Material.SIGN_POST.getId(), (byte) 0, false);
		BlockPosition pos = new BlockPosition(x, 255, z);
		TileEntity tile = ((CraftWorld) player.getWorld()).getHandle().getTileEntity(pos);
		if (!(tile instanceof TileEntitySign)) {
			block.setTypeIdAndData(origTypeId, origData, false);
			player.sendMessage("§c打开编辑器失败，请重试");
			return;
		}
		((TileEntitySign) tile).a(((CraftPlayer) player).getHandle());

		// 打开告示牌编辑器
		((CraftPlayer) player).getHandle().playerConnection.sendPacket(new PacketPlayOutOpenSignEditor(pos));

		// 60 秒超时自动恢复（玩家按 Esc 关闭编辑器时不触发 SignChangeEvent）
		BukkitTask timeout = Bukkit.getScheduler().runTaskLater(CorePluginBridge.get(), () -> restoreSign(uuid),
				1200L);
		pendingSigns.put(uuid, new SignSession(player.getWorld(), pos, origTypeId, origData, timeout));

		player.sendMessage("§e请在告示牌第一行输入新模式名称（以当前全局模式 §f"
				+ KnockbackConfig.getCurrentKb().getName() + " §e为模板）");
	}

	/** 恢复临时告示牌处的原方块（完成/超时/退出时调用） */
	private static void restoreSign(UUID uuid) {
		SignSession session = pendingSigns.remove(uuid);
		if (session == null) {
			return;
		}
		session.timeoutTask.cancel();
		Block block = session.world.getBlockAt(session.pos.getX(), session.pos.getY(), session.pos.getZ());
		if (block.getType() == Material.SIGN_POST || block.getType() == Material.WALL_SIGN) {
			block.setTypeIdAndData(session.origTypeId, session.origData, false);
		}
	}

	public void onSignChange(SignChangeEvent event) {
		Player player = event.getPlayer();
		SignSession session = pendingSigns.get(player.getUniqueId());
		if (session == null) {
			return;
		}
		if (!session.pos.equals(new BlockPosition(event.getBlock().getX(), event.getBlock().getY(),
				event.getBlock().getZ()))) {
			return; // 不是我们的告示牌
		}
		event.setCancelled(true);
		restoreSign(player.getUniqueId());

		String name = event.getLine(0);
		if (name == null || name.trim().isEmpty()) {
			player.sendMessage("§c模式名称不能为空！");
			return;
		}
		name = org.bukkit.ChatColor.stripColor(name).trim().replaceAll("[^\\w\\u4e00-\\u9fa5-]", "");
		if (name.isEmpty()) {
			player.sendMessage("§c模式名称无效");
			return;
		}
		if (KnockbackConfig.getKbProfileByName(name) != null) {
			player.sendMessage("§c模式已存在: " + name);
			return;
		}

		// 三层合并模板（默认值 -> 当前全局模式 -> 完整参数写出）
		String template = KnockbackConfig.getCurrentKb().getName();
		if (KnockbackConfig.createProfileFromTemplate(template, name)) {
			player.sendMessage("§a已创建模式: §f" + name + " §7(模板: " + template + "，含全部参数)");
		} else {
			player.sendMessage("§c创建失败，详情见控制台");
		}
	}
}
