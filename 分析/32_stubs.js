'use strict';
// 生成 ProtocolLib 编译期桩类(仅用于让 javac 8 通过; 运行时用真实 ProtocolLib, 桩不打进 jar)
const fs = require('fs'), path = require('path');
const ROOT = 'F:\\open\\新服务器\\PVP内核\\分析\\kbprobe\\stubs';
const files = {
  'com/comphenix/protocol/PacketType.java': `
package com.comphenix.protocol;
public class PacketType {
    public static class Play {
        public static class Server {
            public static PacketType ENTITY_VELOCITY;
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
public class ProtocolManager {
    public void addPacketListener(PacketListener listener) { }
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
}
`,
  'com/comphenix/protocol/events/PacketEvent.java': `
package com.comphenix.protocol.events;
public class PacketEvent {
    public PacketContainer getPacket() { return null; }
}
`,
  'com/comphenix/protocol/events/PacketContainer.java': `
package com.comphenix.protocol.events;
import com.comphenix.protocol.reflect.StructureModifier;
public class PacketContainer {
    public StructureModifier<Integer> getIntegers() { return null; }
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
console.log('生成桩类 ' + Object.keys(files).length + ' 个 → ' + ROOT);
