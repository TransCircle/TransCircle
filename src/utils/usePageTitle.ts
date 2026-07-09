import { useEffect } from "react";
import { useTranslation } from "react-i18next";

/**
 * 设置文档标题,让标签页/历史记录/读屏器能区分页面。
 * 传空(如数据未加载)时回落到站点默认标题。
 */
export function usePageTitle(title?: string | null): void {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = title
      ? `${title} · ${t("common.siteName")}`
      : t("common.defaultTitle");
  }, [title, t]);

  // 卸载时恢复默认,避免跳回主页后残留子页标题。
  useEffect(() => () => {
    document.title = t("common.defaultTitle");
  }, [t]);
}
