import type { Position } from "~/types/shared";

export const TILE_SIZE = 32;
export const MOVE_SPEED = 160; // pixels per second
export const MOVE_DELAY_MS = 150; // delay before movement starts after keydown
export const FRAME_WIDTH = 64;
export const FRAME_HEIGHT = 64;
export const TOTAL_FRAMES = 9;
export const ANIMATION_SPEED = 0.2;

/** Grid tile coords for hero spawn — must stay on walkable floor for the current map. */
export const HERO_SPAWN_TILE_COORDS = [
  { x: 3, y: 3 },
  { x: 10, y: 10 },
  { x: 18, y: 8 },
  { x: 12, y: 35 },
] as const;

export function tileCoordsToHeroPosition(
  tileX: number,
  tileY: number,
  tileSize: number,
): Position {
  return { x: tileX * tileSize, y: tileY * tileSize };
}

export function pickRandomHeroSpawnPosition(tileSize: number): Position {
  const i = Math.floor(Math.random() * HERO_SPAWN_TILE_COORDS.length);
  const t = HERO_SPAWN_TILE_COORDS[i]!;
  return tileCoordsToHeroPosition(t.x, t.y, tileSize);
}

export function isPositionWithinMapBounds(
  pos: Position,
  tileSize: number,
  mapWidth: number,
  mapHeight: number,
): boolean {
  const tx = Math.round(pos.x / tileSize);
  const ty = Math.round(pos.y / tileSize);
  return tx >= 0 && tx < mapWidth && ty >= 0 && ty < mapHeight;
}