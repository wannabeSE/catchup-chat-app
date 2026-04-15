import type { Position } from "~/types/shared";

const PREFIX = "catchup-chat:worldPos:";

export function worldPositionStorageKey(userId: string): string {
  return `${PREFIX}${userId}`;
}

export function readWorldPositionFromStorage(userId: string): Position | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(worldPositionStorageKey(userId));
    if (!raw) return null;
    const p = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof p.x !== "number" || typeof p.y !== "number") return null;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    return { x: p.x, y: p.y };
  } catch {
    return null;
  }
}

export function writeWorldPositionToStorage(userId: string, pos: Position): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      worldPositionStorageKey(userId),
      JSON.stringify({ x: pos.x, y: pos.y }),
    );
  } catch {
    // quota / private mode
  }
}
