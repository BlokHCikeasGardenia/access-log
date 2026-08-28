<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Toaster from '@/components/Toaster.vue'

const auth = useAuthStore()
const router = useRouter()
const mobileNavOpen = ref(false)

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
        <button class="md:hidden ml-auto p-2 -mr-2" @click="mobileNavOpen = !mobileNavOpen" aria-label="Toggle menu">
          <svg class="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path v-if="!mobileNavOpen" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <nav class="hidden md:flex gap-1 text-sm">
          <RouterLink to="/" class="px-3 py-2 rounded hover:bg-slate-100" active-class="bg-slate-100 font-medium">Beranda</RouterLink>
          <RouterLink to="/residents" class="px-3 py-2 rounded hover:bg-slate-100" active-class="bg-slate-100 font-medium">Penghuni</RouterLink>
          <RouterLink to="/cards" class="px-3 py-2 rounded hover:bg-slate-100" active-class="bg-slate-100 font-medium">Kartu</RouterLink>
          <RouterLink to="/relationships" class="px-3 py-2 rounded hover:bg-slate-100" active-class="bg-slate-100 font-medium">Pairing</RouterLink>
        </nav>
        <div class="hidden md:flex ml-auto items-center gap-3">
          <span class="text-xs text-slate-500 truncate max-w-[200px]">{{ auth.user?.email }}</span>
          <button class="text-sm px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100" @click="handleLogout">Keluar</button>
        </div>
      </div>
      <div v-if="mobileNavOpen" class="md:hidden border-t border-slate-200 bg-white px-4 py-2 space-y-1">
        <RouterLink to="/" class="block px-3 py-2 rounded hover:bg-slate-100 text-sm" active-class="bg-slate-100 font-medium" @click="mobileNavOpen = false">Beranda</RouterLink>
        <RouterLink to="/residents" class="block px-3 py-2 rounded hover:bg-slate-100 text-sm" active-class="bg-slate-100 font-medium" @click="mobileNavOpen = false">Penghuni</RouterLink>
        <RouterLink to="/cards" class="block px-3 py-2 rounded hover:bg-slate-100 text-sm" active-class="bg-slate-100 font-medium" @click="mobileNavOpen = false">Kartu</RouterLink>
        <RouterLink to="/relationships" class="block px-3 py-2 rounded hover:bg-slate-100 text-sm" active-class="bg-slate-100 font-medium" @click="mobileNavOpen = false">Pairing</RouterLink>
        <div class="pt-2 border-t border-slate-100">
          <span class="block px-3 py-2 text-xs text-slate-500 truncate">{{ auth.user?.email }}</span>
          <button class="w-full text-left text-sm px-3 py-2 rounded hover:bg-slate-100 text-rose-600" @click="handleLogout">Keluar</button>
        </div>
      </div>
    </header>
    <main class="flex-1">
      <RouterView />
    </main>
    <Toaster />
  </div>
</template>
