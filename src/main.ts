import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'

// GitHub Pages SPA fallback: 404.html stashes the originally requested deep-link
// in sessionStorage and redirects to the base path. Restore that URL before the
// router mounts so vue-router resolves the correct route (for project pages the
// path already includes the /access-log base segment).
const spaRedirect = sessionStorage.getItem('spa-redirect')
if (spaRedirect) {
  sessionStorage.removeItem('spa-redirect')
  window.history.replaceState(null, '', spaRedirect)
}

createApp(App).use(createPinia()).use(router).mount('#app')
