/**
 * Utility konversi zona waktu ke Waktu Jakarta (UTC+7).
 *
 * Prinsip:
 * - Timestamp dari Supabase (`created_at`, `updated_at`) disimpan dalam UTC
 *   (ISO 8601 dengan akhiran 'Z'). `Intl.DateTimeFormat` dengan
 *   `timeZone: 'Asia/Jakarta'` otomatis mengonversi ke WIB tanpa perlu
 *   menambah offset manual.
 * - Timestamp dari API gate eksternal (`log.tgl`, `tgl_eksekusi`) sudah
 *   dikirimkan dalam WIB, jadi tidak perlu konversi — tampilkan apa adanya.
 *
 * DST tidak berlaku untuk Asia/Jakarta, jadi `Intl.DateTimeFormat`
 * sudah cukup andal tanpa offset manual.
 */

const TIMEZONE = 'Asia/Jakarta'

function jakartaParts(d: Date): Record<string, string> {
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
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/**
 * Format UTC ISO string (dari Supabase) → tampilan "YYYY-MM-DD HH:MM:SS" WIB.
 *
 * Contoh: "2026-09-28T02:46:33.123Z" → "2026-09-28 09:46:33"
 *
 * Hanya untuk timestamp yang memiliki timezone indicator (Z atau offset).
 */
export function formatDateTimeJakarta(isoString?: string): string {
  if (!isoString) return '—'
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return '—'
  const p = jakartaParts(d)
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`
}

/**
 * Tanggal "hari ini" di zona Jakarta → "YYYY-MM-DD".
 * Cocok untuk inisialisasi datepicker default.
 */
export function todayJakartaISO(): string {
  const p = jakartaParts(new Date())
  return `${p.year}-${p.month}-${p.day}`
}

/**
 * Tanggal N hari yang lalu dari "hari ini Jakarta" → "YYYY-MM-DD".
 *
 * Mengurangi dari *current instant* (bukan string tanggal), lalu
 * diformatkan di zona Jakarta — selalu akurat di semua browser timezone.
 */
export function daysAgoJakartaISO(days: number): string {
  const now = new Date()
  const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const p = jakartaParts(past)
  return `${p.year}-${p.month}-${p.day}`
}
