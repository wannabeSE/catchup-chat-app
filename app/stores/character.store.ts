import { defineStore } from "pinia";
import { useSupabase } from "~/composables/useSupabase";
import type { Position } from "~/types/shared";
import {
  isPositionWithinMapBounds,
  pickRandomHeroSpawnPosition,
} from "~/constants/world-constants";

export type WorldSpawnContext = {
  tileSize: number;
  mapWidth: number;
  mapHeight: number;
};

export const useCharacterStore = defineStore("character", {
  state: () => ({
    currentUserId: null as string | null,
    characters: [] as any[],
    chatAreas: [] as any[],
    currentArea: null as string | null,
    subscription: null as any,
  }),

  actions: {
    async initialize(userId: string) {
      this.currentUserId = userId;
      await this.fetchChatAreas();
      await this.fetchCharacters();
    },

    /**
     * Load or create the user's row for GameWorld: reuse saved x/y when in bounds,
     * otherwise a random spawn from fixed hero spawn tiles.
     */
    async ensureWorldCharacter(userId: string, ctx: WorldSpawnContext) {
      this.currentUserId = userId;
      const { supabase } = useSupabase();

      const { data: existing, error: selectError } = await supabase
        .from("characters")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (selectError) {
        console.error("ensureWorldCharacter select:", selectError);
        return null;
      }

      if (existing) {
        await supabase
          .from("characters")
          .update({ is_online: true })
          .eq("user_id", userId);

        let x = existing.x as number;
        let y = existing.y as number;
        if (
          !isPositionWithinMapBounds(
            { x, y },
            ctx.tileSize,
            ctx.mapWidth,
            ctx.mapHeight,
          )
        ) {
          const pos = pickRandomHeroSpawnPosition(ctx.tileSize);
          x = pos.x;
          y = pos.y;
          await supabase
            .from("characters")
            .update({ x, y })
            .eq("user_id", userId);
        }

        const merged = { ...existing, x, y };
        const idx = this.characters.findIndex((c) => c.user_id === userId);
        if (idx !== -1) this.characters.splice(idx, 1, merged);
        else this.characters.push(merged);
        return merged;
      }

      const pos = pickRandomHeroSpawnPosition(ctx.tileSize);

      const { data: created, error: insertError } = await supabase
        .from("characters")
        .insert({
          user_id: userId,
          x: pos.x,
          y: pos.y,
          is_online: true,
        })
        .select()
        .single();

      if (insertError) {
        console.error("ensureWorldCharacter insert:", insertError);
        return null;
      }

      if (created) this.characters.push(created);
      return created;
    },

    async persistWorldPosition(userId: string, position: Position) {
      const { supabase } = useSupabase();
      const { error } = await supabase
        .from("characters")
        .update({ x: position.x, y: position.y })
        .eq("user_id", userId);
      if (error) console.error("persistWorldPosition:", error);
    },

    async moveCharacter(direction: string) {
      const step = 20;
      const character = this.characters.find(
        (c) => c.user_id === this.currentUserId,
      );

      if (!character) return;

      const updates = { ...character };

      switch (direction) {
        case "up":
          updates.y = Math.max(0, character.y - step);
          break;
        case "down":
          updates.y = Math.min(580, character.y + step);
          break;
        case "left":
          updates.x = Math.max(0, character.x - step);
          break;
        case "right":
          updates.x = Math.min(780, character.x + step);
          break;
      }

      // Check if entering chat area
      const enteredArea = this.chatAreas.find(
        (area) =>
          updates.x >= area.x &&
          updates.x <= area.x + area.width &&
          updates.y >= area.y &&
          updates.y <= area.y + area.height,
      );

      if (enteredArea) {
        this.currentArea = enteredArea.id;
      }

      // Update in database
      const { supabase } = useSupabase();
      await supabase
        .from("characters")
        .update(updates)
        .eq("user_id", this.currentUserId);
    },
    async updateCurrentArea(areaId: string) {
      const { supabase } = useSupabase();
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
          .from("characters")
          .update({ current_area_id: areaId })
          .eq("user_id", user.id);

        if (error) throw error;

        this.currentArea = areaId;
      } catch (error) {
        console.error("Error updating area:", error);
      }
    },

    // Fetch chat areas from database (tries common table names)
    async fetchChatAreas() {
      const { supabase } = useSupabase();
      try {
        let { data, error } = await supabase.from("chat_areas").select("*");
        if (error || !data || data.length === 0) {
          const res = await supabase.from("areas").select("*");
          data = res.data;
          error = res.error;
        }
        if (!error && data) {
          this.chatAreas = data;
        }
      } catch (e) {
        console.error("Error fetching chat areas:", e);
      }
    },

    // Fetch characters (optionally filtered by world)
    async fetchCharacters(worldId?: string) {
      const { supabase } = useSupabase();
      try {
        let query = supabase.from("characters").select("*");
        if (worldId) query = query.eq("world_id", worldId);
        const { data, error } = await query;
        if (!error && data) {
          this.characters = data;
        }
      } catch (e) {
        console.error("Error fetching characters:", e);
      }
    },

    async subscribeToWorld(worldId?: string) {
      const { supabase } = useSupabase();

      // Initial population
      await this.fetchCharacters(worldId);

      this.subscription = supabase
        .channel("world-updates")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "characters",
          },
          async (payload: any) => {
            try {
              if (payload.new) {
                const idx = this.characters.findIndex((c) => c.id === payload.new.id);
                if (idx !== -1) {
                  this.characters.splice(idx, 1, payload.new);
                } else {
                  this.characters.push(payload.new);
                }
                if (payload.new.user_id === this.currentUserId) {
                  this.currentArea = payload.new.current_area_id;
                }
              }

              if (payload.old) {
                this.characters = this.characters.filter((c) => c.id !== payload.old.id);
              }
            } catch (e) {
              console.error("Error handling world update payload:", e);
            }
          },
        )
        .subscribe();
    },

    unsubscribe() {
      if (this.subscription) {
        this.subscription.unsubscribe();
        this.subscription = null;
      }
    },
  },
});
