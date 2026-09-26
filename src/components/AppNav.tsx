import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSession } from "../context/SessionContext";
import { useAdmin } from "../context/AdminContext";
import ThemeToggle from "./ThemeToggle";
import { Avatar } from "./Avatar";
import FlagStripe from "./FlagStripe";
import { cx } from "./admin/cx";
import { lockScroll } from "../utils/scrollLock";
import styles from "./AppNav.module.css";

/** 移动断点:与 AppNav.module.css 的 @media (max-width: 1200px) 保持一致(双处互指)。
 *  1200px 为 DESIGN.md §4 规定的「导航折叠」断点。 */
const MOBILE_BREAKPOINT = 1200;

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
  /**
   * 预告项:分区还没建成,菜单里只占个位置。
   *
   * 既不给 to 也不给 href —— 渲染成不可点的 <span>,点它不发生任何事。
   * 曾经它指向 /#about(主页里谈归档愿景的那一段)当作替代目的地,
   * 但那等于让人点「人物归档」却被送到别处,比不给目的地更让人困惑。
   */
  disabled?: boolean;
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
  const { user, status, hint, logout: sessionLogout } = useSession();
  // 管理员就是普通用户：控制台复用同一条会话，因此导航身份只有 user 一个来源，
  // 「有没有管理权限」只决定要不要多显示一个入口，不再是第二种登录态。
  const { state: adminState, me: adminMe } = useAdmin();
  const adminAuthed = adminState === "ready";
  /**
   * 导航栏要显示的身份。
   *
   * 会话还没问出结果时（status === "unknown"）退回上次登录留下的身份提示 ——
   * 否则每次冷启动导航栏都会先画出「登录」按钮，几百毫秒后再跳成头像，
   * 而绝大多数情况下用户本来就是登录着的。提示只影响这一处渲染：
   * 猜错了会在 status 落定时立刻改回「登录」，且它带不出任何权限
   *（adminAuthed 另有来源，且必须等真实接口）。
   */
  const navIdentity =
    user ?? (status === "unknown" && hint ? { displayName: hint.displayName, avatarUrl: hint.avatarUrl } : null);
  const navUser = navIdentity;
  /**
   * 身份还只是「提示」时，头像只作占位、不可交互。
   *
   * 提示可能已经失效（登录早已过期、或在别处登出过）。此时把账户菜单一起画出来，
   * 用户点「退出登录」会撞上 401、点「账户中心」会被门控弹回登录页 ——
   * 展示一个还没证实的身份是可以接受的取舍，让人对着它做操作则不是。
   * 状态一落定（几百毫秒内）菜单即可用。
   */
  const identityUnconfirmed = !user && navIdentity !== null;
  /**
   * 会话还没问出结果、且本地也没有身份提示。
   *
   * 不展示头像（未知是谁），但必须保留登录入口：本地/网络错误可能让 session
   * 探测长期停在 unknown，若把登录也隐藏，用户系统会变成无法进入的死状态。
   */
  const identityPending = status === "unknown" && navIdentity === null;
  const location = useLocation();
  const navigate = useNavigate();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
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

  // 导航站主导航:首页 + 已经上线的生态分区(全是独立子域,直接外链)。
  const primaryLinks: NavLinkDef[] = [
    { label: t("nav.home"), to: "/" },
    { label: t("nav.blog"), href: "https://blog.transcircle.org/" },
    { label: t("nav.stories"), href: "https://story.transcircle.org/" },
    { label: t("nav.community"), href: "https://community.transcircle.org/" },
  ];
  // 「更多」下拉:主导航之外的入口。
  // 人物归档还没有站点,只作预告留在这里(不可点击,见 NavLinkDef.disabled)。
  const moreLinks: NavLinkDef[] = [
    { label: t("nav.archive"), disabled: true },
    { label: t("nav.search"), href: "https://search.transcircle.org/" },
  ];

  /**
   * 当前项判定（§5.3 迷你旗帜条纹指示）：只有站内 <Link> 参与，外链与预告项永远不是「当前页」。
   *
   * 目标自带 hash 的按 pathname + hash 整体比对（同一 pathname 下的分区要各自高亮）；
   * 不带 hash 的只看 pathname —— 否则停在 /#about 这类锚点上时「首页」会莫名失去标记。
   */
  const currentPath = `${location.pathname}${location.hash}`;
  const isCurrent = (l: NavLinkDef): boolean =>
    l.to !== undefined && (l.to.includes("#") ? l.to === currentPath : l.to === location.pathname);

  // 关闭抽屉/下拉：路由变化时。含 hash——站内锚点(/#about 之类)只改 hash 不改 pathname,
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

  // 抽屉打开时锁定背景滚动 + Escape 关闭 + 变宽自动关闭
  useEffect(() => {
    if (!drawerOpen) return;
    // 与弹窗共用同一把锁(见 utils/scrollLock):抽屉此前只裸设 body.overflow,
    // 既不参与引用计数(和弹窗叠一起会互相还原掉),旧浏览器上也从不补偿滚动条宽度。
    const releaseScroll = lockScroll();
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
      releaseScroll();
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

  // 身份一旦变得不确定（别的标签页换了号、会话正在重新确认），**已经展开的账户菜单
  // 必须立刻收起来**。只把触发按钮 disabled 是不够的：菜单是独立渲染的，
  // 展开状态会原样留在屏幕上，用户点里面的「退出登录」或「账户中心」时，
  // 身份其实还没确认 —— 那次操作会带着旧令牌和已经换过的共享 cookie 发出去。
  useEffect(() => {
    if (identityUnconfirmed || identityPending) setAcctOpen(false);
  }, [identityUnconfirmed, identityPending]);

  // 用事件的 pointerType(而非 matchMedia)判定是否为真实鼠标悬停:触屏笔记本的主指针也报告为
  // 可 hover 的 fine 指针,若按媒体查询判定,手指点击会先触发兼容鼠标事件(pointerenter 开 → click 关)
  // 造成菜单"点开即关、触屏点不开"。改看 pointerType 后,触屏 tap 不再误触发 hover 打开。
  const openAcctHover = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    // 身份未证实时头像只是占位：悬停也不该展开菜单（disabled 按钮挡不住父容器的悬停）。
    if (identityUnconfirmed) return;
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
      await sessionLogout();
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

  // user 的 displayName 可能为空串，回落用户名；hint 在写入时已经做过同样的回落。
  const displayName = user ? user.displayName || user.username || "" : navIdentity?.displayName ?? "";
  const avatarUrl = navIdentity?.avatarUrl ?? null;
  const logoutLabel = loggingOut ? t("nav.loggingOut") : t("nav.logout");
  /** 管理员的角色说明（原先画在后台左栏底部）；非管理员不显示。 */
  const adminRoleText =
    adminAuthed && adminMe
      ? adminMe.roles.length > 0
        ? adminMe.roles.join("、")
        : t("admin.access.directGrant")
      : null;

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
              <span className={cx(styles.bar, drawerOpen && styles.barTop)} />
              <span className={cx(styles.bar, drawerOpen && styles.barMid)} />
              <span className={cx(styles.bar, drawerOpen && styles.barBot)} />
            </button>
            <Link to="/" className={styles.brand} aria-label="TransCircle">
              <img
                className={cx(styles.brandLogo, styles.brandLogoLight)}
                src="/brand/transcircle-horizontal-on-light.svg"
                width={400}
                height={120}
                alt=""
                aria-hidden="true"
              />
              <img
                className={cx(styles.brandLogo, styles.brandLogoDark)}
                src="/brand/transcircle-horizontal-on-dark.svg"
                width={400}
                height={120}
                alt=""
                aria-hidden="true"
              />
            </Link>
          </div>

          <div className={styles.links}>
            {primaryLinks.map((l) =>
              l.to ? (
                <Link
                  key={l.label}
                  to={l.to}
                  className={cx(styles.link, isCurrent(l) && styles.linkActive)}
                  aria-current={isCurrent(l) ? "page" : undefined}
                >
                  {l.label}
                  {/* 当前项指示：24×3px 迷你旗帜条纹（§3.1 / §5.3）。
                      语义由 aria-current 承担，条纹纯装饰。 */}
                  {isCurrent(l) && <FlagStripe variant="mini" className={styles.activeStripe} />}
                </Link>
              ) : (
                <a key={l.label} href={l.href} rel="nofollow noopener noreferrer" className={styles.link}>
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
                  {moreLinks.map((l) => (
                    <li key={l.label} role="none">
                      {l.disabled ? (
                        /* 预告项:没有跳转目标,点了什么都不会发生。
                           仍保留 role=menuitem + tabIndex=-1 —— 方向键要能走到它,
                           不然键盘/读屏用户根本不知道这一项存在;aria-disabled 说明它现在点不了。 */
                        <span
                          role="menuitem"
                          aria-disabled="true"
                          tabIndex={-1}
                          className={cx(styles.menuItem, styles.menuItemMuted)}
                        >
                          {l.label}
                        </span>
                      ) : (
                        <a role="menuitem" href={l.href} target="_blank" rel="nofollow noopener noreferrer" className={styles.menuItem}>
                          {l.label}<ExternalIcon />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className={styles.right}>
            <ThemeToggle />
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
                  disabled={identityUnconfirmed}
                  aria-haspopup="menu"
                  aria-expanded={acctOpen}
                  aria-label={`${displayName} · ${t("nav.account")}`}
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
                {acctOpen && !identityUnconfirmed && (
                  <ul ref={acctMenuRef} className={cx(styles.menu, styles.menuRight)} role="menu">
                    {/* 身份抬头：告诉用户「当前是谁」。管理后台不再在左栏底部重复画一遍头像，
                        角色信息（仅管理员）就挪到这里。触发器的 aria-label 已含名字，
                        这里对读屏隐藏，避免 role=menu 里混入非菜单项。 */}
                    <li role="none" aria-hidden="true" className={styles.menuHeader}>
                      <span className={styles.menuHeaderName}>{displayName}</span>
                      {adminRoleText && <span className={styles.menuHeaderMeta}>{adminRoleText}</span>}
                    </li>
                    <li role="separator" className={styles.menuSeparator} />
                    {/* 账户中心对所有人都在：管理员首先也是普通用户，个人资料 / 安全设置同样要能找到。 */}
                    <li role="none"><Link role="menuitem" to="/account" className={styles.menuItem}>{t("nav.account")}</Link></li>
                    {adminAuthed && (
                      <li role="none"><Link role="menuitem" to="/admin" className={styles.menuItem}>{t("nav.admin")}</Link></li>
                    )}
                    <li role="separator" className={styles.menuSeparator} />
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

      {/* 移动端抽屉：关闭时 inert（不可聚焦、移出无障碍树）。
          模态语义（role/aria-modal/aria-label）与既有焦点陷阱配套。 */}
      <div
        ref={drawerRef}
        className={cx(styles.drawer, drawerOpen && styles.drawerOpen)}
        id="app-drawer"
        inert={drawerOpen ? undefined : true}
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.primary')}
      >
        <div className={styles.drawerHeader}>
          <div className={styles.drawerBrand} aria-hidden="true">
            <img
              className={cx(styles.brandLogo, styles.brandLogoLight)}
              src="/brand/transcircle-horizontal-on-light.svg"
              width={400}
              height={120}
              alt=""
            />
            <img
              className={cx(styles.brandLogo, styles.brandLogoDark)}
              src="/brand/transcircle-horizontal-on-dark.svg"
              width={400}
              height={120}
              alt=""
            />
          </div>
          <button
            type="button"
            className={styles.drawerClose}
            aria-label={t("shell.closeNav")}
            onClick={() => setDrawerOpen(false)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className={styles.drawerInner}>
          {primaryLinks.map((l) =>
            l.to ? (
              <Link
                key={l.label}
                to={l.to}
                className={styles.drawerLink}
                aria-current={isCurrent(l) ? "page" : undefined}
              >
                {l.label}
              </Link>
            ) : (
              <a key={l.label} href={l.href} rel="nofollow noopener noreferrer" className={styles.drawerLink}>
                {l.label}<ExternalIcon />
              </a>
            ),
          )}
          {moreLinks.map((l) =>
            l.disabled ? (
              // 同桌面菜单:预告项不可点击,也不进焦点序列(抽屉的 Tab 陷阱只收可聚焦元素)。
              <span key={l.label} aria-disabled="true" className={cx(styles.drawerLink, styles.drawerLinkMuted)}>
                {l.label}
              </span>
            ) : (
              <a key={l.label} href={l.href} target="_blank" rel="nofollow noopener noreferrer" className={styles.drawerLink}>{l.label}<ExternalIcon /></a>
            ),
          )}
          <hr className={styles.drawerDivider} />
          {identityUnconfirmed ? (
            // 身份提示未证实：不提供账户/退出等可能失败的操作。
            null
          ) : navUser ? (
            <>
              <Link to="/account" className={styles.drawerLink} onClick={() => setDrawerOpen(false)}>{t("nav.account")}</Link>
              {adminAuthed && (
                <Link to="/admin" className={styles.drawerLink} onClick={() => setDrawerOpen(false)}>{t("nav.admin")}</Link>
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
