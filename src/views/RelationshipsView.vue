<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { formatLabelCombined } from '@/lib/label-decode'
import { notify } from '@/lib/toast'
import { todayJakartaISO } from '@/lib/time'
import { CARD_STATUSES, type Card, type CardStatus, type Resident, type ResidentWithCards } from '@/types'
import { enqueueGateCommand } from '@/lib/gate-command'
import { useSettingsStore } from '@/stores/settings'
import SkeletonList from '@/components/SkeletonList.vue'

const groups = ref<ResidentWithCards[]>([])
const unassigned = ref<Card[]>([])
const loading = ref(false)
const settings = useSettingsStore()

const adding = reactive<Record<string, boolean>>({})
const query = reactive<Record<string, string>>({})
const tableFilter = ref('')
const saving = ref(false)
const editingCard = ref<string | null>(null)
const editStatus = ref<CardStatus>('Aktif')

const filteredGroups = computed(() => {
  const q = tableFilter.value.toLowerCase().trim()
  if (!q) return groups.value
  return groups.value.filter(
    (g) =>
      g.resident.nama.toLowerCase().includes(q) ||
      g.resident.blok.toLowerCase().includes(q),
  )
})

async function load() {
  loading.value = true
  const [res, cardRes, unassRes] = await Promise.all([
    supabase.from('residents').select('*').order('blok'),
    supabase.from('cards').select('*'),
    supabase.from('cards').select('*').is('resident_id', null),
  ])

  if (res.error || cardRes.error || unassRes.error) {
    notify(res.error?.message || cardRes.error?.message || unassRes.error?.message || 'Gagal memuat data', 'error')
  } else {
    const residentsData = (res.data as Resident[]) ?? []
    const cardsData = (cardRes.data as Card[]) ?? []
    unassigned.value = (unassRes.data as Card[]) ?? []

    groups.value = residentsData.map((r) => ({
      resident: r,
      cards: cardsData.filter((c) => c.resident_id === r.id),
    }))
  }
  loading.value = false
}

function filteredUnassigned(residentId: string) {
  const q = (query[residentId] || '').toLowerCase().trim()
  if (!q) return unassigned.value
  return unassigned.value.filter(
    (c) =>
      (c.blok || '').toLowerCase().includes(q) ||
      (c.no_rumah || '').toLowerCase().includes(q) ||
      (c.label_b || '').toLowerCase().includes(q) ||
      (c.label_a || '').toLowerCase().includes(q) ||
      c.uid.toLowerCase().includes(q),
  )
}

async function assignCard(card: Card, residentId: string) {
  saving.value = true
  const { error } = await supabase
    .from('cards')
    .update({ resident_id: residentId, card_status: 'Aktif' })
    .eq('id', card.id)
  saving.value = false
  if (error) {
    notify(error.message, 'error')
    return
  }
  notify(`Kartu ${card.uid} dipasang.`, 'success')
  // Daftarkan kartu ke reader gate (best-effort, tidak memblokir pairing)
  // hanya ketika auto-command aktif.
  if (settings.autoCommandGate) {
    void enqueueGateCommand('ADD', { uid: card.uid, blok: card.blok, no_rumah: card.no_rumah })
  } else {
    notify('Auto-command non-aktif. Kirim ke gate manual dari halaman Sinkronisasi Gate.', 'info')
  }
  adding[residentId] = false
  query[residentId] = ''
  load()
}

function startAdd(residentId: string) {
  adding[residentId] = true
  query[residentId] = ''
}

function cancelAdd(residentId: string) {
  adding[residentId] = false
  query[residentId] = ''
}

async function unassignCard(card: Card) {
  saving.value = true
  const { error } = await supabase.from('cards').update({ resident_id: null }).eq('id', card.id)
  saving.value = false
  if (error) {
    notify(error.message, 'error')
    return
  }
  notify(`Kartu ${card.uid} dilepas.`, 'success')
  // Cabut kartu dari reader gate (best-effort) hanya ketika auto-command aktif.
  if (settings.autoCommandGate) {
    void enqueueGateCommand('DELETE', { uid: card.uid, blok: card.blok, no_rumah: card.no_rumah })
  } else {
    notify('Auto-command non-aktif. Kirim ke gate manual dari halaman Sinkronisasi Gate.', 'info')
  }
  load()
}

function startEdit(card: Card) {
  editingCard.value = card.id
  editStatus.value = card.card_status
}

async function saveStatus(card: Card) {
  saving.value = true
  const { error } = await supabase.from('cards').update({ card_status: editStatus.value }).eq('id', card.id)
  saving.value = false
  if (error) {
    notify(error.message, 'error')
    return
  }
  notify('Status kartu diperbarui.', 'success')
  editingCard.value = null
  load()
}

function cancelEdit() {
  editingCard.value = null
}

/** Get the combined label string for a card's UID. */
function cardLabelCombined(c: Card): string {
  try {
    return formatLabelCombined(BigInt(c.uid))
  } catch {
    return '—'
  }
}

function exportExcel() {
  if (groups.value.length === 0) {
    notify('Belum ada data penghuni.', 'info')
    return
  }

  const rows: Record<string, string | number>[] = []
  const groupRowRanges: { start: number; end: number }[] = []
  let rowIndex = 0

  for (const g of groups.value) {
    const cardCount = g.cards.length
    const startRow = rowIndex

    if (cardCount === 0) {
      rows.push({
        Blok: g.resident.blok,
        Nama: g.resident.nama,
        'Jumlah Kartu': 0,
        UID: '',
        'Label Kartu': 'belum ada kartu',
      })
      rowIndex++
    } else {
      for (const c of g.cards) {
        let label = '—'
        try {
          label = formatLabelCombined(BigInt(c.uid))
        } catch {
          label = '—'
        }
        rows.push({
          Blok: g.resident.blok,
          Nama: g.resident.nama,
          'Jumlah Kartu': cardCount,
          UID: c.uid,
          'Label Kartu': label,
        })
        rowIndex++
      }
    }

    groupRowRanges.push({ start: startRow, end: rowIndex - 1 })
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)

  // Apply borders per resident group
  const thickBorder = { style: 'thick', color: { rgb: '000000' } }
  const thinBorder = { style: 'thin', color: { rgb: 'CCCCCC' } }

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  const numCols = range.e.c + 1

  // SheetJS uses 0-based indexing: header at row 0, data starts at row 1
  for (const { start, end } of groupRowRanges) {
    const wsStartRow = start + 1 // data row index (0-based)
    const wsEndRow = end + 1

    if (wsStartRow === wsEndRow) {
      // Single row (resident with 0 or 1 card): apply thick border all around
      for (let col = 0; col < numCols; col++) {
        const cellAddr = XLSX.utils.encode_cell({ r: wsStartRow, c: col })
        const cell = ws[cellAddr]
        if (cell) {
          cell.s = {
            border: {
              top: thickBorder,
              bottom: thickBorder,
              left: thinBorder,
              right: thinBorder,
            },
          }
        }
      }
    } else {
      // Multiple rows (merged group): apply borders to merge cells (top-left of each merge)
      // For merged columns (0, 1, 2), only the first row cell exists visually
      // For non-merged columns (3, 4), each row has its own cell

      // First row: thick top, thin left/right, thin bottom (except merged cols)
      for (let col = 0; col < numCols; col++) {
        const cellAddr = XLSX.utils.encode_cell({ r: wsStartRow, c: col })
        const cell = ws[cellAddr]
        if (cell) {
          const isMergedCol = col <= 2 // Blok, Nama, Jumlah Kartu are merged
          cell.s = {
            border: {
              top: thickBorder,
              left: thinBorder,
              right: thinBorder,
              bottom: isMergedCol ? thickBorder : thinBorder,
            },
          }
        }
      }

      // Last row: thick bottom, thin left/right, thin top
      for (let col = 0; col < numCols; col++) {
        const cellAddr = XLSX.utils.encode_cell({ r: wsEndRow, c: col })
        const cell = ws[cellAddr]
        if (cell) {
          const isMergedCol = col <= 2
          cell.s = {
            border: {
              bottom: thickBorder,
              left: thinBorder,
              right: thinBorder,
              top: isMergedCol ? thickBorder : thinBorder,
            },
          }
        }
      }

      // Middle rows (only for non-merged columns 3, 4)
      for (let r = wsStartRow + 1; r < wsEndRow; r++) {
        for (let col = 3; col < numCols; col++) {
          const cellAddr = XLSX.utils.encode_cell({ r, c: col })
          const cell = ws[cellAddr]
          if (cell) {
            cell.s = {
              border: {
                top: thinBorder,
                bottom: thinBorder,
                left: thinBorder,
                right: thinBorder,
              },
            }
          }
        }
      }

      // Also apply left/right borders to merged cells on first/last row
      for (let col = 0; col <= 2; col++) {
        // First row merged cell
        const firstAddr = XLSX.utils.encode_cell({ r: wsStartRow, c: col })
        const firstCell = ws[firstAddr]
        if (firstCell && firstCell.s) {
          firstCell.s.border.left = thickBorder
          firstCell.s.border.right = thickBorder
        }
        // Last row merged cell
        const lastAddr = XLSX.utils.encode_cell({ r: wsEndRow, c: col })
        const lastCell = ws[lastAddr]
        if (lastCell && lastCell.s) {
          lastCell.s.border.left = thickBorder
          lastCell.s.border.right = thickBorder
        }
      }
    }
  }

  // Set column widths
  ws['!cols'] = [
    { wch: 15 }, // Blok
    { wch: 25 }, // Nama
    { wch: 12 }, // Jumlah Kartu
    { wch: 20 }, // UID
    { wch: 40 }, // Label Kartu
  ]

  // Merge cells for Blok, Nama, Jumlah Kartu per resident group
  ws['!merges'] = []
  for (const { start, end } of groupRowRanges) {
    if (start !== end) {
      const wsStartRow = start + 1
      const wsEndRow = end + 1
      ws['!merges'].push({ s: { r: wsStartRow, c: 0 }, e: { r: wsEndRow, c: 0 } })
      ws['!merges'].push({ s: { r: wsStartRow, c: 1 }, e: { r: wsEndRow, c: 1 } })
      ws['!merges'].push({ s: { r: wsStartRow, c: 2 }, e: { r: wsEndRow, c: 2 } })
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Pairing')

  const filename = `rekap-pairing-${todayJakartaISO().slice(0, 10)}.xlsx`

  try {
    XLSX.writeFile(wb, filename)
    notify('Rekap pairing diunduh.', 'success')
  } catch (err) {
    notify(err instanceof Error ? err.message : 'Gagal mengekspor Excel', 'error')
  }
}

const totalCards = computed(() => groups.value.reduce((n, g) => n + g.cards.length, 0))
const unassignedResidents = computed(() => groups.value.filter((g) => g.cards.length === 0).length)
const avgCardsPerResident = computed(() => {
  if (groups.value.length === 0) return '0'
  return (totalCards.value / groups.value.length).toFixed(1)
})

onMounted(load)
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8">
<div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Pairing Penghuni & Kartu</h1>
        <p class="text-sm text-slate-500">{{ groups.length }} penghuni · {{ totalCards }} kartu terpasang · {{ unassigned.length }} kartu belum terpasang · {{ unassignedResidents }} belum punya kartu · Rata-rata {{ avgCardsPerResident }} kartu/penghuni.</p>
      </div>
      <button class="text-sm px-3 py-2 rounded border border-slate-300 hover:bg-slate-100 min-h-[44px]" @click="exportExcel">Export Excel</button>
    </div>

    <div v-if="groups.length" class="flex flex-col md:flex-row md:items-end gap-3 mb-4">
      <div class="flex-1">
        <label class="block text-sm font-medium text-slate-600 mb-1">Filter</label>
        <input v-model="tableFilter" type="text" placeholder="Cari berdasarkan Nama atau Blok…" class="w-full rounded border border-slate-300 px-3 py-2 text-sm min-h-[44px]" />
      </div>
    </div>

    <SkeletonList v-if="loading" :rows="4" card />
    <div v-else-if="groups.length === 0" class="bg-white rounded border border-slate-200 p-8 text-center text-slate-500">
      Belum ada data penghuni. Tambah penghuni terlebih dahulu.
    </div>

<div v-if="filteredGroups.length" class="hidden md:block bg-white rounded border border-slate-200 overflow-x-auto">
      <table class="w-full text-xs">
        <thead class="bg-slate-50 text-left text-slate-500">
          <tr>
            <th class="px-4 py-3 font-medium">Blok (Penghuni)</th>
            <th class="px-4 py-3 font-medium">UID</th>
            <th class="px-4 py-3 font-medium">Label Kartu</th>
            <th class="px-4 py-3 font-medium">Blok</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <template v-for="g in filteredGroups" :key="g.resident.id">
            <tr v-if="g.cards.length === 0" class="bg-slate-50/40">
              <td class="px-4 py-3 font-medium">{{ g.resident.blok }} · {{ g.resident.nama }}</td>
              <td colspan="4" class="px-4 py-3 text-slate-400 italic">belum ada kartu</td>
              <td class="px-4 py-3 text-right">
                <button class="text-indigo-600 hover:underline" @click="startAdd(g.resident.id)">+ Tambah Kartu</button>
              </td>
            </tr>

            <template v-for="(c, i) in g.cards" :key="c.id">
              <tr>
                <td v-if="i === 0" :rowspan="g.cards.length" class="px-4 py-3 font-medium align-top border-r border-slate-100">{{ g.resident.blok }} · {{ g.resident.nama }}</td>
                <td class="px-4 py-3 font-mono">{{ c.uid }}</td>
                <td class="px-4 py-3 font-mono text-xs">{{ cardLabelCombined(c) }}</td>
                <td class="px-4 py-3 text-xs">{{ (c.blok || '—') + '/' + (c.no_rumah || '—') }}</td>
                <td class="px-4 py-3">
                  <select
                    v-if="editingCard === c.id"
                    v-model="editStatus"
                    class="rounded border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option v-for="s in CARD_STATUSES" :key="s" :value="s">{{ s }}</option>
                  </select>
                  <span v-else class="inline-block px-2 py-0.5 rounded-full text-xs" :class="{
                    'bg-emerald-100 text-emerald-700': c.card_status === 'Aktif',
                    'bg-amber-100 text-amber-700': c.card_status === 'Rusak',
                    'bg-rose-100 text-rose-700': c.card_status === 'Hilang',
                  }">{{ c.card_status }}</span>
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <template v-if="editingCard === c.id">
                    <button class="text-emerald-600 hover:underline mr-2" :disabled="saving" @click="saveStatus(c)">Simpan</button>
                    <button class="text-slate-500 hover:underline" @click="cancelEdit">Batal</button>
                  </template>
                  <template v-else>
                    <button class="text-indigo-600 hover:underline mr-2" @click="startEdit(c)">Edit</button>
                    <button class="text-rose-600 hover:underline" :disabled="saving" @click="unassignCard(c)">Delete</button>
                  </template>
                </td>
              </tr>
            </template>

            <tr v-if="adding[g.resident.id]" class="bg-indigo-50/40">
              <td class="px-4 py-2 text-xs text-slate-500">Pasang kartu ke {{ g.resident.nama }}:</td>
              <td colspan="5" class="px-4 py-2">
                <div class="flex flex-col gap-1">
                    <input
                      v-model="query[g.resident.id]"
                      class="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
                      placeholder="Cari berdasarkan Blok / No Rumah / UID…"
                      autofocus
                    />
                  <div v-if="filteredUnassigned(g.resident.id).length" class="border border-slate-200 rounded bg-white max-h-40 overflow-auto">
                    <button
                      v-for="c in filteredUnassigned(g.resident.id)"
                      :key="c.id"
                      class="w-full text-left px-3 py-1.5 hover:bg-slate-100 text-sm flex flex-wrap gap-x-3 gap-y-0.5"
                      :disabled="saving"
                      @click="assignCard(c, g.resident.id)"
                    >
                      <span class="font-mono">{{ c.uid }}</span>
                      <span class="text-slate-500">Blok:{{ c.blok || '—' }}</span>
                      <span class="text-slate-500">No:{{ c.no_rumah || '—' }}</span>
                      <span class="text-slate-500">A:{{ c.label_a || '—' }}</span>
                      <span class="text-slate-500">B:{{ c.label_b || '—' }}</span>
                    </button>
                  </div>
                  <p v-else class="text-xs text-slate-400">Tidak ada kartu yang cocok (atau semua sudah terpasang).</p>
                  <button class="self-start text-xs text-slate-500 hover:underline" @click="cancelAdd(g.resident.id)">Batal</button>
                </div>
              </td>
            </tr>

            <tr v-else-if="g.cards.length > 0" class="bg-slate-50/40">
              <td></td>
              <td colspan="5" class="px-4 py-2">
                <button class="text-indigo-600 hover:underline text-xs" @click="startAdd(g.resident.id)">+ Tambah Kartu</button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <div v-if="filteredGroups.length" class="md:hidden space-y-4">
      <div v-for="g in filteredGroups" :key="g.resident.id" class="bg-white rounded border border-slate-200 p-4">
        <div class="flex items-start justify-between gap-2 mb-2">
          <div>
            <span class="font-semibold text-slate-800">{{ g.resident.blok }}</span>
            <span class="text-sm text-slate-600 ml-2">{{ g.resident.nama }}</span>
          </div>
          <button v-if="!adding[g.resident.id]" class="text-sm px-3 py-2 rounded border border-slate-300 hover:bg-slate-100 min-h-[44px]" @click="startAdd(g.resident.id)">+ Tambah Kartu</button>
        </div>

        <div v-if="g.cards.length === 0 && !adding[g.resident.id]" class="text-xs text-slate-400 italic py-2">belum ada kartu</div>

        <div v-if="adding[g.resident.id]" class="mt-2 space-y-2">
          <input
            v-model="query[g.resident.id]"
            class="w-full rounded border border-slate-300 px-3 py-2 text-sm min-h-[44px]"
            placeholder="Cari berdasarkan Blok / No Rumah / UID…"
            autofocus
          />
          <div v-if="filteredUnassigned(g.resident.id).length" class="border border-slate-200 rounded bg-white max-h-40 overflow-auto">
            <button
              v-for="c in filteredUnassigned(g.resident.id)"
              :key="c.id"
              class="w-full text-left px-3 py-2.5 min-h-[44px] hover:bg-slate-100 text-sm flex flex-wrap gap-x-3 gap-y-0.5"
              :disabled="saving"
              @click="assignCard(c, g.resident.id)"
            >
              <span class="font-mono">{{ c.uid }}</span>
              <span class="text-slate-500">Blok:{{ c.blok || '—' }}</span>
              <span class="text-slate-500">No:{{ c.no_rumah || '—' }}</span>
              <span class="text-slate-500">A:{{ c.label_a || '—' }}</span>
              <span class="text-slate-500">B:{{ c.label_b || '—' }}</span>
            </button>
          </div>
          <p v-else class="text-xs text-slate-400">Tidak ada kartu yang cocok.</p>
          <button class="text-xs text-slate-500 hover:underline" @click="cancelAdd(g.resident.id)">Batal</button>
        </div>

        <div v-if="g.cards.length" class="mt-2 space-y-2">
          <div v-for="c in g.cards" :key="c.id" class="border border-slate-100 rounded p-3">
            <div class="flex items-center justify-between gap-2">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-mono text-sm font-semibold text-slate-800">{{ c.uid }}</span>
                  <span v-if="editingCard !== c.id" class="inline-block px-2 py-0.5 rounded-full text-xs" :class="{
                    'bg-emerald-100 text-emerald-700': c.card_status === 'Aktif',
                    'bg-amber-100 text-amber-700': c.card_status === 'Rusak',
                    'bg-rose-100 text-rose-700': c.card_status === 'Hilang',
                  }">{{ c.card_status }}</span>
                </div>
                <p class="text-xs text-slate-500 font-mono">{{ cardLabelCombined(c) }}</p>
                <p class="text-xs text-slate-500">Blok: {{ (c.blok || '—') + '/' + (c.no_rumah || '—') }}</p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <template v-if="editingCard === c.id">
                  <select v-model="editStatus" class="rounded border border-slate-300 px-2 py-1 text-sm min-h-[44px]">
                    <option v-for="s in CARD_STATUSES" :key="s" :value="s">{{ s }}</option>
                  </select>
                  <button class="text-sm px-3 py-2 rounded border border-slate-300 text-emerald-600 hover:bg-emerald-50 min-h-[44px]" :disabled="saving" @click="saveStatus(c)">Simpan</button>
                  <button class="text-sm px-3 py-2 rounded border border-slate-300 hover:bg-slate-100 min-h-[44px]" @click="cancelEdit">Batal</button>
                </template>
                <template v-else>
                  <button class="text-sm px-3 py-2 rounded border border-slate-300 hover:bg-slate-100 min-h-[44px]" @click="startEdit(c)">Edit</button>
                  <button class="text-sm px-3 py-2 rounded border border-slate-300 text-rose-600 hover:bg-rose-50 min-h-[44px]" :disabled="saving" @click="unassignCard(c)">Delete</button>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
