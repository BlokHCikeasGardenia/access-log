// Label decoding utilities for Log Akses card system.
// Implements Excel formulas used by the access control system.

const MOD_25 = 33554432n       // 2^25
const MOD_32 = 4294967296n     // 2^32
const MOD_24 = 16777216n       // 2^24
const MOD_16 = 65536n          // 2^16

/**
 * Convert a 10-digit label to UID.
 * Excel: UID = MOD(VALUE(label)*2; 33554432)
 */
export function labelToUid(label: string): bigint {
  const labelVal = BigInt(label.trim())
  return (labelVal * 2n) % MOD_25
}

/**
 * Convert UID to Label A.
 * Excel: Label A = QUOTIENT(MOD(UID*128; 4294967296); 16777216)
 */
export function uidToLabelA(uid: bigint): bigint {
  const temp = (uid * 128n) % MOD_32
  return temp / MOD_24
}

/**
 * Convert UID to Label B.
 * Excel: Label B = MOD(QUOTIENT(MOD(UID*128; 4294967296); 256); 65536)
 */
export function uidToLabelB(uid: bigint): bigint {
  const temp = (uid * 128n) % MOD_32
  const quotient = temp / 256n
  return quotient % MOD_16
}

/**
 * Format Label A and Label B as "LabelA,00000" (Label B padded to 5 digits).
 * Excel: Label A B = Label A & "," & TEXT(Label B; "00000")
 */
export function formatLabelAB(labelA: bigint, labelB: bigint): string {
  return `${labelA},${String(labelB).padStart(5, "0")}`
}

/**
 * Convert UID back to the original 10-digit label.
 * Excel: Label 10 Digit = TEXT(QUOTIENT(MOD(UID*128; 4294967296); 256); "0000000000")
 */
export function uidToLabel10Digit(uid: bigint): string {
  const temp = (uid * 128n) % MOD_32
  const label = temp / 256n
  return String(label).padStart(10, '0')
}

/**
 * Validate that a string is a 10-digit number.
 */
export function isValidLabel10Digit(value: string): boolean {
  const trimmed = value.trim()
  return /^\d{10}$/.test(trimmed)
}

/**
 * Format label gabungan untuk tampilan tabel Kartu.
 * Format: "Label 10 Digit | Label A (3 digit) | Label B (5 digit)"
 * Label A dan Label B di-padding dengan nol di depan.
 */
export function formatLabelCombined(uid: bigint): string {
  const label10 = uidToLabel10Digit(uid)
  const a = uidToLabelA(uid).toString().padStart(3, '0')
  const b = uidToLabelB(uid).toString().padStart(5, '0')
  return `${label10} | ${a} | ${b}`
}