/**
 * Convert ArrayBuffer to base64url encoding.
 * Used for WebAuthn (Passkey) and API binary data encoding.
 */
export function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Convert base64url string to ArrayBuffer.
 * Used for WebAuthn credential parsing (challenge, credential ID, signature).
 * Inverse of arrayBufferToBase64url.
 */
export function base64urlToArrayBuffer(s: string): ArrayBuffer {
  // Normalize base64url → base64: replace URL-safe chars and restore padding
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const padding = 4 - (base64.length % 4)
  const padded = padding < 4 ? base64 + '='.repeat(padding) : base64
  try {
    const binaryStr = atob(padded)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    return bytes.buffer as ArrayBuffer
  } catch {
    throw new Error(`Invalid base64url string: length=${s.length}`)
  }
}

/**
 * Unicode-aware string truncation by character count (not UTF-16 code units)
 */
export function limitByUnicode(str: string, max: number): string {
  return [...str].slice(0, max).join('')
}

// ─── Validation utilities (shared across pages, L3) ─────────────

/** Username: 3-32 chars, starts with lowercase letter, only [a-z0-9_-] */
export const USERNAME_RE = /^[a-z][a-z0-9_-]{2,31}$/

export const UPPER_RE = /[A-Z]/
export const LOWER_RE = /[a-z]/
export const DIGIT_RE = /\d/
/** ASCII punctuation or Unicode punctuation (Prop{P} + Prop{S}) */
export const SYMBOL_RE = /[!-/:-@[-`{-~]|[\p{P}\p{S}]/u

/**
 * Password strength: counts character-class categories met (max 4).
 * api.md §1.1: requires at least 3 of 4 categories.
 */
export function checkPasswordStrength(password: string): number {
  let score = 0
  if (UPPER_RE.test(password)) score++
  if (LOWER_RE.test(password)) score++
  if (DIGIT_RE.test(password)) score++
  if (SYMBOL_RE.test(password)) score++
  return score
}

/**
 * Simple RFC 5322–approximate email validation.
 */
export function validateEmail(email: string): boolean {
  const parts = email.split('@')
  if (parts.length !== 2) return false
  const [local, domain] = parts as [string, string]
  if (!local || !domain) return false
  if (local.length > 64) return false
  if (email.length > 254) return false
  const domainRe = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/
  if (!domainRe.test(domain)) return false
  return true
}
