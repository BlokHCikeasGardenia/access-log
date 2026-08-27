<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
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

// Search & pagination state.
const searchInput = ref('')
const filterArah = ref<'all' | 'IN' | 'OUT'>('all')
const pageSize = ref(10)
const currentPage = ref(1)

// Filter logs by search text (matches date, card id, resident) and direction.
const filteredLogs = computed(() => {
  const q = searchInput.value.trim().toLowerCase()
  return logs.value.filter((log) => {
    if (filterArah.value !== 'all' && log.arah !== filterArah.value) return false
    if (!q) return true
    return (
      log.tgl.toLowerCase().includes(q) ||
      log.id_kartu.toLowerCase().includes(q) ||
      (log.warga || '').toLowerCase().includes(q)
    )
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredLogs.value.length / pageSize.value)))

const pagedLogs = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredLogs.value.slice(start, start + pageSize.value)
})

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

/** Translate the API's direction value (MASUK/KELUAR) to IN/OUT. */
function arahLabel(raw: string): string {
  return (raw || '').trim().toUpperCase() === 'MASUK' ? 'IN' : 'OUT'
}

async function loadResidentsMap() {
  try {
    const [cardsRes, resRes] = await Promise.all([
      supabase.from('cards').select('uid,resident_id'),
      supabase.from('residents').select('id,blok,nama'),
    ])
    if (cardsRes.error) throw cardsRes.error
    if (resRes.error) throw resRes.error

    const resMap = new Map<string, string>()
    for (const r of (resRes.data as any[]) || []) {
      resMap.set(r.id, `${r.blok} - ${r.nama}`)
    }

    const map: Record<string, string> = {}
    for (const c of (cardsRes.data as any[]) || []) {
      const label = c.resident_id ? resMap.get(c.resident_id) : undefined
      if (label) map[(c.uid as string).trim()] = label
    }
    wargaByUid.value = map
  } catch (e: any) {
    console.error('[Log Akses] Gagal memuat data penghuni/kartu:', e?.message || e)
  }
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
      arah: arahLabel(r.arah),
      warga: wargaByUid.value[(r.id_kartu || '').trim()] || null,
    }))
    currentPage.value = 1
  } catch (e: any) {
    error.value = e?.message || 'Terjadi kesalahan saat memuat log.'
    logs.value = []
  } finally {
    loading.value = false
  }
}

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
}

// Reset to the first page whenever the search text, direction filter, or page
// size changes — otherwise the user can land on an empty last page.
watch([searchInput, filterArah, pageSize], () => {
  currentPage.value = 1
})



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

    <!-- Search / filter / per-page controls (shown only when there are logs). -->
    <div v-if="logs.length" class="flex flex-wrap items-end gap-4 mb-4">
      <div class="flex-1 min-w-56">
        <label class="block text-sm font-medium text-slate-600 mb-1">Cari</label>
        <input v-model="searchInput" type="text" placeholder="UID, nama, atau tanggal…" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-600 mb-1">Arah</label>
        <select v-model="filterArah" class="rounded border border-slate-300 px-3 py-2 text-sm">
          <option value="all">Semua</option>
          <option value="IN">Masuk (IN)</option>
          <option value="OUT">Keluar (OUT)</option>
        </select>
      </div>
      <div class="w-28">
        <label class="block text-sm font-medium text-slate-600 mb-1">Per halaman</label>
        <select v-model.number="pageSize" class="w-full rounded border border-slate-300 px-3 py-2 text-sm">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
        </select>
      </div>
    </div>

    <div
      v-if="filteredLogs.length"
      class="flex items-center justify-between mb-3 text-sm text-slate-600"
    >
      <span>
        Menampilkan {{ (currentPage - 1) * pageSize + 1 }}–{{
          Math.min(currentPage * pageSize, filteredLogs.length)
        }}
        dari {{ filteredLogs.length }} data
      </span>
      <span>
        Halaman {{ currentPage }} / {{ totalPages }}
      </span>
    </div>
    <div v-else-if="logs.length" class="mb-3 text-sm text-slate-600">
      0 data (setelah filter)
    </div>


    <div v-if="loading" class="text-slate-500 text-sm">Memuat�</div>
    <div v-else-if="error" class="bg-rose-50 border border-rose-200 text-rose-700 rounded p-4 text-sm">{{ error }}</div>
    <div v-else-if="logs.length === 0" class="bg-white rounded border border-slate-200 p-8 text-center text-slate-500">
      Belum ada data log pada rentang tanggal ini.
    </div>
    <div v-else-if="filteredLogs.length === 0" class="bg-white rounded border border-slate-200 p-8 text-center text-slate-500">
      Tidak ada data yang cocup dengan filter pencarian.
    </div>
    <div v-else class="bg-white rounded border border-slate-200 overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead class="bg-slate-50 text-left text-slate-500">
          <tr>
            <th class="border border-slate-200 px-3 py-2 font-medium">Tanggal &amp; Jam</th>
            <th class="border border-slate-200 px-3 py-2 font-medium">Arah</th>
            <th class="border border-slate-200 px-3 py-2 font-medium">ID Kartu</th>
            <th class="border border-slate-200 px-3 py-2 font-medium">Nama Penghuni</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="log in pagedLogs"
            :key="log.id"
            class="border border-slate-200"
            :class="log.arah === 'IN' ? 'bg-emerald-50' : 'bg-amber-50'"
          >
            <td class="border border-slate-200 px-3 py-1.5 whitespace-nowrap">{{ log.tgl }}</td>
            <td class="border border-slate-200 px-3 py-1.5 font-semibold">{{ log.arah }}</td>
            <td class="border border-slate-200 px-3 py-1.5 font-mono">{{ log.id_kartu }}</td>
            <td class="border border-slate-200 px-3 py-1.5">{{ log.warga || '—' }}</td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination (only when more rows than a single page). -->
      <div v-if="filteredLogs.length > pageSize" class="flex items-center justify-between p-3 border-t border-slate-200 text-sm">
        <div class="flex gap-1">
          <button class="px-3 py-1 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-50" :disabled="currentPage === 1" @click="goToPage(1)">Awal</button>
          <button class="px-3 py-1 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-50" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">Prev</button>
          <button class="px-3 py-1 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-50" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">Next</button>
          <button class="px-3 py-1 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-50" :disabled="currentPage === totalPages" @click="goToPage(totalPages)">Akhir</button>
        </div>
        <span class="text-slate-600">Halaman {{ currentPage }} / {{ totalPages }}</span>
      </div>
    </div>
  </div>
</template>

