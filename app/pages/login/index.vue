<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gray-950 text-white"
  >
    <!-- <div v-if="loading" class="text-xl">Entering the space...</div>
    <div v-else class="text-red-400">Something went wrong — refresh page</div> -->
    <form class="max-w-sm mx-auto flex flex-col gap-6 font-sans">
      <div class="group relative">
        <label
          for="email"
          class="block mb-1 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          email
        </label>
        <div class="relative">
          <div
            class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"
          >
            <svg
              class="w-5 h-5 text-zinc-900 dark:text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
              ></path>
            </svg>
          </div>
          <input
            type="email"
            id="email"
            class="block w-full pl-10 p-3.5 bg-white text-zinc-900 font-medium text-sm border-2 border-zinc-900 focus:outline-none focus:ring-0 focus:border-blue-600 dark:bg-zinc-900 dark:text-white dark:border-zinc-100 dark:focus:border-yellow-400 transition-colors duration-200 ease-in-out"
            placeholder="name@example.com"
            v-model="email"
          />
          <div
            class="absolute top-0 left-0 w-full h-full bg-zinc-200 -z-10 translate-x-1.5 translate-y-1.5 border-2 border-transparent dark:bg-zinc-700 transition-transform group-focus-within:translate-x-2.5 group-focus-within:translate-y-2.5"
          ></div>
        </div>
      </div>

      <div class="group relative">
        <label
          for="password"
          class="block mb-1 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          password
        </label>
        <div class="relative">
          <div
            class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"
          >
            <svg
              class="w-5 h-5 text-zinc-900 dark:text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              ></path>
            </svg>
          </div>
          <input
            type="password"
            id="password"
            class="block w-full pl-10 p-3.5 bg-white text-zinc-900 font-medium text-sm border-2 border-zinc-900 focus:outline-none focus:ring-0 focus:border-blue-600 dark:bg-zinc-900 dark:text-white dark:border-zinc-100 dark:focus:border-yellow-400 transition-colors duration-200 ease-in-out"
            placeholder="••••••••"
            v-model="password"
          />
          <div
            class="absolute top-0 left-0 w-full h-full bg-zinc-200 -z-10 translate-x-1.5 translate-y-1.5 border-2 border-transparent dark:bg-zinc-700 transition-transform group-focus-within:translate-x-2.5 group-focus-within:translate-y-2.5"
          ></div>
        </div>
      </div>

      <button
        type="button"
        class="relative inline-block w-full group mt-2"
        @click="login"
      >
        <span
          class="absolute top-0 left-0 w-full h-full transition-all duration-200 ease-out transform translate-x-1.5 translate-y-1.5 bg-blue-600 dark:bg-yellow-400 border-2 border-zinc-900 dark:border-white group-hover:translate-x-0 group-hover:translate-y-0"
        ></span>
        <span
          class="relative block w-full px-5 py-3.5 text-sm font-bold tracking-widest uppercase border-2 border-zinc-900 bg-white text-zinc-900 dark:bg-zinc-900 dark:text-white dark:border-white"
        >
          Enter System
        </span>
      </button>
    </form>
  </div>
</template>
<script setup lang="ts">
const { supabase } = useSupabase();
const user = useState("auth.user");
const loading = ref(true);
const email = ref("");
const password = ref("");
const login = async () => {
  loading.value = true;
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  });
  console.log(email.value, password.value);

  console.log(data);
  if (data.user) {
    await navigateTo("/realtime-test");
  }
  if (error) {
    console.error("Login failed:", error);
    alert("Failed to login. Try refreshing.");
  }
  loading.value = false;
};
onMounted(async () => {
  // Check if already signed in (e.g. from previous session)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user) {
    user.value = session.user;
    await navigateTo("/realtime-test");
  } else {
    await login();
  }
  loading.value = false;
});
</script>
