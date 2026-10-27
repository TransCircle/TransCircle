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

/**
 * 从一个站内路径里取出 `oidc` 交互句柄。
 *
 * 第三方登录往返时，后端把用户送回 `redirectAfter`，而有授权请求在跑时它就是
 * `/login?oidc=<uid>`（见 `LoginPage` 的 `startOAuth`）。落地页若只 `navigate("/login")`，
 * 这个句柄就丢了 —— 后续 `finish()` 走普通跳转分支，那笔 OIDC 交互永远没人续跑，
 * 用户以为登好了、业务站却一直等着。
 *
 * 用 URL 解析而不是字符串拼接：`redirectAfter` 来自查询串、可被外部构造，
 * 直接拼会把这串参数原样转发下去。**取值还要过 `valid()`** —— 它会被拼进
 * 下一次 `navigate()` 的查询串，带任意字符过去就是一个开放的参数注入面。
 */
export function oidcFromPath(target: string): string | null {
  const q = target.indexOf("?");
  if (q < 0) return null;
  const raw = new URLSearchParams(target.slice(q + 1)).get("oidc");
  return valid(raw) ? raw : null;
}
