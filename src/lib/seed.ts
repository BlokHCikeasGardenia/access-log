import { supabase } from '@/lib/supabase'
import { parseCards, parseResidents } from '@/lib/parse'
import type { CardStatus } from '@/types'

const base = import.meta.env.BASE_URL || '/'

async function fetchText(name: string): Promise<string> {
  const res = await fetch(`${base}${name}`)
  if (!res.ok) throw new Error(`Gagal memuat ${name} (${res.status})`)
  return res.text()
}

export interface SeedResult {
  residents: number
  cards: number
  relationships: number
  errors: string[]
}

export async function importResidentsSample(): Promise<number> {
  const text = await fetchText('sample-residents.txt')
  const { rows } = parseResidents(text)
  if (rows.length) await supabase.from('residents').insert(rows)
  return rows.length
}

export async function importCardsSample(): Promise<number> {
  const text = await fetchText('sample-cards.txt')
  const { rows } = parseCards(text)
  let inserted = 0
  for (const row of rows) {
    const { error } = await supabase.from('cards').insert(row)
    if (!error) inserted++
  }
  return inserted
}

interface RelationshipRow {
  blok: string
  nama: string
  uid: string
  status: CardStatus
}

/**
 * Parse the relationship block: `<blok>\t<penghuni>\t<uid|labelA|labelB>\t<status>`.
 * Blok/penghuni may be blank on continuation rows (same resident as previous).
 */
function parseRelationships(text: string): RelationshipRow[] {
  const lines = text.split(/\r?\n/)
  const out: RelationshipRow[] = []
  let curBlok = ''
  let curNama = ''
  lines.forEach((raw) => {
    const line = raw.trim()
    if (!line) return
    const parts = line.split('\t').map((p) => p.trim())
    if (parts[0] && /^\d/.test(parts[0])) {
      curBlok = parts[0]
      curNama = parts[1] || curNama
    }
    const col3 = parts[2] || ''
    if (!col3.includes('|')) return
    const uid = col3.split('|')[0].trim()
    const status = (parts[3] || 'Aktif').trim() as CardStatus
    if (uid) out.push({ blok: curBlok, nama: curNama, uid, status })
  })
  return out
}

export async function importAllSample(): Promise<SeedResult> {
  const result: SeedResult = { residents: 0, cards: 0, relationships: 0, errors: [] }

  const [resText, cardText, relText] = await Promise.all([
    fetchText('sample-residents.txt'),
    fetchText('sample-cards.txt'),
    fetchText('sample-relationships.txt'),
  ])

  const residents = parseResidents(resText)
  const cards = parseCards(cardText)
  if (residents.rows.length) {
    const { error } = await supabase.from('residents').insert(residents.rows)
    if (error) result.errors.push(error.message)
    else result.residents = residents.rows.length
  }
  if (cards.rows.length) {
    for (const row of cards.rows) {
      const { error } = await supabase.from('cards').insert(row)
      if (error) result.errors.push(`Kartu ${row.uid}: ${error.message}`)
      else result.cards++
    }
  }

  const rels = parseRelationships(relText)
  const { data: resData } = await supabase.from('residents').select('id,blok,nama')
  const { data: cardData } = await supabase.from('cards').select('id,uid')
  const resMap = new Map((resData as any[]).map((r) => [`${r.blok}|${r.nama}`.toLowerCase(), r.id]))
  const cardMap = new Map((cardData as any[]).map((c) => [c.uid, c.id]))

  for (const rel of rels) {
    const resId = resMap.get(`${rel.blok}|${rel.nama}`.toLowerCase())
    const cardId = cardMap.get(rel.uid)
    if (!resId || !cardId) {
      result.errors.push(`Relasi tidak cocok: ${rel.blok} ${rel.nama} / ${rel.uid}`)
      continue
    }
    const { error } = await supabase
      .from('cards')
      .update({ resident_id: resId, card_status: rel.status })
      .eq('id', cardId)
    if (!error) result.relationships++
  }

  return result
}
