/**
 * Utility konversi zona waktu ke Waktu Jakarta (UTC+7).
 *
 * Semua timestamp dari Supabase dan API eksternal disimpan/dikirim dalam UTC.
 * Helper ini hanya mengonversi **untuk tampilan di frontend** agar konsisten
 * dengan zona waktu pengguna yang meaksud (WIB). Backend tetap memakai UTC.
 *
 * DST tidak berlaku untuk zona Asia/Jakarta, jadi offset statis +7 jam
 * sudah aman. Kami pakai Intl.DateTimeFormat sebagai fallback yang robust
 * namun tetap menyertakan offset manual untuk kasus edge-case.
 */

const TIMEZONE = 'Asia/Jakarta'
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * Mengonversi ISO string (UTC) menjadi Date objek dalam zona Jakarta.
 * Jika input sudah berisi offset zona (mis. "2026-09-28T00:00:00+00:00"),
 * Date constructor akan menanganinya dengan benar.
 */
function toJakartaDate(isoString?: string): Date | null {
  if (!isoString) return null
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return null
  // new Date(isoString) sudah mengembalikan waktu universal.
  // Tambahkan offset Jakarta untuk mendapatkan waktu lokal jika diperlukan.
  return new Date(d.getTime() + JAKARTA_OFFSET_MS)
}

/**
 * Format `YYYY-MM-DD HH:MM:SS` dalam zona Jakarta.
 *
 * Contoh: "2026-09-28 09:03:11"
 *
 * Cocok untuk menampilkan Supabase created_at / updated_at.
 */
export function formatDateTimeJakarta(isoString?: string): string {
  const d = toJakartaDate(isoString)
  if (!d) return '—'

  // Gunakan Intl.DateTimeFormat untuk format yang robust.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const yyyy = get('year')
  const MM = get('month')
  const dd = get('day')
  const HH = get('hour')
  const mm = get('minute')
  const ss = get('second')

  return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`
}

/**
 * Format `YYYY-MM-DD` dalam zona Jakarta — untuk datepicker input type="date".
 *
 * Contoh: "2026-09-28"
 */
export function formatDateJakarta(isoString?: string): string {
  const d = toJakartaDate(isoString)
  if (!d) return ''

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * Tanggal "hari ini" dalam zona Jakarta.
 *
 * Menggunakan Intl agar konsisten dengan browser (bukan hanya offset manual),
 * sehingga selalu akurat meski ada aktivasi TZ di masa depan.
 */
export function todayJakartaISO(): string {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * Tanggal N hari yang lalu dari "hari ini Jakarta" (default: 30).
 */
export function daysAgoJakartaISO(days: number): string {
  const today = todayJakartaISO()
  const d = new Date(today + 'T00:00:00')
  d.setDate(d.getDate() - days)
  // Karena todayJakartaISO sudah relatif Jakarta dan kita lakukan arithmetic
  // pada Date objek UTC, hasilnya tetap konsisten.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}
