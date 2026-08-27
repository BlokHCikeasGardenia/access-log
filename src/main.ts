import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'

// GitHub Pages SPA fallback: restore the original URL from the ?p= param
// injected by 404.html before the router initializes.
const redirect = new URLSearchParams(window.location.search).get('p')
if (redirect) {
  const clean = redirect + window.location.search.replace(/[?&]p=[^&]*/, '') + window.location.hash
  window.history.replaceState(null, '', clean)
}

createApp(App).use(createPinia()).use(router).mount('#app')
