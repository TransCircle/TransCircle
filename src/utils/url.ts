/**
 * 重定向目标净化:仅接受站内相对路径(单个 "/" 开头)。
 * 拒绝绝对 URL、协议相对地址("//evil.com")与反斜杠变体("/\evil.com",
 * 浏览器会把 "\" 当 "/" 解析),防止登录/回调后的开放重定向。
 */
export function sanitizeRedirect(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw;
}
