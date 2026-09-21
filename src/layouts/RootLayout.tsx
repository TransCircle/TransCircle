import { useEffect, useLayoutEffect, useRef } from "react";
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
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.focus();
  }, [location.pathname]);

  /**
   * 换页时把 main 的内部滚动归零。
   *
   * 视口锁定的页面(见 RootLayout.module.css)真正在滚的是 main,而它不随路由卸载 ——
   * 浏览器的滚动恢复只认 document,于是从一个滚到一半的锁定页进入下一个锁定页,
   * 新页面会原样继承上一页的滚动位置(开局就停在半截)。
   * 带 hash 的导航不碰:那时目标页自己的 scrollIntoView 才是权威,归零会把它抵消掉。
   *
   * 用 useLayoutEffect 而非 useEffect:effect 是自底向上跑的,父组件的 useEffect
   * 会晚于子页面的 useEffect —— 若某个页面在自己的 effect 里做定位(滚到某个区块、
   * 滚到错误摘要),父级的归零会**后发制人**把它抹掉。布局阶段先归零,
   * 子页面随后的定位才是最终结果。
   */
  useLayoutEffect(() => {
    if (location.hash) return;
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname, location.hash]);

  return (
    <div className={styles.app}>
      <a href="#main-content" className={styles.skipLink}>
        {t("shell.skipToContent")}
      </a>
      <AppNav />
      {/* location.pathname === '/' && <FloatingTOC items={TOC_ITEMS} /> */}
      <main ref={mainRef} id="main-content" tabIndex={-1} className={styles.main}>
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
