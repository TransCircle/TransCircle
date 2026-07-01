import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSession } from "../context/SessionContext";
import { useAdmin } from "../context/AdminContext";
import ThemeToggle from "./ThemeToggle";
import { LanguageToggle } from "./ui";
import { Avatar } from "./Avatar";
import { cx } from "./admin/cx";
import styles from "./AppNav.module.css";

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
  to?: string;
  href?: string;
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
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const acctRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // 导航站主导航：首页 + 生态各业务分区（沿用原导航站，故事征集/人物归档/社群互助）。
  const primaryLinks: NavLinkDef[] = [
    { label: t("nav.home"), to: "/" },
    { label: t("nav.stories"), href: "https://story.transcircle.org/" },
    { label: t("nav.archive"), href: "/#archive" },
    { label: t("nav.community"), href: "/#community" },
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

  // 点击外部 / Escape 关闭下拉
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

  const doLogout = async () => {
    setAcctOpen(false);
    await logout();
    navigate("/", { replace: true });
  };

  const displayName = user ? user.displayName || user.username : "";

  return (
    <>
      <nav className={styles.nav} aria-label={t("nav.primary")}>
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
              <span className={styles.bar} /><span className={styles.bar} /><span className={styles.bar} />
            </button>
            <Link to="/" className={styles.brand}>TransCircle</Link>
          </div>

          <div className={styles.links}>
            {primaryLinks.map((l) =>
              l.to ? (
                <Link key={l.to} to={l.to} className={styles.link}>{l.label}</Link>
              ) : (
                <a key={l.href} href={l.href} className={styles.link}>{l.label}</a>
              ),
            )}
            <div ref={linksRef} className={styles.dropdown}>
              <button
                type="button"
                className={styles.link}
                aria-haspopup="menu"
                aria-expanded={linksOpen}
                onClick={() => setLinksOpen((o) => !o)}
              >
                {t("nav.links")}<ChevronIcon />
              </button>
              {linksOpen && (
                <ul className={styles.menu} role="menu">
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
            {adminAuthed && (
              <Link to="/admin" className={cx(styles.link, styles.adminLink)}>{t("nav.admin")}</Link>
            )}
            <div className={styles.toggles}>
              <LanguageToggle variant="plain" />
              <ThemeToggle />
            </div>
            {user ? (
              <div ref={acctRef} className={styles.dropdown}>
                <button
                  type="button"
                  className={styles.acctBtn}
                  aria-haspopup="menu"
                  aria-expanded={acctOpen}
                  aria-label={t("nav.account")}
                  onClick={() => setAcctOpen((o) => !o)}
                >
                  <Avatar name={displayName} src={user.avatarUrl} size={32} />
                  <span className={styles.acctName}>{displayName}</span>
                  <ChevronIcon />
                </button>
                {acctOpen && (
                  <ul className={cx(styles.menu, styles.menuRight)} role="menu">
                    <li role="none"><Link role="menuitem" to="/account" className={styles.menuItem}>{t("nav.account")}</Link></li>
                    {adminAuthed && (
                      <li role="none"><Link role="menuitem" to="/admin" className={styles.menuItem}>{t("nav.admin")}</Link></li>
                    )}
                    <li role="none"><button role="menuitem" type="button" className={styles.menuItem} onClick={() => void doLogout()}>{t("nav.logout")}</button></li>
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
              <Link key={l.to} to={l.to} className={styles.drawerLink}>{l.label}</Link>
            ) : (
              <a key={l.href} href={l.href} className={styles.drawerLink}>{l.label}</a>
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
              <button type="button" className={styles.drawerLink} onClick={() => void doLogout()}>{t("nav.logout")}</button>
            </>
          ) : (
            <>
              <Link to="/login" className={styles.drawerLink}>{t("nav.login")}</Link>
              {adminAuthed && <Link to="/admin" className={styles.drawerLink}>{t("nav.admin")}</Link>}
            </>
          )}
          <div className={styles.drawerDivider} />
          <div className={styles.drawerToggles}>
            <LanguageToggle variant="plain" />
            <ThemeToggle />
          </div>
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
