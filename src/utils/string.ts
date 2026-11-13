/**
 * Convert ArrayBuffer to base64url encoding.
 * Used for WebAuthn (Passkey) and API binary data encoding.
 */
export function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Decode a base64url string to its raw binary string.
 *
 * JWT 的 payload 段是**去掉 padding** 的 base64url，长度 `% 4` 在 {0,2,3} 之间。
 * 浏览器的 `atob` 严格要求长度为 4 的倍数，不补 `=` 会抛 `InvalidCharacterError`
 * （Node 的 `atob` 宽松，所以这个坑在 Node 里复现不出来）。
 * 任何要解码 base64url 的地方都必须走这里，不要各自写一遍。
 */
export function base64urlDecode(s: string): string {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = base64.length % 4;
  // `% 4 === 1` 不是合法 base64 长度，补几个 `=` 都解不出来，直接拒绝。
  if (remainder === 1) throw new Error(`Invalid base64url length: ${s.length}`);
  const padded = remainder === 0 ? base64 : base64 + "=".repeat(4 - remainder);
  return atob(padded);
}

/**
 * Convert base64url string to ArrayBuffer.
 * Used for WebAuthn credential parsing (challenge, credential ID, signature).
 * Inverse of arrayBufferToBase64url.
 */
export function base64urlToArrayBuffer(s: string): ArrayBuffer {
  try {
    const binaryStr = base64urlDecode(s);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes.buffer as ArrayBuffer;
  } catch {
    throw new Error(`Invalid base64url string: length=${s.length}`);
  }
}

/**
 * Unicode-aware string truncation by character count (not UTF-16 code units)
 */
export function limitByUnicode(str: string, max: number): string {
  return [...str].slice(0, max).join("");
}

// ─── Validation utilities (shared across pages, L3) ─────────────

/** Username: 3-32 chars, starts with lowercase letter, only [a-z0-9_-] */
export const USERNAME_RE = /^[a-z][a-z0-9_-]{2,31}$/;

export const UPPER_RE = /[A-Z]/;
export const LOWER_RE = /[a-z]/;
export const DIGIT_RE = /\d/;
/** ASCII punctuation or Unicode punctuation (Prop{P} + Prop{S}) */
export const SYMBOL_RE = /[!-/:-@[-`{-~]|[\p{P}\p{S}]/u;

/**
 * Password strength (0-4): character-class categories weighted by length.
 * api.md §1.1: requires at least 8 chars and 3 of 4 categories.
 * - empty → 0
 * - length < 8 → always 1 (weak), so 'aB1!' can never read "strong"
 * - length 8-11 → capped at 3 (good)
 * - length ≥ 12 → up to 4 (strong) when all four categories present
 */
export function checkPasswordStrength(password: string): number {
  if (password.length === 0) return 0;
  let categories = 0;
  if (UPPER_RE.test(password)) categories++;
  if (LOWER_RE.test(password)) categories++;
  if (DIGIT_RE.test(password)) categories++;
  if (SYMBOL_RE.test(password)) categories++;
  if (password.length < 8) return 1;
  return Math.min(categories, password.length < 12 ? 3 : 4);
}

/**
 * Simple RFC 5322–approximate email validation.
 */
export function validateEmail(email: string): boolean {
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts as [string, string];
  if (!local || !domain) return false;
  if (local.length > 64) return false;
  if (email.length > 254) return false;
  const domainRe =
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;
  if (!domainRe.test(domain)) return false;
  return true;
}
