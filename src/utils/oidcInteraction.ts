const OIDC_INTERACTION_KEY = "pass_oidc_interaction";
const OIDC_INTERACTION_PATTERN = /^[A-Za-z0-9._~-]{1,256}$/;

function valid(value: string | null | undefined): value is string {
  return typeof value === "string" && OIDC_INTERACTION_PATTERN.test(value);
}

export function rememberOidcInteraction(value: string | null | undefined): string | null {
  if (!valid(value)) return null;
  try {
    sessionStorage.setItem(OIDC_INTERACTION_KEY, value);
  } catch {
    // sessionStorage may be unavailable in hardened browser contexts.
  }
  return value;
}

/**
 * Reads a validated interaction. A URL-provided value is authoritative; when the
 * parameter is absent, callers may explicitly opt into the stored continuation.
 */
export function readOidcInteraction(
  value: string | null | undefined,
  useStored = false,
): string | null {
  if (value !== null && value !== undefined) return rememberOidcInteraction(value);
  if (!useStored) return null;
  try {
    const stored = sessionStorage.getItem(OIDC_INTERACTION_KEY);
    return valid(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function clearOidcInteraction(): void {
  try {
    sessionStorage.removeItem(OIDC_INTERACTION_KEY);
  } catch {
    // noop
  }
}
