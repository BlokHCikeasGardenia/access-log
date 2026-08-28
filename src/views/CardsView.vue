<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { parseCards } from '@/lib/parse'
import { notify } from '@/lib/toast'
import { friendlyError, isUniqueViolation } from '@/lib/errors'
import type { Card } from '@/types'
import Modal from '@/components/Modal.vue'

const cards = ref<Card[]>([])
const residents = ref<Record<string, string>>({})
const loading = ref(false)

const showAdd = ref(false)
const addTab = ref<'manual' | 'upload'>('manual')
const uid = ref('')
const labelA = ref('')
const labelB = ref('')
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

const showEdit = ref(false)
const editTarget = ref<Card | null>(null)
const editLabelA = ref('')
const editLabelB = ref('')

const showDelete = ref(false)
const deleteTarget = ref<Card | null>(null)
const deleteWarn = ref<string | null>(null)
const deleting = ref(false)

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
}

function residentName(id: string | null) {
  return id ? residents.value[id] ?? '—' : '—'
}

function openAdd() {
  addTab.value = 'manual'
  uid.value = ''
  labelA.value = ''
  labelB.value = ''
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
    .insert({ uid: uid.value.trim(), label_a: labelA.value.trim() || null, label_b: labelB.value.trim() || null })
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
  showEdit.value = true
}

async function submitEdit() {
  if (!editTarget.value) return
  saving.value = true
  const { error } = await supabase
    .from('cards')
    .update({
      label_a: editLabelA.value.trim() || null,
      label_b: editLabelB.value.trim() || null,
    })
    .eq('id', editTarget.value.id)
  saving.value = false
  if (error) {
    notify(error.message, 'error')
    return
  }
  notify('Label kartu diperbarui.', 'success')
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
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Kartu</h1>
        <p class="text-sm text-slate-500">Master kartu akses (UID, Label A, Label B).</p>
      </div>
      <button class="bg-indigo-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-indigo-700" @click="openAdd">
        + Tambah Kartu
      </button>
    </div>

    <div v-if="loading" class="text-slate-500 text-sm">Memuat…</div>
    <div v-else-if="cards.length === 0" class="bg-white rounded border border-slate-200 p-8 text-center text-slate-500">
      Belum ada data kartu.
    </div>
    <div v-else class="bg-white rounded border border-slate-200 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left text-slate-500">
          <tr>
            <th class="px-4 py-3 font-medium">UID</th>
            <th class="px-4 py-3 font-medium">Label A</th>
            <th class="px-4 py-3 font-medium">Label B</th>
            <th class="px-4 py-3 font-medium">Penghuni</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="c in cards" :key="c.id">
            <td class="px-4 py-3 font-mono">{{ c.uid }}</td>
            <td class="px-4 py-3">{{ c.label_a || '—' }}</td>
            <td class="px-4 py-3">{{ c.label_b || '—' }}</td>
            <td class="px-4 py-3">{{ residentName(c.resident_id) }}</td>
            <td class="px-4 py-3">
              <span class="inline-block px-2 py-0.5 rounded-full text-xs" :class="{
                'bg-emerald-100 text-emerald-700': c.card_status === 'Aktif',
                'bg-amber-100 text-amber-700': c.card_status === 'Rusak',
                'bg-rose-100 text-rose-700': c.card_status === 'Hilang',
              }">{{ c.card_status }}</span>
            </td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
              <button class="text-indigo-600 hover:underline mr-3" @click="openEdit(c)">Edit</button>
              <button class="text-rose-600 hover:underline" @click="openDelete(c)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal :open="showAdd" title="Tambah Kartu" @close="showAdd = false">
      <div class="flex gap-2 mb-4 text-sm">
        <button class="px-3 py-1.5 rounded" :class="addTab === 'manual' ? 'bg-indigo-600 text-white' : 'bg-slate-100'" @click="addTab = 'manual'">Manual</button>
        <button class="px-3 py-1.5 rounded" :class="addTab === 'upload' ? 'bg-indigo-600 text-white' : 'bg-slate-100'" @click="addTab = 'upload'">Upload .txt</button>
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
      </div>

      <div v-else class="space-y-3">
        <p class="text-xs text-slate-500">Format pipe-separated: <code>UID|LabelA|LabelB</code>. Baris header otomatis dilewati.</p>
        <textarea v-model="uploadText" rows="8" class="w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono" placeholder="56018067|171|25161"></textarea>
        <button class="text-sm px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100" @click="previewUpload">Pratinjau</button>
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

    <Modal :open="showEdit" title="Edit Label Kartu" @close="showEdit = false">
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
  </div>
</template>
