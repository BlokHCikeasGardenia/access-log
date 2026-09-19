// Service worker minimal: satu-satunya tujuan adalah membuat aplikasi bisa
// di-install sebagai PWA (Chrome mewajibkan adanya fetch handler terdaftar).
// Semua request diteruskan apa adanya — tanpa caching, sehingga setiap deploy
// selalu menyajikan konten terbaru dari jaringan.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // Sengaja kosong: tanpa respondWith(), browser otomatis fallback ke jaringan.
})