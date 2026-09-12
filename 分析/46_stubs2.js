'use strict';
// 生成 ProtocolLib 编译期桩类。注意: 真实 ProtocolManager 是 **接口**, 桩必须也是接口,
// 否则 javac 会生成 invokevirtual 而运行时抛 IncompatibleClassChangeError。
const fs = require('fs'), path = require('path');
const ROOT = 'F:\\open\\新服务器\\PVP内核\\分析\\kbprobe\\stubs';
const files = {
  'com/comphenix/protocol/PacketType.java': `
package com.comphenix.protocol;
public class PacketType {
    public static class Play {
        public static class Server { public static PacketType ENTITY_VELOCITY; }
        public static class Client {
            public static PacketType USE_ENTITY;
            public static PacketType ARM_ANIMATION;
            public static PacketType ENTITY_ACTION;
        }
    }
}
`,
  'com/comphenix/protocol/ProtocolLibrary.java': `
package com.comphenix.protocol;
public class ProtocolLibrary {
    public static ProtocolManager getProtocolManager() { return null; }
}
`,
  'com/comphenix/protocol/ProtocolManager.java': `
package com.comphenix.protocol;
import com.comphenix.protocol.events.PacketListener;
public interface ProtocolManager {
    void addPacketListener(PacketListener listener);
    void removePacketListeners(org.bukkit.plugin.Plugin plugin);
}
`,
  'com/comphenix/protocol/events/ListenerPriority.java': `
package com.comphenix.protocol.events;
public enum ListenerPriority { LOWEST, LOW, NORMAL, HIGH, HIGHEST, MONITOR }
`,
  'com/comphenix/protocol/events/PacketListener.java': `
package com.comphenix.protocol.events;
public interface PacketListener { }
`,
  'com/comphenix/protocol/events/PacketAdapter.java': `
package com.comphenix.protocol.events;
import org.bukkit.plugin.Plugin;
import com.comphenix.protocol.PacketType;
public class PacketAdapter implements PacketListener {
    public PacketAdapter(Plugin plugin, ListenerPriority priority, PacketType... types) { }
    public void onPacketSending(PacketEvent event) { }
    public void onPacketReceiving(PacketEvent event) { }
}
`,
  'com/comphenix/protocol/events/PacketEvent.java': `
package com.comphenix.protocol.events;
import org.bukkit.entity.Player;
import com.comphenix.protocol.PacketType;
public class PacketEvent {
    public PacketContainer getPacket() { return null; }
    public PacketType getPacketType() { return null; }
    public Player getPlayer() { return null; }
}
`,
  'com/comphenix/protocol/events/PacketContainer.java': `
package com.comphenix.protocol.events;
import com.comphenix.protocol.reflect.StructureModifier;
public class PacketContainer {
    public StructureModifier<Integer> getIntegers() { return null; }
    public StructureModifier<String> getStrings() { return null; }
}
`,
  'com/comphenix/protocol/reflect/StructureModifier.java': `
package com.comphenix.protocol.reflect;
public class StructureModifier<T> {
    public T read(int index) { return null; }
}
`,
};
for (const [rel, body] of Object.entries(files)) {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body.trimStart(), 'utf8');
}
console.log('桩类已更新 ' + Object.keys(files).length + ' 个 (ProtocolManager = interface)');
