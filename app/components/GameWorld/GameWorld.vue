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
import {
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from "pixi.js";
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
/** Declared before movement helpers so `isMovementBlocked` can read remote player positions. */
const remotePlayerContainers = new Map<string, Container>();
const remoteOccupiedTileKeys = new Set<string>();
const getTileKey = (x: number, y: number): string =>
  `${Math.floor(x / tileSize)},${Math.floor(y / tileSize)}`;
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

const PLAYER_NAME_FONT_PX = 14;
const NAME_BADGE_PAD_X = 8;
const NAME_BADGE_PAD_Y = 4;
/** Smaller gap = banner sits tighter to the sprite head. */
const NAME_BADGE_GAP_ABOVE_SPRITE = 1;
/** Semi-transparent black banner behind the name (letters stay solid white). */
const NAME_BADGE_BG_ALPHA = 0.72;
const NAME_BADGE_CORNER_RADIUS = 5;

const playerNameTextStyle = new TextStyle({
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  fontSize: PLAYER_NAME_FONT_PX,
  fill: 0xffffff,
  align: "center",
});

function clampPlayerLabel(text: string, maxLen = 22): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

function displayNameForAuthUser(
  user:
    | {
        id: string;
        email?: string | null;
        user_metadata?: Record<string, unknown>;
      }
    | null
    | undefined,
): string {
  if (!user) return "Player";
  const m = user.user_metadata ?? {};
  const fromMeta = m.full_name ?? m.name ?? m.username ?? m.display_name;
  if (typeof fromMeta === "string" && fromMeta.trim().length > 0) {
    return clampPlayerLabel(fromMeta);
  }
  const local = user.email?.split("@")[0]?.trim();
  if (local) return clampPlayerLabel(local);
  return clampPlayerLabel(`Player_${user.id.slice(0, 6)}`);
}

function resolveRemoteDisplayName(
  userId: string,
  payloadName: string | undefined,
): string {
  if (typeof payloadName === "string" && payloadName.trim().length > 0) {
    return clampPlayerLabel(payloadName);
  }
  return clampPlayerLabel(`Player_${userId.slice(0, 6)}`);
}

function layoutPlayerNameBadgeBackground(badge: Container, label: Text) {
  const bg = badge.children[0] as Graphics;
  bg.clear();
  const w = label.width + NAME_BADGE_PAD_X * 2;
  const h = label.height + NAME_BADGE_PAD_Y * 2;
  const r = Math.min(NAME_BADGE_CORNER_RADIUS, w / 2 - 0.5, h / 2 - 0.5);
  bg.roundRect(-w / 2, -h, w, h, Math.max(0, r)).fill({
    color: 0x000000,
    alpha: NAME_BADGE_BG_ALPHA,
  });
}

/** Banner above sprite: white text on translucent black pill. */
function createPlayerNameBadge(initialText: string): Container {
  const badge = new Container();
  const bg = new Graphics();
  const label = new Text({
    text: initialText,
    style: playerNameTextStyle,
  });
  label.anchor.set(0.5, 1);
  label.x = 0;
  label.y = -NAME_BADGE_PAD_Y;
  badge.addChild(bg as unknown as Container);
  badge.addChild(label as unknown as Container);
  layoutPlayerNameBadgeBackground(badge, label);
  badge.y = -(FRAME_HEIGHT + NAME_BADGE_GAP_ABOVE_SPRITE);
  return badge;
}

const localPlayerDisplayName = displayNameForAuthUser(session?.user ?? null);

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
      display_name: localPlayerDisplayName,
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

/** Same grid as map collision; uses floor so interpolated broadcast positions still resolve to a tile. */
const isTileOccupiedByRemote = (pos: Position): boolean => {
  return remoteOccupiedTileKeys.has(getTileKey(pos.x, pos.y));
};

const isMovementBlocked = (pos: Position) =>
  isTileSolid(pos) || isTileOccupiedByRemote(pos);

const moveTowards = (current: number, target: number, maxStep: number) =>
  current +
  Math.sign(target - current) * Math.min(Math.abs(target - current), maxStep);

const startMovementToward = (direction: Direction) => {
  if (targetPosition.value) return;
  const next = getNextTileTarget(heroPosition.value, direction);
  if (isMovementBlocked(next)) return;
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

const localPlayerContainer = new Container();
localPlayerContainer.x = heroPosition.value.x;
localPlayerContainer.y = heroPosition.value.y;
localPlayerContainer.scale.set(0.7, 0.7);
localPlayerContainer.addChild(heroSprite as unknown as Container);
localPlayerContainer.addChild(
  createPlayerNameBadge(localPlayerDisplayName) as unknown as Container,
);

// --- Other players via Realtime Presence (no DB table) ---
/** Local player + remote players: one layer so Pixi can Y-sort draw order (depth). */
const playerSpritesLayer = new Container();
playerSpritesLayer.sortableChildren = true;
playerSpritesLayer.addChild(localPlayerContainer);

/** If no packet arrives for this long while `moving` was true, treat as idle (stale flag / dropped send). */
const REMOTE_IDLE_MS = 180;

type RemoteAnimState = {
  frameIndex: number;
  elapsedTime: number;
  facing: Direction;
  moving: boolean;
  lastPacketAt: number;
};

const remotePlayerAnimByUserId = new Map<string, RemoteAnimState>();

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
  displayName?: string,
) {
  if (session?.user && userId === session.user.id) return;
  // Remove old position from occupied set
  const existingRemoteContainer = remotePlayerContainers.get(userId);
  if (existingRemoteContainer) {
    remoteOccupiedTileKeys.delete(
      getTileKey(existingRemoteContainer.x, existingRemoteContainer.y),
    );
  }
  let remotePlayerContainer = remotePlayerContainers.get(userId);
  if (!remotePlayerContainer) {
    remotePlayerContainer = new Container();
    const sprite = new Sprite(getFrameTexture(getRowByDirection("down"), 0));
    sprite.anchor.set(0.5, 1);
    sprite.tint = tintForUserId(userId);
    remotePlayerContainer.scale.set(0.7, 0.7);
    remotePlayerContainer.addChild(sprite as unknown as Container);
    remotePlayerContainer.addChild(
      createPlayerNameBadge(
        resolveRemoteDisplayName(userId, displayName),
      ) as unknown as Container,
    );
    playerSpritesLayer.addChild(remotePlayerContainer);
    remotePlayerContainers.set(userId, remotePlayerContainer);
    remotePlayerAnimByUserId.set(userId, {
      frameIndex: 0,
      elapsedTime: 0,
      facing: facing ?? "down",
      moving: moving ?? false,
      lastPacketAt: performance.now(),
    });
  } else if (displayName !== undefined) {
    const resolved = resolveRemoteDisplayName(userId, displayName);
    const badge = remotePlayerContainer.children[1] as Container | undefined;
    const label = badge?.children[1] as Text | undefined;
    if (label && label.text !== resolved) {
      label.text = resolved;
      if (badge) layoutPlayerNameBadgeBackground(badge, label);
    }
  }
  const remotePlayerAnim = remotePlayerAnimByUserId.get(userId);
  if (remotePlayerAnim) {
    if (facing !== undefined) remotePlayerAnim.facing = facing;
    if (moving !== undefined) remotePlayerAnim.moving = moving;
    remotePlayerAnim.lastPacketAt = performance.now();
  }
  remotePlayerContainer.x = x;
  remotePlayerContainer.y = y;
  // Add new position to occupied set
  remoteOccupiedTileKeys.add(getTileKey(x, y));
}

function removeRemoteSprite(userId: string) {
  const remotePlayerContainer = remotePlayerContainers.get(userId);
  if (remotePlayerContainer) {
    remoteOccupiedTileKeys.delete(
      getTileKey(remotePlayerContainer.x, remotePlayerContainer.y),
    );
  }
  if (!remotePlayerContainer) return;
  playerSpritesLayer.removeChild(remotePlayerContainer);
  remotePlayerContainer.destroy({ children: true });
  remotePlayerContainers.delete(userId);
  remotePlayerAnimByUserId.delete(userId);
}

function updateRemoteSpriteTexture(userId: string) {
  const remotePlayerAnim = remotePlayerAnimByUserId.get(userId);
  const remotePlayerContainer = remotePlayerContainers.get(userId);
  if (!remotePlayerContainer || !remotePlayerAnim) return;
  const now = performance.now();
  if (
    remotePlayerAnim.moving &&
    now - remotePlayerAnim.lastPacketAt > REMOTE_IDLE_MS
  ) {
    remotePlayerAnim.moving = false;
  }
  const sprite = remotePlayerContainer.children[0] as Sprite;
  const row = getRowByDirection(remotePlayerAnim.facing);
  let column = 0;
  if (remotePlayerAnim.moving) {
    remotePlayerAnim.elapsedTime += ANIMATION_SPEED;
    if (remotePlayerAnim.elapsedTime >= 1) {
      remotePlayerAnim.elapsedTime = 0;
      remotePlayerAnim.frameIndex =
        (remotePlayerAnim.frameIndex + 1) % TOTAL_FRAMES;
    }
    column = remotePlayerAnim.frameIndex;
  } else {
    remotePlayerAnim.frameIndex = 0;
    remotePlayerAnim.elapsedTime = 0;
  }
  sprite.texture = getFrameTexture(row, column);
}

type PresencePayload = {
  user_id?: string;
  sender_key?: string;
  display_name?: string;
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
  for (const remoteUserId of remotePlayerContainers.keys()) {
    if (!activeUserIds.has(remoteUserId)) removeRemoteSprite(remoteUserId);
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
        typeof p.display_name === "string" ? p.display_name : undefined,
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
  for (const [, remotePlayerContainer] of remotePlayerContainers) {
    playerSpritesLayer.removeChild(remotePlayerContainer);
    remotePlayerContainer.destroy({ children: true });
  }
  remotePlayerContainers.clear();
  remotePlayerAnimByUserId.clear();
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
        typeof p.display_name === "string" ? p.display_name : undefined,
      );
    },
  );

  await presenceChannel.subscribe(async (status) => {
    if (status === "SUBSCRIBED" && presenceChannel && session.user) {
      await presenceChannel.track({
        user_id: session.user.id,
        sender_key: selfPresenceKey,
        display_name: localPlayerDisplayName,
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
        if (!isMovementBlocked(next)) {
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
  localPlayerContainer.x = heroPosition.value.x;
  localPlayerContainer.y = heroPosition.value.y;
  localPlayerContainer.zIndex = localPlayerContainer.y;
  for (const [, remotePlayerContainer] of remotePlayerContainers) {
    remotePlayerContainer.zIndex = remotePlayerContainer.y;
  }
  playerSpritesLayer.sortChildren();
  updateHeroSprite(facingDirection.value, isMoving.value);
  for (const remoteUserId of remotePlayerContainers.keys()) {
    updateRemoteSpriteTexture(remoteUserId);
  }
  updateCurrentRoom(heroPosition.value);
  updateRoomOverlayVisibility(roomOverlays, currentRoom.value?.id ?? null);
};

const roomOverlays = createRoomOverlays(rooms, worldContainer, tileSize);

worldContainer.addChild(playerSpritesLayer);

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
  for (const [, remotePlayerContainer] of remotePlayerContainers) {
    playerSpritesLayer.removeChild(remotePlayerContainer);
    remotePlayerContainer.destroy({ children: true });
  }
  remotePlayerContainers.clear();
  remotePlayerAnimByUserId.clear();

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
