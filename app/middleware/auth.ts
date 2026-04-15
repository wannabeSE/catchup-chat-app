export default defineNuxtRouteMiddleware(async (to) => {
  const user = useState("auth.user");

  if (!user.value) {
    const { supabase } = useSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      user.value = session.user;
    }
  }

  if (!user.value && to.path !== "/login") {
    return navigateTo("/login");
  }
});