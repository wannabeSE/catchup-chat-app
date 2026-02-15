import { createPinia, setActivePinia } from 'pinia'
import { defineNuxtPlugin } from '#app'

export default defineNuxtPlugin((nuxtApp) => {
  const pinia = createPinia()
  // Ensure there's an active Pinia instance available immediately
  // (helps when stores are accessed very early)
  try {
    setActivePinia(pinia as any)
  } catch (e) {
    // ignore if not available
  }

  nuxtApp.vueApp.use(pinia)

  // expose for devtools/debugging
  if (process.client) {
    // @ts-ignore
    window.$pinia = pinia
  }
})

