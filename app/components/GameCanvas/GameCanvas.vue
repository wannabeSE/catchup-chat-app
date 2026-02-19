<template>
  <div class="game-wrapper">
    <div ref="containerRef" tabindex="0" class="game-canvas" />
    <div class="zoom-controls">
      <button
        type="button"
        class="zoom-btn"
        aria-label="Zoom in"
        @click="zoomControls?.zoomIn()"
      >
        +
      </button>
      <button
        type="button"
        class="zoom-btn"
        aria-label="Zoom out"
        @click="zoomControls?.zoomOut()"
      >
        −
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Application, Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";
import HeroImg from "../../../public/images/hero.png";
import type { Direction, Position } from "~/types/shared";

const TILE_SIZE = 32;
const MOVE_SPEED = 160; // pixels per second

const containerRef = ref<HTMLDivElement | null>(null);
const appRef = ref<Application | null>(null);
const dragCleanupRef = ref<(() => void) | null>(null);
const zoomControls = ref<{ zoomIn: () => void; zoomOut: () => void } | null>(null);

const heroPosition = ref<Position>({ x: 192, y: 192 });
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
  x: from.x + (direction === "left" ? -TILE_SIZE : direction === "right" ? TILE_SIZE : 0),
  y: from.y + (direction === "up" ? -TILE_SIZE : direction === "down" ? TILE_SIZE : 0),
});

const moveTowards = (current: number, target: number, maxStep: number) =>
  current + Math.sign(target - current) * Math.min(Math.abs(target - current), maxStep);

const onKeydown = (e: KeyboardEvent) => {
  const direction = keyToDirection(e.key);
  if (!direction) return;
  e.preventDefault();
  pressedDirection.value = direction;
  facingDirection.value = direction;
  if (!targetPosition.value) {
    targetPosition.value = getNextTileTarget(heroPosition.value, direction);
  }
};

const onKeyup = (e: KeyboardEvent) => {
  const direction = keyToDirection(e.key);
  if (!direction) return;
  if (pressedDirection.value === direction) {
    pressedDirection.value = null;
  }
};

const initPixi = async () => {
  const app = new Application();
  appRef.value = app;
  await app.init({
    background: "#C0C2DC",
    resizeTo: window,
    backgroundAlpha: 1,
  });

  const map = await Assets.loadBundle("map");
  const mapTexture = map.map;
  await Assets.load(HeroImg);
  const heroTexture = Texture.from(HeroImg);

  const frameWidth = 64;
  const frameHeight = 64;
  const totalFrames = 9;
  const animationSpeed = 0.2;
  let frameIndex = 0;
  let elapsedTime = 0;

  const getRowByDirection = (direction: Direction) => {
    switch (direction) {
      case "up": return 8;
      case "left": return 9;
      case "right": return 11;
      case "down": return 10;
      default: return 10;
    }
  };

  const getFrameTexture = (row: number, column: number) => {
    const rect = new Rectangle(
      column * frameWidth,
      row * frameHeight,
      frameWidth,
      frameHeight,
    );
    return new Texture({ source: heroTexture.source, frame: rect });
  };

  const heroSprite = new Sprite(getFrameTexture(getRowByDirection("down"), 0));
  heroSprite.anchor.set(0.5, 1);

  const updateHeroSprite = (direction: Direction, moving: boolean) => {
    const row = getRowByDirection(direction);
    let column = 0;
    if (moving) {
      elapsedTime += animationSpeed;
      if (elapsedTime >= 1) {
        elapsedTime = 0;
        frameIndex = (frameIndex + 1) % totalFrames;
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
      const dist = Math.hypot(target.x - heroPosition.value.x, target.y - heroPosition.value.y);

      if (dist <= step) {
        heroPosition.value = { ...target };
        if (pressedDirection.value) {
          facingDirection.value = pressedDirection.value;
          targetPosition.value = getNextTileTarget(target, pressedDirection.value);
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

  const mapSprite = Sprite.from(mapTexture);
  mapSprite.x = 0;
  mapSprite.y = 0;
  mapSprite.width = window.innerWidth;
  mapSprite.height = window.innerHeight;

  const worldContainer = new Container();
  worldContainer.addChild(mapSprite);
  worldContainer.addChild(heroContainer);
  app.stage.addChild(worldContainer);

  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 3;
  const ZOOM_STEP = 0.2;
  let worldScale = 1;

  const zoomTowardCenter = (newScale: number) => {
    const canvas = app.canvas as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const worldX = (centerX - worldContainer.x) / worldScale;
    const worldY = (centerY - worldContainer.y) / worldScale;
    worldScale = newScale;
    worldContainer.scale.set(worldScale, worldScale);
    worldContainer.x = centerX - worldX * worldScale;
    worldContainer.y = centerY - worldY * worldScale;
  };

  zoomControls.value = {
    zoomIn: () => {
      const next = Math.min(MAX_ZOOM, worldScale + ZOOM_STEP);
      if (next !== worldScale) zoomTowardCenter(next);
    },
    zoomOut: () => {
      const next = Math.max(MIN_ZOOM, worldScale - ZOOM_STEP);
      if (next !== worldScale) zoomTowardCenter(next);
    },
  };

  const dragData = {
    active: false,
    startX: 0,
    startY: 0,
    startWorldX: 0,
    startWorldY: 0,
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    dragData.active = true;
    dragData.startX = e.clientX;
    dragData.startY = e.clientY;
    dragData.startWorldX = worldContainer.x;
    dragData.startWorldY = worldContainer.y;
    canvas.style.cursor = "grabbing";
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragData.active) return;
    worldContainer.x = dragData.startWorldX + (e.clientX - dragData.startX);
    worldContainer.y = dragData.startWorldY + (e.clientY - dragData.startY);
  };
  const onPointerUp = () => {
    dragData.active = false;
    canvas.style.cursor = "grab";
  };

  const canvas = app.canvas as HTMLCanvasElement;
  canvas.style.cursor = "grab";
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerUp);

  app.ticker.add((t) => heroTick(t.deltaMS / 1000));
  containerRef.value?.appendChild(app.canvas);

  dragCleanupRef.value = () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointerleave", onPointerUp);
  };
};

onMounted(async () => {
  await Assets.init({ manifest: "/manifest.json" });
  await initPixi();
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("keyup", onKeyup);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  window.removeEventListener("keyup", onKeyup);
  zoomControls.value = null;
  dragCleanupRef.value?.();
  appRef.value?.destroy(true, true);
  appRef.value = null;
});
</script>

<style scoped>
.game-wrapper {
  position: relative;
  width: 100%;
  height: 100vh;
}
.game-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.game-canvas:focus {
  outline: none;
}
.zoom-controls {
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.zoom-btn {
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.zoom-btn:hover {
  background: rgba(0, 0, 0, 0.8);
}
.zoom-btn:active {
  transform: scale(0.96);
}
</style>
