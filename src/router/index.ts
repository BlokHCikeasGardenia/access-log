import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const basePath = import.meta.env.VITE_BASE_PATH || '/'

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
  { path: '/residents', name: 'residents', component: () => import('@/views/ResidentsView.vue') },
  { path: '/cards', name: 'cards', component: () => import('@/views/CardsView.vue') },
  { path: '/relationships', name: 'relationships', component: () => import('@/views/RelationshipsView.vue') },
]

const router = createRouter({
  history: createWebHistory(basePath),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.init()
  if (!auth.isAuthenticated && !to.meta.public) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'home' }
  }
  return true
})

export default router
