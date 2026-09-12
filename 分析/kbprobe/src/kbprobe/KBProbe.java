package kbprobe;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.entity.Zombie;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.player.PlayerVelocityEvent;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * KB 端内诊断探针（不依赖 ProtocolLib）
 *
 * 原理: CraftBukkit 在把 S12 速度包发给玩家**之前**会触发 PlayerVelocityEvent,
 *       事件的 velocity 就是即将写入网络包的那个向量 ⇒ 等价于抓到真实发包内容。
 *       再由 EntityDamageByEntityEvent(先于击退计算触发) 记录"命中前"上下文。
 */
public class KBProbe extends JavaPlugin implements Listener {

    private static final class Hit {
        long tsMs;
        String attacker, victim;
        boolean atkSprint, atkExtraKb, vicSprint, vicGround;
        int vicNdt, atkMaxNdt;
        float vicLastDmg, atkLastDmg;
        double atkX, atkY, atkZ, atkYaw;
        double vicX, vicY, vicZ;
        double preX, preY, preZ;
        int atkPing, vicPing;
        double dist;
    }

    private static final Map<Integer, Deque<Hit>> PENDING = new ConcurrentHashMap<>();
    private BufferedWriter out;
    private volatile int written = 0;
    private volatile int skipped = 0;

    @Override
    public void onEnable() {
        try {
            File dir = getDataFolder();
            dir.mkdirs();
            boolean fresh = !new File(dir, "kb-log.csv").exists();
            out = new BufferedWriter(new OutputStreamWriter(
                    new FileOutputStream(new File(dir, "kb-log.csv"), true), StandardCharsets.UTF_8));
            if (fresh) {
                out.write("ts_ms,attacker,victim,atk_sprint,atk_extra_kb,vic_sprint,vic_ground,"
                        + "vic_ndt,atk_max_ndt,vic_last_dmg,atk_last_dmg,"
                        + "atk_yaw,atk_x,atk_y,atk_z,vic_x,vic_y,vic_z,pre_x,pre_y,pre_z,"
                        + "pkt_x,pkt_y,pkt_z,pkt_h,atk_ping,vic_ping,dist\n");
                out.flush();
            }
        } catch (Exception ex) {
            getLogger().severe("无法打开日志: " + ex);
        }
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("KBProbe 诊断就绪 → plugins/KBProbe/kb-log.csv");
    }

    /** 命中前快照: 此事件在击退计算之前触发, 因此 mot 仍是"原速度" */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onDamage(EntityDamageByEntityEvent e) {
        if (!(e.getEntity() instanceof Player) || !(e.getDamager() instanceof Player)) {
            return;
        }
        try {
            Player victim = (Player) e.getEntity();
            Player attacker = (Player) e.getDamager();
            Hit h = new Hit();
            h.tsMs = System.currentTimeMillis();
            h.attacker = attacker.getName();
            h.victim = victim.getName();
            h.atkSprint = attacker.isSprinting();
            h.vicSprint = victim.isSprinting();
            Location va = victim.getLocation(), aa = attacker.getLocation();
            net.minecraft.server.v1_8_R3.EntityPlayer vh =
                    ((org.bukkit.craftbukkit.v1_8_R3.entity.CraftPlayer) victim).getHandle();
            net.minecraft.server.v1_8_R3.EntityPlayer ah =
                    ((org.bukkit.craftbukkit.v1_8_R3.entity.CraftPlayer) attacker).getHandle();
            // 引擎判定用的是 isExtraKnockback() || isSprinting()，必须两个都记
            h.atkExtraKb = ah.isExtraKnockback();
            h.atkMaxNdt = ah.maxNoDamageTicks;
            h.atkLastDmg = ah.lastDamage;
            h.vicNdt = vh.noDamageTicks;
            h.vicLastDmg = vh.lastDamage;
            h.vicGround = vh.onGround;
            h.atkX = aa.getX(); h.atkY = aa.getY(); h.atkZ = aa.getZ(); h.atkYaw = aa.getYaw();
            h.vicX = va.getX(); h.vicY = va.getY(); h.vicZ = va.getZ();
            h.preX = vh.motX; h.preY = vh.motY; h.preZ = vh.motZ;
            h.atkPing = ah.ping;
            h.vicPing = vh.ping;
            h.dist = va.distance(aa);
            PENDING.computeIfAbsent(victim.getEntityId(), k -> new ArrayDeque<>()).addLast(h);
        } catch (Exception ex) {
            getLogger().warning("记录命中失败: " + ex);
        }
    }

    /** 即将发出的速度包内容 */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onVelocity(PlayerVelocityEvent e) {
        Hit h = take(e.getPlayer().getEntityId());
        if (h == null) {
            skipped++;
            return;   // 非对刀造成(爆炸/指令等)
        }
        try {
            double vx = e.getVelocity().getX(), vy = e.getVelocity().getY(), vz = e.getVelocity().getZ();
            double ph = Math.sqrt(vx * vx + vz * vz);
            synchronized (this) {
                out.write(String.format(Locale.ROOT,
                        "%d,%s,%s,%b,%b,%b,%b,%d,%d,%.3f,%.3f,%.3f,"
                        + "%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.5f,%.5f,%.5f,"
                        + "%.6f,%.6f,%.6f,%.6f,%d,%d,%.4f%n",
                        h.tsMs, h.attacker, h.victim, h.atkSprint, h.atkExtraKb, h.vicSprint, h.vicGround,
                        h.vicNdt, h.atkMaxNdt, h.vicLastDmg, h.atkLastDmg, h.atkYaw,
                        h.atkX, h.atkY, h.atkZ, h.vicX, h.vicY, h.vicZ,
                        h.preX, h.preY, h.preZ, vx, vy, vz, ph, h.atkPing, h.vicPing, h.dist));
                out.flush();
                written++;
            }
        } catch (Exception ex) {
            getLogger().warning("写日志失败: " + ex);
        }
    }

    private Hit take(int entityId) {
        Deque<Hit> q = PENDING.get(entityId);
        if (q == null) {
            return null;
        }
        long now = System.currentTimeMillis();
        synchronized (q) {
            while (!q.isEmpty() && now - q.peekFirst().tsMs > 400) {
                q.pollFirst();
            }
            return q.pollFirst();
        }
    }

    @Override
    public void onDisable() {
        try { if (out != null) { out.flush(); out.close(); } } catch (Exception ignored) { }
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!"kbprobe".equalsIgnoreCase(cmd.getName())) {
            return false;
        }
        if (args.length > 0 && "status".equalsIgnoreCase(args[0])) {
            sender.sendMessage("KBProbe: 已记录对刀速度包 " + written + " 条 (过滤非对刀 " + skipped
                    + "), 在线 " + Bukkit.getOnlinePlayers().size() + " 人");
            return true;
        }
        if (args.length > 0 && "text".equalsIgnoreCase(args[0])) {
            String self = com.windpvp.windspigot.config.WindSpigotConfig.pingSelfCmdString;
            sender.sendMessage("KBProbe/text = [" + org.bukkit.ChatColor
                    .translateAlternateColorCodes('&', self).replace("%ping%", "32") + "]");
            return true;
        }
        World world = Bukkit.getWorlds().get(0);
        Zombie zombie = world.spawn(world.getSpawnLocation(), Zombie.class);
        try {
            net.minecraft.server.v1_8_R3.EntityZombie nms =
                    ((org.bukkit.craftbukkit.v1_8_R3.entity.CraftZombie) zombie).getHandle();
            nms.motX = 0; nms.motY = 0; nms.motZ = 0;
            nms.onGround = true;
            com.windpvp.windspigot.knockback.KnockbackEngine.applyBaseKnockback(nms, 1.0D, 0.0D, null);
            double mag = Math.sqrt(nms.motX * nms.motX + nms.motZ * nms.motZ);
            sender.sendMessage(String.format(Locale.ROOT, "KBProbe: |motXZ|=%.6f motY=%.6f profile=%s",
                    mag, nms.motY, com.windpvp.windspigot.knockback.KnockbackConfig.getCurrentKb().getName()));
        } finally {
            zombie.remove();
        }
        return true;
    }
}
