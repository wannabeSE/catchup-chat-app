export default defineNuxtPlugin(async (nuxtApp) => {
    const supabase = useSupabase()
    const user = useState('auth.user', () => null)
  
    // Restore session on app start
    const { data: { session } } = await supabase.auth.getSession()
    user.value = session?.user ?? null
  
    // Listen for changes (including anonymous sign-in)
    supabase.auth.onAuthStateChange((event, session) => {
      user.value = session?.user ?? null
    })
  })