# GameWorld

A tile-based 2D game view: map layers, hero movement, and collision. This doc walks through how it works in plain language.

---

## Sprite Fusion to PixiJS Implementation Guide

This section summarizes the logic used to render the game world and handle collisions using data exported from **Sprite Fusion**.

### 1. Asset loading

The game needs two main files from the Sprite Fusion export:

- **map.json** – Tile positions, layer types, tile IDs, and which layers are colliders.
- **spritesheet.png** – Single image containing all tile art in a grid.

See [§5 Map data](#5-map-data) and [§6 Tile spritesheet](#6-tile-spritesheet) for how they are loaded and used.

### 2. Layer processing

Layers are processed in **reverse order**. In the exported JSON, the **main (floor)** layer is at the **bottom** of the list. Reversing the array before rendering ensures the floor is drawn first (back) and furniture/barriers on top (front).  
See [§9 Layer order](#9-layer-order).

### 3. Tile rendering math

To get one tile from the spritesheet we use:

| What | Formula |
|------|--------|
| **Column** (in sheet) | `tileId % columnsInSheet` |
| **Row** (in sheet) | `floor(tileId / columnsInSheet)` |
| **Pixel X in sheet** | `column × tileSize` |
| **Pixel Y in sheet** | `row × tileSize` |

So we cut a rectangle at `(column × tileSize, row × tileSize)` with size `tileSize × tileSize`.  
See [§10 Drawing tiles](#10-drawing-tiles).

### 4. Collision system

Collision is a **Set** of coordinate strings, e.g. `"10,5"` (tile x, tile y).

- Any layer with **collider: true** in the JSON has its tile coordinates added to this Set.
- In this project the layers **barrier**, **monitor-setup**, and **pc-table** are treated as solid obstacles.

See [§7 Solid tiles (collision)](#7-solid-tiles-collision) and [§14 Wall check](#14-wall-check).

### 5. Movement logic (grid-locked)

Movement is grid-locked:

1. **Capture** keyboard input (direction).
2. **Calculate** the target grid coordinate (next tile in that direction).
3. **Check** if that target is in the collision Set; if yes, do not move.
4. **Update** the player’s pixel position as they move toward the target (grid coordinate × tileSize), frame by frame.

See [§13 Next tile target](#13-next-tile-target), [§14 Wall check](#14-wall-check), [§16 Start walking](#16-start-walking), and [§21 Hero container & tick](#21-hero-container--tick).

### 6. Rooms

Rooms are rectangular regions defined in `map.json`. Each room has an `id`, `name`, and `bounds` (x1, y1, x2, y2 in tile coordinates). The `useRooms` composable provides `currentRoom`, `getRoomAtPosition`, and `updateCurrentRoom` so you can detect which room the hero is in.

**Adding more rooms** – Edit `public/map.json` and add entries to the `rooms` array:

```json
"rooms": [
  { "id": "main-hall", "name": "Main Hall", "bounds": { "x1": 1, "y1": 1, "x2": 22, "y2": 17 } },
  { "id": "office", "name": "Office", "bounds": { "x1": 5, "y1": 19, "x2": 16, "y2": 27 } }
]
```

- **id** – Unique identifier for the room.
- **name** – Display name (e.g. for UI).
- **bounds** – `x1,y1` = top-left tile, `x2,y2` = bottom-right tile (inclusive).
- **highlightColor** (optional) – Tint shown only when the hero is in that room (e.g. `"rgba(255,200,200,0.45)"`). Add to any room to get a conditional overlay.

The `useRooms` composable (`~/composables/useRooms`) is reusable: pass `rooms` and `tileSize`, then call `updateCurrentRoom(position)` each frame. The `useRoomOverlays` composable (`~/composables/useRoomOverlays`) creates overlays for rooms with `highlightColor` and toggles their visibility based on `currentRoom`.

---

## Contents

- [Sprite Fusion to PixiJS Implementation Guide](#sprite-fusion-to-pixijs-implementation-guide) (asset loading, layers, tile math, collision, movement)
1. [Screen & template](#1-screen--template)
2. [Imports](#2-imports)
3. [Refs](#3-refs)
4. [Game stage (Pixi app)](#4-game-stage-pixi-app)
5. [Map data](#5-map-data)
6. [Tile spritesheet](#6-tile-spritesheet)
7. [Solid tiles (collision)](#7-solid-tiles-collision)
8. [World container](#8-world-container)
9. [Layer order](#9-layer-order)
10. [Drawing tiles](#10-drawing-tiles)
11. [Hero state](#11-hero-state)
12. [Key → direction](#12-key--direction)
13. [Next tile target](#13-next-tile-target)
14. [Wall check](#14-wall-check)
15. [Smooth move](#15-smooth-move)
16. [Start walking](#16-start-walking)
17. [Key down](#17-key-down)
18. [Key up](#18-key-up)
19. [Hero texture & frames](#19-hero-texture--frames)
20. [Hero sprite & animation](#20-hero-sprite--animation)
21. [Hero container & tick](#21-hero-container--tick)
22. [Stage & ticker](#22-stage--ticker)
23. [On mount](#23-on-mount)
24. [On unmount](#24-on-unmount)
25. [Styles](#25-styles)

---

## 1. Screen & template

The game is drawn inside **game-container**. Inside it, **canvas-wrapper** is the empty div where the Pixi canvas is inserted when the page is ready.  
`tabindex="0"` lets that wrapper receive focus so keyboard input works.

---

## 2. Imports

- **usePixi** – sets up the Pixi app and drawing.
- **pixi.js** – Assets, Container, Rectangle, Texture, Sprite for loading images and drawing.
- **Hero image** – the character spritesheet.
- **Types** – `Direction` (up/down/left/right), `Position` (x, y).
- **world-constants** – move speed, move delay, frame size, animation speed.

---

## 3. Refs

- **canvasContainerRef** – the DOM element that will hold the game canvas.
- **movementDelayTimeoutRef** – the “wait before first step” timer; we clear it if the key is released before the delay ends.

---

## 4. Game stage (Pixi app)

**usePixi()** creates the Pixi **Application** (the “stage” everything is drawn on). We store it in **app**. The app has a **canvas**; we attach that canvas to the page in **onMounted**.

---

## 5. Map data

We **$fetch** `/map.json` (the Sprite Fusion export). It describes the map:

- **tileSize** – pixel size of one tile (e.g. 16).
- **layers** – each layer has a name, optional **collider** flag, and a list of **tiles** with:
  - **id** – which tile image in the spritesheet (tile ID from Sprite Fusion).
  - **x, y** – tile position on the map grid.

---

## 6. Tile spritesheet

We load **spritesheet.png** (the Sprite Fusion art export – one image with all tiles in a grid).  
**colsInSheet** (or `columnsInSheet`) = how many tiles fit in one row. With that and **tileSize**, we compute the pixel position of any tile in the image using the formulas in the [Sprite Fusion guide](#3-tile-rendering-math) above.

---

## 7. Solid tiles (collision)

**solidTiles** is a `Set` of coordinate strings (e.g. `"10,5"` for tile x=10, y=5) where the hero cannot walk.  
When we draw the map, any layer with **collider: true** in the JSON has its tile coordinates added to this Set. In this implementation the layers **barrier**, **monitor-setup**, and **pc-table** are all treated as solid obstacles.

---

## 8. World container

**worldContainer** is a Pixi **Container**. We add all map tiles and the hero into it, then add **worldContainer** to **app.stage**.  
Order: **stage → worldContainer → map tiles + hero**.

---

## 9. Layer order

In the Sprite Fusion export the **main (floor)** layer is usually at the **bottom** of the layers list. We **reverse** the layer array before rendering so we draw the floor first (back) and barriers/furniture on top (front). That way the floor is behind and obstacles in front.

---

## 10. Drawing tiles

For each **layer**, we loop over each **tile** and use the Sprite Fusion tile-rendering math:

1. **tileId** – which tile in the spritesheet (numeric; from JSON as `tile.id`).
2. **Column & row in sheet**: `column = tileId % columnsInSheet`, `row = floor(tileId / columnsInSheet)`.
3. **sx, sy** – pixel position in the spritesheet: `sx = column × tileSize`, `sy = row × tileSize`.
4. **Texture** – we take a **frame** (rectangle) from the spritesheet at (sx, sy) with size tileSize × tileSize.
5. **Sprite** – we create a sprite with that texture, set its position to (tile.x × tileSize, tile.y × tileSize) on the map, and add it to **worldContainer**.
6. If the layer has **collider: true**, we add `"tile.x,tile.y"` to **solidTiles**.

---

## 11. Hero state

- **heroPosition** – current position in pixels (starts at e.g. 3×tileSize, 3×tileSize).
- **targetPosition** – next tile we’re walking to; `null` when standing still.
- **isMoving** – true while moving toward a target.
- **pressedDirection** – direction of the key currently held (or null).
- **facingDirection** – direction the hero is drawn facing (for the correct animation row).

---

## 12. Key → direction

**keyToDirection(key)** maps keyboard keys to a direction:

- ArrowUp / W → `"up"`
- ArrowDown / S → `"down"`
- ArrowLeft / A → `"left"`
- ArrowRight / D → `"right"`
- Anything else → `null` (ignored).

---

## 13. Next tile target

**getNextTileTarget(from, direction)** returns the position (in pixels) of the tile one step in that direction: add or subtract **tileSize** on x or y.

---

## 14. Wall check

**isTileSolid(pos)** converts a pixel position to tile coordinates (divide by tileSize), builds the key `"tileX,tileY"`, and returns whether that key is in **solidTiles**. If yes, the hero cannot walk there.

---

## 15. Smooth move

**moveTowards(current, target, maxStep)** moves **current** toward **target** by at most **maxStep**. Used so the hero moves smoothly each frame instead of jumping.

---

## 16. Start walking

**startMovementToward(direction)** implements the grid-locked movement flow:

- If we already have a **targetPosition**, we do nothing (finish current step).
- We **calculate** the next tile (target grid coordinate) in that direction.
- We **check** if that tile is in the collision Set (**isTileSolid**); if yes, we return (no move).
- Otherwise we set **targetPosition** to that tile; the tick then **updates** the hero’s pixel position (grid × tileSize) frame by frame until they reach the target.

---

## 17. Key down

**onKeydown**:

1. Get **direction** from the key; ignore non-movement keys.
2. Cancel any existing movement-delay timer.
3. Store **pressedDirection** and **facingDirection**.
4. Start a timer for **MOVE_DELAY_MS**. When it fires, if the same key is still held, call **startMovementToward(direction)**.  
   So a short tap doesn’t move; you have to hold briefly.

---

## 18. Key up

**onKeyup**:

1. Get **direction** from the key.
2. Cancel the movement-delay timer (so releasing before the delay doesn’t start a move).
3. If the released key is the one we stored, set **pressedDirection** to null.

We do **not** snap or teleport the hero; he keeps walking to his current target and then stops.

---

## 19. Hero texture & frames

We load the hero image and create a **Texture**. The image is a grid: **rows** = facing (up/left/right/down), **columns** = walk animation.  
**getRowByDirection** returns the row index (e.g. up=8, down=10).  
**getFrameTexture(row, column)** creates a texture by cutting a rectangle (one frame) from that image using **FRAME_WIDTH** and **FRAME_HEIGHT**.

---

## 20. Hero sprite & animation

We create one **heroSprite** with the “standing down” frame and set **anchor (0.5, 1)** so the bottom-center is the position (hero stands on the tile).  
**updateHeroSprite(direction, moving)**:

- **Row** comes from **facingDirection** (which way he’s facing).
- **Column**: if **moving**, we advance **elapsedTime** and use the next animation frame (column); if not moving, we use column 0 (idle).

---

## 21. Hero container & tick

**heroContainer** is a Container that holds the hero sprite. We set its position to **heroPosition** and scale (e.g. 0.7).  
**heroTick(deltaSec)** runs every frame:

- If there’s a **target**:
  - **step** = MOVE_SPEED × deltaSec.
  - If the hero is within **step** of the target: set position to target; if a key is still held, set the next tile as target (if not solid), otherwise clear target and stop; if key not held, clear target and stop.
  - Else: move the hero one **step** closer to the target.
- Update **heroContainer** position and call **updateHeroSprite** with current facing and moving state.

---

## 22. Stage & ticker

We add **heroContainer** to **worldContainer** so the hero is drawn on top of the map.  
We register **heroTick** with **app.ticker**, passing time in seconds (e.g. `t.deltaMS / 1000`) so movement is frame-rate independent.

---

## 23. On mount

When the component is mounted:

- Append **app.canvas** to **canvasContainerRef** so the game is visible.
- Focus the canvas wrapper so it can receive key events.
- Add **keydown** and **keyup** listeners on **window** to drive hero movement.

---

## 24. On unmount

When the component is destroyed:

- Clear the movement-delay timer.
- Remove **keydown** and **keyup** listeners.
- Call **app.destroy(true, true)** so the Pixi app and canvas are disposed.

---

## 25. Styles

- **game-container** – flex layout, centered content.
- **canvas-wrapper** – full width, minimum height (e.g. 400px).
- Canvas inside the wrapper – block, full width, border, **image-rendering: pixelated** so pixel art stays sharp.
