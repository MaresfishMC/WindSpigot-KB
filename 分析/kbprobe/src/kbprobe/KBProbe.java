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

import com.comphenix.protocol.PacketType;
import com.comphenix.protocol.ProtocolLibrary;
import com.comphenix.protocol.events.ListenerPriority;
import com.comphenix.protocol.events.PacketAdapter;
import com.comphenix.protocol.events.PacketContainer;
import com.comphenix.protocol.events.PacketEvent;

/**
 * KB 端内诊断探针 v1.3
 *  - 原始包层(ProtocolLib): C02_ATTACK 出手(含被无敌帧吞掉的) / C0B 疾跑切换 / S12 出包
 *  - Bukkit 层: 命中前上下文 + 即将发出的速度包内容
 * 输出: plugins/KBProbe/kb-log.csv (对刀生效包) 与 events.csv (出手与疾跑事件流)
 */
public class KBProbe extends JavaPlugin implements Listener {

    private static final class Hit {
        long tsMs;
        String attacker, victim;
        boolean atkSprint, atkExtraKb, vicSprint, vicGround;
        int vicNdt; float vicLastDmg, eventDmg;
        double atkX, atkY, atkZ, atkYaw, vicX, vicY, vicZ, preX, preY, preZ, dist;
        int atkPing, vicPing;
    }
    private static final Map<Integer, Deque<Hit>> PENDING = new ConcurrentHashMap<>();
    private BufferedWriter kbOut, evOut;
    private volatile int written = 0, skipped = 0, attacks = 0;

    @Override
    public void onEnable() {
        try {
            File dir = getDataFolder(); dir.mkdirs();
            boolean fresh = !new File(dir, "kb-log.csv").exists();
            kbOut = new BufferedWriter(new OutputStreamWriter(new FileOutputStream(new File(dir, "kb-log.csv"), true), StandardCharsets.UTF_8));
            if (fresh) {
                kbOut.write("ts_ms,attacker,victim,atk_sprint,atk_extra_kb,vic_sprint,vic_ground,"
                        + "vic_ndt,vic_last_dmg,event_dmg,atk_yaw,atk_x,atk_y,atk_z,vic_x,vic_y,vic_z,"
                        + "pre_x,pre_y,pre_z,pkt_x,pkt_y,pkt_z,pkt_h,atk_ping,vic_ping,dist\n");
                kbOut.flush();
            }
            boolean freshEv = !new File(dir, "events.csv").exists();
            evOut = new BufferedWriter(new OutputStreamWriter(new FileOutputStream(new File(dir, "events.csv"), true), StandardCharsets.UTF_8));
            if (freshEv) { evOut.write("ts_ms,type,player,x,y,z,yaw,sprint,extra_kb,ndt,last_dmg\n"); evOut.flush(); }
        } catch (Exception ex) { getLogger().severe("无法打开日志: " + ex); }

        getServer().getPluginManager().registerEvents(this, this);

        try {
            ProtocolLibrary.getProtocolManager().addPacketListener(new PacketAdapter(this,
                    ListenerPriority.MONITOR, PacketType.Play.Client.USE_ENTITY, PacketType.Play.Client.ENTITY_ACTION) {
                @Override public void onPacketReceiving(PacketEvent e) {
                    try {
                        Player p = e.getPlayer();
                        if (p == null) return;
                        Object pkt = e.getPacket();
                        String type;
                        String use = enumName(pkt, "UseAction");
                        if (use != null) {
                            if (!"ATTACK".equals(use)) return; // 只关心左键出手
                            type = "ATTACK"; attacks++;
                        } else {
                            String pa = enumName(pkt, "PlayerAction");
                            if (pa == null) return;
                            if (pa.contains("START_SPRINTING")) type = "SPRINT_START";
                            else if (pa.contains("STOP_SPRINTING")) type = "SPRINT_STOP";
                            else return;
                        }
                        net.minecraft.server.v1_8_R3.EntityPlayer h =
                                ((org.bukkit.craftbukkit.v1_8_R3.entity.CraftPlayer) p).getHandle();
                        Location l = p.getLocation();
                        synchronized (KBProbe.this) {
                            evOut.write(String.format(Locale.ROOT, "%d,%s,%s,%.4f,%.4f,%.4f,%.3f,%b,%b,%d,%.3f%n",
                                    System.currentTimeMillis(), type, p.getName(), l.getX(), l.getY(), l.getZ(),
                                    l.getYaw(), h.isSprinting(), h.isExtraKnockback(), h.noDamageTicks, h.lastDamage));
                            evOut.flush();
                        }
                    } catch (Exception ex) { /* 忽略 */ }
                }
            });
            getLogger().info("KBProbe v1.3: ProtocolLib 包层已挂载 (USE_ENTITY/ATTACK + ENTITY_ACTION)");
        } catch (Throwable t) {
            getLogger().warning("ProtocolLib 挂载失败(仅剩 Bukkit 层): " + t);
        }

        getLogger().info("KBProbe 诊断就绪 → plugins/KBProbe/{kb-log,events}.csv");
    }

    /**
     * 从 PacketContainer 里取出指定 StructureModifier 的第 0 项并返回其枚举名。
     * 全部走反射: 不同 ProtocolLib 版本的访问器名/结构不同(5.4.0 无 PacketType.Play.Client.ATTACK,
     * 左键出手是 USE_ENTITY + EntityUseAction.ATTACK), 编译期桩无法覆盖, 反射最稳。
     */
    private static String enumName(Object packet, String keyword) {
        if (packet == null) return null;
        for (java.lang.reflect.Method m : packet.getClass().getMethods()) {
            if (m.getParameterTypes().length != 0 || !m.getName().contains(keyword)) continue;
            try {
                Object mod = m.invoke(packet);
                if (mod == null) continue;
                java.lang.reflect.Method read = mod.getClass().getMethod("read", int.class);
                Object val = read.invoke(mod, 0);
                if (val == null) continue;
                try { return val.getClass().getMethod("name").invoke(val).toString(); }
                catch (Throwable t) { return val.toString(); }
            } catch (Throwable ignored) { }
        }
        return null;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onDamage(EntityDamageByEntityEvent e) {
        if (!(e.getEntity() instanceof Player) || !(e.getDamager() instanceof Player)) return;
        try {
            Player victim = (Player) e.getEntity(), attacker = (Player) e.getDamager();
            Hit h = new Hit();
            h.tsMs = System.currentTimeMillis();
            h.attacker = attacker.getName(); h.victim = victim.getName();
            h.atkSprint = attacker.isSprinting(); h.vicSprint = victim.isSprinting();
            Location va = victim.getLocation(), aa = attacker.getLocation();
            net.minecraft.server.v1_8_R3.EntityPlayer vh = ((org.bukkit.craftbukkit.v1_8_R3.entity.CraftPlayer) victim).getHandle();
            net.minecraft.server.v1_8_R3.EntityPlayer ah = ((org.bukkit.craftbukkit.v1_8_R3.entity.CraftPlayer) attacker).getHandle();
            h.atkExtraKb = ah.isExtraKnockback();
            h.vicNdt = vh.noDamageTicks; h.vicLastDmg = vh.lastDamage;
            h.eventDmg = (float) e.getFinalDamage();
            h.vicGround = vh.onGround;
            h.atkX = aa.getX(); h.atkY = aa.getY(); h.atkZ = aa.getZ(); h.atkYaw = aa.getYaw();
            h.vicX = va.getX(); h.vicY = va.getY(); h.vicZ = va.getZ();
            h.preX = vh.motX; h.preY = vh.motY; h.preZ = vh.motZ;
            h.atkPing = ah.ping; h.vicPing = vh.ping; h.dist = va.distance(aa);
            PENDING.computeIfAbsent(victim.getEntityId(), k -> new ArrayDeque<>()).addLast(h);
        } catch (Exception ex) { getLogger().warning("记录命中失败: " + ex); }
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onVelocity(PlayerVelocityEvent e) {
        Hit h = take(e.getPlayer().getEntityId());
        if (h == null) { skipped++; return; }
        try {
            double vx = e.getVelocity().getX(), vy = e.getVelocity().getY(), vz = e.getVelocity().getZ();
            double ph = Math.sqrt(vx * vx + vz * vz);
            synchronized (this) {
                kbOut.write(String.format(Locale.ROOT,
                        "%d,%s,%s,%b,%b,%b,%b,%d,%.3f,%.3f,%.3f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,"
                        + "%.5f,%.5f,%.5f,%.6f,%.6f,%.6f,%.6f,%d,%d,%.4f%n",
                        h.tsMs, h.attacker, h.victim, h.atkSprint, h.atkExtraKb, h.vicSprint, h.vicGround,
                        h.vicNdt, h.vicLastDmg, h.eventDmg, h.atkYaw,
                        h.atkX, h.atkY, h.atkZ, h.vicX, h.vicY, h.vicZ,
                        h.preX, h.preY, h.preZ, vx, vy, vz, ph, h.atkPing, h.vicPing, h.dist));
                kbOut.flush(); written++;
            }
        } catch (Exception ex) { getLogger().warning("写日志失败: " + ex); }
    }

    private Hit take(int entityId) {
        Deque<Hit> q = PENDING.get(entityId);
        if (q == null) return null;
        long now = System.currentTimeMillis();
        synchronized (q) {
            while (!q.isEmpty() && now - q.peekFirst().tsMs > 400) q.pollFirst();
            return q.pollFirst();
        }
    }

    @Override public void onDisable() {
        try { if (kbOut != null) { kbOut.flush(); kbOut.close(); } } catch (Exception ignored) { }
        try { if (evOut != null) { evOut.flush(); evOut.close(); } } catch (Exception ignored) { }
        try { ProtocolLibrary.getProtocolManager().removePacketListeners(this); } catch (Throwable ignored) { }
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!"kbprobe".equalsIgnoreCase(cmd.getName())) return false;
        if (args.length > 0 && "traj".equalsIgnoreCase(args[0])) {
            // 合成弹道自检: 按当前活配置逐 tick 模拟击退滞空期的竖直运动。
            // 不依赖玩家/僵尸, 用于核对重力 / 顶点丝滑过渡 / 滞空时间。
            double v = com.windpvp.windspigot.knockback.KnockbackConfig.getCurrentKb() instanceof com.windpvp.windspigot.knockback.CraftKnockbackProfile
                    ? ((com.windpvp.windspigot.knockback.CraftKnockbackProfile) com.windpvp.windspigot.knockback.KnockbackConfig.getCurrentKb()).getVerticalGround()
                    : com.windpvp.windspigot.knockback.KnockbackEngineSettings.param("base-kb.vertical.ground").getDouble();
            if (args.length >= 2) { try { v = Double.parseDouble(args[1]); } catch (NumberFormatException ignored) { } }
            double g = com.windpvp.windspigot.knockback.KnockbackEngineSettings.param("gravity.value").getDouble();
            double drag = com.windpvp.windspigot.knockback.KnockbackEngineSettings.param("gravity.air-resistance").getDouble();
            double scale = com.windpvp.windspigot.knockback.KnockbackEngineSettings.param("gravity.apex-scale").getDouble();
            double thr = com.windpvp.windspigot.knockback.KnockbackEngineSettings.param("gravity.apex-threshold").getDouble();
            double motY = v, h = 0.0D, peak = 0.0D;
            int peakTick = 0, apexSoft = 0;
            StringBuilder sb = new StringBuilder();
            for (int t = 1; t <= 40; t++) {
                double gEff = g;
                if (scale < 1.0D && thr > 0.0D && Math.abs(motY) < thr) {
                    gEff = g * (scale + (1.0D - scale) * (Math.abs(motY) / thr));
                    apexSoft++;
                }
                motY = (motY - gEff) * drag;
                h += motY;
                if (h > peak) { peak = h; peakTick = t; }
                if (t <= 16) sb.append(String.format(Locale.ROOT, "t%02d:v=%+.4f h=%.4f  ", t, motY, h));
                if (t > peakTick + 1 && h <= 0.0D) {
                    sender.sendMessage(String.format(Locale.ROOT,
                            "KBProbe/traj: 初速=%.6f g=%.4f(等效 %.1f m/s²) 阻力=%.2f 顶点倍率=%.2f 阈值=%.3f",
                            v, g, g / 0.0025D, drag, scale, thr));
                    sender.sendMessage("KBProbe/traj: 顶点高度=" + String.format(Locale.ROOT, "%.4f", peak)
                            + " 格 (第 " + peakTick + " tick), 滞空 " + t + " tick ("
                            + String.format(Locale.ROOT, "%.2f", t * 0.05D) + " 秒), 顶点过渡区 tick 数=" + apexSoft);
                    sender.sendMessage("KBProbe/traj: " + sb.toString().trim());
                    return true;
                }
            }
            sender.sendMessage("KBProbe/traj: 40 tick 内未落地 (初速=" + v + " g=" + g + ")");
            return true;
        }
        if (args.length > 0 && "status".equalsIgnoreCase(args[0])) {
            sender.sendMessage("KBProbe: 生效速度包 " + written + " 条 (过滤 " + skipped + "), 原始出手包 " + attacks
                    + " 个, 在线 " + Bukkit.getOnlinePlayers().size() + " 人");
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
            // 合成测试: /kbprobe [x] [z]  —— 直接走内核真实代码路径, 用活配置算基础击退。
            // x z 省略时用 1.0 / 0.0; 传 0 0 可验证"位置重合"分支(原版应重掷随机方向后照常击退,
            // 旧实现直接 return 会造成零击退)。
            double x = 1.0D, z = 0.0D;
            if (args.length >= 2) {
                try { x = Double.parseDouble(args[0]); z = Double.parseDouble(args[1]); }
                catch (NumberFormatException nfe) { sender.sendMessage("§c用法: /kbprobe [x] [z]"); return true; }
            }
            net.minecraft.server.v1_8_R3.EntityZombie nms =
                    ((org.bukkit.craftbukkit.v1_8_R3.entity.CraftZombie) zombie).getHandle();
            nms.motX = 0; nms.motY = 0; nms.motZ = 0; nms.onGround = true;
            com.windpvp.windspigot.knockback.KnockbackEngine.applyBaseKnockback(nms, x, z, null);
            double mag = Math.sqrt(nms.motX * nms.motX + nms.motZ * nms.motZ);
            sender.sendMessage(String.format(Locale.ROOT,
                    "KBProbe: 输入=(%.4f,%.4f) |motXZ|=%.6f motY=%.6f 方向=(%.4f,%.4f) profile=%s",
                    x, z, mag, nms.motY, mag > 0 ? nms.motX / mag : 0, mag > 0 ? nms.motZ / mag : 0,
                    com.windpvp.windspigot.knockback.KnockbackConfig.getCurrentKb().getName()));
        } finally { zombie.remove(); }
        return true;
    }
}
