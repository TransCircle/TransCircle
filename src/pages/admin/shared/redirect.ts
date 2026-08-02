import type { ClientApplicationType } from "../../../api/types";

export type UriCheckLevel = "ok" | "warn" | "bad";

export interface UriCheck {
  level: UriCheckLevel;
  /** i18n key 后缀：admin.uriCheck.<reason>。 */
  reason: string;
}

/**
 * 回调地址实时校验。
 *
 * **后端必须独立再校一遍**（api-delta §4.1）—— 这里只是让人在敲的时候就知道对不对，
 * 挡不住 curl。规则：绝对地址、无 # 片段、无通配符、非本地必须 https、
 * 路径不得为 `/`（警告级）；原生应用额外放行自定义 scheme。
 */
export function checkRedirect(raw: string, type: ClientApplicationType): UriCheck | null {
  const s = raw.trim();
  if (!s) return null;

  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return { level: "bad", reason: "notAbsolute" };
  }
  if (url.hash) return { level: "bad", reason: "hasFragment" };
  if (s.includes("*")) return { level: "bad", reason: "wildcard" };

  const local =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";

  // 原生应用无法承接 https 回跳，自定义 scheme 是唯一可行路径。
  if (type === "native" && url.protocol !== "http:" && url.protocol !== "https:") {
    return { level: "ok", reason: "customScheme" };
  }
  if (url.protocol === "http:") {
    return local ? { level: "ok", reason: "loopback" } : { level: "bad", reason: "needHttps" };
  }
  if (url.protocol !== "https:") return { level: "bad", reason: "httpsOnly" };
  if (url.pathname === "/") return { level: "warn", reason: "rootPath" };
  return { level: "ok", reason: "usable" };
}
