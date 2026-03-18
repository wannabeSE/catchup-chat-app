import type { Position } from "~/types/shared";
import type { Room, RoomBounds } from "~/types/room";

/**
 * Checks if a tile coordinate (tx, ty) is inside a room's bounds (inclusive).
 */
export function isPositionInRoom(
  tx: number,
  ty: number,
  bounds: RoomBounds,
): boolean {
  return (
    tx >= bounds.x1 && tx <= bounds.x2 && ty >= bounds.y1 && ty <= bounds.y2
  );
}

/**
 * Returns the room that contains the given tile coordinates, or null.
 */
export function getRoomAt(tx: number, ty: number, rooms: Room[]): Room | null {
  return rooms.find((r) => isPositionInRoom(tx, ty, r.bounds)) ?? null;
}

/**
 * Converts pixel position to tile coordinates (floored).
 */
export function pixelToTile(
  px: number,
  py: number,
  tileSize: number,
): { tx: number; ty: number } {
  return {
    tx: Math.floor(px / tileSize),
    ty: Math.floor(py / tileSize),
  };
}

/**
 * Composable for room detection. Provides currentRoom ref that updates when
 * the hero moves, and helpers for checking room membership.
 *
 * @example
 * const { currentRoom, getRoomAtPosition } = useRooms(rooms, tileSize);
 * // In your tick: getRoomAtPosition(heroPosition) and assign to currentRoom
 */
export function useRooms(rooms: Room[], tileSize: number) {
  const currentRoom = ref<Room | null>(null);

  const getRoomAtPosition = (pos: Position): Room | null => {
    const { tx, ty } = pixelToTile(pos.x, pos.y, tileSize);
    return getRoomAt(tx, ty, rooms);
  };

  const updateCurrentRoom = (pos: Position) => {
    currentRoom.value = getRoomAtPosition(pos);
  };

  return {
    currentRoom,
    getRoomAtPosition,
    updateCurrentRoom,
    getRoomAt: (tx: number, ty: number) => getRoomAt(tx, ty, rooms),
    isPositionInRoom: (tx: number, ty: number, bounds: RoomBounds) =>
      isPositionInRoom(tx, ty, bounds),
  };
}
