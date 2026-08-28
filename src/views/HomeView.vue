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

// A row enriched with the matched resident (may be null if card not linked)
// and the full card identity (uid + label A + label B).
interface LogRow extends GateLog {
  warga: string | null
  kartu: string
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
      log.kartu.toLowerCase().includes(q) ||
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

// Map card UID -> full card identity "uid | labelA | labelB".
const kartuByUid = ref<Record<string, string>>({})

const edgeUrl = (import.meta.env.VITE_SUPABASE_EDGE_LOG_GATE as string) || ''

/** Translate the API's direction value (MASUK/KELUAR) to IN/OUT. */
function arahLabel(raw: string): string {
  return (raw || '').trim().toUpperCase() === 'MASUK' ? 'IN' : 'OUT'
}

async function loadResidentsMap() {
  try {
    const [cardsRes, resRes] = await Promise.all([
      supabase.from('cards').select('uid,label_a,label_b,resident_id'),
      supabase.from('residents').select('id,blok,nama'),
    ])
    if (cardsRes.error) throw cardsRes.error
    if (resRes.error) throw resRes.error

    const resMap = new Map<string, string>()
    for (const r of (resRes.data as any[]) || []) {
      resMap.set(r.id, `${r.blok} - ${r.nama}`)
    }

    const map: Record<string, string> = {}
    const kartuMap: Record<string, string> = {}
    for (const c of (cardsRes.data as any[]) || []) {
      const uid = (c.uid as string).trim()
      const label = c.resident_id ? resMap.get(c.resident_id) : undefined
      if (label) map[uid] = label
      kartuMap[uid] = [uid, c.label_a || '', c.label_b || ''].join(' | ')
    }
    wargaByUid.value = map
    kartuByUid.value = kartuMap
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
    logs.value = rows.map((r) => {
      const uid = (r.id_kartu || '').trim()
      return {
        ...r,
        arah: arahLabel(r.arah),
        warga: wargaByUid.value[uid] || null,
        kartu: kartuByUid.value[uid] || uid,
      }
    })
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
    <div class="flex flex-col md:flex-row md:items-start justify-between mb-6 gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-800 mb-1">Log In/Out Warga</h1>
        <p class="text-sm text-slate-500">Riwayat keluar masuk gerbang.</p>
      </div>
    </div>

    <div class="flex flex-col md:flex-row md:items-end gap-3 mb-6">
      <div class="flex-1">
        <label class="block text-sm font-medium text-slate-600 mb-1">Tanggal Awal</label>
        <input v-model="tanggalAwal" type="date" class="w-full rounded border border-slate-300 px-3 py-2 text-sm min-h-[44px]" />
      </div>
      <div class="flex-1">
        <label class="block text-sm font-medium text-slate-600 mb-1">Tanggal Akhir</label>
        <input v-model="tanggalAkhir" type="date" class="w-full rounded border border-slate-300 px-3 py-2 text-sm min-h-[44px]" />
      </div>
      <button
        class="w-full md:w-auto bg-indigo-600 text-white rounded px-4 py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 min-h-[44px]"
        :disabled="loading"
        @click="loadLogs"
      >
        {{ loading ? 'Memuat…' : 'Muat' }}
      </button>
    </div>

    <!-- Search / filter / per-page controls (shown only when there are logs). -->
    <div v-if="logs.length" class="flex flex-col md:flex-row md:items-end gap-3 mb-4">
      <div class="flex-1">
        <label class="block text-sm font-medium text-slate-600 mb-1">Cari</label>
        <input v-model="searchInput" type="text" placeholder="UID, nama, atau tanggal…" class="w-full rounded border border-slate-300 px-3 py-2 text-sm min-h-[44px]" />
      </div>
      <div class="w-full md:w-40">
        <label class="block text-sm font-medium text-slate-600 mb-1">Arah</label>
        <select v-model="filterArah" class="w-full rounded border border-slate-300 px-3 py-2 text-sm min-h-[44px]">
          <option value="all">Semua</option>
          <option value="IN">Masuk (IN)</option>
          <option value="OUT">Keluar (OUT)</option>
        </select>
      </div>
      <div class="w-full md:w-28">
        <label class="block text-sm font-medium text-slate-600 mb-1">Per halaman</label>
        <select v-model.number="pageSize" class="w-full rounded border border-slate-300 px-3 py-2 text-sm min-h-[44px]">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
        </select>
      </div>
    </div>

    <div v-if="logs.length && filteredLogs.length" class="hidden md:block bg-white rounded border border-slate-200 overflow-x-auto">
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
            <td class="border border-slate-200 px-3 py-1.5 font-mono">{{ log.kartu }}</td>
            <td class="border border-slate-200 px-3 py-1.5">{{ log.warga || '—' }}</td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination (only when more rows than a single page). -->
      <div v-if="filteredLogs.length > pageSize" class="flex flex-col md:flex-row md:items-center justify-between p-3 border-t border-slate-200 text-sm gap-3">
        <div class="flex flex-wrap gap-2">
          <button class="px-3 py-2 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-50 min-h-[44px]" :disabled="currentPage === 1" @click="goToPage(1)">Awal</button>
          <button class="px-3 py-2 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-50 min-h-[44px]" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">Prev</button>
          <button class="px-3 py-2 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-50 min-h-[44px]" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">Next</button>
          <button class="px-3 py-2 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-50 min-h-[44px]" :disabled="currentPage === totalPages" @click="goToPage(totalPages)">Akhir</button>
        </div>
        <span class="text-slate-600">Halaman {{ currentPage }} / {{ totalPages }}</span>
      </div>
    </div>

    <div v-if="logs.length && filteredLogs.length" class="md:hidden space-y-3">
      <div
        v-for="log in pagedLogs"
        :key="log.id"
        class="bg-white rounded border border-slate-200 p-4"
        :class="log.arah === 'IN' ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-amber-500'"
      >
        <div class="flex items-center justify-between gap-2 mb-2">
          <span class="text-sm font-medium text-slate-800">{{ log.tgl }}</span>
          <span class="inline-block px-2 py-1 rounded-full text-xs font-semibold" :class="log.arah === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'">{{ log.arah }}</span>
        </div>
        <div class="text-sm text-slate-600 space-y-1">
          <p class="font-mono text-xs">ID Kartu: {{ log.kartu }}</p>
          <p>Penghuni: {{ log.warga || '—' }}</p>
        </div>
      </div>

      <div v-if="filteredLogs.length > pageSize" class="flex flex-col gap-2 pt-2">
        <div class="flex gap-2">
          <button class="flex-1 px-3 py-2 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-50 min-h-[44px] text-sm" :disabled="currentPage === 1" @click="goToPage(1)">Awal</button>
          <button class="flex-1 px-3 py-2 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-50 min-h-[44px] text-sm" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">Prev</button>
          <button class="flex-1 px-3 py-2 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-50 min-h-[44px] text-sm" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">Next</button>
          <button class="flex-1 px-3 py-2 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-50 min-h-[44px] text-sm" :disabled="currentPage === totalPages" @click="goToPage(totalPages)">Akhir</button>
        </div>
        <span class="text-xs text-center text-slate-600">Halaman {{ currentPage }} / {{ totalPages }}</span>
      </div>
    </div>
  </div>
</template>

