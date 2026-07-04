import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppNav } from "../components/AppNav";
// import FloatingTOC from "../components/FloatingTOC";
// import type { TOCItem } from "../components/FloatingTOC";
import LicenseFooter from "../components/LicenseFooter";
import styles from "./RootLayout.module.css";

// const TOC_ITEMS: TOCItem[] = [
//   { href: '#about', label: '关于项目' },
//   { href: '#join',  label: '加入项目' },
//   { href: '#follow', label: '关注我们' },
// ];

/**
 * 全站根布局：统一导航栏 + 内容区 + 页脚。
 * landing / 认证 / 账户中心 / 管理后台均嵌套于此，共用同一套外壳与视觉语言。
 */
const RootLayout = () => {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <div className={styles.app}>
      <a href="#main-content" className={styles.skipLink}>
        {t("shell.skipToContent")}
      </a>
      <AppNav />
      {/* location.pathname === '/' && <FloatingTOC items={TOC_ITEMS} /> */}
      <main id="main-content" tabIndex={-1} className={styles.main}>
        {/* 按 pathname 重挂载做淡入上滑动效:查询参数/哈希变化(筛选、锚点)
            不应整页重挂载丢状态。仅顶级路由切换(landing/认证/后台)触发重挂载,
            admin/account 的子路由切换只换内容、不重建侧栏。 */}
        <div key={location.pathname.replace(/^(\/[^/]*).*$/, "$1")} className={styles.pageWrap}>
          <Outlet />
        </div>
      </main>
      <LicenseFooter />
    </div>
  );
};

export default RootLayout;
