/**
 * 重定向目标净化:仅接受站内相对路径(单个 "/" 开头)。
 * 拒绝绝对 URL、协议相对地址("//evil.com")与反斜杠变体("/\evil.com",
 * 浏览器会把 "\" 当 "/" 解析),防止登录/回调后的开放重定向。
 *
 * 与 TransCircle-Frontend 的 isValidRedirect 强度对齐,但**不**拦截 /auth、/login、
 * /register —— 本站在 OIDC 交互中继时会把 `redirectAfter` 设为 `/login?oidc=<uid>`
 * (见 startOAuth),拦掉鉴权路由会让交互无法回到登录页完成。
 */
export function sanitizeRedirect(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  if (raw.length > 200) return fallback;
  // 控制字符会被部分客户端/中间件归一化成可绕过形式,一律拒绝。
  // 用 \p{Cc} 而不是 \u0000-\u001F 字面量：语义相同且多覆盖 C1 控制字符(0x80-0x9F),
  // 同时避开 no-control-regex —— 该规则防的是「误写」,这里是有意匹配。
  if (/\p{Cc}/u.test(raw)) return fallback;
  try {
    // 确认解析后的 pathname 与原路径一致,防止 /%2Fevil.com 一类编码绕过。
    const pathPart = raw.split("?")[0]!;
    const parsed = new URL(raw, "http://localhost");
    if (parsed.pathname !== pathPart && decodeURIComponent(parsed.pathname) !== pathPart) return fallback;
    return raw;
  } catch {
    return fallback;
  }
}
