import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppNav } from "../components/AppNav";
import LicenseFooter from "../components/LicenseFooter";
import styles from "./RootLayout.module.css";

/**
 * 全站根布局：统一导航栏 + 内容区 + 页脚。
 * landing / 认证 / 账户中心 / 管理后台均嵌套于此，共用同一套外壳与视觉语言。
 */
const RootLayout = () => {
  const { t } = useTranslation();
  return (
    <div className={styles.app}>
      <a href="#main-content" className={styles.skipLink}>
        {t("shell.skipToContent")}
      </a>
      <AppNav />
      <main id="main-content" tabIndex={-1} className={styles.main}>
        <Outlet />
      </main>
      <LicenseFooter />
    </div>
  );
};

export default RootLayout;
