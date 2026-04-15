<template>
  <div class="game-container">
    <div v-if="sessionSuperseded" class="game-overlay">
      <div class="game-overlay__panel">
        <p>This game is open in another tab.</p>
        <button type="button" class="game-overlay__btn" @click="reloadPage">
          Reload this page
        </button>
      </div>
    </div>
    <div ref="canvasContainerRef" class="canvas-wrapper" tabindex="0" />
    <div v-if="currentRoom" class="room-label">{{ currentRoom.name }}</div>
  </div>
</template>

<script setup lang="ts">
import { useDebounceFn, useThrottleFn } from "@vueuse/core";
import { usePixi } from "~/composables/usePixi";
import { Assets, Container, Rectangle, Texture, Sprite } from "pixi.js";
import HeroImg from "../../../public/images/hero.png";
import type { Direction, Position } from "~/types/shared";
import {
  MOVE_SPEED,
  MOVE_DELAY_MS,
  FRAME_WIDTH,
  FRAME_HEIGHT,
  TOTAL_FRAMES,
  ANIMATION_SPEED,
  isPositionWithinMapBounds,
  tileCoordsToHeroPosition,
} from "~/constants/world-constants";
import { useRooms } from "~/composables/useRooms";
import {
  createRoomOverlays,
  updateRoomOverlayVisibility,
} from "~/composables/useRoomOverlays";
import type { Room } from "~/types/room";
import {
  readWorldPositionFromStorage,
  writeWorldPositionToStorage,
} from "~/utils/worldPositionStorage";
import { claimSingleGameTab } from "~/composables/useSingleGameTab";

const canvasContainerRef = ref<HTMLDivElement | null>(null);
const movementDelayTimeoutRef = ref<ReturnType<typeof setTimeout> | null>(null);

const app = await usePixi();
const mapData = await $fetch<{
  tileSize: number;
  mapWidth: number;
  mapHeight: number;
  rooms?: Room[];
  layers: {
    name: string;
    collider?: boolean;
    tiles: { id: string; x: number; y: number }[];
  }[];
}>("/map.json");
const sheetTexture = await Assets.load("/images/spritesheet.png");
const tileSize = mapData.tileSize;
const colsInSheet = Math.floor(sheetTexture.width / tileSize);
const solidTiles = new Set<string>();
const worldContainer = new Container();
app.stage.addChild(worldContainer);

// FIX: We .reverse() the layers so the 'main' floor (last in JSON)
// is added to the stage FIRST (bottom layer).
const layers = [...mapData.layers].reverse();

layers.forEach((layer) => {
  console.log(`Rendering layer: ${layer.name}`);

  layer.tiles.forEach((tile) => {
    const tileId = Number(tile.id);

    const sx = (tileId % colsInSheet) * tileSize;
    const sy = Math.floor(tileId / colsInSheet) * tileSize;

    const tileTexture = new Texture({
      source: sheetTexture.source,
      frame: new Rectangle(sx, sy, tileSize, tileSize),
    });

    const sprite = new Sprite(tileTexture);
    sprite.x = tile.x * tileSize;
    sprite.y = tile.y * tileSize;
    worldContainer.addChild(sprite as unknown as Container);

    if (layer.collider) {
      solidTiles.add(`${tile.x},${tile.y}`);
    }
  });
});

const rooms = mapData.rooms ?? [];
const { currentRoom, updateCurrentRoom } = useRooms(rooms, tileSize);

const { supabase } = useSupabase();
const authUser = useState("auth.user");

let initialHeroPosition: Position = tileCoordsToHeroPosition(3, 3, tileSize);
const worldUserId = ref<string | null>(null);

const {
  data: { session },
} = await supabase.auth.getSession();
if (session?.user) {
  if (!authUser.value) authUser.value = session.user;
  worldUserId.value = session.user.id;
  const stored = readWorldPositionFromStorage(session.user.id);
  if (
    stored &&
    isPositionWithinMapBounds(
      stored,
      tileSize,
      mapData.mapWidth,
      mapData.mapHeight,
    )
  ) {
    initialHeroPosition = stored;
  }
}

// --- Hero state and movement (from GameCanvas) ---
const heroPosition = ref<Position>(initialHeroPosition);
updateCurrentRoom(heroPosition.value);

const debouncedLocalSave = useDebounceFn((pos: Position) => {
  const uid = worldUserId.value;
  if (!uid) return;
  writeWorldPositionToStorage(uid, pos);
}, 400);

const targetPosition = ref<Position | null>(null);
const isMoving = ref(false);
const pressedDirection = ref<Direction | null>(null);
const facingDirection = ref<Direction>("down");

/** Same as Realtime presence `key` and broadcast `sender_key` (one tab per browser via localStorage). */
const selfPresenceKey = session?.user?.id ?? "";

const gameSessionActive = ref(true);
const sessionSuperseded = ref(false);

let disposeGameLease: (() => void) | null = null;
let presenceChannel: ReturnType<typeof supabase.channel> | null = null;
let tickerFnRef: ((t: { deltaMS: number }) => void) | null = null;

function reloadPage() {
  if (typeof window !== "undefined") window.location.reload();
}

/** Presence alone does not reliably re-sync every `track()`; broadcast sends live positions. */
function sendBroadcastState() {
  if (!presenceChannel || !session?.user) return;
  void presenceChannel.send({
    type: "broadcast",
    event: "pos",
    payload: {
      sender_key: selfPresenceKey,
      user_id: session.user.id,
      x: heroPosition.value.x,
      y: heroPosition.value.y,
      facing: facingDirection.value,
      moving: isMoving.value,
    },
  });
}

/** Throttle position-only updates; `moving`/`facing` must not be throttled or `moving: false` can be dropped. */
const throttledBroadcastPos = useThrottleFn(sendBroadcastState, 50);

watch(
  heroPosition,
  () => {
    debouncedLocalSave({
      x: heroPosition.value.x,
      y: heroPosition.value.y,
    });
    throttledBroadcastPos();
  },
  { deep: true },
);

watch([isMoving, facingDirection], () => {
  sendBroadcastState();
});

const keyToDirection = (key: string): Direction | null => {
  switch (key.toLowerCase()) {
    case "arrowup":
    case "w":
      return "up";
    case "arrowdown":
    case "s":
      return "down";
    case "arrowleft":
    case "a":
      return "left";
    case "arrowright":
    case "d":
      return "right";
    default:
      return null;
  }
};

const getNextTileTarget = (from: Position, direction: Direction): Position => ({
  x:
    from.x +
    (direction === "left" ? -tileSize : direction === "right" ? tileSize : 0),
  y:
    from.y +
    (direction === "up" ? -tileSize : direction === "down" ? tileSize : 0),
});

const isTileSolid = (pos: Position): boolean =>
  solidTiles.has(`${pos.x / tileSize},${pos.y / tileSize}`);

const moveTowards = (current: number, target: number, maxStep: number) =>
  current +
  Math.sign(target - current) * Math.min(Math.abs(target - current), maxStep);

const startMovementToward = (direction: Direction) => {
  if (targetPosition.value) return;
  const next = getNextTileTarget(heroPosition.value, direction);
  if (isTileSolid(next)) return;
  targetPosition.value = next;
};

const onKeydown = (e: KeyboardEvent) => {
  if (!gameSessionActive.value) return;
  const direction = keyToDirection(e.key);
  if (!direction) return;
  e.preventDefault();
  if (movementDelayTimeoutRef.value) {
    clearTimeout(movementDelayTimeoutRef.value);
    movementDelayTimeoutRef.value = null;
  }
  pressedDirection.value = direction;
  facingDirection.value = direction;
  movementDelayTimeoutRef.value = setTimeout(() => {
    movementDelayTimeoutRef.value = null;
    if (pressedDirection.value === direction) {
      startMovementToward(direction);
    }
  }, MOVE_DELAY_MS);
};

const onKeyup = (e: KeyboardEvent) => {
  if (!gameSessionActive.value) return;
  const direction = keyToDirection(e.key);
  if (!direction) return;
  if (movementDelayTimeoutRef.value) {
    clearTimeout(movementDelayTimeoutRef.value);
    movementDelayTimeoutRef.value = null;
  }
  if (pressedDirection.value === direction) {
    pressedDirection.value = null;
  }
};

// --- Hero sprite and animation ---
await Assets.load(HeroImg);
const heroTexture = Texture.from(HeroImg);
let frameIndex = 0;
let elapsedTime = 0;

const getRowByDirection = (direction: Direction) => {
  switch (direction) {
    case "up":
      return 8;
    case "left":
      return 9;
    case "right":
      return 11;
    case "down":
      return 10;
    default:
      return 10;
  }
};

const getFrameTexture = (row: number, column: number) => {
  const rect = new Rectangle(
    column * FRAME_WIDTH,
    row * FRAME_HEIGHT,
    FRAME_WIDTH,
    FRAME_HEIGHT,
  );
  return new Texture({ source: heroTexture.source, frame: rect });
};

const heroSprite = new Sprite(getFrameTexture(getRowByDirection("down"), 0));
heroSprite.anchor.set(0.5, 1);

const updateHeroSprite = (direction: Direction, moving: boolean) => {
  const row = getRowByDirection(direction);
  let column = 0;
  if (moving) {
    elapsedTime += ANIMATION_SPEED;
    if (elapsedTime >= 1) {
      elapsedTime = 0;
      frameIndex = (frameIndex + 1) % TOTAL_FRAMES;
    }
    column = frameIndex;
  }
  heroSprite.texture = getFrameTexture(row, column);
};

const heroContainer = new Container();
heroContainer.x = heroPosition.value.x;
heroContainer.y = heroPosition.value.y;
heroContainer.scale.set(0.7, 0.7);
heroContainer.addChild(heroSprite as unknown as Container);

// --- Other players via Realtime Presence (no DB table) ---
const othersRoot = new Container();
const remoteSprites = new Map<string, Container>();

/** If no packet arrives for this long while `moving` was true, treat as idle (stale flag / dropped send). */
const REMOTE_IDLE_MS = 180;

type RemoteAnimState = {
  frameIndex: number;
  elapsedTime: number;
  facing: Direction;
  moving: boolean;
  lastPacketAt: number;
};

const remoteAnimState = new Map<string, RemoteAnimState>();

const DIRECTIONS = ["up", "down", "left", "right"] as const;

function parseFacing(v: unknown): Direction | undefined {
  if (typeof v !== "string") return undefined;
  return (DIRECTIONS as readonly string[]).includes(v)
    ? (v as Direction)
    : undefined;
}

function tintForUserId(userId: string): number {
  const colors = [0x8899ff, 0xff9988, 0x88ff99, 0xffdd88, 0xdd88ff, 0x88eeff];
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return colors[h % colors.length]!;
}

/** One remote sprite per account (`user_id`); single-tab guard prevents duplicate same-user clients. */
function upsertRemoteSprite(
  userId: string,
  x: number,
  y: number,
  facing?: Direction,
  moving?: boolean,
) {
  if (session?.user && userId === session.user.id) return;
  let container = remoteSprites.get(userId);
  if (!container) {
    container = new Container();
    const sprite = new Sprite(getFrameTexture(getRowByDirection("down"), 0));
    sprite.anchor.set(0.5, 1);
    sprite.tint = tintForUserId(userId);
    container.scale.set(0.7, 0.7);
    container.addChild(sprite as unknown as Container);
    othersRoot.addChild(container);
    remoteSprites.set(userId, container);
    remoteAnimState.set(userId, {
      frameIndex: 0,
      elapsedTime: 0,
      facing: facing ?? "down",
      moving: moving ?? false,
      lastPacketAt: performance.now(),
    });
  }
  const anim = remoteAnimState.get(userId);
  if (anim) {
    if (facing !== undefined) anim.facing = facing;
    if (moving !== undefined) anim.moving = moving;
    anim.lastPacketAt = performance.now();
  }
  container.x = x;
  container.y = y;
}

function removeRemoteSprite(userId: string) {
  const container = remoteSprites.get(userId);
  if (!container) return;
  othersRoot.removeChild(container);
  container.destroy({ children: true });
  remoteSprites.delete(userId);
  remoteAnimState.delete(userId);
}

function updateRemoteSpriteTexture(userId: string) {
  const anim = remoteAnimState.get(userId);
  const container = remoteSprites.get(userId);
  if (!container || !anim) return;
  const now = performance.now();
  if (anim.moving && now - anim.lastPacketAt > REMOTE_IDLE_MS) {
    anim.moving = false;
  }
  const sprite = container.children[0] as Sprite;
  const row = getRowByDirection(anim.facing);
  let column = 0;
  if (anim.moving) {
    anim.elapsedTime += ANIMATION_SPEED;
    if (anim.elapsedTime >= 1) {
      anim.elapsedTime = 0;
      anim.frameIndex = (anim.frameIndex + 1) % TOTAL_FRAMES;
    }
    column = anim.frameIndex;
  } else {
    anim.frameIndex = 0;
    anim.elapsedTime = 0;
  }
  sprite.texture = getFrameTexture(row, column);
}

type PresencePayload = {
  user_id?: string;
  sender_key?: string;
  x?: number;
  y?: number;
  facing?: unknown;
  moving?: unknown;
};

function pruneRemoteSpritesNotInPresence(state: Record<string, unknown>) {
  const activeUserIds = new Set<string>();
  for (const [presenceKey, presences] of Object.entries(state)) {
    if (presenceKey === selfPresenceKey) continue;
    if (!Array.isArray(presences)) continue;
    for (const raw of presences) {
      const p = raw as PresencePayload;
      if (typeof p.user_id === "string") activeUserIds.add(p.user_id);
    }
  }
  for (const uid of remoteSprites.keys()) {
    if (!activeUserIds.has(uid)) removeRemoteSprite(uid);
  }
}

/** Upsert remotes from presence payloads only — does not prune (see below). */
function receivePresenceState(state: Record<string, unknown>) {
  for (const [presenceKey, presences] of Object.entries(state)) {
    if (presenceKey === selfPresenceKey) continue;
    if (!Array.isArray(presences)) continue;
    for (const raw of presences) {
      const p = raw as PresencePayload;
      if (
        typeof p.x !== "number" ||
        typeof p.y !== "number" ||
        typeof p.user_id !== "string"
      ) {
        continue;
      }
      upsertRemoteSprite(
        p.user_id,
        p.x,
        p.y,
        parseFacing(p.facing),
        typeof p.moving === "boolean" ? p.moving : undefined,
      );
    }
  }
}

/**
 * Prune only when membership changes (leave). Do **not** prune on every
 * `sync`/`join`: `presenceState()` can be briefly empty or incomplete, which
 * would remove everyone and hide peers that were already shown via broadcast.
 */
function applyPresenceSyncOrJoin() {
  if (!presenceChannel) return;
  receivePresenceState(presenceChannel.presenceState());
}

function applyPresenceLeave() {
  if (!presenceChannel) return;
  const state = presenceChannel.presenceState();
  receivePresenceState(state);
  pruneRemoteSpritesNotInPresence(state);
}

function teardownSupersededSession() {
  gameSessionActive.value = false;
  sessionSuperseded.value = true;
  if (disposeGameLease) {
    disposeGameLease();
    disposeGameLease = null;
  }
  if (presenceChannel) {
    void presenceChannel.untrack().catch(() => {});
    void supabase.removeChannel(presenceChannel);
    presenceChannel = null;
  }
  for (const [, container] of remoteSprites) {
    othersRoot.removeChild(container);
    container.destroy({ children: true });
  }
  remoteSprites.clear();
  remoteAnimState.clear();
  if (tickerFnRef) {
    app.ticker.remove(tickerFnRef);
    tickerFnRef = null;
  }
  window.removeEventListener("keydown", onKeydown);
  window.removeEventListener("keyup", onKeyup);
}

if (import.meta.client && session?.user) {
  disposeGameLease = claimSingleGameTab(teardownSupersededSession);

  presenceChannel = supabase.channel("gameworld", {
    config: {
      broadcast: { self: true },
      presence: {
        key: selfPresenceKey,
      },
    },
  });

  presenceChannel.on("presence", { event: "sync" }, applyPresenceSyncOrJoin);
  presenceChannel.on("presence", { event: "join" }, applyPresenceSyncOrJoin);
  presenceChannel.on("presence", { event: "leave" }, applyPresenceLeave);

  presenceChannel.on(
    "broadcast",
    { event: "pos" },
    ({ payload }: { payload?: unknown }) => {
      if (!payload || typeof payload !== "object") return;
      const p = payload as Record<string, unknown>;
      const uid = p.user_id;
      const x = p.x;
      const y = p.y;
      if (
        typeof uid !== "string" ||
        typeof x !== "number" ||
        typeof y !== "number"
      ) {
        return;
      }
      upsertRemoteSprite(
        uid,
        x,
        y,
        parseFacing(p.facing),
        typeof p.moving === "boolean" ? p.moving : undefined,
      );
    },
  );

  await presenceChannel.subscribe(async (status) => {
    if (status === "SUBSCRIBED" && presenceChannel && session.user) {
      await presenceChannel.track({
        user_id: session.user.id,
        sender_key: selfPresenceKey,
        x: heroPosition.value.x,
        y: heroPosition.value.y,
        facing: facingDirection.value,
        moving: isMoving.value,
      });
      sendBroadcastState();
    }
  });
}

const heroTick = (deltaSec: number) => {
  const target = targetPosition.value;
  if (target) {
    isMoving.value = true;
    const step = MOVE_SPEED * deltaSec;
    const dist = Math.hypot(
      target.x - heroPosition.value.x,
      target.y - heroPosition.value.y,
    );

    if (dist <= step) {
      heroPosition.value = { ...target };
      if (pressedDirection.value) {
        const next = getNextTileTarget(target, pressedDirection.value);
        if (!isTileSolid(next)) {
          facingDirection.value = pressedDirection.value;
          targetPosition.value = next;
        } else {
          targetPosition.value = null;
          isMoving.value = false;
        }
      } else {
        targetPosition.value = null;
        isMoving.value = false;
      }
    } else {
      heroPosition.value = {
        x: moveTowards(heroPosition.value.x, target.x, step),
        y: moveTowards(heroPosition.value.y, target.y, step),
      };
    }
  }
  heroContainer.x = heroPosition.value.x;
  heroContainer.y = heroPosition.value.y;
  updateHeroSprite(facingDirection.value, isMoving.value);
  for (const uid of remoteSprites.keys()) {
    updateRemoteSpriteTexture(uid);
  }
  updateCurrentRoom(heroPosition.value);
  updateRoomOverlayVisibility(roomOverlays, currentRoom.value?.id ?? null);
};

const roomOverlays = createRoomOverlays(rooms, worldContainer, tileSize);

worldContainer.addChild(othersRoot);
worldContainer.addChild(heroContainer);

const runHeroTick = (t: { deltaMS: number }) => {
  if (!gameSessionActive.value) return;
  heroTick(t.deltaMS / 1000);
};
tickerFnRef = runHeroTick;
app.ticker.add(runHeroTick);

onMounted(() => {
  if (canvasContainerRef.value && app.canvas) {
    canvasContainerRef.value.appendChild(app.canvas);
  }
  canvasContainerRef.value?.focus();
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("keyup", onKeyup);
});

onUnmounted(() => {
  if (disposeGameLease) {
    disposeGameLease();
    disposeGameLease = null;
  }
  if (presenceChannel) {
    void presenceChannel.untrack().catch(() => {});
    void supabase.removeChannel(presenceChannel);
    presenceChannel = null;
  }
  for (const [, container] of remoteSprites) {
    othersRoot.removeChild(container);
    container.destroy({ children: true });
  }
  remoteSprites.clear();
  remoteAnimState.clear();

  if (tickerFnRef) {
    app.ticker.remove(tickerFnRef);
    tickerFnRef = null;
  }

  if (movementDelayTimeoutRef.value) {
    clearTimeout(movementDelayTimeoutRef.value);
    movementDelayTimeoutRef.value = null;
  }
  window.removeEventListener("keydown", onKeydown);
  window.removeEventListener("keyup", onKeyup);
  app.destroy(true, true);
});
</script>

<style scoped>
.game-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}
.canvas-wrapper {
  width: 100%;
  max-width: 100vw;
  min-height: 400px;
}
.canvas-wrapper :deep(canvas) {
  display: block;
  width: 100%;
  border: 4px solid #222;
  image-rendering: pixelated;
}
.room-label {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 12px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 0.875rem;
  border-radius: 4px;
}

.game-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.75);
}
.game-overlay__panel {
  max-width: 22rem;
  padding: 1.25rem 1.5rem;
  background: #1a1a1a;
  color: #eee;
  border-radius: 8px;
  text-align: center;
}
.game-overlay__btn {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  font-size: 1rem;
  cursor: pointer;
  border-radius: 4px;
  border: none;
  background: #3b82f6;
  color: #fff;
}
.game-overlay__btn:hover {
  background: #2563eb;
}
</style>
