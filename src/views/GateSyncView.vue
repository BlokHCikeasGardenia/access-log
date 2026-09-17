<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/toast'
import { GATE_ACTIONS, type GateAction, type GateCommand } from '@/types'
import {
  resumePendingGateCommands,
  retryGateCommand,
  sendGateCommand,
  checkGateResult,
  gateStatusClass,
  gateStatusLabel,
} from '@/lib/gate-command'

const commands = ref<GateCommand[]>([])
const loading = ref(false)

const mUid = ref('')
const mAction = ref<GateAction>('ADD')
const mBlok = ref('')
const mNoRumah = ref('')
const mSaving = ref(false)

const activeStatuses = ['QUEUED', 'SENDING', 'WAITING_RESULT']

const stats = computed(() => ({
  total: commands.value.length,
  active: commands.value.filter((c) => activeStatuses.includes(c.status)).length,
  done: commands.value.filter((c) => c.status === 'DONE').length,
  failed: commands.value.filter((c) => c.status === 'FAILED').length,
}))

async function load() {
  loading.value = true
  const { data, error } = await supabase
    .from('gate_commands')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    notify(error.message, 'error')
  } else {
    commands.value = (data as GateCommand[]) ?? []
  }
  loading.value = false
}

function feedbackPesan(c: GateCommand): string {
  const d = c.feedback_json?.data as Record<string, unknown> | undefined
  const pesan = d?.pesan as string | undefined
  const tgl = d?.tgl_eksekusi as string | undefined
  return [pesan, tgl ? `Eksekusi: ${tgl}` : null].filter(Boolean).join(' · ')
}

async function retry(c: GateCommand) {
  await retryGateCommand(c.id)
  notify(`Command ${c.action} UID ${c.uid} dikirim ulang.`, 'info')
  load()
}

async function check(c: GateCommand) {
  await checkGateResult(c.id)
  load()
}

async function sendManual() {
  if (!mUid.value.trim() || Number.isNaN(Number(mUid.value.trim()))) {
    notify('UID wajib diisi dan harus berupa angka.', 'error')
    return
  }
  mSaving.value = true
  const { data, error } = await supabase
    .from('gate_commands')
    .insert({
      action: mAction.value,
      uid: mUid.value.trim(),
      blok: mBlok.value.trim(),
      no_rumah: mNoRumah.value.trim(),
    })
    .select()
    .single()
  mSaving.value = false
  if (error) {
    notify(error.message, 'error')
    return
  }
  notify(`Command ${mAction.value} UID ${mUid.value.trim()} masuk antrean.`, 'success')
  mUid.value = ''
  mBlok.value = ''
  mNoRumah.value = ''
  void sendGateCommand(data as GateCommand)
  load()
}

let timer: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  await load()
  void resumePendingGateCommands()
  timer = setInterval(async () => {
    if (commands.value.some((c) => activeStatuses.includes(c.status))) {
      for (const c of commands.value.filter((x) => activeStatuses.includes(x.status))) {
        void checkGateResult(c.id)
      }
      setTimeout(load, 1500)
    }
  }, 20000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Sinkronisasi Gate</h1>
        <p class="text-sm text-slate-500">Antrean command kartu ke reader gerbang dan feedback-nya.</p>
      </div>
      <button class="border border-slate-300 rounded px-4 py-2 text-sm hover:bg-slate-100" :disabled="loading" @click="load">
        {{ loading ? 'Memuat…' : 'Refresh' }}
      </button>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <div class="bg-white rounded border border-slate-200 p-3 text-center">
        <p class="text-2xl font-bold text-slate-800">{{ stats.total }}</p>
        <p class="text-xs text-slate-500">Total Command</p>
      </div>
      <div class="bg-white rounded border border-slate-200 p-3 text-center">
        <p class="text-2xl font-bold text-amber-600">{{ stats.active }}</p>
        <p class="text-xs text-slate-500">Dalam Proses</p>
      </div>
      <div class="bg-white rounded border border-slate-200 p-3 text-center">
        <p class="text-2xl font-bold text-emerald-600">{{ stats.done }}</p>
        <p class="text-xs text-slate-500">Selesai</p>
      </div>
      <div class="bg-white rounded border border-slate-200 p-3 text-center">
        <p class="text-2xl font-bold text-rose-600">{{ stats.failed }}</p>
        <p class="text-xs text-slate-500">Gagal</p>
      </div>
    </div>

    <div class="bg-white rounded border border-slate-200 p-4 mb-6">
      <p class="text-sm font-medium text-slate-700 mb-3">Kirim Command Manual</p>
      <div class="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1">Action</label>
          <select v-model="mAction" class="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            <option v-for="a in GATE_ACTIONS" :key="a" :value="a">{{ a }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1">UID</label>
          <input v-model="mUid" class="w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono" placeholder="56909775" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1">Blok</label>
          <input v-model="mBlok" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="H" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1">No Rumah</label>
          <input v-model="mNoRumah" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="25" />
        </div>
        <button class="bg-indigo-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50" :disabled="mSaving" @click="sendManual">
          {{ mSaving ? 'Menyimpan…' : 'Kirim' }}
        </button>
      </div>
    </div>

    <div v-if="loading && commands.length === 0" class="text-slate-500 text-sm">Memuat…</div>
    <div v-else-if="commands.length === 0" class="bg-white rounded border border-slate-200 p-8 text-center text-slate-500">
      Belum ada command gate.
    </div>

    <div v-if="commands.length" class="hidden md:block bg-white rounded border border-slate-200 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left text-slate-500">
          <tr>
            <th class="px-4 py-3 font-medium">Waktu</th>
            <th class="px-4 py-3 font-medium">Action</th>
            <th class="px-4 py-3 font-medium">UID</th>
            <th class="px-4 py-3 font-medium">Blok</th>
            <th class="px-4 py-3 font-medium">No Rumah</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium">Feedback / Error</th>
            <th class="px-4 py-3 font-medium text-right">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="c in commands" :key="c.id">
            <td class="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{{ c.created_at?.replace('T', ' ').slice(0, 19) }}</td>
            <td class="px-4 py-3 font-medium">{{ c.action }}</td>
            <td class="px-4 py-3 font-mono">{{ c.uid }}</td>
            <td class="px-4 py-3">{{ c.blok || '—' }}</td>
            <td class="px-4 py-3">{{ c.no_rumah || '—' }}</td>
            <td class="px-4 py-3">
              <span class="inline-block px-2 py-0.5 rounded-full text-xs" :class="gateStatusClass(c.status)">{{ gateStatusLabel(c.status) }}</span>
              <span v-if="c.attempt_count > 1" class="ml-1 text-xs text-slate-400">×{{ c.attempt_count }}</span>
            </td>
            <td class="px-4 py-3 text-xs max-w-xs">
              <p v-if="c.status === 'DONE'" class="text-emerald-700">{{ feedbackPesan(c) }}</p>
              <p v-else-if="c.status === 'FAILED'" class="text-rose-700">{{ c.error_message || feedbackPesan(c) }}</p>
              <p v-else-if="c.error_message" class="text-amber-700">{{ c.error_message }}</p>
              <p v-else class="text-slate-400">—</p>
            </td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
              <button v-if="c.status === 'FAILED' || c.status === 'QUEUED'" class="text-indigo-600 hover:underline mr-2" @click="retry(c)">Ulangi</button>
              <button v-if="activeStatuses.includes(c.status)" class="text-slate-600 hover:underline" @click="check(c)">Cek Feedback</button>
              <span v-if="c.status === 'DONE'" class="text-slate-300">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="commands.length" class="md:hidden space-y-3">
      <div v-for="c in commands" :key="c.id" class="bg-white rounded border border-slate-200 p-4">
        <div class="flex items-center justify-between mb-1">
          <span class="font-mono text-sm font-semibold">{{ c.uid }}</span>
          <span class="inline-block px-2 py-0.5 rounded-full text-xs" :class="gateStatusClass(c.status)">{{ gateStatusLabel(c.status) }}</span>
        </div>
        <p class="text-xs text-slate-500">{{ c.action }} · Blok {{ c.blok || '—' }} · No {{ c.no_rumah || '—' }}</p>
        <p class="text-xs text-slate-400 mt-0.5">{{ c.created_at?.replace('T', ' ').slice(0, 19) }} · percobaan {{ c.attempt_count }}</p>
        <p v-if="c.status === 'DONE'" class="text-xs text-emerald-700 mt-1">{{ feedbackPesan(c) }}</p>
        <p v-else-if="c.status === 'FAILED'" class="text-xs text-rose-700 mt-1">{{ c.error_message || feedbackPesan(c) }}</p>
        <div class="mt-2 flex gap-2">
          <button v-if="c.status === 'FAILED' || c.status === 'QUEUED'" class="text-sm px-3 py-2 rounded border border-slate-300 text-indigo-600 min-h-[44px]" @click="retry(c)">Ulangi</button>
          <button v-if="activeStatuses.includes(c.status)" class="text-sm px-3 py-2 rounded border border-slate-300 min-h-[44px]" @click="check(c)">Cek Feedback</button>
        </div>
      </div>
    </div>
  </div>
</template>