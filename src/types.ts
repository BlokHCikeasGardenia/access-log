export interface Resident {
  id: string
  blok: string
  nama: string
  status: string
  created_at?: string
  updated_at?: string
}

export interface Card {
  id: string
  uid: string
  label_a: string | null
  label_b: string | null
  blok?: string
  no_rumah?: string
  resident_id: string | null
  card_status: 'Aktif' | 'Rusak' | 'Hilang'
  created_at?: string
  updated_at?: string
}

export type CardStatus = 'Aktif' | 'Rusak' | 'Hilang'

export const CARD_STATUSES: CardStatus[] = ['Aktif', 'Rusak', 'Hilang']

export interface ResidentWithCards {
  resident: Resident
  cards: Card[]
}

/** Gate command actions supported by the external reader API. */
export type GateAction = 'ADD' | 'UPDATE' | 'DELETE'

export const GATE_ACTIONS: GateAction[] = ['ADD', 'UPDATE', 'DELETE']

/** Lifecycle of a gate command row in the local queue. */
export type GateCommandStatus = 'QUEUED' | 'SENDING' | 'WAITING_RESULT' | 'DONE' | 'FAILED'

export interface GateCommand {
  id: string
  action: GateAction
  uid: string
  blok: string
  no_rumah: string
  status: GateCommandStatus
  attempt_count: number
  response_json?: Record<string, unknown> | null
  feedback_json?: Record<string, unknown> | null
  error_message?: string | null
  created_at?: string
  updated_at?: string
}
