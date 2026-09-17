<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { parseResidents } from '@/lib/parse'
import { notify } from '@/lib/toast'
import type { Resident } from '@/types'
import { enqueueGateCommand } from '@/lib/gate-command'
import Modal from '@/components/Modal.vue'

const residents = ref<Resident[]>([])
const loading = ref(false)

const filterQuery = ref('')
const filterBlok = ref('')
const filterStatus = ref('')

const filteredResidents = computed(() => {
  const q = filterQuery.value.trim().toLowerCase()
  return residents.value.filter((r) => {
    if (q) {
      const hay = `${r.blok} ${r.nama}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (filterBlok.value && r.blok.toLowerCase() !== filterBlok.value.trim().toLowerCase()) return false
    if (filterStatus.value && r.status !== filterStatus.value) return false
    return true
  })
})

const totalResidents = computed(() => residents.value.length)
const activeResidents = computed(() => residents.value.filter((r) => r.status === 'Active').length)
const inactiveResidents = computed(() => residents.value.filter((r) => r.status === 'Inactive').length)

const uniqueBloks = computed(() => {
  const s = new Set(residents.value.map((r) => r.blok).filter(Boolean))
  return [...s].sort((a, b) => a.localeCompare(b))
})

const showAdd = ref(false)
const addTab = ref<'manual' | 'upload'>('manual')
const blok = ref('')
const nama = ref('')
const status = ref('Active')
const uploadText = ref('')
const uploadPreview = ref<{ ok: number; errors: string[] } | null>(null)
const saving = ref(false)

const showEdit = ref(false)
const editTarget = ref<Resident | null>(null)
const editBlok = ref('')
const editNama = ref('')
const editStatus = ref('Active')

const showDelete = ref(false)
const deleteTarget = ref<Resident | null>(null)
const deleteWarn = ref<string | null>(null)
const deleting = ref(false)

async function load() {
  loading.value = true
  const { data, error } = await supabase
    .from('residents')
    .select('*')
    .order('blok')
  if (error) {
    notify(error.message, 'error')
  } else {
    residents.value = (data as Resident[]) ?? []
  }
  loading.value = false
}

function openAdd() {
  addTab.value = 'manual'
  blok.value = ''
  nama.value = ''
  status.value = 'Active'
  uploadText.value = ''
  uploadPreview.value = null
  showAdd.value = true
}

function previewUpload() {
  const { rows, errors } = parseResidents(uploadText.value)
  uploadPreview.value = { ok: rows.length, errors }
}

async function submitManual() {
  if (!blok.value.trim() || !nama.value.trim()) {
    notify('Blok dan nama wajib diisi.', 'error')
    return
  }
  saving.value = true
  const { error } = await supabase
    .from('residents')
    .insert({ blok: blok.value.trim(), nama: nama.value.trim(), status: status.value })
  saving.value = false
  if (error) {
    notify(error.message, 'error')
    return
  }
  notify('Penghuni ditambahkan.', 'success')
  showAdd.value = false
  load()
}

async function submitUpload() {
  const { rows, errors } = parseResidents(uploadText.value)
  if (rows.length === 0) {
    notify('Tidak ada baris valid untuk diimpor.', 'error')
    return
  }
  saving.value = true
  const { error } = await supabase.from('residents').insert(rows)
  saving.value = false
  if (error) {
    notify(error.message, 'error')
    return
  }
  const msg = `Berhasil impor ${rows.length} penghuni.` + (errors.length ? ` ${errors.length} baris dilewati.` : '')
  notify(msg, errors.length ? 'info' : 'success')
  showAdd.value = false
  load()
}

function openEdit(r: Resident) {
  editTarget.value = r
  editBlok.value = r.blok
  editNama.value = r.nama
  editStatus.value = r.status
  showEdit.value = true
}

async function submitEdit() {
  if (!editTarget.value) return
  if (!editBlok.value.trim() || !editNama.value.trim()) {
    notify('Blok dan nama wajib diisi.', 'error')
    return
  }
  saving.value = true
  const { error } = await supabase
    .from('residents')
    .update({ blok: editBlok.value.trim(), nama: editNama.value.trim(), status: editStatus.value })
    .eq('id', editTarget.value.id)
  saving.value = false
  if (error) {
    notify(error.message, 'error')
    return
  }
  notify('Data penghuni diperbarui.', 'success')
  showEdit.value = false
  load()
}

async function openDelete(r: Resident) {
  deleteTarget.value = r
  deleteWarn.value = null
  const { count } = await supabase
    .from('cards')
    .select('*', { count: 'exact', head: true })
    .eq('resident_id', r.id)
  if (count && count > 0) {
    deleteWarn.value = `Penghuni ini masih memiliki ${count} kartu terpasang. Menghapus akan membiarkan kartu tersebut tanpa penghuni (kembali ke pool kartu).`
  }
  showDelete.value = true
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  // Cabut semua kartu milik penghuni ini dari reader gate, lalu lepaskan
  // relasinya (FK residents.id) sebelum penghuni dihapus.
  const { data: linked } = await supabase
    .from('cards')
    .select('*')
    .eq('resident_id', deleteTarget.value.id)
  for (const card of (linked ?? []) as import('@/types').Card[]) {
    void enqueueGateCommand('DELETE', { uid: card.uid, blok: card.blok, no_rumah: card.no_rumah })
  }
  if (linked && linked.length > 0) {
    const { error: unassignErr } = await supabase
      .from('cards')
      .update({ resident_id: null })
      .eq('resident_id', deleteTarget.value.id)
    if (unassignErr) {
      deleting.value = false
      notify(unassignErr.message, 'error')
      return
    }
  }
  const { error } = await supabase.from('residents').delete().eq('id', deleteTarget.value.id)
  deleting.value = false
  if (error) {
    notify(error.message, 'error')
    return
  }
  notify('Penghuni dihapus.', 'success')
  showDelete.value = false
  load()
}

onMounted(load)
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Penghuni</h1>
        <p class="text-sm text-slate-500">Daftar penghuni komplek.</p>
      </div>
      <button class="bg-indigo-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-indigo-700" @click="openAdd">
        + Tambah Penghuni
      </button>
    </div>

<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <div class="bg-white rounded border border-slate-200 p-3 text-center">
        <p class="text-2xl font-bold text-slate-800">{{ totalResidents }}</p>
        <p class="text-xs text-slate-500">Total Penghuni</p>
      </div>
      <div class="bg-white rounded border border-slate-200 p-3 text-center">
        <p class="text-2xl font-bold text-emerald-600">{{ activeResidents }}</p>
        <p class="text-xs text-slate-500">Aktif</p>
      </div>
      <div class="bg-white rounded border border-slate-200 p-3 text-center">
        <p class="text-2xl font-bold text-amber-600">{{ inactiveResidents }}</p>
        <p class="text-xs text-slate-500">Tidak Aktif</p>
      </div>
      <div class="bg-white rounded border border-slate-200 p-3 text-center">
        <p class="text-2xl font-bold text-slate-600">{{ uniqueBloks.length }}</p>
        <p class="text-xs text-slate-500">Blok</p>
      </div>
    </div>

    <div v-if="residents.length" class="bg-white rounded border border-slate-200 p-4 mb-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1">Pencarian</label>
            <input v-model="filterQuery" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Blok / Nama" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1">Blok</label>
            <select v-model="filterBlok" class="w-full rounded border border-slate-300 px-3 py-2 text-sm">
              <option value="">Semua</option>
              <option v-for="b in uniqueBloks" :key="b" :value="b">{{ b }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <select v-model="filterStatus" class="w-full rounded border border-slate-300 px-3 py-2 text-sm">
              <option value="">Semua</option>
              <option value="Active">Aktif</option>
              <option value="Inactive">Tidak Aktif</option>
            </select>
          </div>
        </div>
        <p v-if="filteredResidents.length !== residents.length" class="text-xs text-slate-500 mt-2">{{ filteredResidents.length }} dari {{ residents.length }} penghuni ditampilkan.</p>
      </div>

      <div v-if="loading" class="text-slate-500 text-sm">Memuat…</div>
      <div v-else-if="residents.length === 0" class="bg-white rounded border border-slate-200 p-8 text-center text-slate-500">
        Belum ada data penghuni.
      </div>

      <div v-if="residents.length" class="hidden md:block bg-white rounded border border-slate-200 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left text-slate-500">
          <tr>
            <th class="px-4 py-3 font-medium">Blok</th>
            <th class="px-4 py-3 font-medium">Nama</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium text-right">Action</th>
          </tr>
        </thead>
<tbody class="divide-y divide-slate-100">
           <tr v-for="r in filteredResidents" :key="r.id">
            <td class="px-4 py-3">{{ r.blok }}</td>
            <td class="px-4 py-3">{{ r.nama }}</td>
            <td class="px-4 py-3">
              <span class="inline-block px-2 py-0.5 rounded-full text-xs bg-slate-100">{{ r.status }}</span>
            </td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
              <button class="text-indigo-600 hover:underline mr-3" @click="openEdit(r)">Edit</button>
              <button class="text-rose-600 hover:underline" @click="openDelete(r)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

<div v-if="filteredResidents.length" class="md:hidden space-y-3">
       <div v-for="r in filteredResidents" :key="r.id" class="bg-white rounded border border-slate-200 p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-semibold text-slate-800">{{ r.blok }}</span>
              <span class="inline-block px-2 py-0.5 rounded-full text-xs bg-slate-100">{{ r.status }}</span>
            </div>
            <p class="text-sm text-slate-600 truncate">{{ r.nama }}</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button class="text-sm px-3 py-2 rounded border border-slate-300 hover:bg-slate-100 min-h-[44px]" @click="openEdit(r)">Edit</button>
            <button class="text-sm px-3 py-2 rounded border border-slate-300 text-rose-600 hover:bg-rose-50 min-h-[44px]" @click="openDelete(r)">Delete</button>
          </div>
        </div>
      </div>
    </div>

    <Modal :open="showAdd" title="Tambah Penghuni" @close="showAdd = false">
      <div class="flex gap-2 mb-4 text-sm">
        <button class="px-3 py-1.5 rounded" :class="addTab === 'manual' ? 'bg-indigo-600 text-white' : 'bg-slate-100'" @click="addTab = 'manual'">Manual</button>
        <button class="px-3 py-1.5 rounded" :class="addTab === 'upload' ? 'bg-indigo-600 text-white' : 'bg-slate-100'" @click="addTab = 'upload'">Upload .txt</button>
      </div>

      <div v-if="addTab === 'manual'" class="space-y-3">
        <div>
          <label class="block text-sm font-medium mb-1">Blok</label>
          <input v-model="blok" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="3/1" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Nama</label>
          <input v-model="nama" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Jono" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Status</label>
          <select v-model="status" class="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            <option>Active</option>
            <option>Inactive</option>
          </select>
        </div>
      </div>

      <div v-else class="space-y-3">
        <p class="text-xs text-slate-500">Format TAB-separated: <code>Blok&lt;TAB&gt;Nama</code>. Baris header otomatis dilewati.</p>
        <textarea v-model="uploadText" rows="8" class="w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono" placeholder="3/1&#9;Jono"></textarea>
        <div class="flex gap-2">
          <button class="text-sm px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100" @click="previewUpload">Pratinjau</button>
        </div>
        <div v-if="uploadPreview" class="text-sm">
          <p class="text-emerald-600">{{ uploadPreview.ok }} baris valid.</p>
          <ul v-if="uploadPreview.errors.length" class="mt-1 text-rose-600 list-disc list-inside text-xs max-h-32 overflow-auto">
            <li v-for="(e, i) in uploadPreview.errors" :key="i">{{ e }}</li>
          </ul>
        </div>
      </div>

      <template #footer>
        <button class="text-sm px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100" @click="showAdd = false">Batal</button>
        <button v-if="addTab === 'manual'" class="text-sm px-4 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50" :disabled="saving" @click="submitManual">
          {{ saving ? 'Menyimpan…' : 'Simpan' }}
        </button>
        <button v-else class="text-sm px-4 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50" :disabled="saving" @click="submitUpload">
          {{ saving ? 'Mengimpor…' : 'Impor' }}
        </button>
      </template>
    </Modal>

    <Modal :open="showEdit" title="Edit Penghuni" @close="showEdit = false">
      <div class="space-y-3">
        <div>
          <label class="block text-sm font-medium mb-1">Blok</label>
          <input v-model="editBlok" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Nama</label>
          <input v-model="editNama" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Status</label>
          <select v-model="editStatus" class="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            <option>Active</option>
            <option>Inactive</option>
          </select>
        </div>
      </div>
      <template #footer>
        <button class="text-sm px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100" @click="showEdit = false">Batal</button>
        <button class="text-sm px-4 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50" :disabled="saving" @click="submitEdit">
          {{ saving ? 'Menyimpan…' : 'Simpan' }}
        </button>
      </template>
    </Modal>

    <Modal :open="showDelete" title="Hapus Penghuni" @close="showDelete = false">
      <p class="text-sm text-slate-600">Yakin menghapus <strong>{{ deleteTarget?.nama }}</strong> (Blok {{ deleteTarget?.blok }})?</p>
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
