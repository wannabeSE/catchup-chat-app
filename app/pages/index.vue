<template>
  <div class="page">
    <GameWorld />
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: "auth" });

import GameWorld from "~/components/GameWorld/GameWorld.vue";
</script>

<style scoped>
.page {
  width: 100%;
  height: 100vh;
}
</style>
