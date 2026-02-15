import { defineStore } from "pinia";
import { useSupabase } from "~/composables/useSupabase";

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

      // Create or fetch user's character
      const { supabase } = useSupabase();

      const { data: character } = await supabase
        .from("characters")
        .upsert({
          user_id: userId,
          x: Math.random() * 700,
          y: Math.random() * 500,
          is_online: true,
        })
        .select()
        .single();

      if (character) {
        this.characters.push(character);
      }

      // Fetch existing chat areas and characters
      await this.fetchChatAreas();
      await this.fetchCharacters();
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
