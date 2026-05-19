import { defineStore } from "pinia";
import { useSupabase } from "~/composables/useSupabase";

/** Realtime `postgres_changes` filters only support a single column; narrow in the handler. */
function messageMatchesArea(
  row: { area_id?: string | null },
  areaId: string | null,
) {
  if (areaId) return row.area_id === areaId;
  return row.area_id == null;
}

export const useChatStore = defineStore("chat", {
  state: () => ({
    messages: [],
    currentArea: null,
    charactersInArea: [],
    subscription: null,
    isLoading: false,
    error: null,
  }),

  actions: {
    // Subscribe to messages in a specific area
    async subscribeToMessages(worldId, areaId = null) {
      const { supabase } = useSupabase();

      // Unsubscribe from previous subscription
      if (this.subscription) {
        this.unsubscribe();
      }

      // Get existing messages
      await this.fetchMessages(worldId, areaId);

      // Subscribe to new messages (one filter column only — see Supabase Realtime docs)
      this.subscription = supabase
        .channel(`messages-world-${worldId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `world_id=eq.${worldId}`,
          },
          (payload) => {
            if (!messageMatchesArea(payload.new, areaId)) return;
            this.enrichMessageWithUser(payload.new).then((enrichedMessage) => {
              this.messages.push(enrichedMessage);
            });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "messages",
            filter: `world_id=eq.${worldId}`,
          },
          (payload) => {
            const id = (payload.old as { id?: string })?.id;
            if (!id || !this.messages.some((m) => m.id === id)) return;
            this.messages = this.messages.filter((msg) => msg.id !== id);
          },
        )
        .subscribe((status) => {
          if (import.meta.dev && status === "CHANNEL_ERROR") {
            console.error(
              "[chat] Realtime subscription error. Check: Database → Publications → `supabase_realtime` includes `messages`, and RLS allows SELECT for this user.",
            );
          }
        });

      // Subscribe to character presence in area
      await this.subscribeToAreaPresence(areaId);
    },

    // Fetch initial messages
    async fetchMessages(worldId, areaId = null) {
      this.isLoading = true;
      try {
        const { supabase } = useSupabase();

        let query = supabase
          .from("messages")
          .select("*")
          .eq("world_id", worldId)
          .order("created_at", { ascending: true })
          .limit(100);

        if (areaId) {
          query = query.eq("area_id", areaId);
        } else {
          query = query.is("area_id", null);
        }

        const { data: messages, error } = await query;

        if (error) throw error;

        // Enrich messages with user data
        const enrichedMessages = await Promise.all(
          messages.map(async (message) => {
            return await this.enrichMessageWithUser(message);
          }),
        );

        this.messages = enrichedMessages;
        this.error = null;
      } catch (error) {
        console.error("Error fetching messages:", error);
        this.error = error.message;
      } finally {
        this.isLoading = false;
      }
    },

    // Send a new message
    async sendMessage(messageData) {
      const { supabase } = useSupabase();
      const user = useSupabaseUser();

      if (!user.value) {
        throw new Error("User not authenticated");
      }

      try {
        const { data, error } = await supabase
          .from("messages")
          .insert([
            {
              user_id: user.value.id,
              content: messageData.content,
              world_id: messageData.world_id,
              area_id: messageData.area_id || null,
              created_at: new Date().toISOString(),
            },
          ])
          .select()
          .single();

        if (error) throw error;

        // Enrich and add to local state
        const enrichedMessage = await this.enrichMessageWithUser(data);
        this.messages.push(enrichedMessage);

        return data;
      } catch (error) {
        console.error("Error sending message:", error);
        throw error;
      }
    },

    // Enrich message with user profile data
    async enrichMessageWithUser(message) {
      const { supabase } = useSupabase();

      try {
        // Get user profile
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("username, avatar_style")
          .eq("id", message.user_id)
          .single();

        if (profileError) throw profileError;

        // Get character info (for current position/status)
        const { data: character } = await supabase
          .from("characters")
          .select("is_online, color")
          .eq("user_id", message.user_id)
          .single();

        return {
          ...message,
          username: profile?.username || `User_${message.user_id.slice(0, 8)}`,
          avatar: profile?.avatar_style
            ? `https://api.dicebear.com/6.x/${profile.avatar_style}/svg?seed=${message.user_id}`
            : `https://api.dicebear.com/6.x/avataaars/svg?seed=${message.user_id}`,
          is_online: character?.is_online || false,
          color: character?.color || "#3B82F6",
        };
      } catch (error) {
        console.error("Error enriching message:", error);
        return {
          ...message,
          username: `User_${message.user_id.slice(0, 8)}`,
          avatar: `https://api.dicebear.com/6.x/avataaars/svg?seed=${message.user_id}`,
          is_online: false,
          color: "#3B82F6",
        };
      }
    },

    // Get characters currently in the same area
    async subscribeToAreaPresence(areaId) {
      const { supabase } = useSupabase();

      // Initial fetch
      await this.fetchCharactersInArea(areaId);

      // Subscribe to character updates
      supabase
        .channel("area-presence")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "characters",
          },
          () => {
            this.fetchCharactersInArea(areaId);
          },
        )
        .subscribe();
    },

    async fetchCharactersInArea(areaId) {
      const { supabase } = useSupabase();

      let query = supabase
        .from("characters")
        .select("*, profiles(username, avatar_style)")
        .eq("is_online", true);

      if (areaId) {
        query = query.eq("current_area_id", areaId);
      } else {
        query = query.is("current_area_id", null);
      }

      const { data: characters, error } = await query;

      if (!error && characters) {
        this.charactersInArea = characters.map((character) => ({
          ...character,
          username:
            character.profiles?.username ||
            `User_${character.user_id.slice(0, 8)}`,
          avatar_url: character.profiles?.avatar_style
            ? `https://api.dicebear.com/6.x/${character.profiles.avatar_style}/svg?seed=${character.user_id}`
            : character.avatar_url,
        }));
      }
    },

    // Get chat history for a specific user
    async getDirectMessages(userId) {
      const { supabase } = useSupabase();
      const currentUser = useSupabaseUser();

      if (!currentUser.value) return [];

      try {
        const { data: messages, error } = await supabase
          .from("messages")
          .select("*")
          .or(
            `and(sender_id.eq.${currentUser.value.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${currentUser.value.id})`,
          )
          .order("created_at", { ascending: true })
          .limit(50);

        if (error) throw error;

        // Enrich messages
        const enrichedMessages = await Promise.all(
          messages.map((msg) => this.enrichMessageWithUser(msg)),
        );

        return enrichedMessages;
      } catch (error) {
        console.error("Error fetching DMs:", error);
        return [];
      }
    },

    // Send direct message
    async sendDirectMessage(receiverId, content) {
      const { supabase } = useSupabase();
      const user = useSupabaseUser();

      if (!user.value) {
        throw new Error("User not authenticated");
      }

      try {
        const { data, error } = await supabase
          .from("private_messages")
          .insert([
            {
              sender_id: user.value.id,
              receiver_id: receiverId,
              content: content,
              created_at: new Date().toISOString(),
              read: false,
            },
          ])
          .select()
          .single();

        if (error) throw error;
        return data;
      } catch (error) {
        console.error("Error sending DM:", error);
        throw error;
      }
    },

    // Mark messages as read
    async markMessagesAsRead(messageIds) {
      const { supabase } = useSupabase();

      try {
        const { error } = await supabase
          .from("private_messages")
          .update({ read: true })
          .in("id", messageIds)
          .eq("receiver_id", useSupabaseUser().value.id);

        if (error) throw error;
      } catch (error) {
        console.error("Error marking messages as read:", error);
      }
    },

    // Clear messages for current area
    clearMessages() {
      this.messages = [];
    },

    // Unsubscribe from real-time updates
    unsubscribe() {
      if (this.subscription) {
        this.subscription.unsubscribe();
        this.subscription = null;
      }
    },

    // Cleanup on store destroy
    $reset() {
      this.unsubscribe();
      this.messages = [];
      this.charactersInArea = [];
      this.currentArea = null;
      this.error = null;
    },
  },

  getters: {
    // Get unread message count
    unreadCount: (state) => {
      return state.messages.filter(
        (msg) => !msg.read && msg.user_id !== useSupabaseUser()?.value?.id,
      ).length;
    },

    // Get recent messages (last 50)
    recentMessages: (state) => {
      return state.messages.slice(-50);
    },

    // Get messages grouped by date
    messagesByDate: (state) => {
      const groups = {};
      state.messages.forEach((message) => {
        const date = new Date(message.created_at).toLocaleDateString();
        if (!groups[date]) {
          groups[date] = [];
        }
        groups[date].push(message);
      });
      return groups;
    },

    // Get online users in area
    onlineUsers: (state) => {
      return state.charactersInArea.filter((char) => char.is_online);
    },

    // Get area name
    areaName: (state) => {
      return state.currentArea?.name || "Global Chat";
    },
  },
});
