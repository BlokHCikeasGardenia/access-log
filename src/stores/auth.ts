import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const loading = ref(true)
  let initPromise: Promise<void> | null = null

  const user = computed<User | null>(() => session.value?.user ?? null)
  const isAuthenticated = computed(() => !!session.value)

  async function hydrate() {
    const { data } = await supabase.auth.getSession()
    session.value = data.session
    loading.value = false

    supabase.auth.onAuthStateChange((_event, newSession) => {
      session.value = newSession
    })
  }

  function init() {
    if (!initPromise) {
      initPromise = hydrate()
    }
    return initPromise
  }

  async function login(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function logout() {
    await supabase.auth.signOut()
    session.value = null
  }

  return { session, loading, user, isAuthenticated, init, login, logout }
})
