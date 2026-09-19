<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { parseCards } from '@/lib/parse'
import { notify } from '@/lib/toast'
import { friendlyError, isUniqueViolation } from '@/lib/errors'
import type { Card, GateAction } from '@/types'
import Modal from '@/components/Modal.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import { enqueueGateCommand, loadGateStatusByUid, gateStatusClass, gateStatusLabel } from '@/lib/gate-command'

const cards = ref<Card[]>([])
const residents = ref<Record<string, string>>({})
const loading = ref(false)
const pulling = ref(false)
const syncStats = ref<{ inserted: number; skipped: number } | null>(null)

const CARD_LIST_URL = (import.meta.env.VITE_SUPABASE_EDGE_CARD_LIST as string) || ''

const showAdd = ref(false)
const addTab = ref<'manual' | 'upload'>('manual')
const uid = ref('')
const labelA = ref('')
const labelB = ref('')
const blokManual = ref('')
const noRumahManual = ref('')
const uploadText = ref('')
const uploadPreview = ref<{ ok: number; errors: string[] } | null>(null)
const saving = ref(false)

/** Returns true when the given (trimmed) UID already exists in the loaded cards. */
function uidExists(value: string): boolean {
  const target = value.trim()
  if (!target) return false
  return cards.value.some((c) => c.uid === target)
}

/** Live hint for the manual add form — true while the typed UID already exists. */
const uidDuplicate = computed(() => uidExists(uid.value))

const totalCards = computed(() => cards.value.length)
const activeCards = computed(() => cards.value.filter((c) => c.card_status === 'Aktif').length)
const damagedCards = computed(() => cards.value.filter((c) => c.card_status === 'Rusak').length)
const lostCards = computed(() => cards.value.filter((c) => c.card_status === 'Hilang').length)
const unassignedCards = computed(() => cards.value.filter((c) => c.resident_id === null).length)

const showEdit = ref(false)
const editTarget = ref<Card | null>(null)
const editLabelA = ref('')
const editLabelB = ref('')
const editBlok = ref('')
const editNoRumah = ref('')

const showDelete = ref(false)
const deleteTarget = ref<Card | null>(null)
const deleteWarn = ref<string | null>(null)
const deleting = ref(false)

const gateStatus = ref<Record<string, import('@/types').GateCommand>>({})

const showGate = ref(false)
const gateTarget = ref<Card | null>(null)
const gateAction = ref<GateAction>('ADD')
const gateBusy = ref(false)

function gateStatusFor(c: Card): import('@/types').GateCommand | undefined {
  return gateStatus.value[c.uid]
}

async function loadGateStatus() {
  gateStatus.value = await loadGateStatusByUid()
}

function openGate(c: Card) {
  gateTarget.value = c
  gateAction.value = c.resident_id ? 'UPDATE' : 'ADD'
  showGate.value = true
}

async function submitGate() {
  if (!gateTarget.value) return
  gateBusy.value = true
  const cmd = await enqueueGateCommand(gateAction.value, {
    uid: gateTarget.value.uid,
    blok: gateTarget.value.blok,
    no_rumah: gateTarget.value.no_rumah,
  })
  gateBusy.value = false
  if (cmd) {
    notify(`Command ${gateAction.value} UID ${cmd.uid} masuk antrean gate.`, 'success')
    showGate.value = false
    void loadGateStatus()
  }
}

const filterQuery = ref('')
const filterBlok = ref('')
const filterNoRumah = ref('')
const filterStatus = ref('')

const filteredCards = computed(() => {
  const q = filterQuery.value.trim().toLowerCase()
  return cards.value.filter((c) => {
    if (q) {
      const hay = `${c.uid} ${c.label_a || ''} ${c.label_b || ''} ${c.blok || ''} ${c.no_rumah || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (filterBlok.value && (c.blok || '').toLowerCase() !== filterBlok.value.trim().toLowerCase()) return false
    if (filterNoRumah.value && (c.no_rumah || '').toLowerCase() !== filterNoRumah.value.trim().toLowerCase()) return false
    if (filterStatus.value && c.card_status !== filterStatus.value) return false
    return true
  })
})

async function pullFromApi() {
  if (!CARD_LIST_URL) {
    notify('URL Edge Function card-list belum diatur.', 'error')
    return
  }
  pulling.value = true
  syncStats.value = null
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token

    const res = await fetch(CARD_LIST_URL, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error(`Gagal tarik data (${res.status}).`)
    const json = await res.json()
    if (!json.success) throw new Error(json.message || 'Gagal tarik data.')

    const apiCards: Array<{ uid: string; label_a: string; label_b: string; blok?: string; no_rumah?: string }> = Array.isArray(json.data) ? json.data : []

    const { data: existingCards, error: fetchErr } = await supabase.from('cards').select('uid')
    if (fetchErr) throw fetchErr

    const existingUids = new Set((existingCards ?? []).map((c) => c.uid))
    const newCards = apiCards.filter((c) => !existingUids.has(c.uid))
    const skipped = apiCards.length - newCards.length

    let inserted = 0
    const dupErrors: string[] = []
      for (const row of newCards) {
        const { error } = await supabase.from('cards').insert({
          uid: row.uid,
          label_a: row.label_a || null,
          label_b: row.label_b || null,
          blok: row.blok || null,
          no_rumah: row.no_rumah || null,
          resident_id: null,
          card_status: 'Aktif',
        })
      if (error) {
        if (isUniqueViolation(error)) {
          dupErrors.push(`UID ${row.uid} sudah ada, dilewati.`)
        }
        continue
      }
      inserted++
    }

    syncStats.value = { inserted, skipped }

    if (inserted > 0 || skipped > 0 || dupErrors.length) {
      notify(
        `Sync selesai: ${inserted} kartu baru dimasukkan.` +
          (skipped > 0 ? ` ${skipped} dilewati (sudah ada).` : '') +
          (dupErrors.length ? ` ${dupErrors.length} duplikat saat insert.` : ''),
        inserted > 0 ? 'success' : 'error',
      )
    } else {
      notify('Tidak ada kartu baru untuk dimasukkan.', 'info')
    }

    load()
  } catch (e: any) {
    notify(e?.message || 'Gagal menarik data dari API.', 'error')
  } finally {
    pulling.value = false
  }
}

async function load() {
  loading.value = true
  const [{ data, error }, resRes] = await Promise.all([
    supabase.from('cards').select('*').order('uid'),
    supabase.from('residents').select('id,blok,nama'),
  ])
  if (error) {
    notify(error.message, 'error')
  } else {
    cards.value = (data as Card[]) ?? []
  }
  if (resRes.data) {
    residents.value = Object.fromEntries((resRes.data as any[]).map((r) => [r.id, `${r.blok} - ${r.nama}`]))
  }
  loading.value = false
  void loadGateStatus()
}

function residentName(id: string | null) {
  return id ? residents.value[id] ?? '—' : '—'
}

function openAdd() {
  addTab.value = 'manual'
  uid.value = ''
  labelA.value = ''
  labelB.value = ''
  blokManual.value = ''
  noRumahManual.value = ''
  uploadText.value = ''
  uploadPreview.value = null
  showAdd.value = true
}

function previewUpload() {
  const { rows, errors } = parseCards(uploadText.value)
  // Flag rows whose UID already exists in the database so the user sees the real
  // number of NEW cards before importing. Duplicates in-file are already caught
  // inside parseCards.
  const dbErrors: string[] = []
  const ok = rows.filter((r) => {
    if (uidExists(r.uid)) {
      dbErrors.push(`UID ${r.uid} sudah ada di database, dilewati.`)
      return false
    }
    return true
  }).length
  uploadPreview.value = { ok, errors: [...errors, ...dbErrors] }
}

async function submitManual() {
  if (!uid.value.trim()) {
    notify('UID wajib diisi.', 'error')
    return
  }
  if (uidExists(uid.value)) {
    notify('UID sudah digunakan (duplikat). Gunakan UID lain.', 'error')
    return
  }
  saving.value = true
  const { error } = await supabase
    .from('cards')
    .insert({
      uid: uid.value.trim(),
      label_a: labelA.value.trim() || null,
      label_b: labelB.value.trim() || null,
      blok: blokManual.value.trim() || null,
      no_rumah: noRumahManual.value.trim() || null,
    })
  saving.value = false
  if (error) {
    notify(friendlyError(error, 'UID'), 'error')
    return
  }
  notify('Kartu ditambahkan.', 'success')
  showAdd.value = false
  load()
}

async function submitUpload() {
  const { rows, errors } = parseCards(uploadText.value)
  if (rows.length === 0) {
    notify('Tidak ada baris valid untuk diimpor.', 'error')
    return
  }
  // Insert row-by-row so a duplicate UID only rejects that row while valid
  // rows still get inserted (DB unique constraint is the source of truth).
  saving.value = true
  let inserted = 0
  const dupErrors: string[] = []
  for (const row of rows) {
    const { error } = await supabase.from('cards').insert(row)
    if (error) {
      if (isUniqueViolation(error)) {
        dupErrors.push(`UID ${row.uid} sudah ada, dilewati.`)
      } else {
        dupErrors.push(`UID ${row.uid}: ${error.message}`)
      }
      continue
    }
    inserted++
  }
  saving.value = false
  if (inserted > 0) {
    notify(
      `Berhasil impor ${inserted} kartu.` +
        (errors.length ? ` ${errors.length} baris tidak valid dilewati.` : '') +
        (dupErrors.length ? ` ${dupErrors.length} duplikat dilewati.` : ''),
      dupErrors.length && inserted === 0 ? 'error' : 'success',
    )
  } else if (dupErrors.length) {
    notify(dupErrors.join(' '), 'error')
  } else if (errors.length) {
    notify(`Tidak ada baris valid. ${errors.length} baris dilewati.`, 'error')
  }
  if (inserted > 0 || dupErrors.length) {
    showAdd.value = false
    load()
  }
}

function openEdit(c: Card) {
  editTarget.value = c
  editLabelA.value = c.label_a ?? ''
  editLabelB.value = c.label_b ?? ''
  editBlok.value = c.blok ?? ''
  editNoRumah.value = c.no_rumah ?? ''
  showEdit.value = true
}

async function submitEdit() {
  if (!editTarget.value) return
  const oldBlok = editTarget.value.blok ?? ''
  const oldNoRumah = editTarget.value.no_rumah ?? ''
  saving.value = true
  const { error } = await supabase
    .from('cards')
    .update({
      label_a: editLabelA.value.trim() || null,
      label_b: editLabelB.value.trim() || null,
      blok: editBlok.value.trim() || null,
      no_rumah: editNoRumah.value.trim() || null,
    })
    .eq('id', editTarget.value.id)
  saving.value = false
  if (error) {
    notify(error.message, 'error')
    return
  }
  notify('Label kartu diperbarui.', 'success')
  // Blok / no rumah berubah → sinkronkan lokasi kartu di reader gate.
  if ((editBlok.value.trim() || '') !== oldBlok || (editNoRumah.value.trim() || '') !== oldNoRumah) {
    void enqueueGateCommand('UPDATE', {
      uid: editTarget.value.uid,
      blok: editBlok.value.trim() || null,
      no_rumah: editNoRumah.value.trim() || null,
    })
    notify('Perubahan lokasi dikirim ke gate (UPDATE).', 'info')
  }
  showEdit.value = false
  load()
}

async function openDelete(c: Card) {
  deleteTarget.value = c
  deleteWarn.value = null
  if (c.resident_id) {
    deleteWarn.value = 'Kartu ini sedang terpasang pada penghuni. Menghapus akan melepas hubungan tersebut secara permanen.'
  }
  showDelete.value = true
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  // Cabut kartu dari reader gate sebelum data lokal dihapus.
  await enqueueGateCommand('DELETE', {
    uid: deleteTarget.value.uid,
    blok: deleteTarget.value.blok,
    no_rumah: deleteTarget.value.no_rumah,
  })
  const { error } = await supabase.from('cards').delete().eq('id', deleteTarget.value.id)
  deleting.value = false
  if (error) {
    notify(error.message, 'error')
    return
  }
  notify('Kartu dihapus.', 'success')
  showDelete.value = false
  load()
}

onMounted(load)
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Kartu</h1>
        <p class="text-sm text-slate-500">Master kartu akses (UID, Label A, Label B, Blok, No Rumah).</p>
      </div>
      <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
        <button
          v-if="syncStats"
          class="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600"
          title="Hasil sync terakhir"
        >
          Sync: {{ syncStats.inserted }} masuk, {{ syncStats.skipped }} dilewati
        </button>
        <button
          class="flex-1 sm:flex-none min-h-[44px] text-center bg-emerald-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          :disabled="pulling || loading"
          @click="pullFromApi"
        >
          {{ pulling ? 'Menarik…' : 'Tarik Data' }}
        </button>
        <button class="flex-1 sm:flex-none min-h-[44px] text-center bg-indigo-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-indigo-700" @click="openAdd">
          + Tambah Kartu
        </button>
        <RouterLink to="/gate-sync" class="flex-1 sm:flex-none min-h-[44px] border border-slate-300 rounded px-4 py-2 text-sm hover:bg-slate-100 text-center">Sinkronisasi Gate</RouterLink>
      </div>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      <div class="bg-white rounded border border-slate-200 p-3 text-center">
        <p class="text-2xl font-bold text-slate-800">{{ totalCards }}</p>
        <p class="text-xs text-slate-500">Total Kartu</p>
      </div>
      <div class="bg-white rounded border border-slate-200 p-3 text-center">
        <p class="text-2xl font-bold text-emerald-600">{{ activeCards }}</p>
        <p class="text-xs text-slate-500">Aktif</p>
      </div>
      <div class="bg-white rounded border border-slate-200 p-3 text-center">
        <p class="text-2xl font-bold text-amber-600">{{ damagedCards }}</p>
        <p class="text-xs text-slate-500">Rusak</p>
      </div>
      <div class="bg-white rounded border border-slate-200 p-3 text-center">
        <p class="text-2xl font-bold text-rose-600">{{ lostCards }}</p>
        <p class="text-xs text-slate-500">Hilang</p>
      </div>
      <div class="bg-white rounded border border-slate-200 p-3 text-center">
        <p class="text-2xl font-bold text-slate-600">{{ unassignedCards }}</p>
        <p class="text-xs text-slate-500">Belum Dipasang</p>
      </div>
    </div>

    <SkeletonList v-if="loading || pulling" :rows="4" card />
    <div v-else-if="cards.length === 0" class="bg-white rounded border border-slate-200 p-8 text-center text-slate-500">
      Belum ada data kartu.
    </div>

    <div v-if="cards.length" class="bg-white rounded border border-slate-200 p-4 mb-4">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1">Pencarian</label>
            <input v-model="filterQuery" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="UID / Label / Blok / No Rumah" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1">Blok</label>
            <input v-model="filterBlok" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Contoh: A" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1">No Rumah</label>
            <input v-model="filterNoRumah" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Contoh: 171" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <select v-model="filterStatus" class="w-full rounded border border-slate-300 px-3 py-2 text-sm">
              <option value="">Semua</option>
              <option value="Aktif">Aktif</option>
              <option value="Rusak">Rusak</option>
              <option value="Hilang">Hilang</option>
            </select>
          </div>
        </div>
        <p v-if="filteredCards.length !== cards.length" class="text-xs text-slate-500 mt-2">{{ filteredCards.length }} dari {{ cards.length }} kartu ditampilkan.</p>
      </div>

      <div v-if="cards.length" class="hidden md:block bg-white rounded border border-slate-200 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left text-slate-500">
          <tr>
            <th class="px-4 py-3 font-medium">UID</th>
            <th class="px-4 py-3 font-medium">Label A</th>
            <th class="px-4 py-3 font-medium">Label B</th>
            <th class="px-4 py-3 font-medium">Blok</th>
            <th class="px-4 py-3 font-medium">No Rumah</th>
            <th class="px-4 py-3 font-medium">Penghuni</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium">Status Gate</th>
            <th class="px-4 py-3 font-medium text-right">Action</th>
          </tr>
        </thead>
<tbody class="divide-y divide-slate-100">
           <tr v-for="c in filteredCards" :key="c.id">
            <td class="px-4 py-3 font-mono">{{ c.uid }}</td>
            <td class="px-4 py-3">{{ c.label_a || '—' }}</td>
            <td class="px-4 py-3">{{ c.label_b || '—' }}</td>
            <td class="px-4 py-3">{{ c.blok || '—' }}</td>
            <td class="px-4 py-3">{{ c.no_rumah || '—' }}</td>
            <td class="px-4 py-3">{{ residentName(c.resident_id) }}</td>
            <td class="px-4 py-3">
              <span class="inline-block px-2 py-0.5 rounded-full text-xs" :class="{
                'bg-emerald-100 text-emerald-700': c.card_status === 'Aktif',
                'bg-amber-100 text-amber-700': c.card_status === 'Rusak',
                'bg-rose-100 text-rose-700': c.card_status === 'Hilang',
              }">{{ c.card_status }}</span>
            </td>
            <td class="px-4 py-3">
              <span v-if="gateStatusFor(c)" class="inline-block px-2 py-0.5 rounded-full text-xs" :class="gateStatusClass(gateStatusFor(c)!.status)">{{ gateStatusLabel(gateStatusFor(c)!.status) }}</span>
              <span v-else class="text-slate-300">—</span>
            </td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
              <button class="text-emerald-600 hover:underline mr-3" @click="openGate(c)">Gate</button>
              <button class="text-indigo-600 hover:underline mr-3" @click="openEdit(c)">Edit</button>
              <button class="text-rose-600 hover:underline" @click="openDelete(c)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

<div v-if="filteredCards.length" class="md:hidden space-y-3">
       <div v-for="c in filteredCards" :key="c.id" class="bg-white rounded border border-slate-200 p-4">
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-mono font-semibold text-slate-800 text-sm">{{ c.uid }}</span>
              <span class="inline-block px-2 py-0.5 rounded-full text-xs" :class="{
                'bg-emerald-100 text-emerald-700': c.card_status === 'Aktif',
                'bg-amber-100 text-amber-700': c.card_status === 'Rusak',
                'bg-rose-100 text-rose-700': c.card_status === 'Hilang',
              }">{{ c.card_status }}</span>
            </div>
            <p class="text-xs text-slate-500">A: {{ c.label_a || '—' }} · B: {{ c.label_b || '—' }}</p>
            <p class="text-xs text-slate-500">Blok: {{ c.blok || '—' }} · No Rumah: {{ c.no_rumah || '—' }}</p>
            <p class="text-xs text-slate-500 mt-0.5">Penghuni: {{ residentName(c.resident_id) }}</p>
            <p class="text-xs mt-1">
              <span v-if="gateStatusFor(c)" class="inline-block px-2 py-0.5 rounded-full text-xs" :class="gateStatusClass(gateStatusFor(c)!.status)">Gate: {{ gateStatusLabel(gateStatusFor(c)!.status) }}</span>
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button class="text-sm px-3 py-2 rounded border border-slate-300 text-emerald-600 min-h-[44px]" @click="openGate(c)">Gate</button>
            <button class="text-sm px-3 py-2 rounded border border-slate-300 hover:bg-slate-100 min-h-[44px]" @click="openEdit(c)">Edit</button>
            <button class="text-sm px-3 py-2 rounded border border-slate-300 text-rose-600 hover:bg-rose-50 min-h-[44px]" @click="openDelete(c)">Delete</button>
          </div>
        </div>
      </div>
    </div>

    <Modal :open="showAdd" title="Tambah Kartu" @close="showAdd = false">
      <div class="flex gap-2 mb-4 text-sm">
        <button class="px-3 py-2.5 min-h-[44px] rounded" :class="addTab === 'manual' ? 'bg-indigo-600 text-white' : 'bg-slate-100'" @click="addTab = 'manual'">Manual</button>
        <button class="px-3 py-2.5 min-h-[44px] rounded" :class="addTab === 'upload' ? 'bg-indigo-600 text-white' : 'bg-slate-100'" @click="addTab = 'upload'">Upload .txt</button>
      </div>

      <div v-if="addTab === 'manual'" class="space-y-3">
        <div>
          <label class="block text-sm font-medium mb-1">UID Kartu</label>
          <input v-model="uid" class="w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono" placeholder="56018067" />
          <p v-if="uidDuplicate" class="mt-1 text-xs text-rose-600">UID ini sudah terdaftar — gunakan UID lain.</p>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Label A</label>
          <input v-model="labelA" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="171" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Label B</label>
          <input v-model="labelB" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="25161" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Blok</label>
          <input v-model="blokManual" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="A" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">No Rumah</label>
          <input v-model="noRumahManual" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="171" />
        </div>
      </div>

      <div v-else class="space-y-3">
        <p class="text-xs text-slate-500">Format pipe-separated: <code>UID|LabelA|LabelB|Blok|NoRumah</code> (kolom opsional setelah LabelB). Baris header otomatis dilewati.</p>
        <textarea v-model="uploadText" rows="8" class="w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono" placeholder="56018067|171|25161|A|171"></textarea>
        <button class="text-sm px-3 py-2.5 min-h-[44px] rounded border border-slate-300 hover:bg-slate-100" @click="previewUpload">Pratinjau</button>
        <div v-if="uploadPreview" class="text-sm">
          <p class="text-emerald-600">{{ uploadPreview.ok }} baris valid.</p>
          <ul v-if="uploadPreview.errors.length" class="mt-1 text-rose-600 list-disc list-inside text-xs max-h-32 overflow-auto">
            <li v-for="(e, i) in uploadPreview.errors" :key="i">{{ e }}</li>
          </ul>
        </div>
      </div>

      <template #footer>
        <button class="text-sm px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100" @click="showAdd = false">Batal</button>
        <button v-if="addTab === 'manual'" class="text-sm px-4 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50" :disabled="saving || uidDuplicate" @click="submitManual">
          {{ saving ? 'Menyimpan…' : 'Simpan' }}
        </button>
        <button v-else class="text-sm px-4 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50" :disabled="saving" @click="submitUpload">
          {{ saving ? 'Mengimpor…' : 'Impor' }}
        </button>
      </template>
    </Modal>

    <Modal :open="showEdit" title="Edit Kartu" @close="showEdit = false">
      <p class="text-xs text-slate-500 mb-3">UID tidak dapat diubah.</p>
      <div class="space-y-3">
        <div>
          <label class="block text-sm font-medium mb-1">Label A</label>
          <input v-model="editLabelA" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Label B</label>
          <input v-model="editLabelB" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Blok</label>
          <input v-model="editBlok" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="A" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">No Rumah</label>
          <input v-model="editNoRumah" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="171" />
        </div>
      </div>
      <template #footer>
        <button class="text-sm px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100" @click="showEdit = false">Batal</button>
        <button class="text-sm px-4 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50" :disabled="saving" @click="submitEdit">
          {{ saving ? 'Menyimpan…' : 'Simpan' }}
        </button>
      </template>
    </Modal>

    <Modal :open="showDelete" title="Hapus Kartu" @close="showDelete = false">
      <p class="text-sm text-slate-600">Yakin menghapus kartu <strong class="font-mono">{{ deleteTarget?.uid }}</strong>?</p>
      <p v-if="deleteWarn" class="mt-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">{{ deleteWarn }}</p>
      <template #footer>
        <button class="text-sm px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100" @click="showDelete = false">Batal</button>
        <button class="text-sm px-4 py-1.5 rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50" :disabled="deleting" @click="confirmDelete">
          {{ deleting ? 'Menghapus…' : 'Hapus' }}
        </button>
      </template>
    </Modal>
    <Modal :open="showGate" title="Kirim ke Gate" @close="showGate = false">
      <p class="text-sm text-slate-600 mb-3">Kartu <strong class="font-mono">{{ gateTarget?.uid }}</strong> — Blok {{ gateTarget?.blok || '—' }}, No Rumah {{ gateTarget?.no_rumah || '—' }}.</p>
      <div>
        <label class="block text-sm font-medium mb-1">Action</label>
        <select v-model="gateAction" class="w-full rounded border border-slate-300 px-3 py-2 text-sm">
          <option value="ADD">ADD — daftarkan kartu</option>
          <option value="UPDATE">UPDATE — perbarui lokasi kartu</option>
          <option value="DELETE">DELETE — hapus kartu dari reader</option>
        </select>
      </div>
      <template #footer>
        <button class="text-sm px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100" @click="showGate = false">Batal</button>
        <button class="text-sm px-4 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50" :disabled="gateBusy" @click="submitGate">
          {{ gateBusy ? 'Mengirim…' : 'Kirim' }}
        </button>
      </template>
    </Modal>
  </div>
</template>
