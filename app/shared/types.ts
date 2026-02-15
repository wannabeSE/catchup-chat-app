interface Conversation {
  id: string;
  name: string | null;
  is_group: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface Participant {
  id: string;
  conversation_id: string;
  user_id: string;
  joined_at: string;
}

export type { Conversation, Message, Participant };
