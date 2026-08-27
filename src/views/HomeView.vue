<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { importAllSample } from '@/lib/seed'
import { notify } from '@/lib/toast'

const router = useRouter()
const cards = [
  { title: 'Penghuni', desc: 'Data blok, nama, dan status penghuni komplek.', to: '/residents' },
  { title: 'Kartu', desc: 'Master kartu akses (UID, Label A, Label B).', to: '/cards' },
  { title: 'Hubungan', desc: 'Pasangkan kartu ke penghuni & atur statusnya.', to: '/relationships' },
]

const seeding = ref(false)

async function seedSample() {
  seeding.value = true
  try {
    const r = await importAllSample()
    const msg = `Sample diimpor: ${r.residents} penghuni, ${r.cards} kartu, ${r.relationships} hubungan.`
    if (r.errors.length) notify(msg + ` ${r.errors.length} relasi dilewati.`, 'info')
    else notify(msg, 'success')
  } catch (e: any) {
    notify(e?.message || 'Gagal impor sample.', 'error')
  } finally {
    seeding.value = false
  }
}
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8">
    <div class="flex items-start justify-between mb-6 gap-4 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold text-slate-800 mb-1">Beranda</h1>
        <p class="text-slate-500">Selamat datang di panel Log Akses.</p>
      </div>
      <button
        class="bg-slate-800 text-white rounded px-4 py-2 text-sm font-medium hover:bg-slate-900 disabled:opacity-50"
        :disabled="seeding"
        @click="seedSample"
      >
        {{ seeding ? 'Mengimpor…' : 'Import Sample Data' }}
      </button>
    </div>
    <div class="grid sm:grid-cols-3 gap-4">
      <button
        v-for="c in cards"
        :key="c.to"
        class="text-left bg-white rounded-lg shadow-sm border border-slate-200 p-5 hover:border-indigo-300 hover:shadow transition"
        @click="router.push(c.to)"
      >
        <h2 class="font-semibold text-slate-800">{{ c.title }}</h2>
        <p class="text-sm text-slate-500 mt-1">{{ c.desc }}</p>
      </button>
    </div>
  </div>
</template>
