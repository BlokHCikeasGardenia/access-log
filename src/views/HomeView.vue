<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/toast'

interface GateLog {
  id: string
  tgl: string
  arah: string
  id_kartu: string
}

// A row enriched with the matched resident (may be null if card not linked).
interface LogRow extends GateLog {
  warga: string | null
}

const logs = ref<LogRow[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// Date range controls (default: last 30 days up to today).
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function defaultStart(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}
const tanggalAwal = ref(defaultStart())
const tanggalAkhir = ref(todayISO())

// Map card UID -> resident label, loaded from Supabase for name matching.
const wargaByUid = ref<Record<string, string>>({})

const edgeUrl = (import.meta.env.VITE_SUPABASE_EDGE_LOG_GATE as string) || ''

async function loadResidentsMap() {
  const [cardsRes, resRes] = await Promise.all([
    supabase.from('cards').select('uid,resident_id'),
    supabase.from('residents').select('id,blok,nama'),
  ])
  const resMap = new Map<string, string>()
  for (const r of (resRes.data as any[]) || []) {
    resMap.set(r.id, `${r.blok} - ${r.nama}`)
  }
  const map: Record<string, string> = {}
  for (const c of (cardsRes.data as any[]) || []) {
    const label = c.resident_id ? resMap.get(c.resident_id) : undefined
    if (label) map[c.uid] = label
  }
  wargaByUid.value = map
}

async function loadLogs() {
  if (!edgeUrl) {
    error.value = 'URL Edge Function belum diatur (VITE_SUPABASE_EDGE_LOG_GATE).'
    return
  }
  if (!tanggalAwal.value || !tanggalAkhir.value) {
    notify('Tanggal awal dan akhir wajib diisi.', 'error')
    return
  }

  loading.value = true
  error.value = null
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token

    const url = new URL(edgeUrl)
    url.searchParams.set('tanggal_awal', tanggalAwal.value)
    url.searchParams.set('tanggal_akhir', tanggalAkhir.value)

    const res = await fetch(url.toString(), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) {
      throw new Error(`Gagal memuat log (${res.status}).`)
    }
    const json = await res.json()
    if (!json.success) {
      throw new Error(json.message || 'Gagal memuat log.')
    }
    const rows: GateLog[] = Array.isArray(json.data) ? json.data : []
    logs.value = rows.map((r) => ({
      ...r,
      arah: (r.arah || '').toUpperCase(),
      warga: wargaByUid.value[r.id_kartu] || null,
    }))
  } catch (e: any) {
    error.value = e?.message || 'Terjadi kesalahan saat memuat log.'
    logs.value = []
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadResidentsMap()
  await loadLogs()
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8">
    <div class="flex items-start justify-between mb-6 gap-4 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold text-slate-800 mb-1">Log In/Out Warga</h1>
        <p class="text-sm text-slate-500">Riwayat keluar masuk gerbang.</p>
      </div>
    </div>

    <div class="flex flex-wrap items-end gap-3 mb-6">
      <div>
        <label class="block text-sm font-medium text-slate-600 mb-1">Tanggal Awal</label>
        <input v-model="tanggalAwal" type="date" class="rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-600 mb-1">Tanggal Akhir</label>
        <input v-model="tanggalAkhir" type="date" class="rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <button
        class="bg-indigo-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        :disabled="loading"
        @click="loadLogs"
      >
        {{ loading ? 'Memuat…' : 'Muat' }}
      </button>
    </div>

    <div v-if="loading" class="text-slate-500 text-sm">Memuat…</div>
    <div v-else-if="error" class="bg-rose-50 border border-rose-200 text-rose-700 rounded p-4 text-sm">{{ error }}</div>
    <div v-else-if="logs.length === 0" class="bg-white rounded border border-slate-200 p-8 text-center text-slate-500">
      Belum ada data log pada rentang tanggal ini.
    </div>
    <div v-else class="bg-white rounded border border-slate-200 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left text-slate-500">
          <tr>
            <th class="px-4 py-3 font-medium">Tanggal &amp; Jam</th>
            <th class="px-4 py-3 font-medium">Arah</th>
            <th class="px-4 py-3 font-medium">ID Kartu</th>
            <th class="px-4 py-3 font-medium">Nama Penghuni</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="log in logs" :key="log.id" class="hover:bg-slate-50">
            <td class="px-4 py-3 whitespace-nowrap">{{ log.tgl }}</td>
            <td class="px-4 py-3">
              <span
                class="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                :class="log.arah === 'MASUK' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'"
              >
                {{ log.arah }}
              </span>
            </td>
            <td class="px-4 py-3 font-mono">{{ log.id_kartu }}</td>
            <td class="px-4 py-3">{{ log.warga || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

