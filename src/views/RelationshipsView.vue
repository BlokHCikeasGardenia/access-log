<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/toast'
import { CARD_STATUSES, type Card, type CardStatus, type Resident, type ResidentWithCards } from '@/types'

const groups = ref<ResidentWithCards[]>([])
const unassigned = ref<Card[]>([])
const loading = ref(false)

const adding = reactive<Record<string, boolean>>({})
const query = reactive<Record<string, string>>({})
const saving = ref(false)
const editingCard = ref<string | null>(null)
const editStatus = ref<CardStatus>('Aktif')

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

const totalCards = computed(() => groups.value.reduce((n, g) => n + g.cards.length, 0))

onMounted(load)
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Hubungan Penghuni &amp; Kartu</h1>
        <p class="text-sm text-slate-500">{{ groups.length }} penghuni · {{ totalCards }} kartu terpasang · {{ unassigned.length }} kartu belum terpasang.</p>
      </div>
    </div>

    <div v-if="loading" class="text-slate-500 text-sm">Memuat…</div>
    <div v-else-if="groups.length === 0" class="bg-white rounded border border-slate-200 p-8 text-center text-slate-500">
      Belum ada data penghuni. Tambah penghuni terlebih dahulu.
    </div>
    <div v-else class="bg-white rounded border border-slate-200 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left text-slate-500">
          <tr>
            <th class="px-4 py-3 font-medium">Blok</th>
            <th class="px-4 py-3 font-medium">Penghuni</th>
            <th class="px-4 py-3 font-medium">UID</th>
            <th class="px-4 py-3 font-medium">Label A</th>
            <th class="px-4 py-3 font-medium">Label B</th>
            <th class="px-4 py-3 font-medium">Card Status</th>
            <th class="px-4 py-3 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <template v-for="g in groups" :key="g.resident.id">
            <tr v-if="g.cards.length === 0" class="bg-slate-50/40">
              <td class="px-4 py-3 font-medium">{{ g.resident.blok }}</td>
              <td class="px-4 py-3 font-medium">{{ g.resident.nama }}</td>
              <td colspan="4" class="px-4 py-3 text-slate-400 italic">belum ada kartu</td>
              <td class="px-4 py-3 text-right">
                <button class="text-indigo-600 hover:underline" @click="startAdd(g.resident.id)">+ Tambah Kartu</button>
              </td>
            </tr>

            <template v-for="(c, i) in g.cards" :key="c.id">
              <tr>
                <td v-if="i === 0" :rowspan="g.cards.length" class="px-4 py-3 font-medium align-top border-r border-slate-100">{{ g.resident.blok }}</td>
                <td v-if="i === 0" :rowspan="g.cards.length" class="px-4 py-3 font-medium align-top border-r border-slate-100">{{ g.resident.nama }}</td>
                <td class="px-4 py-3 font-mono">{{ c.uid }}</td>
                <td class="px-4 py-3">{{ c.label_a || '—' }}</td>
                <td class="px-4 py-3">{{ c.label_b || '—' }}</td>
                <td class="px-4 py-3">
                  <select
                    v-if="editingCard === c.id"
                    v-model="editStatus"
                    class="rounded border border-slate-300 px-2 py-1 text-sm"
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
              <td :colspan="2" class="px-4 py-2 text-xs text-slate-500">Pasang kartu ke {{ g.resident.nama }}:</td>
              <td colspan="5" class="px-4 py-2">
                <div class="flex flex-col gap-1">
                  <input
                    v-model="query[g.resident.id]"
                    class="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
                    placeholder="Cari berdasarkan Label B / Label A / UID…"
                    autofocus
                  />
                  <div v-if="filteredUnassigned(g.resident.id).length" class="border border-slate-200 rounded bg-white max-h-40 overflow-auto">
                    <button
                      v-for="c in filteredUnassigned(g.resident.id)"
                      :key="c.id"
                      class="w-full text-left px-3 py-1.5 hover:bg-slate-100 text-sm flex gap-3"
                      :disabled="saving"
                      @click="assignCard(c, g.resident.id)"
                    >
                      <span class="font-mono">{{ c.uid }}</span>
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
              <td :colspan="2"></td>
              <td colspan="5" class="px-4 py-2">
                <button class="text-indigo-600 hover:underline text-sm" @click="startAdd(g.resident.id)">+ Tambah Kartu</button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>
