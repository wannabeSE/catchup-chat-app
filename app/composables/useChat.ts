import type { Conversation, Message } from "~/shared/types";
export const useChat = () => {
  const { supabase } = useSupabase();
  async function getOrCreateConversation(otherUserId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error("Not authenticated");
      return null;
    }

    // Check if conversation already exists (if you're using conversation_participants)
    const { data: existing } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .in("user_id", [user.id, otherUserId]);

    // Find conversation where both users are participants
    const conversationIds = existing?.map((p) => p.conversation_id) || [];
    const counts = conversationIds.reduce((acc, id) => {
      acc[id] = (acc[id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const existingConvId = Object.keys(counts).find((id) => counts[id] === 2);

    if (existingConvId) {
      return existingConvId;
    }

    // Create new conversation - no user_a/user_b needed!
    const { data: newConv, error: createError } = await supabase
      .from("conversations")
      .insert({}) // ✅ Empty insert works now
      .select()
      .single();

    if (createError) {
      console.error("Failed to create conversation:", createError);
      return null;
    }

    // Add both users as participants
    await supabase.from("conversation_participants").insert([
      { conversation_id: newConv.id, user_id: user.id },
      { conversation_id: newConv.id, user_id: otherUserId },
    ]);

    return newConv.id;
  }

  async function createDuoConversation(
    otherUserId: string
  ): Promise<string | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      console.error("Not authenticated");
      return null;
    }

    console.log("Creating/finding duo conversation");
    console.log("Current user:", user.id);
    console.log("Other user:", otherUserId);

    // Better approach: Use a single query with proper filtering
    const { data: existingConversations, error: queryError } = await supabase
      .from("conversations")
      .select(
        `
        id,
        is_group,
        conversation_participants!inner(user_id)
      `
      )
      .eq("is_group", false);

    console.log("Query result:", { existingConversations, queryError });

    if (queryError) {
      console.error("Query error:", queryError);
      return null;
    }

    // Find a conversation where both users are participants
    const duoConversation = existingConversations?.find((conv) => {
      const participantIds = conv.conversation_participants.map(
        (p: any) => p.user_id
      );
      return (
        participantIds.length === 2 &&
        participantIds.includes(user.id) &&
        participantIds.includes(otherUserId)
      );
    });

    if (duoConversation) {
      console.log("Found existing duo conversation:", duoConversation.id);
      return duoConversation.id;
    }

    // Create new duo conversation
    console.log("Creating new duo conversation");

    const { data: newConv, error: convError } = await supabase
      .from("conversations")
      .insert({
        is_group: false,
        created_by: user.id,
      })
      .select()
      .single();
    if (convError || !newConv) {
      console.error("Failed to create conversation:", convError);
      return null;
    }

    console.log("New conversation created:", newConv.id);

    // Add both participants
    const { error: participantsError } = await supabase
      .from("conversation_participants")
      .insert([
        { conversation_id: newConv.id, user_id: user.id },
        { conversation_id: newConv.id, user_id: otherUserId },
      ]);

    if (participantsError) {
      console.error("Failed to add participants:", participantsError);
      return null;
    }

    console.log("Participants added successfully");
    return newConv.id;
  }

  async function createGroupConversation(
    groupName: string,
    participantIds: string[]
  ): Promise<string | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // Create group conversation
    const { data: newConv, error: convError } = await supabase
      .from("conversations")
      .insert({
        name: groupName,
        is_group: true,
        created_by: user.id,
      })
      .select()
      .single();

    if (convError || !newConv) {
      console.error("Failed to create group:", convError);
      return null;
    }

    // Add creator + all participants
    const allParticipants = [user.id, ...participantIds]
      .filter((id, index, self) => self.indexOf(id) === index) // Remove duplicates
      .map((userId) => ({
        conversation_id: newConv.id,
        user_id: userId,
      }));

    const { error: participantsError } = await supabase
      .from("conversation_participants")
      .insert(allParticipants);

    if (participantsError) {
      console.error("Failed to add participants:", participantsError);
      return null;
    }

    return newConv.id;
  }

  // =====================================================
  // SEND MESSAGE
  // =====================================================
  async function sendMessage(
    conversationId: string,
    content: string
  ): Promise<boolean> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: content.trim(),
    });

    if (error) {
      console.error("Failed to send message:", error);
      return false;
    }
    return true;
  }

  // =====================================================
  // GET CONVERSATIONS
  // =====================================================
  async function getMyConversations(): Promise<Conversation[]> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("conversations")
      .select(
        `
      *,
      conversation_participants!inner(user_id)
    `
      )
      .eq("conversation_participants.user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch conversations:", error);
      return [];
    }

    return data || [];
  }

  // =====================================================
  // GET MESSAGES
  // =====================================================
  async function getMessages(conversationId: string): Promise<Message[]> {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to fetch messages:", error);
      return [];
    }

    return data || [];
  }

  // =====================================================
  // SUBSCRIBE TO NEW MESSAGES
  // =====================================================
  function subscribeToMessages(
    conversationId: string,
    callback: (message: Message) => void
  ) {
    console.log('🔌 Setting up realtime subscription for:', conversationId)
    
    const channel = supabase
      .channel(`conversation-${conversationId}`) // Use unique channel name
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          console.log('📨 Realtime message received:', payload.new)
          callback(payload.new as Message)
        }
      )
      .subscribe((status) => {
        console.log('📡 Subscription status:', status)
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to conversation:', conversationId)
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Subscription failed')
        }
      })

    // Return cleanup function
    return () => {
      console.log('🔌 Unsubscribing from conversation:', conversationId)
      supabase.removeChannel(channel)
    }
  }

  // =====================================================
  // ADD PARTICIPANT TO GROUP
  // =====================================================
  async function addParticipantToGroup(
    conversationId: string,
    userId: string
  ): Promise<boolean> {
    const { error } = await supabase.from("conversation_participants").insert({
      conversation_id: conversationId,
      user_id: userId,
    });

    if (error) {
      console.error("Failed to add participant:", error);
      return false;
    }

    return true;
  }

  // =====================================================
  // LEAVE CONVERSATION
  // =====================================================
  async function leaveConversation(conversationId: string): Promise<boolean> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from("conversation_participants")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to leave conversation:", error);
      return false;
    }

    return true;
  }
  return {
    getOrCreateConversation,
    createDuoConversation,
    createGroupConversation,
    sendMessage,
    getMyConversations,
    getMessages,
    subscribeToMessages,
    addParticipantToGroup,
    leaveConversation,
  };
};
