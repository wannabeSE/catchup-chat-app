// composables/useWorldData.ts
// Defines all rooms, their connections, and visual properties

export interface Door {
    id: string
    x: number        // tile x in room
    y: number        // tile y in room
    direction: 'north' | 'south' | 'east' | 'west'
    leadsTo: string  // room id
    spawnX: number   // where player spawns in target room (tile)
    spawnY: number
    label: string
  }
  
  export interface RoomObject {
    id: string
    x: number
    y: number
    type: 'chest' | 'npc' | 'pillar' | 'table' | 'bed' | 'fountain' | 'bookshelf' | 'torch' | 'throne' | 'barrel' | 'sign'
    label?: string
    interaction?: string
    blocksMovement: boolean
  }
  
  export interface Room {
    id: string
    name: string
    description: string
    width: number    // in tiles
    height: number   // in tiles
    theme: 'dungeon' | 'forest' | 'castle' | 'cave' | 'village' | 'throne'
    floorColor: number
    wallColor: number
    accentColor: number
    doors: Door[]
    objects: RoomObject[]
    ambientMessage?: string
  }
  
  export function useWorldData() {
    const TILE = 32
  
    const rooms: Record<string, Room> = {
      // ─── VILLAGE SQUARE (hub room) ─────────────────────────────────────
      village_square: {
        id: 'village_square',
        name: 'Village Square',
        description: 'The heart of the village. A weathered fountain gurgles in the center.',
        width: 20,
        height: 16,
        theme: 'village',
        floorColor: 0x8B7355,
        wallColor: 0x5c4a32,
        accentColor: 0xc8a870,
        ambientMessage: '🏘️ Welcome to Pixiworld! Use arrow keys or WASD to move.',
        doors: [
          {
            id: 'vs_to_dungeon',
            x: 10, y: 15,
            direction: 'south',
            leadsTo: 'dungeon_entrance',
            spawnX: 10, spawnY: 1,
            label: 'Dungeon ↓'
          },
          {
            id: 'vs_to_forest',
            x: 19, y: 7,
            direction: 'east',
            leadsTo: 'forest_path',
            spawnX: 1, spawnY: 7,
            label: 'Forest →'
          },
          {
            id: 'vs_to_castle',
            x: 0, y: 7,
            direction: 'west',
            leadsTo: 'castle_gate',
            spawnX: 18, spawnY: 7,
            label: '← Castle'
          },
          {
            id: 'vs_to_tavern',
            x: 10, y: 0,
            direction: 'north',
            leadsTo: 'tavern',
            spawnX: 10, spawnY: 14,
            label: 'Tavern ↑'
          }
        ],
        objects: [
          { id: 'fountain', x: 10, y: 7, type: 'fountain', label: 'Village Fountain', interaction: 'The ancient fountain hums with magic. You feel refreshed!', blocksMovement: true },
          { id: 'barrel1', x: 3, y: 3, type: 'barrel', blocksMovement: true },
          { id: 'barrel2', x: 4, y: 3, type: 'barrel', blocksMovement: true },
          { id: 'sign1', x: 5, y: 12, type: 'sign', label: 'Notice Board', interaction: 'WANTED: Dragon slayer. Good pay. Low survival rate.', blocksMovement: false },
          { id: 'npc_merchant', x: 16, y: 11, type: 'npc', label: 'Merchant', interaction: '🧙 "Ah, a traveler! Dangerous roads ahead. Watch yourself."', blocksMovement: true },
          { id: 'npc_guard', x: 2, y: 11, type: 'npc', label: 'Guard', interaction: '⚔️ "The castle gates are open, but mind the king\'s temper!"', blocksMovement: true },
          { id: 'torch1', x: 1, y: 1, type: 'torch', blocksMovement: false },
          { id: 'torch2', x: 18, y: 1, type: 'torch', blocksMovement: false },
          { id: 'torch3', x: 1, y: 14, type: 'torch', blocksMovement: false },
          { id: 'torch4', x: 18, y: 14, type: 'torch', blocksMovement: false },
        ]
      },
  
      // ─── TAVERN ────────────────────────────────────────────────────────
      tavern: {
        id: 'tavern',
        name: 'The Rusty Goblet',
        description: 'A warm tavern filled with the smell of ale and roasted meat.',
        width: 16,
        height: 12,
        theme: 'village',
        floorColor: 0x6b4c2a,
        wallColor: 0x4a321a,
        accentColor: 0xe8a030,
        ambientMessage: '🍺 The tavern buzzes with chatter and laughter.',
        doors: [
          {
            id: 'tavern_to_vs',
            x: 8, y: 11,
            direction: 'south',
            leadsTo: 'village_square',
            spawnX: 10, spawnY: 1,
            label: 'Exit ↓'
          }
        ],
        objects: [
          { id: 'table1', x: 3, y: 4, type: 'table', blocksMovement: true },
          { id: 'table2', x: 3, y: 7, type: 'table', blocksMovement: true },
          { id: 'table3', x: 8, y: 4, type: 'table', blocksMovement: true },
          { id: 'table4', x: 8, y: 7, type: 'table', blocksMovement: true },
          { id: 'table5', x: 13, y: 4, type: 'table', blocksMovement: true },
          { id: 'bookshelf1', x: 1, y: 2, type: 'bookshelf', label: 'Menu', interaction: '📜 Today\'s special: Mystery stew & dragon tail soup.', blocksMovement: true },
          { id: 'npc_innkeeper', x: 12, y: 9, type: 'npc', label: 'Innkeeper', interaction: '🍺 "Room for rent! 10 gold a night. Or listen to my tales for free!"', blocksMovement: true },
          { id: 'npc_bard', x: 5, y: 9, type: 'npc', label: 'Bard', interaction: '🎵 *strums lute* "Have you heard the ballad of the forgotten hero?"', blocksMovement: true },
          { id: 'chest_tavern', x: 14, y: 2, type: 'chest', label: 'Chest', interaction: '🎁 You found a healing potion! (+20 HP)', blocksMovement: true },
          { id: 'torch_t1', x: 1, y: 1, type: 'torch', blocksMovement: false },
          { id: 'torch_t2', x: 14, y: 1, type: 'torch', blocksMovement: false },
        ]
      },
  
      // ─── DUNGEON ENTRANCE ──────────────────────────────────────────────
      dungeon_entrance: {
        id: 'dungeon_entrance',
        name: 'Dungeon Entrance',
        description: 'Damp stone walls drip with moisture. Flickering torches cast long shadows.',
        width: 18,
        height: 14,
        theme: 'dungeon',
        floorColor: 0x2a2a3e,
        wallColor: 0x1a1a2e,
        accentColor: 0x8040c0,
        ambientMessage: '💀 Something lurks in the darkness...',
        doors: [
          {
            id: 'dungeon_to_vs',
            x: 9, y: 0,
            direction: 'north',
            leadsTo: 'village_square',
            spawnX: 10, spawnY: 14,
            label: 'Exit ↑'
          },
          {
            id: 'dungeon_to_deep',
            x: 9, y: 13,
            direction: 'south',
            leadsTo: 'dungeon_depths',
            spawnX: 9, spawnY: 1,
            label: 'Deeper ↓'
          }
        ],
        objects: [
          { id: 'pillar1', x: 3, y: 3, type: 'pillar', blocksMovement: true },
          { id: 'pillar2', x: 14, y: 3, type: 'pillar', blocksMovement: true },
          { id: 'pillar3', x: 3, y: 10, type: 'pillar', blocksMovement: true },
          { id: 'pillar4', x: 14, y: 10, type: 'pillar', blocksMovement: true },
          { id: 'chest_d1', x: 1, y: 12, type: 'chest', label: 'Rusty Chest', interaction: '⚔️ You found a rusty sword! It\'s better than nothing.', blocksMovement: true },
          { id: 'npc_skeleton', x: 6, y: 6, type: 'npc', label: 'Skeleton', interaction: '💀 *rattles bones* "Turn back... while you still can..."', blocksMovement: true },
          { id: 'sign_dungeon', x: 9, y: 2, type: 'sign', label: 'Warning Sign', interaction: '⚠️ WARNING: 47 adventurers have not returned. Enter at own risk.', blocksMovement: false },
          { id: 'barrel_d1', x: 16, y: 5, type: 'barrel', blocksMovement: true },
          { id: 'barrel_d2', x: 16, y: 6, type: 'barrel', blocksMovement: true },
          { id: 'torch_d1', x: 1, y: 5, type: 'torch', blocksMovement: false },
          { id: 'torch_d2', x: 16, y: 8, type: 'torch', blocksMovement: false },
        ]
      },
  
      // ─── DUNGEON DEPTHS ────────────────────────────────────────────────
      dungeon_depths: {
        id: 'dungeon_depths',
        name: 'The Depths',
        description: 'Ancient ruins of a forgotten civilization. The air crackles with dark magic.',
        width: 20,
        height: 16,
        theme: 'cave',
        floorColor: 0x1a0a2a,
        wallColor: 0x0f0818,
        accentColor: 0xff2060,
        ambientMessage: '🔮 Ancient runes glow on the walls...',
        doors: [
          {
            id: 'deep_to_dungeon',
            x: 10, y: 0,
            direction: 'north',
            leadsTo: 'dungeon_entrance',
            spawnX: 9, spawnY: 12,
            label: 'Back ↑'
          }
        ],
        objects: [
          { id: 'throne_evil', x: 10, y: 13, type: 'throne', label: 'Dark Throne', interaction: '👑 An ancient throne radiates dark energy. You sense immense power.', blocksMovement: true },
          { id: 'chest_deep1', x: 1, y: 14, type: 'chest', label: 'Ancient Chest', interaction: '💎 You found the Crystal of Eternity! A legendary artifact!', blocksMovement: true },
          { id: 'chest_deep2', x: 18, y: 14, type: 'chest', label: 'Ancient Chest', interaction: '✨ You found the Star Map! Secrets of the cosmos revealed!', blocksMovement: true },
          { id: 'pillar_d1', x: 4, y: 4, type: 'pillar', blocksMovement: true },
          { id: 'pillar_d2', x: 8, y: 4, type: 'pillar', blocksMovement: true },
          { id: 'pillar_d3', x: 12, y: 4, type: 'pillar', blocksMovement: true },
          { id: 'pillar_d4', x: 16, y: 4, type: 'pillar', blocksMovement: true },
          { id: 'pillar_d5', x: 4, y: 10, type: 'pillar', blocksMovement: true },
          { id: 'pillar_d6', x: 16, y: 10, type: 'pillar', blocksMovement: true },
          { id: 'npc_lich', x: 10, y: 8, type: 'npc', label: 'Lich', interaction: '💀 "FOOL! You dare enter MY domain? Prepare for eternal darkness!"', blocksMovement: true },
          { id: 'fountain_dark', x: 1, y: 8, type: 'fountain', label: 'Dark Pool', interaction: '🌑 The pool shows visions of another world... a world of mirrors.', blocksMovement: true },
          { id: 'torch_dep1', x: 1, y: 1, type: 'torch', blocksMovement: false },
          { id: 'torch_dep2', x: 18, y: 1, type: 'torch', blocksMovement: false },
        ]
      },
  
      // ─── FOREST PATH ──────────────────────────────────────────────────
      forest_path: {
        id: 'forest_path',
        name: 'Whispering Forest',
        description: 'Ancient trees tower above. Sunlight filters through the canopy.',
        width: 20,
        height: 16,
        theme: 'forest',
        floorColor: 0x2d4a1e,
        wallColor: 0x1a2e10,
        accentColor: 0x60c840,
        ambientMessage: '🌿 The forest whispers ancient secrets...',
        doors: [
          {
            id: 'forest_to_vs',
            x: 0, y: 7,
            direction: 'west',
            leadsTo: 'village_square',
            spawnX: 18, spawnY: 7,
            label: '← Village'
          },
          {
            id: 'forest_to_cave',
            x: 19, y: 12,
            direction: 'east',
            leadsTo: 'mystic_cave',
            spawnX: 1, spawnY: 7,
            label: 'Cave →'
          }
        ],
        objects: [
          { id: 'tree1', x: 3, y: 2, type: 'pillar', blocksMovement: true },
          { id: 'tree2', x: 7, y: 1, type: 'pillar', blocksMovement: true },
          { id: 'tree3', x: 12, y: 3, type: 'pillar', blocksMovement: true },
          { id: 'tree4', x: 16, y: 2, type: 'pillar', blocksMovement: true },
          { id: 'tree5', x: 5, y: 11, type: 'pillar', blocksMovement: true },
          { id: 'tree6', x: 9, y: 13, type: 'pillar', blocksMovement: true },
          { id: 'tree7', x: 14, y: 12, type: 'pillar', blocksMovement: true },
          { id: 'tree8', x: 18, y: 5, type: 'pillar', blocksMovement: true },
          { id: 'tree9', x: 2, y: 14, type: 'pillar', blocksMovement: true },
          { id: 'npc_elf', x: 10, y: 7, type: 'npc', label: 'Forest Elf', interaction: '🧝 "The cave to the east holds great power. But beware the guardian!"', blocksMovement: true },
          { id: 'chest_forest', x: 17, y: 14, type: 'chest', label: 'Hollow Log', interaction: '🌿 You found herbs and berries. Nature provides!', blocksMovement: true },
          { id: 'sign_forest', x: 5, y: 6, type: 'sign', label: 'Carved Tree', interaction: '🌳 "D.R. + E.L. — May the forest remember us always."', blocksMovement: false },
          { id: 'fountain_spring', x: 10, y: 12, type: 'fountain', label: 'Forest Spring', interaction: '💧 Pure spring water. You drink deeply. HP fully restored!', blocksMovement: true },
        ]
      },
  
      // ─── MYSTIC CAVE ──────────────────────────────────────────────────
      mystic_cave: {
        id: 'mystic_cave',
        name: 'Crystal Cavern',
        description: 'Glowing crystals illuminate the cave in shimmering blue light.',
        width: 16,
        height: 14,
        theme: 'cave',
        floorColor: 0x0a1a2e,
        wallColor: 0x060f1e,
        accentColor: 0x40c0ff,
        ambientMessage: '💎 The crystals hum with ancient energy...',
        doors: [
          {
            id: 'cave_to_forest',
            x: 0, y: 7,
            direction: 'west',
            leadsTo: 'forest_path',
            spawnX: 18, spawnY: 12,
            label: '← Forest'
          }
        ],
        objects: [
          { id: 'crystal1', x: 3, y: 2, type: 'pillar', blocksMovement: true },
          { id: 'crystal2', x: 12, y: 2, type: 'pillar', blocksMovement: true },
          { id: 'crystal3', x: 3, y: 11, type: 'pillar', blocksMovement: true },
          { id: 'crystal4', x: 12, y: 11, type: 'pillar', blocksMovement: true },
          { id: 'crystal5', x: 7, y: 5, type: 'pillar', blocksMovement: true },
          { id: 'crystal6', x: 7, y: 9, type: 'pillar', blocksMovement: true },
          { id: 'fountain_crystal', x: 8, y: 7, type: 'fountain', label: 'Crystal Pool', interaction: '🔮 The pool shows your destiny. The path ahead is full of wonder.', blocksMovement: true },
          { id: 'chest_crystal1', x: 1, y: 2, type: 'chest', label: 'Crystal Chest', interaction: '💎 LEGENDARY ITEM: The Crystal Sword! Power level: 9000!', blocksMovement: true },
          { id: 'chest_crystal2', x: 14, y: 11, type: 'chest', label: 'Crystal Chest', interaction: '✨ You found the Ancient Tome. Its knowledge fills your mind!', blocksMovement: true },
          { id: 'npc_spirit', x: 8, y: 2, type: 'npc', label: 'Cave Spirit', interaction: '👻 "Seeker... the crystal is the key. The dungeon holds the lock. Unite them."', blocksMovement: true },
        ]
      },
  
      // ─── CASTLE GATE ──────────────────────────────────────────────────
      castle_gate: {
        id: 'castle_gate',
        name: 'Castle Courtyard',
        description: 'Grand stone walls surround you. Royal banners snap in the wind.',
        width: 20,
        height: 16,
        theme: 'castle',
        floorColor: 0x4a4a5a,
        wallColor: 0x2a2a3a,
        accentColor: 0xf0c040,
        ambientMessage: '🏰 The castle stands proud and ancient.',
        doors: [
          {
            id: 'castle_to_vs',
            x: 19, y: 7,
            direction: 'east',
            leadsTo: 'village_square',
            spawnX: 1, spawnY: 7,
            label: 'Village →'
          },
          {
            id: 'castle_to_throne',
            x: 10, y: 0,
            direction: 'north',
            leadsTo: 'throne_room',
            spawnX: 10, spawnY: 14,
            label: 'Throne ↑'
          }
        ],
        objects: [
          { id: 'pillar_c1', x: 3, y: 3, type: 'pillar', blocksMovement: true },
          { id: 'pillar_c2', x: 16, y: 3, type: 'pillar', blocksMovement: true },
          { id: 'pillar_c3', x: 3, y: 12, type: 'pillar', blocksMovement: true },
          { id: 'pillar_c4', x: 16, y: 12, type: 'pillar', blocksMovement: true },
          { id: 'pillar_c5', x: 3, y: 7, type: 'pillar', blocksMovement: true },
          { id: 'pillar_c6', x: 16, y: 7, type: 'pillar', blocksMovement: true },
          { id: 'fountain_castle', x: 10, y: 8, type: 'fountain', label: 'Royal Fountain', interaction: '👑 The royal fountain. Water flows with gold flakes.', blocksMovement: true },
          { id: 'npc_knight1', x: 6, y: 13, type: 'npc', label: 'Knight', interaction: '⚔️ "Halt! State your business in the royal courtyard."', blocksMovement: true },
          { id: 'npc_knight2', x: 13, y: 13, type: 'npc', label: 'Knight', interaction: '🛡️ "The king awaits in the throne room. Do not keep him waiting!"', blocksMovement: true },
          { id: 'chest_castle', x: 18, y: 2, type: 'chest', label: 'Royal Chest', interaction: '🏆 You found the Royal Signet Ring! Guards now respect you.', blocksMovement: true },
          { id: 'sign_castle', x: 7, y: 14, type: 'sign', label: 'Royal Decree', interaction: '📜 "By order of King Aldric: No dragons in the courtyard. Offenders will be fined."', blocksMovement: false },
          { id: 'torch_c1', x: 1, y: 1, type: 'torch', blocksMovement: false },
          { id: 'torch_c2', x: 18, y: 1, type: 'torch', blocksMovement: false },
        ]
      },
  
      // ─── THRONE ROOM ──────────────────────────────────────────────────
      throne_room: {
        id: 'throne_room',
        name: 'The Royal Throne Room',
        description: 'Magnificent tapestries line golden walls. The king\'s presence commands respect.',
        width: 18,
        height: 14,
        theme: 'throne',
        floorColor: 0x3a2a0a,
        wallColor: 0x2a1a05,
        accentColor: 0xffd700,
        ambientMessage: '👑 You stand before the throne of King Aldric.',
        doors: [
          {
            id: 'throne_to_castle',
            x: 9, y: 13,
            direction: 'south',
            leadsTo: 'castle_gate',
            spawnX: 10, spawnY: 1,
            label: 'Courtyard ↓'
          }
        ],
        objects: [
          { id: 'throne_main', x: 9, y: 2, type: 'throne', label: 'Royal Throne', interaction: '👑 The throne of King Aldric. You feel the weight of destiny.', blocksMovement: true },
          { id: 'npc_king', x: 9, y: 3, type: 'npc', label: 'King Aldric', interaction: '👑 "Brave adventurer! The realm is in peril. Seek the Crystal of Eternity in the deep dungeon. Return it, and I shall grant you lordship of these lands!"', blocksMovement: true },
          { id: 'npc_advisor', x: 5, y: 4, type: 'npc', label: 'Royal Advisor', interaction: '📚 "The Crystal lies in the Dungeon Depths, beyond the dungeon entrance south of the village."', blocksMovement: true },
          { id: 'npc_princess', x: 13, y: 4, type: 'npc', label: 'Princess Lyra', interaction: '👸 "Please, hero! Bring the Crystal before darkness consumes the land! I believe in you!"', blocksMovement: true },
          { id: 'pillar_t1', x: 2, y: 2, type: 'pillar', blocksMovement: true },
          { id: 'pillar_t2', x: 15, y: 2, type: 'pillar', blocksMovement: true },
          { id: 'pillar_t3', x: 2, y: 8, type: 'pillar', blocksMovement: true },
          { id: 'pillar_t4', x: 15, y: 8, type: 'pillar', blocksMovement: true },
          { id: 'bookshelf_t1', x: 1, y: 5, type: 'bookshelf', label: 'Royal Archives', interaction: '📖 Ancient history: "The Crystal of Eternity was hidden by the Lich after the Great War."', blocksMovement: true },
          { id: 'bookshelf_t2', x: 16, y: 5, type: 'bookshelf', label: 'Royal Archives', interaction: '📖 "Legend speaks of a brave soul who shall wield the Crystal against darkness."', blocksMovement: true },
          { id: 'chest_throne', x: 1, y: 12, type: 'chest', label: 'Royal Treasury', interaction: '💰 You found 500 Gold Coins! The kingdom\'s gratitude.', blocksMovement: true },
          { id: 'torch_th1', x: 1, y: 1, type: 'torch', blocksMovement: false },
          { id: 'torch_th2', x: 16, y: 1, type: 'torch', blocksMovement: false },
          { id: 'torch_th3', x: 1, y: 11, type: 'torch', blocksMovement: false },
          { id: 'torch_th4', x: 16, y: 11, type: 'torch', blocksMovement: false },
        ]
      }
    }
  
    const startRoom = 'village_square'
    const startX = 10
    const startY = 8
  
    return { rooms, TILE, startRoom, startX, startY }
  }