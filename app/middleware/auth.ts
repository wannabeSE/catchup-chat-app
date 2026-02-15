export default defineNuxtRouteMiddleware((to) => {
    const user = useState('auth.user')
    if (!user.value && to.path !== '/login') {
      return navigateTo('/login')
    }
  })