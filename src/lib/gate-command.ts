// Client-side orchestration for the gate command queue.
//
// Contract with the external gate system (confirmed with the provider):
// - Command: POST https://cek.goepoet.com/card-command.php
//     { action: 'ADD'|'UPDATE'|'DELETE', uid: <number>, blok, no_rumah }
//     (server treats uid = raw_id, so the client only sends `uid`)
// - Feedback: POST https://cek.goepoet.com/command-result.php
//     { action, uid } → data: { status: 'PENDING'|'DONE'|..., tgl_kirim, tgl_eksekusi, pesan }
//
// Both endpoints are proxied by Supabase Edge Functions (card-command and
// command-result) because the external API does not send CORS headers.
//
// Design: local Supabase changes commit first; gate commands are best-effort
// and async. Failures never roll back local data — they surface in the UI and
// can be retried from the Sinkronisasi Gate page.
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/toast'
import type { GateAction, GateCommand } from '@/types'

const CARD_COMMAND_URL = (import.meta.env.VITE_SUPABASE_EDGE_CARD_COMMAND as string) || ''
const COMMAND_RESULT_URL = (import.meta.env.VITE_SUPABASE_EDGE_COMMAND_RESULT as string) || ''

const POLL_INTERVAL_MS = 15000
const POLL_TIMEOUT_MS = 15 * 60 * 1000

/** One interval timer per command row currently being polled. */
const pollTimers = new Map<string, ReturnType<typeof setInterval>>()
const pollStartedAt = new Map<string, number>()

/** Builds the exact payload the gate API expects. uid = raw_id (numeric). */
function gatePayload(cmd: Pick<GateCommand, 'action' | 'uid' | 'blok' | 'no_rumah'>) {
  return {
    action: cmd.action,
    uid: Number(String(cmd.uid).trim()),
    blok: cmd.blok ?? '',
    no_rumah: cmd.no_rumah ?? '',
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function markFailed(id: string, message: string, json?: unknown) {
  await supabase
    .from('gate_commands')
    .update({ status: 'FAILED', error_message: message, ...(json ? { feedback_json: json } : {}) })
    .eq('id', id)
}

/**
 * Records a gate command for a card and starts sending it in the background.
 * Returns the created row, or null when the enqueue itself failed (or an
 * identical active command already exists).
 */
export async function enqueueGateCommand(
  action: GateAction,
  card: { uid: string; blok?: string | null; no_rumah?: string | null },
): Promise<GateCommand | null> {
  try {
    // Avoid duplicate active commands for the same card + action.
    const { data: active } = await supabase
      .from('gate_commands')
      .select('id')
      .eq('uid', card.uid)
      .eq('action', action)
      .in('status', ['QUEUED', 'SENDING', 'WAITING_RESULT'])
      .limit(1)
      .maybeSingle()
    if (active) return null

    const { data, error } = await supabase
      .from('gate_commands')
      .insert({
        action,
        uid: card.uid,
        blok: card.blok ?? '',
        no_rumah: card.no_rumah ?? '',
      })
      .select()
      .single()
    if (error) {
      notify(`Gagal mencatat command gate: ${error.message}`, 'error')
      return null
    }
    const cmd = data as GateCommand
    // Fire-and-forget: the caller's local change must not wait on the gate.
    void sendGateCommand(cmd)
    return cmd
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Gagal mencatat command gate.', 'error')
    return null
  }
}

/** Sends (or re-sends) a queued command row to the gate via the Edge Function. */
export async function sendGateCommand(cmd: GateCommand): Promise<void> {
  if (!CARD_COMMAND_URL) {
    await markFailed(cmd.id, 'URL Edge Function card-command belum diatur (.env).')
    notify('URL Edge Function card-command belum diatur.', 'error')
    return
  }
  await supabase
    .from('gate_commands')
    .update({ status: 'SENDING', attempt_count: (cmd.attempt_count ?? 0) + 1, error_message: null })
    .eq('id', cmd.id)

  try {
    const res = await fetch(CARD_COMMAND_URL, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(gatePayload(cmd)),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.success) {
      const msg = json?.message || `Gagal mengirim command (HTTP ${res.status}).`
      await markFailed(cmd.id, msg, json ?? undefined)
      notify(`Command gate ${cmd.action} UID ${cmd.uid} gagal: ${msg}`, 'error')
      return
    }
    await supabase
      .from('gate_commands')
      .update({ status: 'WAITING_RESULT', response_json: json, error_message: null })
      .eq('id', cmd.id)
    void checkGateResult(cmd.id)
    startPolling(cmd.id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal mengirim command ke gate.'
    await markFailed(cmd.id, msg)
    notify(`Command gate ${cmd.action} UID ${cmd.uid} gagal: ${msg}`, 'error')
  }
}

/**
 * Polls the feedback endpoint for a command and updates its row.
 * Safe to call repeatedly — it no-ops for rows in a terminal state.
 */
export async function checkGateResult(id: string): Promise<void> {
  const { data } = await supabase.from('gate_commands').select('*').eq('id', id).maybeSingle()
  if (!data) return
  const cmd = data as GateCommand
  if (!['QUEUED', 'SENDING', 'WAITING_RESULT'].includes(cmd.status)) return

  if (!COMMAND_RESULT_URL) {
    await supabase
      .from('gate_commands')
      .update({ error_message: 'URL Edge Function command-result belum diatur (.env).' })
      .eq('id', id)
    stopPolling(id)
    return
  }

  try {
    const res = await fetch(COMMAND_RESULT_URL, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(gatePayload(cmd)),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.success) {
      const msg = json?.message || `Gagal mengambil feedback (HTTP ${res.status}).`
      // "Command ... tidak ditemukan" means the gate has not picked it up yet.
      if (/tidak ditemukan/i.test(msg)) return
      await supabase.from('gate_commands').update({ feedback_json: json ?? null, error_message: msg }).eq('id', id)
      return
    }
    const d = (json.data ?? null) as Record<string, unknown> | null
    const status = String(d?.status ?? '').toUpperCase()
    if (status === 'DONE') {
      await supabase
        .from('gate_commands')
        .update({ status: 'DONE', feedback_json: json, error_message: null })
        .eq('id', id)
      stopPolling(id)
    } else if (status === 'FAILED' || status === 'GAGAL') {
      await supabase
        .from('gate_commands')
        .update({
          status: 'FAILED',
          feedback_json: json,
          error_message: (d?.pesan as string) || 'Command gagal dieksekusi di reader.',
        })
        .eq('id', id)
      stopPolling(id)
    } else {
      // PENDING or unknown — keep waiting.
      await supabase.from('gate_commands').update({ feedback_json: json }).eq('id', id)
    }
  } catch (e) {
    // Network hiccup: keep the row waiting; the poller will retry.
    await supabase
      .from('gate_commands')
      .update({ error_message: e instanceof Error ? e.message : 'Gagal mengambil feedback.' })
      .eq('id', id)
  }
}

/** Marks a failed command as queued again and re-sends it. */
export async function retryGateCommand(id: string): Promise<void> {
  const { data } = await supabase.from('gate_commands').select('*').eq('id', id).maybeSingle()
  if (!data) return
  const cmd = data as GateCommand
  await supabase.from('gate_commands').update({ status: 'QUEUED', error_message: null }).eq('id', id)
  void sendGateCommand({ ...cmd, status: 'QUEUED' })
}

function startPolling(id: string) {
  if (pollTimers.has(id)) return
  pollStartedAt.set(id, Date.now())
  const timer = setInterval(async () => {
    const started = pollStartedAt.get(id) ?? 0
    if (Date.now() - started > POLL_TIMEOUT_MS) {
      // Give up polling but keep the row in WAITING_RESULT so the user can
      // check feedback manually from the Sinkronisasi Gate page.
      stopPolling(id)
      return
    }
    const { data } = await supabase.from('gate_commands').select('status').eq('id', id).maybeSingle()
    if (!data || !['QUEUED', 'SENDING', 'WAITING_RESULT'].includes((data as { status: string }).status)) {
      stopPolling(id)
      return
    }
    await checkGateResult(id)
  }, POLL_INTERVAL_MS)
  pollTimers.set(id, timer)
}

function stopPolling(id: string) {
  const timer = pollTimers.get(id)
  if (timer) clearInterval(timer)
  pollTimers.delete(id)
  pollStartedAt.delete(id)
}

export function stopAllPolling() {
  for (const id of [...pollTimers.keys()]) stopPolling(id)
}

/**
 * Resumes commands that were in flight when the app was closed/refreshed:
 * sends queued rows and checks feedback for waiting rows.
 */
export async function resumePendingGateCommands(): Promise<void> {
  if (!CARD_COMMAND_URL && !COMMAND_RESULT_URL) return
  const { data } = await supabase
    .from('gate_commands')
    .select('*')
    .in('status', ['QUEUED', 'SENDING', 'WAITING_RESULT'])
    .order('created_at', { ascending: true })
    .limit(50)
  if (!data) return
  for (const row of data as GateCommand[]) {
    if (row.status === 'QUEUED') {
      void sendGateCommand(row)
    } else {
      void checkGateResult(row.id)
      startPolling(row.id)
    }
  }
}

/** Latest command per UID (used to show per-card gate status). */
export async function loadGateStatusByUid(): Promise<Record<string, GateCommand>> {
  const { data, error } = await supabase
    .from('gate_commands')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)
  const map: Record<string, GateCommand> = {}
  if (error || !data) return map
  for (const cmd of data as GateCommand[]) {
    if (!map[cmd.uid]) map[cmd.uid] = cmd
  }
  return map
}

/** Tailwind badge classes for a gate command status. */
export function gateStatusClass(status: string): string {
  switch (status) {
    case 'DONE':
      return 'bg-emerald-100 text-emerald-700'
    case 'FAILED':
      return 'bg-rose-100 text-rose-700'
    case 'WAITING_RESULT':
      return 'bg-amber-100 text-amber-700'
    case 'SENDING':
      return 'bg-indigo-100 text-indigo-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

/** Indonesian label for a gate command status. */
export function gateStatusLabel(status: string): string {
  switch (status) {
    case 'QUEUED':
      return 'Antre'
    case 'SENDING':
      return 'Mengirim'
    case 'WAITING_RESULT':
      return 'Menunggu Reader'
    case 'DONE':
      return 'Selesai'
    case 'FAILED':
      return 'Gagal'
    default:
      return status
  }
}