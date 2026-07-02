import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSession } from "../context/SessionContext";
import { useAdmin } from "../context/AdminContext";
import ThemeToggle from "./ThemeToggle";
// import { LanguageToggle } from "./ui";
import { Avatar } from "./Avatar";
import { cx } from "./admin/cx";
import styles from "./AppNav.module.css";

/** 移动断点:与 AppNav.module.css 的 @media (max-width: 1100px) 保持一致(双处互指)。 */
const MOBILE_BREAKPOINT = 1100;

const ExternalIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.extIcon}>
    <path d="M6 2h8v8" /><path d="M14 2 4 12" />
  </svg>
);
const ChevronIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
);

interface NavLinkDef {
  label: string;
  /** 站内路由:一律 react-router <Link>,避免整页刷新丢状态。 */
  to?: string;
  /** 生态外链(子域站点):原生 <a> + rel noopener noreferrer。 */
  href?: string;
}

/**
 * role=menu 的键盘契约:打开即聚焦首个 menuitem,ArrowUp/Down 循环,Home/End 跳首尾,
 * Esc 关闭并把焦点还给触发器,Tab 关闭(焦点自然离开)。
 * 声明了 menu/menuitem 语义就必须配套这些行为,否则读屏/键盘用户会被"假菜单"卡住。
 */
function useMenuKeyboard(
  open: boolean,
  close: () => void,
  menuRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu) return;
    const items = () => Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      const nodes = items();
      if (nodes.length === 0) return;
      const idx = nodes.indexOf(document.activeElement as HTMLElement);
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          nodes[(idx + 1) % nodes.length]?.focus();
          break;
        case "ArrowUp":
          e.preventDefault();
          nodes[(idx - 1 + nodes.length) % nodes.length]?.focus();
          break;
        case "Home":
          e.preventDefault();
          nodes[0]?.focus();
          break;
        case "End":
          e.preventDefault();
          nodes[nodes.length - 1]?.focus();
          break;
        case "Escape":
          close();
          triggerRef.current?.focus();
          break;
        case "Tab":
          close();
          break;
      }
    };
    menu.addEventListener("keydown", onKey);
    return () => menu.removeEventListener("keydown", onKey);
  }, [open, close, menuRef, triggerRef]);
}

/**
 * 全站统一导航栏：landing / 认证 / 账户中心 / 管理后台共用同一套导航与视觉语言。
 * 认证感知：已登录展示头像菜单（账户中心 / 退出），管理员额外显示「管理后台」入口。
 */
export function AppNav() {
  const { t } = useTranslation();
  const { user, logout } = useSession();
  const { authed: adminAuthed } = useAdmin();
  const location = useLocation();
  const navigate = useNavigate();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const linksBtnRef = useRef<HTMLButtonElement>(null);
  const linksMenuRef = useRef<HTMLUListElement>(null);
  const acctRef = useRef<HTMLDivElement>(null);
  const acctBtnRef = useRef<HTMLButtonElement>(null);
  const acctMenuRef = useRef<HTMLUListElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // 导航站主导航:首页 + 生态各业务分区。
  // - 故事征集:已上线的子域站点(commit 33b4643 的产品意图,曾在合并中回退,此处恢复)。
  // - 人物归档/社群互助:尚无独立站点(标签仍带「开发中」),指向主页真实分区
  //   (归档愿景在 #about 阐述、社群入口在 #join),避免 /#archive 这类无目标死锚点。
  const primaryLinks: NavLinkDef[] = [
    { label: t("nav.home"), to: "/" },
    { label: t("nav.stories"), href: "https://story.transcircle.org/" },
    { label: t("nav.archive"), to: "/#about" },
    { label: t("nav.community"), to: "/#join" },
  ];
  const externalLinks: NavLinkDef[] = [
    { label: t("nav.blog"), href: "https://blog.transcircle.org/" },
    { label: t("nav.search"), href: "https://search.transcircle.org/" },
  ];

  // 关闭抽屉/下拉：路由变化时
  useEffect(() => {
    setDrawerOpen(false);
    setLinksOpen(false);
    setAcctOpen(false);
  }, [location.pathname]);

  // --app-nav-height 动态写入文档根:导航实际高度随断点/字号/换行变化,
  // 供 Page.module.css 等处的 sticky 偏移消费;index.css 保留 57px 静态兜底。
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const write = () => {
      document.documentElement.style.setProperty(
        "--app-nav-height",
        `${Math.ceil(nav.getBoundingClientRect().height)}px`,
      );
    };
    write();
    const ro = new ResizeObserver(write);
    ro.observe(nav);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--app-nav-height");
    };
  }, []);

  // 抽屉打开时锁定背景滚动 + Escape 关闭 + 变宽自动关闭
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        hamburgerRef.current?.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth > MOBILE_BREAKPOINT) setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [drawerOpen]);

  // 抽屉打开：背景设为 inert，焦点移入抽屉并在内部循环（Tab 陷阱）。
  useEffect(() => {
    if (!drawerOpen) return;
    const drawer = drawerRef.current;
    const main = document.querySelector<HTMLElement>("main");
    if (main) main.inert = true;
    const focusables = () =>
      drawer?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
    focusables()?.[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = focusables();
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    drawer?.addEventListener("keydown", onKey);
    return () => {
      if (main) main.inert = false;
      drawer?.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  // 点击外部 / Escape 关闭下拉(菜单内的 Escape 由 useMenuKeyboard 处理并恢复焦点)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (linksRef.current && !linksRef.current.contains(e.target as Node)) setLinksOpen(false);
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcctOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLinksOpen(false);
        setAcctOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // close 回调必须引用稳定,否则菜单打开期间的任意重渲染都会触发
  // useMenuKeyboard 重新执行"聚焦首项",打断方向键导航。
  const closeLinks = useCallback(() => setLinksOpen(false), []);
  const closeAcct = useCallback(() => setAcctOpen(false), []);
  useMenuKeyboard(linksOpen, closeLinks, linksMenuRef, linksBtnRef);
  useMenuKeyboard(acctOpen, closeAcct, acctMenuRef, acctBtnRef);

  const doLogout = async () => {
    if (loggingOut) return; // busy 防重复提交
    setLoggingOut(true);
    setLogoutFailed(false);
    try {
      await logout();
      setAcctOpen(false);
      setDrawerOpen(false);
      navigate("/", { replace: true });
    } catch {
      // 不再静默吞错:保持菜单打开并给出可见反馈,允许用户重试。
      setLogoutFailed(true);
    } finally {
      setLoggingOut(false);
    }
  };

  const displayName = user ? user.displayName || user.username : "";
  const logoutLabel = loggingOut ? t("nav.loggingOut") : t("nav.logout");

  // 触发器上按 ArrowDown/ArrowUp 也应打开菜单(菜单按钮键盘惯例);
  // 打开后由 useMenuKeyboard 将焦点移入首项。
  const triggerArrowOpen =
    (open: boolean, setOpen: (v: boolean) => void) =>
    (e: React.KeyboardEvent) => {
      if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        setOpen(true);
      }
    };

  return (
    <>
      <nav ref={navRef} className={styles.nav} aria-label={t("nav.primary")}>
        <div className={styles.inner}>
          <div className={styles.left}>
            <button
              ref={hamburgerRef}
              type="button"
              className={styles.hamburger}
              aria-label={drawerOpen ? t("shell.closeNav") : t("shell.openNav")}
              aria-expanded={drawerOpen}
              aria-controls="app-drawer"
              onClick={() => setDrawerOpen((o) => !o)}
            >
              <span className={cx(styles.bar, drawerOpen && styles.barTop)} />
              <span className={cx(styles.bar, drawerOpen && styles.barMid)} />
              <span className={cx(styles.bar, drawerOpen && styles.barBot)} />
            </button>
            <Link to="/" className={styles.brand}>TransCircle</Link>
          </div>

          <div className={styles.links}>
            {primaryLinks.map((l) =>
              l.to ? (
                <Link key={l.label} to={l.to} className={styles.link}>{l.label}</Link>
              ) : (
                <a key={l.label} href={l.href} rel="noopener noreferrer" className={styles.link}>
                  {l.label}<ExternalIcon />
                </a>
              ),
            )}
            <div ref={linksRef} className={styles.dropdown}>
              <button
                ref={linksBtnRef}
                type="button"
                className={styles.link}
                aria-haspopup="menu"
                aria-expanded={linksOpen}
                onClick={() => setLinksOpen((o) => !o)}
                onKeyDown={triggerArrowOpen(linksOpen, setLinksOpen)}
              >
                {t("nav.links")}<ChevronIcon />
              </button>
              {linksOpen && (
                <ul ref={linksMenuRef} className={styles.menu} role="menu">
                  {externalLinks.map((l) => (
                    <li key={l.href} role="none">
                      <a role="menuitem" href={l.href} target="_blank" rel="noopener noreferrer" className={styles.menuItem}>
                        {l.label}<ExternalIcon />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className={styles.right}>
            <ThemeToggle />
            {/*
            <div ref={langRef} className={styles.dropdown}>
              <button
                type="button"
                className={styles.navBtn}
                aria-haspopup="menu"
                aria-expanded={langOpen}
                aria-label={t("nav.language")}
                onClick={() => { setLangOpen((o) => !o); setThemeOpen(false); }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </button>
              {langOpen && (
                <div className={styles.dropdownMenu}>
                  <LanguageToggle variant="dropdown" />
                </div>
              )}
            </div>
            */}
            {user ? (
              <div ref={acctRef} className={styles.dropdown}>
                <button
                  ref={acctBtnRef}
                  type="button"
                  className={styles.acctBtn}
                  aria-haspopup="menu"
                  aria-expanded={acctOpen}
                  aria-label={t("nav.account")}
                  onClick={() => setAcctOpen((o) => !o)}
                  onKeyDown={triggerArrowOpen(acctOpen, setAcctOpen)}
                >
                  <Avatar name={displayName} src={user.avatarUrl} size={32} />
                  <span className={styles.acctName}>{displayName}</span>
                  <ChevronIcon />
                </button>
                {acctOpen && (
                  <ul ref={acctMenuRef} className={cx(styles.menu, styles.menuRight)} role="menu">
                    <li role="none"><Link role="menuitem" to="/account" className={styles.menuItem}>{t("nav.account")}</Link></li>
                    {adminAuthed && (
                      <li role="none"><Link role="menuitem" to="/admin" className={styles.menuItem}>{t("nav.admin")}</Link></li>
                    )}
                    <li role="none">
                      <button
                        role="menuitem"
                        type="button"
                        className={styles.menuItem}
                        aria-busy={loggingOut}
                        onClick={() => void doLogout()}
                      >
                        {logoutLabel}
                      </button>
                    </li>
                    {logoutFailed && (
                      <li role="none">
                        <p className={styles.logoutError} role="alert">{t("nav.logoutFailed")}</p>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            ) : (
              <Link to="/login" className={styles.loginCta}>{t("nav.login")}</Link>
            )}
          </div>
        </div>
      </nav>

      {/* 移动端抽屉：关闭时 inert（不可聚焦、移出无障碍树）。 */}
      <div
        ref={drawerRef}
        className={cx(styles.drawer, drawerOpen && styles.drawerOpen)}
        id="app-drawer"
        inert={drawerOpen ? undefined : true}
      >
        <div className={styles.drawerInner}>
          {primaryLinks.map((l) =>
            l.to ? (
              <Link key={l.label} to={l.to} className={styles.drawerLink}>{l.label}</Link>
            ) : (
              <a key={l.label} href={l.href} rel="noopener noreferrer" className={styles.drawerLink}>
                {l.label}<ExternalIcon />
              </a>
            ),
          )}
          {externalLinks.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className={styles.drawerLink}>{l.label}<ExternalIcon /></a>
          ))}
          <div className={styles.drawerDivider} />
          {user ? (
            <>
              <Link to="/account" className={styles.drawerLink}>{t("nav.account")}</Link>
              {adminAuthed && <Link to="/admin" className={styles.drawerLink}>{t("nav.admin")}</Link>}
              <button type="button" className={styles.drawerLink} aria-busy={loggingOut} onClick={() => void doLogout()}>
                {logoutLabel}
              </button>
              {logoutFailed && <p className={styles.logoutError} role="alert">{t("nav.logoutFailed")}</p>}
            </>
          ) : (
            <Link to="/login" className={styles.drawerLink}>{t("nav.login")}</Link>
          )}
        </div>
      </div>
      <button
        type="button"
        className={cx(styles.overlay, drawerOpen && styles.overlayOn)}
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => setDrawerOpen(false)}
      />
    </>
  );
}
