<script setup>
import { throttle } from "lodash-es";
definePageMeta({ middleware: "auth" });

const { supabase } = useSupabase();
const user = useState("auth.user");

const sessionId = ref(crypto.randomUUID());

// ── Rooms ────────────────────────────────────────
const rooms = ref([
  { id: "lounge", name: "Main Lounge", color: "#3b82f6" },
  { id: "garden", name: "Garden Area", color: "#10b981" },
  { id: "library", name: "Quiet Library", color: "#8b5cf6" },
  { id: "cafe", name: "Café Corner", color: "#f59e0b" },
]);

const currentRoom = ref(rooms.value[0]); // default first room

// ── Per-room data ────────────────────────────────
const position = ref({ x: 600, y: 400 });
const presences = ref({});
const messages = ref([]); // messages of CURRENT room only
const chatInput = ref("");
const PROXIMITY_DISTANCE = 180;

// Movement state
const movement = reactive({
  up: false,
  down: false,
  left: false,
  right: false,
});

// ── Channel management ───────────────────────────
let currentChannel = null;

const joinRoom = async (room) => {
  if (currentChannel) {
    await currentChannel.untrack().catch(() => {});
    await currentChannel.unsubscribe().catch(() => {});
    currentChannel = null;
  }

  currentRoom.value = room;
  position.value = { x: 600, y: 400 };
  presences.value = {};
  messages.value = []; // clear

  currentChannel = supabase.channel(`room:${room.id}`, {
    config: {
      broadcast: { self: true },
      presence: { key: sessionId.value },
    },
  });

  // Presence
  currentChannel.on("presence", { event: "sync" }, () => {
    presences.value = currentChannel.presenceState();
    console.log(
      `[Presence] Synced in ${room.id} — ${Object.keys(presences.value).length} entries`,
    );
  });

  // Realtime INSERT listener FIRST
  currentChannel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "room_messages",
      filter: `room_id=eq.${room.id}`,
    },
    (payload) => {
      console.log(`[Realtime INSERT] Received in ${room.id}:`, payload.new);
      const m = payload.new;

      const exists = messages.value.some((e) => e.id === m.id);
      if (exists) {
        console.log("[Realtime] Duplicate skipped");
        return;
      }

      const dist = Math.hypot(
        position.value.x - m.sender_x,
        position.value.y - m.sender_y,
      );
      if (dist < PROXIMITY_DISTANCE) {
        messages.value.push({
          id: m.id,
          username: m.username,
          content: m.content,
          senderPos: { x: m.sender_x, y: m.sender_y },
          timestamp: new Date(m.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        });
        console.log(
          `[Realtime] Added message: "${m.content}" (dist ${dist.toFixed(0)}px)`,
        );

        nextTick(() => {
          const container = document.querySelector(
            ".absolute.bottom-20 .overflow-y-auto",
          );
          if (container) container.scrollTop = container.scrollHeight;
        });
      } else {
        console.log(
          `[Realtime] Message ignored — too far (${dist.toFixed(0)}px)`,
        );
      }
    },
  );

  // Subscribe
  const { error: subError } = await currentChannel.subscribe(async (status) => {
    console.log(`[Channel] Status in ${room.id}: ${status}`);
    if (status === "SUBSCRIBED") {
      console.log(`[Channel] Fully subscribed to ${room.id} — now tracking`);
      await updatePresence();

      // Safety net: fetch very recent messages (last 30s) in case realtime missed during setup
      const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
      const { data: recent, error: recentErr } = await supabase
        .from("room_messages")
        .select("id, username, content, sender_x, sender_y, created_at")
        .eq("room_id", room.id)
        .gt("created_at", thirtySecondsAgo)
        .order("created_at", { ascending: true });

      if (recentErr) {
        console.error("[Recent fetch error]:", recentErr);
      } else if (recent?.length) {
        console.log(`[Safety net] Fetched ${recent.length} recent messages`);
        const recentMsgs = recent
          .map((m) => ({
            id: m.id,
            username: m.username,
            content: m.content,
            senderPos: { x: m.sender_x, y: m.sender_y },
            timestamp: new Date(m.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          }))
          .filter((m) => {
            const dist = Math.hypot(
              position.value.x - m.senderPos.x,
              position.value.y - m.senderPos.y,
            );
            return dist < PROXIMITY_DISTANCE;
          });

        const existingIds = new Set(messages.value.map((m) => m.id));
        const toAdd = recentMsgs.filter((m) => !existingIds.has(m.id));
        if (toAdd.length) {
          messages.value = [...messages.value, ...toAdd];
          console.log(`[Safety net] Added ${toAdd.length} missed messages`);
        }
      }
    }
  });

  if (subError) {
    console.error("[Subscribe error]:", subError);
    return;
  }

  // Load full history AFTER subscription (but now with safety net above)
  const { data: initial, error: fetchError } = await supabase
    .from("room_messages")
    .select("id, username, content, sender_x, sender_y, created_at")
    .eq("room_id", room.id)
    .order("created_at", { ascending: true })
    .limit(100);

  if (fetchError) {
    console.error("[History fetch error]:", fetchError);
  } else if (initial?.length) {
    console.log(`[History] Loaded ${initial.length} messages`);
    const historyMsgs = initial
      .map((m) => ({
        id: m.id,
        username: m.username,
        content: m.content,
        senderPos: { x: m.sender_x, y: m.sender_y },
        timestamp: new Date(m.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      }))
      .filter((m) => {
        const dist = Math.hypot(
          position.value.x - m.senderPos.x,
          position.value.y - m.senderPos.y,
        );
        return dist < PROXIMITY_DISTANCE;
      });

    const existingIds = new Set(messages.value.map((m) => m.id));
    const newHistory = historyMsgs.filter((m) => !existingIds.has(m.id));
    messages.value = [...messages.value, ...newHistory];
  }
};

// ── Presence update ──────────────────────────────
const updatePresence = throttle(
  async () => {
    if (!currentChannel) return;
    await currentChannel.track({
      online: true,
      user_id: user.value.id,
      session_id: sessionId.value,
      username: `Guest-${user.value.id.slice(0, 6).toUpperCase()}`,
      x: position.value.x,
      y: position.value.y,
      color: "#" + Math.floor(Math.random() * 16777215).toString(16),
    });
  },
  250,
  { leading: true, trailing: true },
);

// ── Send message (to DB + realtime) ──────────────
const sendError = ref(""); // add this ref at top

const sendMessage = async () => {
  if (!chatInput.value.trim() || !currentChannel) {
    sendError.value = "No room selected or empty message";
    return;
  }

  const content = chatInput.value.trim();
  sendError.value = ""; // clear previous error

  const { error } = await supabase.from("room_messages").insert({
    room_id: currentRoom.value.id,
    user_id: user.value.id,
    username: `Guest-${user.value.id.slice(0, 6).toUpperCase()}`,
    content,
    sender_x: position.value.x,
    sender_y: position.value.y,
  });

  if (error) {
    console.error("Send failed:", error.message, error.details, error.hint);
    sendError.value = "Failed to send: " + (error.message || "Unknown error");
  } else {
    chatInput.value = "";
    // Optional: auto-scroll chat to bottom
    const chatDiv = document.querySelector(".absolute.bottom-20");
    if (chatDiv) chatDiv.scrollTop = chatDiv.scrollHeight;
  }
};

// ── Lifecycle ────────────────────────────────────
onMounted(async () => {
  await joinRoom(currentRoom.value); // enter default room

  // Key handlers (skip when typing)
  const isInputFocused = () => document.activeElement?.tagName === "INPUT";

  const onKeyDown = (e) => {
    if (isInputFocused()) return;
    e.preventDefault();
    const k = e.key.toLowerCase();
    if (k === "w" || k === "arrowup") movement.up = true;
    if (k === "s" || k === "arrowdown") movement.down = true;
    if (k === "a" || k === "arrowleft") movement.left = true;
    if (k === "d" || k === "arrowright") movement.right = true;
  };

  const onKeyUp = (e) => {
    if (isInputFocused()) return;
    const k = e.key.toLowerCase();
    if (k === "w" || k === "arrowup") movement.up = false;
    if (k === "s" || k === "arrowdown") movement.down = false;
    if (k === "a" || k === "arrowleft") movement.left = false;
    if (k === "d" || k === "arrowright") movement.right = false;
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  onUnmounted(() => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    if (currentChannel) currentChannel.unsubscribe();
  });
});

// Movement loop
const moveLoop = () => {
  let moved = false;
  const speed = 4;

  if (movement.up) {
    position.value.y -= speed;
    moved = true;
  }
  if (movement.down) {
    position.value.y += speed;
    moved = true;
  }
  if (movement.left) {
    position.value.x -= speed;
    moved = true;
  }
  if (movement.right) {
    position.value.x += speed;
    moved = true;
  }

  position.value.x = Math.max(
    20,
    Math.min(canvas.value?.width - 20 || 1200, position.value.x),
  );
  position.value.y = Math.max(
    20,
    Math.min(canvas.value?.height - 80 || 800, position.value.y),
  );

  if (moved) updatePresence();
};

const moveInterval = setInterval(moveLoop, 16);
onUnmounted(() => clearInterval(moveInterval));

// Canvas render
const canvas = ref(null);

onMounted(() => {
  const ctx = canvas.value.getContext("2d");
  canvas.value.width = window.innerWidth;
  canvas.value.height = window.innerHeight;

  const loop = () => {
    ctx.fillStyle = "#0f0f1a";
    ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);

    // Draw others in current room
    Object.values(presences.value)
      .flat()
      .forEach((p) => {
        if (p.session_id === sessionId.value) return;

        ctx.fillStyle = p.color || "#888";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ddd";
        ctx.font = "11px monospace";
        ctx.textAlign = "center";
        ctx.fillText(p.username.slice(0, 10), p.x, p.y - 14);
      });

    // Self
    ctx.fillStyle = "#00ff88";
    ctx.beginPath();
    ctx.arc(position.value.x, position.value.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "12px monospace";
    ctx.fillText("You", position.value.x, position.value.y - 18);

    requestAnimationFrame(loop);
  };
  loop();
});
</script>

<template>
  <div class="relative h-screen w-screen overflow-hidden flex select-none">
    <!-- Sidebar – Rooms list -->
    <div
      class="w-64 bg-gray-900/90 border-r border-gray-800 p-4 overflow-y-auto"
    >
      <h2 class="text-lg font-bold mb-4 text-white">Spaces</h2>
      <div class="space-y-2">
        <button
          v-for="room in rooms"
          :key="room.id"
          @click="joinRoom(room)"
          :class="[
            'w-full p-3 rounded-lg text-left transition',
            currentRoom.id === room.id
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 hover:bg-gray-700 text-gray-300',
          ]"
        >
          {{ room.name }}
        </button>
      </div>
    </div>

    <!-- Main canvas + chat -->
    <div class="flex-1 relative">
      <canvas ref="canvas" class="absolute inset-0 touch-none"></canvas>

      <!-- Current room indicator -->
      <div
        class="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 px-6 py-2 rounded-full text-white font-medium backdrop-blur-sm border border-gray-700/50"
      >
        {{ currentRoom.name }}
      </div>

      <!-- Chat messages (current room only) -->
      <div
        class="absolute bottom-20 left-4 right-4 max-h-48 overflow-y-auto bg-black/60 backdrop-blur-md p-4 rounded-xl border border-gray-700/50 text-sm text-gray-100 space-y-1.5"
      >
        <div v-for="(msg, i) in messages" :key="i" class="flex flex-col">
          <span class="text-blue-300 font-medium">{{ msg.username }}</span>
          <span>{{ msg.content }}</span>
          <span class="text-xs text-gray-500 self-end">{{
            msg.timestamp
          }}</span>
        </div>
        <div
          v-if="!messages.length"
          class="text-gray-500 italic text-center py-2"
        >
          No messages yet... say hello!
        </div>
      </div>

      <!-- Input -->
      <div
        class="absolute bottom-4 left-1/2 -translate-x-1/2 flex w-full max-w-2xl px-4"
      >
        <input
          v-model="chatInput"
          @keyup.enter="sendMessage"
          placeholder="Type message... (nearby people in this space see it)"
          class="flex-1 p-3 bg-gray-900/80 border border-gray-700 rounded-l-xl focus:outline-none focus:border-blue-500 text-white"
        />
        <div
          v-if="sendError"
          class="absolute bottom-28 left-1/2 -translate-x-1/2 text-red-400 text-sm bg-black/70 px-4 py-2 rounded"
        >
          {{ sendError }}
        </div>
        <button
          @click="sendMessage"
          class="px-5 bg-blue-600 hover:bg-blue-500 rounded-r-xl font-medium transition"
        >
          Send
        </button>
      </div>
    </div>
  </div>
</template>
