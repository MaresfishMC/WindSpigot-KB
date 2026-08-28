package com.windpvp.windspigot.commands;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

import org.apache.commons.lang3.math.NumberUtils;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

import com.windpvp.windspigot.knockback.CraftKnockbackProfile;
import com.windpvp.windspigot.knockback.KnockbackConfig;
import com.windpvp.windspigot.knockback.KnockbackEngineSettings;
import com.windpvp.windspigot.knockback.KnockbackEngineSettings.Param;
import com.windpvp.windspigot.knockback.gui.KnockbackGUI;

import dev.cobblesword.nachospigot.knockback.KnockbackProfile;

/**
 * 击退配置命令（井然有序的分组结构）。
 *
 * 引擎参数（新版，与 KB调试工具新版适配 兼容）:
 *   /kb                      总览
 *   /kb list [分类]          按分类列出引擎参数
 *   /kb get <参数路径>       查询参数
 *   /kb set <参数路径> <值>  修改参数（即时生效并写回 knockback.yml）
 *   /kb gui [分类]           箱子 GUI 点击编辑
 *   /kb reload               热更新 knockback.yml（合并语义，控制台可用）
 *   /kb reset                恢复全部默认
 *
 * 旧版 profile 系统（保留兼容）:
 *   /kb profile list|create|delete|load|set|info
 *
 * @author WindSpigot
 */
public class KnockbackCommand extends Command {

	private final String separator = "§8§m-=-------------------------=-";

	public KnockbackCommand(String name) {
		super(name);
		this.description = "击退配置管理";
		this.setPermission("windspigot.command.knockback");
	}

	@Override
	public boolean execute(CommandSender sender, String commandLabel, String[] args) {
		if (!testPermission(sender)) {
			return false;
		}

		if (args.length == 0) {
			sendOverview(sender);
			return true;
		}

		String sub = args[0].toLowerCase();
		switch (sub) {
		case "reload":
			KnockbackConfig.reload();
			sender.sendMessage("§a击退配置已热更新（合并语义：只覆盖文件中显式存在的键）");
			return true;
		case "list":
			sendList(sender, args.length > 1 ? joinTail(args) : null);
			return true;
		case "get":
			if (args.length < 2) {
				sender.sendMessage("§c用法: /kb get <参数路径>");
				return true;
			}
			sendGet(sender, args[1]);
			return true;
		case "set":
			if (args.length < 3) {
				sender.sendMessage("§c用法: /kb set <参数路径> <值>");
				return true;
			}
			sendSet(sender, args[1], args[2]);
			return true;
		case "reset":
			KnockbackEngineSettings.resetAll();
			KnockbackConfig.saveEngineSettings();
			sender.sendMessage("§e所有引擎参数已恢复默认并保存");
			return true;
		case "gui":
			if (!(sender instanceof Player)) {
				sender.sendMessage("§cGUI 只能由玩家打开！");
				return true;
			}
			if (args.length > 1) {
				String cat = findCategory(joinTail(args));
				if (cat == null) {
					sender.sendMessage("§c未知分类: " + joinTail(args) + " §7(可选: " + categoryList() + ")");
					return true;
				}
				KnockbackGUI.openCategory((Player) sender, cat, 0);
			} else {
				KnockbackGUI.openMain((Player) sender);
			}
			return true;
		case "profile":
			return handleProfile(sender, args);
		case "help":
		default:
			sendOverview(sender);
			return true;
		}
	}

	// ==================== 引擎参数子命令 ====================

	private void sendOverview(CommandSender sender) {
		sender.sendMessage(separator);
		sender.sendMessage("§6§l击退引擎 §7(热更新: /kb reload)");
		sender.sendMessage("§e/kb list [分类] §7- 列出参数 §8(分类: " + categoryList() + "§8)");
		sender.sendMessage("§e/kb get <路径> §7- 查询参数值");
		sender.sendMessage("§e/kb set <路径> <值> §7- 修改参数(即时生效)");
		sender.sendMessage("§e/kb gui [分类] §7- 箱子GUI编辑");
		sender.sendMessage("§e/kb reset §7- 恢复全部默认");
		sender.sendMessage("§e/kb profile §7- 旧版profile系统");
		sender.sendMessage(separator);
	}

	private String categoryList() {
		return String.join("§7, §f", KnockbackEngineSettings.guiCategories());
	}

	private void sendList(CommandSender sender, String categoryArg) {
		List<Param> params;
		String title;
		if (categoryArg == null) {
			params = new ArrayList<>(KnockbackEngineSettings.PARAMS.values());
			title = "全部参数";
		} else {
			String cat = findCategory(categoryArg);
			if (cat == null) {
				sender.sendMessage("§c未知分类: " + categoryArg + " §7(可选: " + categoryList() + ")");
				return;
			}
			params = KnockbackEngineSettings.byCategory(cat);
			title = cat;
		}
		sender.sendMessage(separator);
		sender.sendMessage("§6" + title + " §7(共 " + params.size() + " 项)");
		for (Param p : params) {
			sender.sendMessage(" §e" + p.path + " §7= §f" + formatValue(p) + " §8" + p.desc);
		}
		sender.sendMessage(separator);
	}

	private void sendGet(CommandSender sender, String path) {
		Param p = findParam(path);
		if (p == null) {
			sender.sendMessage("§c未知参数: " + path + " §7(/kb list 查看全部)");
			return;
		}
		sender.sendMessage("§e" + p.path + " §7= §f" + formatValue(p) + " §8" + p.desc);
	}

	private void sendSet(CommandSender sender, String path, String rawValue) {
		Param p = findParam(path);
		if (p == null) {
			sender.sendMessage("§c未知参数: " + path + " §7(/kb list 查看全部)");
			return;
		}
		Object parsed;
		switch (p.type) {
		case BOOL:
			if (!rawValue.equalsIgnoreCase("true") && !rawValue.equalsIgnoreCase("false")) {
				sender.sendMessage("§c布尔参数只接受 true/false");
				return;
			}
			parsed = Boolean.parseBoolean(rawValue);
			break;
		case INT:
			if (!NumberUtils.isNumber(rawValue)) {
				sender.sendMessage("§c整数参数格式错误: " + rawValue);
				return;
			}
			parsed = (int) Double.parseDouble(rawValue);
			break;
		case DOUBLE:
		default:
			if (!NumberUtils.isNumber(rawValue)) {
				sender.sendMessage("§c数值参数格式错误: " + rawValue);
				return;
			}
			parsed = Double.parseDouble(rawValue);
			break;
		}
		// 一致性自检：非法值拒绝写入
		String error = KnockbackEngineSettings.checkValue(p, parsed);
		if (error != null) {
			sender.sendMessage("§c参数校验失败，已拒绝: " + error);
			return;
		}
		p.set(parsed);
		KnockbackConfig.saveEngineSettings(); // 即时生效 + 持久化
		sender.sendMessage("§a已更新 §f" + p.path + " §7→ " + formatValue(p) + " §7(已保存)");
	}

	private Param findParam(String path) {
		Param p = KnockbackEngineSettings.param(path);
		if (p != null) {
			return p;
		}
		// 宽松匹配：忽略大小写
		for (Param param : KnockbackEngineSettings.PARAMS.values()) {
			if (param.path.equalsIgnoreCase(path)) {
				return param;
			}
		}
		return null;
	}

	private String findCategory(String name) {
		for (String cat : KnockbackEngineSettings.guiCategories()) {
			if (cat.equalsIgnoreCase(name) || cat.contains(name)) {
				return cat;
			}
		}
		return null;
	}

	private String formatValue(Param p) {
		switch (p.type) {
		case BOOL:
			return p.getBool() ? "§atrue" : "§cfalse";
		case INT:
			return String.valueOf(p.getInt());
		default:
			return String.format("%.6f", p.getDouble()).replaceAll("0+$", "").replaceAll("\\.$", ".0");
		}
	}

	private String joinTail(String[] args) {
		return String.join(" ", Arrays.copyOfRange(args, 1, args.length));
	}

	// ==================== 旧版 profile 系统（保留兼容） ====================

	private boolean handleProfile(CommandSender sender, String[] args) {
		if (args.length < 2) {
			sender.sendMessage(separator);
			sender.sendMessage("§6旧版 profile 系统:");
			sender.sendMessage("§e/kb profile list §7- 列出所有profile");
			sender.sendMessage("§e/kb profile create <名> §7- 创建");
			sender.sendMessage("§e/kb profile delete <名> §7- 删除");
			sender.sendMessage("§e/kb profile load <名> §7- 设为全局当前profile");
			sender.sendMessage("§e/kb profile set <名> <玩家> §7- 给玩家单独设置");
			sender.sendMessage("§e/kb profile info <名> §7- 查看参数");
			sender.sendMessage(separator);
			return true;
		}

		String action = args[1].toLowerCase();
		switch (action) {
		case "list": {
			sender.sendMessage(separator);
			sender.sendMessage("§6当前全局profile: §f" + KnockbackConfig.getCurrentKb().getName());
			for (KnockbackProfile profile : KnockbackConfig.getKbProfiles()) {
				sender.sendMessage(" §e- " + profile.getName());
			}
			sender.sendMessage(separator);
			return true;
		}
		case "create": {
			if (args.length < 3) {
				sender.sendMessage("§c用法: /kb profile create <名>");
				return true;
			}
			if (KnockbackConfig.getKbProfileByName(args[2]) != null) {
				sender.sendMessage("§c该profile已存在");
				return true;
			}
			KnockbackProfile profile = new CraftKnockbackProfile(args[2]);
			KnockbackConfig.getKbProfiles().add(profile);
			profile.save(true);
			sender.sendMessage("§a已创建profile: " + args[2]);
			return true;
		}
		case "delete": {
			if (args.length < 3) {
				sender.sendMessage("§c用法: /kb profile delete <名>");
				return true;
			}
			KnockbackProfile profile = KnockbackConfig.getKbProfileByName(args[2]);
			if (profile == null) {
				sender.sendMessage("§c未找到profile: " + args[2]);
				return true;
			}
			if (profile == KnockbackConfig.getCurrentKb()) {
				sender.sendMessage("§c不能删除正在使用的profile");
				return true;
			}
			KnockbackConfig.getKbProfiles().remove(profile);
			KnockbackConfig.deleteProfileFile(profile.getName());
			sender.sendMessage("§a已删除模式: " + args[2] + " §7(kb配置文件/模式/" + args[2] + ".yml)");
			return true;
		}
		case "load": {
			if (args.length < 3) {
				sender.sendMessage("§c用法: /kb profile load <名>");
				return true;
			}
			KnockbackProfile profile = KnockbackConfig.getKbProfileByName(args[2]);
			if (profile == null) {
				sender.sendMessage("§c未找到profile: " + args[2]);
				return true;
			}
			KnockbackConfig.setCurrentKb(profile);
			KnockbackConfig.set("knockback.current", profile.getName());
			sender.sendMessage("§a当前全局profile: " + profile.getName());
			return true;
		}
		case "set": {
			if (args.length < 4) {
				sender.sendMessage("§c用法: /kb profile set <名> <玩家>");
				return true;
			}
			KnockbackProfile profile = KnockbackConfig.getKbProfileByName(args[2]);
			Player target = Bukkit.getPlayer(args[3]);
			if (profile == null) {
				sender.sendMessage("§c未找到profile: " + args[2]);
				return true;
			}
			if (target == null) {
				sender.sendMessage("§c玩家不在线: " + args[3]);
				return true;
			}
			KnockbackConfig.setPlayerProfile(target, profile.getName());
			sender.sendMessage("§a已将玩家 " + target.getName() + " 的profile设为 " + profile.getName());
			return true;
		}
		case "info": {
			if (args.length < 3) {
				sender.sendMessage("§c用法: /kb profile info <名>");
				return true;
			}
			KnockbackProfile profile = KnockbackConfig.getKbProfileByName(args[2]);
			if (profile == null) {
				sender.sendMessage("§c未找到profile: " + args[2]);
				return true;
			}
			sender.sendMessage(separator);
			sender.sendMessage("§6Profile: " + profile.getName());
			for (String value : profile.getKnockbackValues()) {
				sender.sendMessage(" §e" + value);
			}
			for (String value : profile.getAdvancedValues()) {
				sender.sendMessage(" §b" + value);
			}
			sender.sendMessage(separator);
			return true;
		}
		default:
			sender.sendMessage("§c未知profile操作: " + action);
			return true;
		}
	}

	// ==================== Tab 补全 ====================

	@Override
	public List<String> tabComplete(CommandSender sender, String alias, String[] args) {
		if (args.length == 1) {
			return filter(Arrays.asList("reload", "list", "get", "set", "gui", "reset", "profile", "help"), args[0]);
		}
		String sub = args[0].toLowerCase();
		if (args.length == 2) {
			switch (sub) {
			case "list":
			case "gui":
				return filter(KnockbackEngineSettings.guiCategories(), args[1]);
			case "get":
			case "set":
				return filter(KnockbackEngineSettings.paths(), args[1]);
			case "profile":
				return filter(Arrays.asList("list", "create", "delete", "load", "set", "info"), args[1]);
			}
		}
		if (args.length == 3) {
			if (sub.equals("set")) {
				Param p = findParam(args[1]);
				if (p != null && p.type == KnockbackEngineSettings.Type.BOOL) {
					return filter(Arrays.asList("true", "false"), args[2]);
				}
			} else if (sub.equals("profile")) {
				return filter(
						KnockbackConfig.getKbProfiles().stream().map(KnockbackProfile::getName)
								.collect(Collectors.toList()),
						args[2]);
			}
		}
		return Collections.emptyList();
	}

	private List<String> filter(List<String> options, String prefix) {
		String lower = prefix.toLowerCase();
		return options.stream().filter(o -> o.toLowerCase().startsWith(lower)).collect(Collectors.toList());
	}
}
