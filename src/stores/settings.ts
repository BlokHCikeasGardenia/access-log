import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * Global settings persisted in localStorage.
 * Hanya frontend — tidak berkaitan dengan backend/Supabase.
 */
export type SettingKey = 'autoCommandGate' | 'autoPollGate'

const STORAGE_KEY = 'log-akses-settings'

interface SettingsSnapshot {
  autoCommandGate: boolean
  autoPollGate: boolean
}

const DEFAULTS: SettingsSnapshot = {
  autoCommandGate: true,
  autoPollGate: true,
}

function load(): SettingsSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SettingsSnapshot>
      return {
        autoCommandGate: parsed.autoCommandGate ?? DEFAULTS.autoCommandGate,
        autoPollGate: parsed.autoPollGate ?? DEFAULTS.autoPollGate,
      }
    }
  } catch {
    /* corrupt JSON — fall through to defaults */
  }
  return { ...DEFAULTS }
}

function save(snapshot: SettingsSnapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    /* quota exceeded or disabled — silently ignore */
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const _snapshot = ref<SettingsSnapshot>(load())

  // autoCommandGate: ketika FALSE, semua enqueueGateCommand otomatis
  // yang dipicu oleh aksi CRUD (ADD/UPDATE/DELETE card, pairing, delete resident)
  // akan dilewati. Pengguna masih bisa kirim manual dari halaman Gate Sync.
  const autoCommandGate = computed(() => _snapshot.value.autoCommandGate)
  function setAutoCommandGate(v: boolean) {
    _snapshot.value.autoCommandGate = v
    save(_snapshot.value)
  }
  function toggleAutoCommandGate() {
    setAutoCommandGate(!autoCommandGate.value)
  }

  // autoPollGate: ketika FALSE, interval polling 20 detik di GateSyncView
  // akan berhenti. Pengguna masih bisa klik "Refresh" atau "Cek Feedback" manual.
  const autoPollGate = computed(() => _snapshot.value.autoPollGate)
  function setAutoPollGate(v: boolean) {
    _snapshot.value.autoPollGate = v
    save(_snapshot.value)
  }
  function toggleAutoPollGate() {
    setAutoPollGate(!autoPollGate.value)
  }

  return {
    autoCommandGate,
    autoPollGate,
    setAutoCommandGate,
    setAutoPollGate,
    toggleAutoCommandGate,
    toggleAutoPollGate,
  }
})
