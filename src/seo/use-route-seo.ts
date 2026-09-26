import { useEffect } from "react";

import { resolveRoutePolicy } from "./route-policy";
import { absoluteUrl } from "./site";

/** 首页的 robots 指令；与边缘 Worker 的 X-Robots-Tag 保持一致。 */
export const INDEXABLE_ROBOTS = "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1";
export const NOINDEX_ROBOTS = "noindex, nofollow";

function upsertMeta(attr: "name" | "property", key: string, content: string | null): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (content === null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function upsertLink(selector: string, attrs: Record<string, string> | null): void {
  const existing = document.head.querySelectorAll<HTMLLinkElement>(selector);
  if (attrs === null) {
    existing.forEach((el) => el.remove());
    return;
  }
  const el = existing[0] ?? document.head.appendChild(document.createElement("link"));
  Object.entries(attrs).forEach(([name, value]) => el.setAttribute(name, value));
}

/**
 * SPA 内部跳转时按路由策略同步 robots / canonical / og:url。
 *
 * 首次加载时边缘 Worker 已把这些改好了；这里负责的是之后的客户端导航 ——
 * 否则从首页点进登录页，渲染后的 DOM 仍带着首页的 index + canonical，
 * 执行 JS 的爬虫（Googlebot）会读到自相矛盾的信号。标题由各页 usePageTitle 负责。
 */
export function useRouteSeo(pathname: string): void {
  useEffect(() => {
    const policy = resolveRoutePolicy(pathname);
    const url = policy.indexable ? absoluteUrl(pathname) : null;

    upsertMeta("name", "robots", policy.indexable ? INDEXABLE_ROBOTS : NOINDEX_ROBOTS);
    upsertMeta("property", "og:url", url);
    upsertLink('link[rel="canonical"]', url ? { rel: "canonical", href: url } : null);
  }, [pathname]);
}
