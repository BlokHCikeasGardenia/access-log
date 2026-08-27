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
