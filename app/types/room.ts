/**
 * Room bounds in tile coordinates (inclusive).
 * x1,y1 = top-left, x2,y2 = bottom-right.
 */
export type RoomBounds = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type Room = {
  id: string;
  name: string;
  bounds: RoomBounds;
  /** Optional: tint color when hero enters (e.g. "rgba(255,200,200,0.45)"). Only shown while hero is in the room. */
  highlightColor?: string;
};
