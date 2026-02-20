<template>
  <div class="game-container">
    <div ref="canvasContainerRef" class="canvas-wrapper" tabindex="0" />
  </div>
</template>

<script setup lang="ts">
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
} from "~/constants/world-constants";

const canvasContainerRef = ref<HTMLDivElement | null>(null);
const movementDelayTimeoutRef = ref<ReturnType<typeof setTimeout> | null>(null);

const app = await usePixi();
const mapData = await $fetch<{
  tileSize: number;
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

// --- Hero state and movement (from GameCanvas) ---
const heroPosition = ref<Position>({ x: 3 * tileSize, y: 3 * tileSize });
const targetPosition = ref<Position | null>(null);
const isMoving = ref(false);
const pressedDirection = ref<Direction | null>(null);
const facingDirection = ref<Direction>("down");

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
};

worldContainer.addChild(heroContainer);
app.ticker.add((t) => heroTick(t.deltaMS / 1000));

onMounted(() => {
  if (canvasContainerRef.value && app.canvas) {
    canvasContainerRef.value.appendChild(app.canvas);
  }
  canvasContainerRef.value?.focus();
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("keyup", onKeyup);
});

onUnmounted(() => {
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
</style>
