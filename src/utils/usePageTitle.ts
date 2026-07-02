import { useEffect } from "react";

/** index.html 的默认站点标题(主页沿用,子页恢复用)。 */
const DEFAULT_TITLE =
  typeof document !== "undefined" ? document.title : "跨环 · TransCircle Project";

const SITE_NAME = "跨环 TransCircle";

/**
 * 设置文档标题,让标签页/历史记录/读屏器能区分页面。
 * 传空(如数据未加载)时回落到站点默认标题。
 */
export function usePageTitle(title?: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE_NAME}` : DEFAULT_TITLE;
  }, [title]);

  // 卸载时恢复默认,避免跳回主页后残留子页标题。
  useEffect(() => () => {
    document.title = DEFAULT_TITLE;
  }, []);
}
