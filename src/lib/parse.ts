import type { Card, Resident } from '@/types'

export interface ParseResult<T> {
  rows: T[]
  errors: string[]
}

const HEADER_TOKENS = ['blok', 'penghuni', 'nama', 'uid', 'kartu', 'id']

function looksLikeHeader(line: string): boolean {
  const lower = line.toLowerCase()
  return HEADER_TOKENS.some((t) => lower.includes(t)) && line.includes('\t') === false && !/^\d/.test(line.trim())
}

/**
 * Residents .txt — TAB separated, optional header `Blok\tPenghuni`, format `<blok>\t<nama>`.
 */
export function parseResidents(text: string): ParseResult<Omit<Resident, 'id'>> {
  const lines = text.split(/\r?\n/)
  const rows: Omit<Resident, 'id'>[] = []
  const errors: string[] = []
  const seen = new Set<string>()

  lines.forEach((raw, idx) => {
    const line = raw.trim()
    if (!line) return
    if (looksLikeHeader(line)) return

    const parts = line.split('\t').map((p) => p.trim())
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      errors.push(`Baris ${idx + 1}: format salah (diharapkan "Blok<TAB>Nama").`)
      return
    }
    const blok = parts[0]
    const nama = parts[1]
    const key = `${blok.toLowerCase()}|${nama.toLowerCase()}`
    if (seen.has(key)) {
      errors.push(`Baris ${idx + 1}: duplikat ${blok} - ${nama}, dilewati.`)
      return
    }
    seen.add(key)
    rows.push({ blok, nama, status: 'Active' })
  })

  return { rows, errors }
}

/**
 * Cards .txt — pipe separated, optional header `UID kartu|ID kartu|ID kartu`, format `<uid>|<label_a>|<label_b>`.
 */
export function parseCards(text: string): ParseResult<Omit<Card, 'id' | 'resident_id' | 'card_status'>> {
  const lines = text.split(/\r?\n/)
  const rows: Omit<Card, 'id' | 'resident_id' | 'card_status'>[] = []
  const errors: string[] = []
  const seen = new Set<string>()

  lines.forEach((raw, idx) => {
    const line = raw.trim()
    if (!line) return
    if (looksLikeHeader(line)) return

    const parts = line.split('|').map((p) => p.trim())
    if (parts.length < 3 || !parts[0]) {
      errors.push(`Baris ${idx + 1}: format salah (diharapkan "UID|LabelA|LabelB").`)
      return
    }
    const uid = parts[0]
    if (seen.has(uid)) {
      errors.push(`Baris ${idx + 1}: UID ${uid} duplikat, dilewati.`)
      return
    }
    seen.add(uid)
    rows.push({ uid, label_a: parts[1] || null, label_b: parts[2] || null })
  })

  return { rows, errors }
}
