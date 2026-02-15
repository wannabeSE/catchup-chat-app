<template>
  <div class="flex flex-col h-screen bg-gray-100">
    <!-- Messages Container -->
    <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-4">
      <div 
        v-for="msg in messages" 
        :key="msg.id" 
        class="flex"
        :class="msg.sender_id === currentUserId ? 'justify-end' : 'justify-start'"
      >
        <!-- Message Bubble -->
        <div 
          class="max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-2xl shadow"
          :class="msg.sender_id === currentUserId 
            ? 'bg-blue-500 text-white rounded-br-none' 
            : 'bg-white text-gray-800 rounded-bl-none'"
        >
          <p class="text-sm break-words">{{ msg.content }}</p>
          <p 
            class="text-xs mt-1"
            :class="msg.sender_id === currentUserId ? 'text-blue-100' : 'text-gray-500'"
          >
            {{ new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
          </p>
        </div>
      </div>
    </div>
    
    <!-- Input Area -->
    <div class="bg-white border-t border-gray-200 p-4">
      <div class="flex items-center gap-2 max-w-4xl mx-auto">
        <input 
          v-model="messageInput" 
          @keyup.enter="send"
          placeholder="Type a message..."
          class="flex-1 px-4 py-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button 
          @click="send"
          :disabled="!messageInput.trim()"
          class="px-6 py-3 bg-blue-500 text-white rounded-full font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
    </div>
    
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import type { Message } from '~/shared/types'
import { useChat } from '~/composables/useChat'

const conversationId = ref<string | null>(null)
const messages = ref<Message[]>([])
const messageInput = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

const route = useRoute()
const otherUserId = route.params.id as string
const { session, userId } = await useCheckSession()
const currentUserId = userId

let unsubscribe: (() => void) | null = null

const { 
  createDuoConversation, 
  createGroupConversation, 
  getMessages, 
  subscribeToMessages, 
  sendMessage 
} = useChat()

// Auto-scroll to bottom when new messages arrive
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// Watch messages array and scroll when it changes
watch(messages, () => {
  scrollToBottom()
}, { deep: true })

// Initialize conversation (duo or group)
async function initDuoChat(otherUserId: string) {
  console.log('Initializing duo chat with:', otherUserId)
  
  conversationId.value = await createDuoConversation(otherUserId)
  console.log('Conversation ID:', conversationId.value)
  
  if (conversationId.value) {
    await loadMessages()
    subscribeToNewMessages()
  }
}

async function loadMessages() {
  if (!conversationId.value) return
  
  console.log('Loading messages for conversation:', conversationId.value)
  messages.value = await getMessages(conversationId.value)
  console.log('Loaded messages:', messages.value.length)
  
  scrollToBottom()
}

function subscribeToNewMessages() {
  if (!conversationId.value) return
  
  console.log('Subscribing to messages for conversation:', conversationId.value)
  
  unsubscribe = subscribeToMessages(conversationId.value, (newMessage) => {
    console.log('New message received:', newMessage)
    
    // Check if message already exists (prevent duplicates)
    const exists = messages.value.some(msg => msg.id === newMessage.id)
    if (!exists) {
      messages.value.push(newMessage)
    }
  })
  console.log(unsubscribe);
  
  console.log('Subscription set up')
}

async function send() {
  if (!messageInput.value.trim() || !conversationId.value) return
  
  console.log('Sending message:', messageInput.value)
  
  const success = await sendMessage(conversationId.value, messageInput.value)
  
  if (success) {
    console.log('Message sent successfully')
    messageInput.value = ''
    // Don't manually add the message here - let the subscription handle it
  } else {
    console.error('Failed to send message')
  }
}

onMounted(async () => {
  console.log('Component mounted')
  await initDuoChat(otherUserId)
})

onUnmounted(() => {
  console.log('Component unmounting, cleaning up subscription')
  if (unsubscribe) {
    unsubscribe()
  }
})
</script>