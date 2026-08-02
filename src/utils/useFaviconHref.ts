import { useEffect, useState } from "react";

const SELECTOR = 'link[rel~="icon"]';

function readHref(): string | null {
  return document.querySelector<HTMLLinkElement>(SELECTOR)?.href ?? null;
}

/**
 * 站点当前生效的 favicon 地址,实时跟随 `<head>` 里的 `<link rel="icon">` 变化。
 * 用于「品牌图标要和标签页图标保持一致」的场景(如管理后台左上角标)——
 * 直接镜像 DOM 里的那一份,而不是各自硬编码一份资源路径,换图标时才不会两处失配。
 * 用 MutationObserver 而非只读一次:即使当前站点还没有运行时换图标的功能,
 * 一旦以后加了(比如未读消息数徽标),这里也不需要跟着改。
 */
export function useFaviconHref(): string | null {
  const [href, setHref] = useState<string | null>(() => readHref());

  useEffect(() => {
    setHref(readHref());
    const observer = new MutationObserver(() => setHref(readHref()));
    observer.observe(document.head, {
      attributes: true,
      attributeFilter: ["href"],
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);

  return href;
}
