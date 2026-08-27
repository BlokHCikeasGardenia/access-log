<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Toaster from '@/components/Toaster.vue'

const auth = useAuthStore()
const router = useRouter()

onMounted(() => {
  auth.init()
})

async function handleLogout() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header v-if="auth.isAuthenticated" class="bg-white border-b border-slate-200">
      <div class="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
        <span class="font-bold text-indigo-600">Log Akses</span>
        <nav class="flex gap-1 text-sm">
          <RouterLink to="/" class="px-3 py-2 rounded hover:bg-slate-100" active-class="bg-slate-100 font-medium">Beranda</RouterLink>
          <RouterLink to="/residents" class="px-3 py-2 rounded hover:bg-slate-100" active-class="bg-slate-100 font-medium">Penghuni</RouterLink>
          <RouterLink to="/cards" class="px-3 py-2 rounded hover:bg-slate-100" active-class="bg-slate-100 font-medium">Kartu</RouterLink>
          <RouterLink to="/relationships" class="px-3 py-2 rounded hover:bg-slate-100" active-class="bg-slate-100 font-medium">Pairing</RouterLink>
        </nav>
        <div class="ml-auto flex items-center gap-3">
          <span class="text-xs text-slate-500 truncate max-w-[200px]">{{ auth.user?.email }}</span>
          <button class="text-sm px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100" @click="handleLogout">Keluar</button>
        </div>
      </div>
    </header>
    <main class="flex-1">
      <RouterView />
    </main>
    <Toaster />
  </div>
</template>
