<template>
    <div class="chat-container min-h-screen w-screen bg-black text-white">
      <!-- messages list -->
      <div v-for="msg in messages" :key="msg.id" :class="msg.user_id === user?.id ? 'own' : 'other'">
        <strong class="text-red-500">{{ msg.profiles?.username || 'User' }}:</strong> 
        <span class="text-white">{{ msg.content }}</span>
        <small class="text-blue-500">{{ new Date(msg.created_at).toLocaleTimeString() }}</small>
      </div>
  
      <!-- input -->
      <form @submit.prevent="sendMessage">
        <input
          v-model="messageInput"
          placeholder="Type a message..."
          @keyup.enter="sendMessage"
          autofocus
        />
        <button type="submit" :disabled="!messageInput.trim()">Send</button>
      </form>
    </div>
  </template>
<script setup lang="ts">
type Message = {
  content: string;
  created_at: string;
}
import { v4 as uuidv4 } from 'uuid';
const { supabase } = useSupabase();
const user = useState("auth.user");
const loading = ref(true);
const messages = ref<Message[]>([])
const messageInput = ref('')
const createChannel = () => {
  const channel = supabase.channel('messages-channel')
  channel.on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "messages" },
    (payload) => {
      messages.value.push({
        content: payload.new.content,
        created_at: payload.new.created_at,
      })
      //console.log(messages.value)
    }
  );
  channel.subscribe();
  //return channel
};
onMounted(async () => {
    createChannel()
});
const sendMessage = async () => {
  if (user.value?.id === null) {
    return;
  }
  const { data, error } = await supabase.from('messages').insert({
    room_id: uuidv4(),
    content: messageInput.value,
    user_id: user.value?.id,
  }).select()
  // messages.value.push({
  //   id: data?.id,
  //   user_id: user.value?.id as string,
  //   content: messageInput.value,
  //   created_at: data?.created_at,
  // } as Message)
  messages.value.push({
    content: messageInput.value,
    created_at: new Date().toISOString(),
  } as Message)
  messageInput.value = ''
  // console.log(data)
  // console.log(error)
  console.log(messages.value);
  
}
</script>
