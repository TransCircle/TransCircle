import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type RefObject } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSession } from "../context/SessionContext";
import { useAdmin } from "../context/AdminContext";
import ThemeToggle from "./ThemeToggle";
import { Avatar } from "./Avatar";
import FlagStripe from "./FlagStripe";
import { cx } from "./admin/cx";
import { lockScroll } from "../utils/scrollLock";
import { useSectionSpy } from "../utils/useSectionSpy";
import { focusTarget } from "../utils/focusTarget";
import styles from "./AppNav.module.css";

/** 移动断点:与 AppNav.module.css 的 @media (max-width: 1024px) 保持一致(双处互指)。
 *  顶栏改用短标签后横排只占约 330px，1024px 仍放得下，故折叠点从 1200 下移到 1024（DESIGN §4 断点之一）。 */
const MOBILE_BREAKPOINT = 1024;

/** 首页分区 id，顺序即页面自上而下的顺序（滚动监听按此判定所在分区）。 */
const SECTION_IDS = ["about", "projects", "team", "follow", "faq"] as const;
type SectionId = (typeof SECTION_IDS)[number];

/** 顶栏用两字短标签（抽屉与首页分区标题仍用完整名称）。 */
const SECTION_TITLE_KEYS: Record<SectionId, string> = {
  about: "landing.aboutHeading",
  projects: "landing.projectsHeading",
  team: "landing.teamHeading",
  follow: "landing.followHeading",
  faq: "landing.faqHeading",
};

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;


interface NavLinkDef {
  /** 完整名称：抽屉、悬停提示。 */
  label: string;
  /** 顶栏横排用的短标签。 */
  shortLabel: string;
  /** 站内路由:一律 react-router <Link>,避免整页刷新丢状态。 */
  to: string;
  /** 首页分区 id；「首页」本身为 null。 */
  section: SectionId | null;
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
  const [acctOpen, setAcctOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
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

  // 页面导览：首页 + 首页各分区的锚点。宽屏横排短标签，≤1024px 收进汉堡抽屉（完整名称）。
  // 各子项目的入口在首页「项目列表」一节（ProjectsSection），不放进顶栏。
  const navLinks: NavLinkDef[] = [
    { label: t("nav.home"), shortLabel: t("nav.home"), to: "/", section: null },
    ...SECTION_IDS.map((id) => ({
      label: t(SECTION_TITLE_KEYS[id]),
      shortLabel: t(`nav.section.${id}`),
      to: `/#${id}`,
      section: id,
    })),
  ];

  /**
   * 当前项（§5.3 迷你旗帜条纹指示）：在首页上跟随滚动位置（scroll spy），
   * 还没滚到第一个分区时是「首页」；离开首页后顶栏各项都指向首页内容，均不算当前。
   */
  const onHome = location.pathname === "/";
  const spySection = useSectionSpy(SECTION_IDS, onHome);
  const activeTo = onHome ? (spySection ? `/#${spySection}` : "/") : null;
  const isCurrent = (l: NavLinkDef): boolean => l.to === activeTo;
  // 首页用 page；分区是页内位置，用 location（读屏念「当前位置」）。
  const currentKind = (l: NavLinkDef): "page" | "location" | undefined =>
    isCurrent(l) ? (l.section ? "location" : "page") : undefined;

  /**
   * 已在首页时点击导览：自己平滑滚动，而不是交给路由改 hash。
   * 路由方案在「hash 没变」（滚走后再点同一项）时什么都不做；而且 App 的 hash 跳转是瞬移。
   * 抽屉打开时滚动被锁住、背景是 inert，所以先关抽屉，等锁释放（下一帧）再滚。
   *
   * 焦点随之移到目标分区（同跳转链接的惯例）：否则从抽屉里按 Enter 的键盘用户，
   * 焦点会留在刚被隐藏的抽屉链接上，Tab 下去又回到页首。
   */
  const onNavClick = (l: NavLinkDef) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (!onHome) {
      // 跨页跳到首页分区：交给路由，但**同步**关抽屉 —— 与路由更新同一次提交，
      // 抽屉 effect 的清理（解除 main 的 inert、释放滚动锁）先于 App 的聚焦 / 定位执行；
      // 否则 App 聚焦目标时 main 仍是 inert，焦点落不下去。
      setDrawerOpen(false);
      return;
    }
    e.preventDefault();
    setDrawerOpen(false);
    const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
    window.requestAnimationFrame(() => {
      const target = l.section ? document.getElementById(l.section) : null;
      if (target) target.scrollIntoView({ behavior, block: "start" });
      else window.scrollTo({ top: 0, behavior });
      // 「首页」落到页面主标题；分区落到分区本身。
      const landing = target ?? document.querySelector<HTMLElement>("main h1");
      if (landing) focusTarget(landing);
      // 同步地址栏以便分享/刷新，但不经路由（避免触发 App 的瞬移跳转）。
      window.history.replaceState(window.history.state, "", l.to);
    });
  };

  // 横排当前项下方的旗帜条纹是一条独立元素，在各项之间滑动，而不是在每项里闪现/消失。
  const linksRowRef = useRef<HTMLDivElement>(null);
  const [stripe, setStripe] = useState<{ x: number; ready: boolean } | null>(null);
  useLayoutEffect(() => {
    const row = linksRowRef.current;
    if (!row) return;
    const place = () => {
      const el = activeTo ? row.querySelector<HTMLElement>(`[data-nav-to="${activeTo}"]`) : null;
      if (!el || el.offsetWidth === 0) {
        setStripe(null);
        return;
      }
      const x = el.offsetLeft + el.offsetWidth / 2;
      // 首次定位不做过渡（否则会从最左侧滑进来）；之后的切换才滑动。
      setStripe((prev) => ({ x, ready: prev !== null }));
    };
    place();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    ro?.observe(row);
    return () => ro?.disconnect();
  }, [activeTo, t]);

  // 关闭抽屉/下拉：路由变化时。含 hash——站内锚点(/#about 之类)只改 hash 不改 pathname,
  // 若仅依赖 pathname 则抽屉不关、背景滚动保持锁定、main 保持 inert 遮住刚滚到的分区。
  useEffect(() => {
    setDrawerOpen(false);
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
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcctOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAcctOpen(false);
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
  const closeAcct = useCallback(() => setAcctOpen(false), []);
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

          <div ref={linksRowRef} className={styles.links}>
            {navLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                data-nav-to={l.to}
                className={cx(styles.link, isCurrent(l) && styles.linkActive)}
                aria-current={currentKind(l)}
                title={l.shortLabel === l.label ? undefined : l.label}
                onClick={onNavClick(l)}
              >
                {l.shortLabel}
              </Link>
            ))}
            {/* 当前项指示：24×3px 迷你旗帜条纹（§3.1 / §5.3），随当前项滑动。
                语义由 aria-current 承担，条纹纯装饰。 */}
            {stripe && (
              <FlagStripe
                variant="mini"
                className={cx(styles.activeStripe, stripe.ready && styles.activeStripeAnimated)}
                style={{ "--stripe-x": `${stripe.x}px` } as CSSProperties}
              />
            )}
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
                    <li aria-hidden="true" className={styles.menuHeader}>
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
          {navLinks.map((l) => (
            <Link key={l.to} to={l.to} className={styles.drawerLink} aria-current={currentKind(l)} onClick={onNavClick(l)}>
              {l.label}
            </Link>
          ))}
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
