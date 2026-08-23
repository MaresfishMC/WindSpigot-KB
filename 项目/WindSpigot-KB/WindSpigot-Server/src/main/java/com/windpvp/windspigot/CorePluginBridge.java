package com.windpvp.windspigot;

import java.io.File;
import java.io.InputStream;
import java.util.List;
import java.util.logging.Logger;

import org.bukkit.Server;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.generator.ChunkGenerator;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.PluginDescriptionFile;
import org.bukkit.plugin.PluginLoader;

/**
 * 核心内部插件桥：核心本身不是 Bukkit 插件，但 GUI 等功能需要注册事件监听器。
 * 这里提供一个最小 Plugin 实现用于 SimplePluginManager.registerEvents()。
 *
 * @author WindSpigot
 */
public final class CorePluginBridge implements Plugin {

	private static final CorePluginBridge INSTANCE = new CorePluginBridge();
	private final PluginDescriptionFile description = new PluginDescriptionFile("WindSpigot", "2.1.4-KB",
			"com.windpvp.windspigot");

	private CorePluginBridge() {
	}

	public static CorePluginBridge get() {
		return INSTANCE;
	}

	@Override
	public String getName() {
		return "WindSpigot";
	}

	@Override
	public boolean isEnabled() {
		return true;
	}

	@Override
	public Server getServer() {
		return org.bukkit.Bukkit.getServer();
	}

	@Override
	public PluginDescriptionFile getDescription() {
		return description;
	}

	@Override
	public Logger getLogger() {
		return Logger.getLogger("WindSpigot");
	}

	// ---------- 以下均为桩实现 ----------

	@Override
	public File getDataFolder() {
		return new File(".");
	}

	@Override
	public PluginLoader getPluginLoader() {
		return null;
	}

	@Override
	public FileConfiguration getConfig() {
		return null;
	}

	@Override
	public InputStream getResource(String filename) {
		return null;
	}

	@Override
	public void saveConfig() {
	}

	@Override
	public void saveDefaultConfig() {
	}

	@Override
	public void saveResource(String resourcePath, boolean replace) {
	}

	@Override
	public void reloadConfig() {
	}

	@Override
	public void onDisable() {
	}

	@Override
	public void onLoad() {
	}

	@Override
	public void onEnable() {
	}

	@Override
	public boolean isNaggable() {
		return false;
	}

	@Override
	public void setNaggable(boolean canNag) {
	}

	@Override
	public ChunkGenerator getDefaultWorldGenerator(String worldName, String id) {
		return null;
	}

	@Override
	public com.avaje.ebean.EbeanServer getDatabase() {
		return null;
	}

	@Override
	public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
		return false;
	}

	@Override
	public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
		return null;
	}
}
