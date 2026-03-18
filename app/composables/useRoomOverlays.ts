import { Container, Sprite, Texture } from "pixi.js";
import type { Room } from "~/types/room";

type OverlayEntry = {
  roomId: string;
  sprite: Sprite;
};

/**
 * Creates room overlay sprites for rooms that have highlightColor.
 * Overlays are only visible when the hero is inside that room.
 * Reusable: add highlightColor to any room in map.json.
 */
export function createRoomOverlays(
  rooms: Room[],
  worldContainer: Container,
  tileSize: number,
): OverlayEntry[] {
  const entries: OverlayEntry[] = [];

  for (const room of rooms) {
    if (!room.highlightColor) continue;

    const { x1, y1, x2, y2 } = room.bounds;
    const w = (x2 - x1 + 1) * tileSize;
    const h = (y2 - y1 + 1) * tileSize;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = room.highlightColor;
    ctx.fillRect(0, 0, w, h);

    const texture = Texture.from(canvas);
    const sprite = new Sprite(texture);
    sprite.x = x1 * tileSize;
    sprite.y = y1 * tileSize;
    sprite.visible = false;

    worldContainer.addChild(sprite as unknown as Container);
    entries.push({ roomId: room.id, sprite });
  }

  return entries;
}

/**
 * Updates overlay visibility based on current room.
 * Call this each frame (or when hero moves) after updateCurrentRoom.
 */
export function updateRoomOverlayVisibility(
  overlays: OverlayEntry[],
  currentRoomId: string | null,
) {
  for (const { roomId, sprite } of overlays) {
    sprite.visible = currentRoomId === roomId;
  }
}
