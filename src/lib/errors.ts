import type { PostgrestError } from '@supabase/supabase-js'

/** Postgres unique-violation SQLSTATE. */
export function isUniqueViolation(error: PostgrestError | null | undefined): boolean {
  if (!error) return false
  return error.code === '23505' || /duplicate key value violates unique constraint/i.test(error.message)
}

/**
 * Returns a user-friendly message for an error. When the error is a duplicate
 * key on `uid` (or any column), it surfaces a clear "sudah digunakan" message
 * instead of the raw Postgres text.
 */
export function friendlyError(error: PostgrestError | null | undefined, field = 'UID'): string {
  if (!error) return 'Terjadi kesalahan.'
  if (isUniqueViolation(error)) {
    if (/uid/i.test(error.message) || error.message.toLowerCase().includes('cards_uid_key')) {
      return `${field} sudah digunakan (duplikat). Gunakan UID lain.`
    }
    return 'Data duplikat (sudah ada).'
  }
  return error.message
}
