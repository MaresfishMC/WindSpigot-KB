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

    /** 实机弹道追踪: 命中后逐 tick 记录受击方 Y, 用于核对顶点高度/滞空时间是否与合成弹道一致 */
    private static final class Trace {
        long startMs;
        int ticks, id;
        double prevY, startY, peakY;
        int peakTick;
        String victim;
        org.bukkit.entity.Entity ent;                      // 采样对象(玩家或合成生物)
        net.minecraft.server.v1_8_R3.Entity nms;           // 取 motY / onGround
        boolean cleanup;
        double prevX, prevZ;                               // 上一 tick X/Z, 用于记录水平位移
        boolean sawAir;                                    // 是否已观测到离地(避免站定玩家 3 tick 就提前收尾)                                   // 采样结束后移除(合成生物)
    }
    private static final Map<Integer, Trace> TRACES = new ConcurrentHashMap<>();
    private static final int TRACE_TICKS = 30;
    private BufferedWriter trajOut;
    private static final Map<Integer, Deque<Hit>> PENDING = new ConcurrentHashMap<>();
    private BufferedWriter kbOut, evOut, s12Out;
    private volatile int written = 0, skipped = 0, attacks = 0, s12Count = 0, s12Errors = 0;

    @Override
    public void onEnable() {
        try {
            File dir = getDataFolder(); dir.mkdirs();
            boolean fresh = !new File(dir, "kb-log.csv").exists();
            kbOut = new BufferedWriter(new OutputStreamWriter(new FileOutputStream(new File(dir, "kb-log.csv"), true), StandardCharsets.UTF_8));
            if (fresh) {
                kbOut.write("ts_ms,attacker,victim,atk_sprint,atk_extra_kb,vic_sprint,vic_ground,"
                        + "vic_ndt,vic_last_dmg,event_dmg,atk_yaw,atk_x,atk_y,atk_z,vic_x,vic_y,vic_z,"
                        + "pre_x,pre_y,pre_z,pkt_x,pkt_y,pkt_z,pkt_h,atk_ping,vic_ping,dist,cancelled\n");
                kbOut.flush();
            }
            boolean freshEv = !new File(dir, "events.csv").exists();
            evOut = new BufferedWriter(new OutputStreamWriter(new FileOutputStream(new File(dir, "events.csv"), true), StandardCharsets.UTF_8));
            if (freshEv) { evOut.write("ts_ms,type,player,x,y,z,yaw,sprint,extra_kb,ndt,last_dmg\n"); evOut.flush(); }
            boolean freshTr = !new File(dir, "traj.csv").exists();
            trajOut = new BufferedWriter(new OutputStreamWriter(new FileOutputStream(new File(dir, "traj.csv"), true), StandardCharsets.UTF_8));
            if (freshTr) {
                trajOut.write("ts_ms,victim,tick,x,y,z,dx,dy,dz,mot_y,on_ground\n"); // d*=逐tick真实位移(客户端上报)
                trajOut.flush();
            }
            boolean freshS12 = !new File(dir, "s12.csv").exists();
            s12Out = new BufferedWriter(new OutputStreamWriter(new FileOutputStream(new File(dir, "s12.csv"), true), StandardCharsets.UTF_8));
            if (freshS12) {
                s12Out.write("ts_ms,entity_id,player,vx,vy,vz\n");
                s12Out.flush();
            }
        } catch (Exception ex) { getLogger().severe("无法打开日志: " + ex); }

        getServer().getPluginManager().registerEvents(this, this);

        // 实机弹道追踪任务: 命中后逐 tick 采样受击方 Y(客户端的真实轨迹, 服务端只做记录),
        // 用于核对"顶点丝滑过渡 + 25 m/s² 重力"在实机上是否真的按预期生效。
        getServer().getScheduler().runTaskTimer(this, this::tickTraces, 1L, 1L);

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

        // 出包层: 抓所有 S12 速度包(含滞空接管逐 tick 补发的那批), 用于核对客户端实际收到的竖直速度曲线
        try {
            ProtocolLibrary.getProtocolManager().addPacketListener(new PacketAdapter(this,
                    ListenerPriority.MONITOR, PacketType.Play.Server.ENTITY_VELOCITY) {
                @Override public void onPacketSending(PacketEvent e) {
                    try {
                        // 用 NMS 句柄读(1.8 该包是 4 个 int: a=实体id, b/c/d=定点速度*8000)。
                        // 之前用 ProtocolLib 的 getDoubles()/getIntegers() 都读不到东西(异常被吞),
                        // 导致"抓到 0 个 S12"看起来像"没发包", 实际是读数失败。
                        Object handle = e.getPacket().getHandle();
                        java.lang.reflect.Field[] fs = handle.getClass().getDeclaredFields();
                        java.util.Arrays.sort(fs, (a, b) -> a.getName().compareTo(b.getName()));
                        int[] iv = new int[4]; int n = 0;
                        for (java.lang.reflect.Field f : fs) {
                            if (f.getType() == int.class && n < 4) { f.setAccessible(true); iv[n++] = f.getInt(handle); }
                        }
                        if (n < 4) throw new IllegalStateException("S12 字段数=" + n);
                        int id = iv[0];
                        // 1.8 的 S12 速度分量在协议里是**定点整数**(v*8000), ProtocolLib 也是按
                        // 整数结构暴露的; 早先误用 getDoubles() 会抛异常并被下面的 catch 吞掉,
                        // 于是"抓到 0 个包"其实是读数错误, 不是真没发包(曾据此误判为事件被取消)。
                        double vx = iv[1] / 8000.0D;
                        double vy = iv[2] / 8000.0D;
                        double vz = iv[3] / 8000.0D;
                        String name = "";
                        for (Player on : Bukkit.getOnlinePlayers()) {
                            if (on.getEntityId() == id) { name = on.getName(); break; }
                        }
                        synchronized (KBProbe.this) {
                            if (s12Out != null) {
                                s12Out.write(String.format(Locale.ROOT, "%d,%d,%s,%.6f,%.6f,%.6f%n",
                                        System.currentTimeMillis(), id, name, vx, vy, vz));
                                s12Out.flush();
                                s12Count++;
                            }
                        }
                    } catch (Exception ex) {
                        // 不要静默吞掉: 读数失败会让"抓到 0 个包"看起来像"没发包"
                        s12Errors++;
                        if (s12Errors <= 3) getLogger().warning("S12 读取失败: " + ex);
                    }
                }
            });
            getLogger().info("KBProbe v1.3: S12 出包监听已挂载 (ENTITY_VELOCITY)");
        } catch (Throwable t) {
            getLogger().warning("S12 监听挂载失败: " + t);
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
        // 无论是否匹配到上下文, 都开启弹道追踪(速度包＝击退生效, 后续 Y 变化就是弹道)
        Player tp = e.getPlayer();
        if (TRACES.size() < 12) {
            Trace tr = new Trace();
            tr.startMs = System.currentTimeMillis();
            tr.id = tp.getEntityId();
            tr.prevY = tp.getLocation().getY();
            tr.startY = tr.prevY;
            tr.peakY = tr.prevY;
            tr.victim = tp.getName();
            tr.ent = tp;
            tr.nms = ((org.bukkit.craftbukkit.v1_8_R3.entity.CraftPlayer) tp).getHandle();
            TRACES.put(tr.id, tr);
        }
        if (h == null) { skipped++; return; }
        try {
            double vx = e.getVelocity().getX(), vy = e.getVelocity().getY(), vz = e.getVelocity().getZ();
            boolean cancelled = e.isCancelled();   // 关键仪表: 事件被取消 => 服务端不会发包 => 全场无击退
            double ph = Math.sqrt(vx * vx + vz * vz);
            synchronized (this) {
                kbOut.write(String.format(Locale.ROOT,
                        "%d,%s,%s,%b,%b,%b,%b,%d,%.3f,%.3f,%.3f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,"
                        + "%.5f,%.5f,%.5f,%.6f,%.6f,%.6f,%.6f,%d,%d,%.4f,%b%n",
                        h.tsMs, h.attacker, h.victim, h.atkSprint, h.atkExtraKb, h.vicSprint, h.vicGround,
                        h.vicNdt, h.vicLastDmg, h.eventDmg, h.atkYaw,
                        h.atkX, h.atkY, h.atkZ, h.vicX, h.vicY, h.vicZ,
                        h.preX, h.preY, h.preZ, vx, vy, vz, ph, h.atkPing, h.vicPing, h.dist, cancelled));
                kbOut.flush(); written++;
            }
        } catch (Exception ex) { getLogger().warning("写日志失败: " + ex); }
    }

    /** 每 tick 采样被追踪实体的 Y, 落地或满 TRACE_TICKS 后收尾并打印顶点/滞空摘要 */
    private void tickTraces() {
        if (TRACES.isEmpty() || trajOut == null) return;
        for (java.util.Iterator<Map.Entry<Integer, Trace>> it = TRACES.entrySet().iterator(); it.hasNext(); ) {
            Map.Entry<Integer, Trace> en = it.next();
            Trace tr = en.getValue();
            if (tr.ent == null || !tr.ent.isValid() || tr.nms == null) { it.remove(); continue; }
            try {
                double x = tr.ent.getLocation().getX();
                double y = tr.ent.getLocation().getY();
                double z = tr.ent.getLocation().getZ();
                double dx = x - tr.prevX, dy = y - tr.prevY, dz = z - tr.prevZ;
                if (!tr.nms.onGround) tr.sawAir = true;
                tr.ticks++;
                if (y > tr.peakY) { tr.peakY = y; tr.peakTick = tr.ticks; }
                synchronized (this) {
                    trajOut.write(String.format(Locale.ROOT, "%d,%s,%d,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.6f,%b%n",
                            System.currentTimeMillis(), tr.victim, tr.ticks, x, y, z, dx, dy, dz, tr.nms.motY, tr.nms.onGround));
                    trajOut.flush();
                }
                tr.prevX = x; tr.prevY = y; tr.prevZ = z;
                boolean landed = tr.nms.onGround && tr.sawAir && tr.ticks > 2;
                if (landed || tr.ticks >= TRACE_TICKS || System.currentTimeMillis() - tr.startMs > 3000L) {
                    getLogger().info(String.format(Locale.ROOT,
                            "弹道 %s: 起点Y=%.3f 顶点Y=%.3f (第%d tick, 升%.3f) 滞空%d tick(%.2fs)",
                            tr.victim, tr.startY, tr.peakY, tr.peakTick, tr.peakY - tr.startY,
                            tr.ticks, tr.ticks * 0.05D));
                    if (tr.cleanup) { try { tr.ent.remove(); } catch (Throwable ignored) { } }
                    it.remove();
                }
            } catch (Exception ex) {
                if (tr.cleanup) { try { tr.ent.remove(); } catch (Throwable ignored) { } }
                it.remove();
            }
        }
    }

    private Hit take(int entityId) {        Deque<Hit> q = PENDING.get(entityId);
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
        if (args.length > 0 && "trajmob".equalsIgnoreCase(args[0])) {
            // 真·端到端弹道自检: 生物的运动由服务端模拟(玩家是客户端权威, 不能这样测),
            // 所以给合成僵尸施加击退后逐 tick 采样它的 Y, 走的是完整引擎路径:
            // applyBaseKnockback -> markGravityOverride -> EntityLiving.m() 里的 gravityFor/airResistanceFor。
            World w = Bukkit.getWorlds().get(0);
            Location loc = w.getSpawnLocation().clone().add(0.5D, 0.6D, 0.5D);
            Zombie z = w.spawn(loc, Zombie.class);
            net.minecraft.server.v1_8_R3.EntityZombie nms =
                    ((org.bukkit.craftbukkit.v1_8_R3.entity.CraftZombie) z).getHandle();
            try { nms.k(true); } catch (Throwable ignored) { } // 关闭 AI, 排除寻路/跳跃干扰
            nms.motX = 0; nms.motY = 0; nms.motZ = 0; nms.onGround = true;
            com.windpvp.windspigot.knockback.KnockbackEngine.applyBaseKnockback(nms, 1.0D, 0.0D, null);
            double v0 = nms.motY;
            Trace tr = new Trace();
            tr.startMs = System.currentTimeMillis();
            tr.id = nms.getId();
            tr.ent = z; tr.nms = nms; tr.cleanup = true;
            tr.prevY = z.getLocation().getY();
            tr.startY = tr.prevY;
            tr.peakY = tr.prevY;
            tr.victim = "SYNTH_ZOMBIE";
            TRACES.put(tr.id, tr);
            sender.sendMessage(String.format(Locale.ROOT,
                    "KBProbe/trajmob: 已施加击退 motY=%.6f 重力=%.5f(等效 %.1f m/s²), 开始逐 tick 采样(约 30 tick)",
                    v0, com.windpvp.windspigot.knockback.KnockbackEngine.gravityFor(nms),
                    com.windpvp.windspigot.knockback.KnockbackEngine.gravityFor(nms) / 0.0025D));
            return true;
        }
        if (args.length > 0 && "flights".equalsIgnoreCase(args[0])) {
            // 滞空接管诊断: 直接问内核当前有几个接管中的玩家, 以及关键开关取值
            sender.sendMessage("KBProbe/flights: 接管中=" + com.windpvp.windspigot.knockback.KnockbackEngine.activeFlights()
                    + " client-side=" + com.windpvp.windspigot.knockback.KnockbackEngineSettings.param("gravity.client-side").getBool()
                    + " gravity=" + com.windpvp.windspigot.knockback.KnockbackEngineSettings.param("gravity.value").getDouble()
                    + " apex-scale=" + com.windpvp.windspigot.knockback.KnockbackEngineSettings.param("gravity.apex-scale").getDouble()
                    + " max-ticks=" + com.windpvp.windspigot.knockback.KnockbackEngineSettings.param("gravity.client-max-ticks").getInt());
            sender.sendMessage("KBProbe/flights: 已抓到 S12 出包 " + s12Count + " 个 → plugins/KBProbe/s12.csv, 生效速度包 " + written + " 条");
            return true;
        }
        if (args.length > 0 && "hit".equalsIgnoreCase(args[0])) {
            // /kbprobe hit <玩家> [水平] [垂直] [yaw度]
            // 用真实序列驱动一次击退: 设置击退后的 mot -> 发 S12 -> 登记客户端滞空接管。
            // 等价于 EntityHuman.attack / EntityLiving.damageEntity 里那段代码, 因此可以拿
            // 一个真人客户端做端到端弹道验证(不需要第二名玩家来打)。
            if (args.length < 2) { sender.sendMessage("用法: /kbprobe hit <玩家> [水平] [垂直] [yaw]"); return true; }
            Player target = Bukkit.getPlayerExact(args[1]);
            if (target == null) { sender.sendMessage("玩家不在线: " + args[1]); return true; }
            double h = args.length >= 3 ? Double.parseDouble(args[2]) : 0.527375D;
            double v = args.length >= 4 ? Double.parseDouble(args[3]) : 0.361375D;
            double yaw = args.length >= 5 ? Double.parseDouble(args[4]) : 0.0D;
            double rad = yaw * Math.PI / 180.0D;
            net.minecraft.server.v1_8_R3.EntityPlayer nms =
                    ((org.bukkit.craftbukkit.v1_8_R3.entity.CraftPlayer) target).getHandle();
            nms.motX = -Math.sin(rad) * h;
            nms.motZ = Math.cos(rad) * h;
            nms.motY = v;
            nms.velocityChanged = false;
            nms.playerConnection.sendPacket(
                    new net.minecraft.server.v1_8_R3.PacketPlayOutEntityVelocity(nms));
            com.windpvp.windspigot.knockback.KnockbackEngine.beginClientFlight(nms);
            Trace tr = new Trace();
            tr.startMs = System.currentTimeMillis();
            tr.id = target.getEntityId();
            tr.ent = target;
            tr.nms = nms;
            tr.prevY = target.getLocation().getY();
            tr.startY = tr.prevY;
            tr.peakY = tr.prevY;
            tr.victim = target.getName();
            TRACES.put(tr.id, tr);
            sender.sendMessage(String.format(Locale.ROOT,
                    "KBProbe/hit: %s mot=(%.4f, %.4f, %.4f) 已发 S12 并登记接管, 开始逐 tick 采样",
                    target.getName(), nms.motX, nms.motY, nms.motZ));
            return true;
        }
        if (args.length > 0 && "as".equalsIgnoreCase(args[0])) {
            // /kbprobe as <玩家> <指令...>
            // 以某个玩家的身份执行指令(等价于他在聊天栏里敲)。用途: 自动化把真实客户端送进对局,
            // 因为合成输入(mouse_event/keybd_event/SendKeys)会被游戏忽略, 无法用键盘鼠标驱动客户端。
            if (args.length < 3) { sender.sendMessage("用法: /kbprobe as <玩家> <指令...>"); return true; }
            Player target = Bukkit.getPlayerExact(args[1]);
            if (target == null) { sender.sendMessage("玩家不在线: " + args[1]); return true; }
            StringBuilder sb = new StringBuilder();
            for (int i = 2; i < args.length; i++) { if (i > 2) sb.append(' '); sb.append(args[i]); }
            String line = sb.toString();
            boolean ok = Bukkit.dispatchCommand(target, line);
            sender.sendMessage("KBProbe/as: " + target.getName() + " => /" + line + "  已执行=" + ok);
            return true;
        }
        if (args.length > 0 && "attack".equalsIgnoreCase(args[0])) {
            // /kbprobe attack <攻击者> <受击者> [次数]
            // 走**真实伤害路径**: 直接调用 EntityHuman.attack(Entity), 即玩家左键命中服务端后
            // 执行的那段代码(伤害结算 -> 阶段一击退 -> 阶段二疾跑加成 -> 发 S12)。
            // 用于判定"服务端到底有没有发包", 不需要第二名玩家真的点击。
            if (args.length < 3) { sender.sendMessage("用法: /kbprobe attack <攻击者> <受击者> [次数]"); return true; }
            Player atk = Bukkit.getPlayerExact(args[1]);
            Player vic = Bukkit.getPlayerExact(args[2]);
            if (atk == null || vic == null) { sender.sendMessage("玩家不在线"); return true; }
            int times = args.length >= 4 ? Integer.parseInt(args[3]) : 1;
            net.minecraft.server.v1_8_R3.EntityPlayer a =
                    ((org.bukkit.craftbukkit.v1_8_R3.entity.CraftPlayer) atk).getHandle();
            net.minecraft.server.v1_8_R3.EntityPlayer v =
                    ((org.bukkit.craftbukkit.v1_8_R3.entity.CraftPlayer) vic).getHandle();
            for (int k = 0; k < times; k++) {
                a.attack(v);
                v.noDamageTicks = 0; // 便于连续测试, 绕过无敌帧
            }
            sender.sendMessage(String.format(Locale.ROOT,
                    "KBProbe/attack: %s -> %s x%d (真实路径) 受击方 motY=%.4f velocityChanged=%b",
                    atk.getName(), vic.getName(), times, v.motY, v.velocityChanged));
            return true;
        }
        if (args.length > 0 && "where".equalsIgnoreCase(args[0])) {
            for (Player on : Bukkit.getOnlinePlayers()) {
                org.bukkit.Location l = on.getLocation();
                sender.sendMessage(String.format(Locale.ROOT, "KBProbe/where: %s world=%s (%.2f, %.2f, %.2f) yaw=%.1f onGround=%b",
                        on.getName(), l.getWorld().getName(), l.getX(), l.getY(), l.getZ(), l.getYaw(), on.isOnGround()));
            }
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
            // 重力覆写接线检查: 击退后必须置位 kbGravityOverride, 否则"顶点丝滑/自定义重力"在实机上完全不会生效
            // (合成弹道 /kbprobe traj 走的是配置层, 不能证明这条接线)。
            sender.sendMessage(String.format(Locale.ROOT,
                    "KBProbe/grav: kbGravityOverride=%b gravityFor=%.5f(等效 %.1f m/s²) airResistanceFor=%.4f motY=%.6f",
                    nms.kbGravityOverride,
                    com.windpvp.windspigot.knockback.KnockbackEngine.gravityFor(nms),
                    com.windpvp.windspigot.knockback.KnockbackEngine.gravityFor(nms) / 0.0025D,
                    com.windpvp.windspigot.knockback.KnockbackEngine.airResistanceFor(nms),
                    nms.motY));
        } finally { zombie.remove(); }
        return true;
    }
}
