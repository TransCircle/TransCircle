import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSession } from "../context/SessionContext";
import { useAdmin } from "../context/AdminContext";
import ThemeToggle from "./ThemeToggle";
import { LanguageToggle } from "./ui";
import { Avatar } from "./Avatar";
import { cx } from "./admin/cx";
import styles from "./AppNav.module.css";

/** 移动断点:与 AppNav.module.css 的 @media (max-width: 1100px) 保持一致(双处互指)。 */
const MOBILE_BREAKPOINT = 1100;

const ExternalIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={styles.extIcon}>
    <path d="M6 2h8v8" /><path d="M14 2 4 12" />
  </svg>
);
const ChevronIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={styles.chevron}><path d="m6 9 6 6 6-6" /></svg>
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
  autoFocusRef?: RefObject<boolean>,
): void {
  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu) return;
    const items = () => Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    // 桌面悬停打开时不抢占鼠标用户的当前焦点;仅显式(点击/方向键)打开才聚焦首项。
    // 传 ref(标识稳定)而非原始布尔:菜单打开期间的重渲染不会重跑"聚焦首项"、打断方向键导航。
    if (autoFocusRef?.current !== false) items()[0]?.focus();
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
  }, [open, close, menuRef, triggerRef, autoFocusRef]);
}

/**
 * 全站统一导航栏：landing / 认证 / 账户中心 / 管理后台共用同一套导航与视觉语言。
 * 认证感知：已登录展示头像菜单（账户中心 / 退出），管理员额外显示「管理后台」入口。
 */
export function AppNav() {
  const { t } = useTranslation();
  const { user, logout: sessionLogout } = useSession();
  const { authed: adminAuthed, me: adminMe, logout: adminLogout } = useAdmin();
  // 導航列身份：優先使用一般使用者，後備為管理員身份
  const navUser = user ?? (adminAuthed && adminMe ? adminMe : null);
  const isAdminOnly = !user && adminAuthed && !!adminMe;
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
  // 账户菜单交互:桌面鼠标悬停打开、移出延时关闭;触屏/触控笔/键盘走点击切换。
  // acctAutoFocus 仅在"悬停打开"时置 false,避免抢占鼠标用户焦点。
  // acctPointerType 记录最近一次触发按钮的指针类型,供 onClick 区分鼠标(仅保证打开)与触屏(切换)。
  const acctCloseTimer = useRef<number | null>(null);
  const acctAutoFocus = useRef(true);
  const acctPointerType = useRef<string>("");

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

  // 关闭抽屉/下拉：路由变化时。含 hash——移动端已在 / 时点抽屉里的
  // 「人物归档」(/#about)/「社群互助」(/#join)只改 hash 不改 pathname,
  // 若仅依赖 pathname 则抽屉不关、背景滚动保持锁定、main 保持 inert 遮住刚滚到的分区。
  useEffect(() => {
    setDrawerOpen(false);
    setLinksOpen(false);
    setAcctOpen(false);
    if (acctCloseTimer.current !== null) {
      clearTimeout(acctCloseTimer.current);
      acctCloseTimer.current = null;
    }
  }, [location.pathname, location.hash]);

  // 卸载时清理悬停关闭定时器,避免在已卸载组件上 setState。
  useEffect(
    () => () => {
      if (acctCloseTimer.current !== null) clearTimeout(acctCloseTimer.current);
    },
    [],
  );

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
  useMenuKeyboard(acctOpen, closeAcct, acctMenuRef, acctBtnRef, acctAutoFocus);

  // 用事件的 pointerType(而非 matchMedia)判定是否为真实鼠标悬停:触屏笔记本的主指针也报告为
  // 可 hover 的 fine 指针,若按媒体查询判定,手指点击会先触发兼容鼠标事件(pointerenter 开 → click 关)
  // 造成菜单"点开即关、触屏点不开"。改看 pointerType 后,触屏 tap 不再误触发 hover 打开。
  const openAcctHover = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    if (acctCloseTimer.current !== null) {
      clearTimeout(acctCloseTimer.current);
      acctCloseTimer.current = null;
    }
    acctAutoFocus.current = false; // 悬停打开不抢焦点
    setAcctOpen(true);
  };
  const closeAcctHover = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    // 延时关闭:留出指针从触发器跨越到菜单的时间(配合 .menu 顶部间隙收窄到 6px)。
    // 关闭前若焦点仍在菜单内(键盘打开后鼠标扫过又移出),先把焦点还给触发器,避免被丢到 <body>。
    acctCloseTimer.current = window.setTimeout(() => {
      if (acctMenuRef.current?.contains(document.activeElement)) {
        acctBtnRef.current?.focus();
      }
      setAcctOpen(false);
    }, 140);
  };

  const doLogout = async () => {
    if (loggingOut) return; // busy 防重复提交
    setLoggingOut(true);
    setLogoutFailed(false);
    try {
      if (isAdminOnly) {
        adminLogout();
      } else {
        await sessionLogout();
      }
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

  const displayName = navUser ? navUser.displayName || navUser.username || "" : "";
  const avatarUrl = navUser ? navUser.avatarUrl : null;
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
            <div className={styles.toggles}>
              <LanguageToggle variant="plain" />
              <ThemeToggle />
            </div>
            {navUser ? (
              <div
                ref={acctRef}
                className={styles.dropdown}
                onPointerEnter={openAcctHover}
                onPointerLeave={closeAcctHover}
              >
                <button
                  ref={acctBtnRef}
                  type="button"
                  className={styles.acctBtn}
                  aria-haspopup="menu"
                  aria-expanded={acctOpen}
                  aria-label={adminAuthed ? `${displayName} · ${t("nav.admin")}` : `${displayName} · ${t("nav.account")}`}
                  onPointerDown={(e) => {
                    acctPointerType.current = e.pointerType;
                  }}
                  onClick={() => {
                    acctAutoFocus.current = true;
                    // 桌面鼠标:hover 已负责开合,点击只保证"打开",避免与 hover 打架造成点开即关。
                    // 触屏/触控笔/键盘(pointerType 非 mouse 或为空):点击切换开合。
                    if (acctPointerType.current === "mouse") {
                      setAcctOpen(true);
                    } else {
                      setAcctOpen((o) => !o);
                    }
                    acctPointerType.current = "";
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                    e.preventDefault();
                    if (!acctOpen) {
                      acctAutoFocus.current = true;
                      setAcctOpen(true);
                    } else {
                      // 已(悬停)打开且焦点在触发器上时,方向键把焦点送入菜单,后续由 useMenuKeyboard 接管。
                      const items = acctMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
                      if (items && items.length > 0) {
                        (e.key === "ArrowDown" ? items[0] : items[items.length - 1])?.focus();
                      }
                    }
                  }}
                >
                  <Avatar name={displayName} src={avatarUrl} size={34} />
                </button>
                {acctOpen && (
                  <ul ref={acctMenuRef} className={cx(styles.menu, styles.menuRight)} role="menu">
                    {adminAuthed ? (
                      <>
                        <li role="none"><Link role="menuitem" to="/admin" className={styles.menuItem}>{t("nav.admin")}</Link></li>
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
                      </>
                    ) : (
                      <>
                        <li role="none"><Link role="menuitem" to="/account" className={styles.menuItem}>{t("nav.account")}</Link></li>
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
                      </>
                    )}
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
          <hr className={styles.drawerDivider} />
          {navUser ? (
            <>
              {adminAuthed ? (
                <Link to="/admin" className={styles.drawerLink} onClick={() => setDrawerOpen(false)}>{t("nav.admin")}</Link>
              ) : (
                <Link to="/account" className={styles.drawerLink} onClick={() => setDrawerOpen(false)}>{t("nav.account")}</Link>
              )}
              <button
                type="button"
                className={styles.drawerLink}
                aria-busy={loggingOut}
                onClick={() => void doLogout()}
              >
                {logoutLabel}
              </button>
              {logoutFailed && (
                <p className={styles.logoutError} role="alert">{t("nav.logoutFailed")}</p>
              )}
            </>
          ) : (
            <Link to="/login" className={styles.drawerLink} onClick={() => setDrawerOpen(false)}>{t("nav.login")}</Link>
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
