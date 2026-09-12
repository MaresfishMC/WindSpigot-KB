import org.bukkit.configuration.file.YamlConfiguration;
import java.io.File;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;

public class LoadCheck {
    static YamlConfiguration load(String path) throws Exception {
        // 与 KnockbackConfig.loadYaml 相同: 读字节, 剥 BOM, loadFromString
        String content = new String(Files.readAllBytes(new File(path).toPath()), StandardCharsets.UTF_8);
        if (content.startsWith("\uFEFF")) content = content.substring(1);
        YamlConfiguration y = new YamlConfiguration();
        y.loadFromString(content);
        return y;
    }

    public static void main(String[] args) throws Exception {
        String base = "F:\\open\\新服务器\\配置文件\\kb配置文件\\";
        String prof = base + "模式\\mmckb.yml";
        String sys = base + "系统开关.yml";
        String adv = base + "高级机制.yml";
        String root = "F:\\open\\新服务器\\配置文件\\knockback.yml";

        for (String f : new String[]{root, sys, adv, prof}) {
            YamlConfiguration y = load(f);
            System.out.println("[解析OK] " + new File(f).getName() + "  顶层键=" + y.getKeys(false));
        }

        YamlConfiguration p = load(prof);
        System.out.println("\n--- 模式文件关键键 ---");
        String[] keys = {"horizontal.ground", "horizontal.air", "vertical.ground", "vertical-limit",
                "horizontal-limit", "vertical-max", "vertical-min", "horizontal-momentum", "vertical-momentum",
                "sprint-extra.horizontal", "victim-sprint-extra.horizontal",
                "pvp.enabled", "pvp.horizontal.ground", "pvp.sprint-extra.horizontal",
                "multiplier.horizontal.ground", "dynamic-misplay.enabled", "stop-sprint"};
        for (String k : keys) {
            System.out.printf("  %-32s contains=%-5s value=%s%n", k, p.contains(k), p.get(k));
        }

        YamlConfiguration s = load(sys);
        System.out.println("\n--- 系统开关 ---");
        for (String k : new String[]{"stop-sprint", "damage-increment", "iframe-knockback", "server-side-kb", "hit-delay", "lag-compensation.enabled"})
            System.out.printf("  %-28s contains=%-5s value=%s%n", k, s.contains(k), s.get(k));

        YamlConfiguration a = load(adv);
        System.out.println("\n--- 高级机制 ---");
        for (String k : new String[]{"y-limit.enabled", "range-reduction.enabled", "combo.enabled", "gravity.value",
                "air-ground.grace-ticks", "sprint-reach.enabled", "sprint-reach.grace-ticks", "dynamic-misplay.enabled",
                "dynamic-misplay.max-compensation"})
            System.out.printf("  %-34s contains=%-5s value=%s%n", k, a.contains(k), a.get(k));

        YamlConfiguration r = load(root);
        System.out.println("\n--- 根 knockback.yml ---");
        System.out.println("  knockback.current = " + r.getString("knockback.current"));

        // 复算预期输出
        double b = p.getDouble("horizontal.ground");
        double sa = p.getDouble("sprint-extra.horizontal");
        double sv = p.getDouble("victim-sprint-extra.horizontal");
        double cap = p.getDouble("horizontal-limit");
        System.out.printf("%n--- 组合预测 ---%n  无人疾跑=%.6f%n  攻击方疾跑=%.6f%n  受击方疾跑=%.6f%n  双疾跑=%.6f (原始%.6f)%n",
                b, b + sa, b + sv, Math.min(b + sa + sv, cap), b + sa + sv);
        System.out.printf("  实测锚点:        0.527358   0.948889        0.886747        0.941454%n");
    }
}
