import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAdmin } from "../../context/AdminContext";
import { Avatar } from "../../components/Avatar";
import { cx } from "../../components/admin/cx";
import { AdminButton as Button, Card, EmptyState, StatusScreen } from "../../components/ui";
import { usePageTitle } from "../../utils/usePageTitle";
import { PERM } from "./shared/constants";
import { AdminHeaderContext, type AdminHeaderState } from "./shared/header";
import {
  IconApps,
  IconAudit,
  IconBack,
  IconHome,
  IconShield,
  IconStaff,
  IconUsers,
} from "./shared/icons";
import styles from "./Admin.module.css";

interface NavDef {
  to: string;
  key: string;
  icon: ReactNode;
  /** 任一命中即显示。安全页同时服务「策略」与「密钥轮换」两种权限，不能只看其一。 */
  perm: string | readonly string[];
}

const NAV: readonly NavDef[] = [
  { to: "/admin/overview", key: "overview", icon: <IconHome />, perm: PERM.userRead },
  { to: "/admin/users", key: "users", icon: <IconUsers />, perm: PERM.userRead },
  { to: "/admin/clients", key: "clients", icon: <IconApps />, perm: PERM.clientRead },
  { to: "/admin/audit", key: "audit", icon: <IconAudit />, perm: PERM.auditRead },
  { to: "/admin/staff", key: "staff", icon: <IconStaff />, perm: PERM.auditRead },
  // 后端 GET /keys 对 pass.key:rotate 与 pass.policy:manage 都开放，安全页内部也分区判权。
  // 导航只认 policyManage 的话，只被授予「轮换签名密钥」的管理员看不到入口，
  // 只能手敲 /admin/security —— 有权限却找不到门。
  { to: "/admin/security", key: "security", icon: <IconShield />, perm: [PERM.policyManage, PERM.keyRotate] },
];

/**
 * 左栏折叠阈值。
 *
 * 1280 是算出来的，不是拍的：左栏 232→60 会让工作区骤增 172px。若折叠点落在
 * 容器断点（1040/860/700）附近，就会出现「视口变窄、表格列反而变多」的反向跳变。
 * 取 1280 时折叠前容器 1048（>1040，全列）、折叠后 1220（同样全列），两侧同档，单调。
 */
const RAIL_COLLAPSE_AT = 1280;

/**
 * 管理控制台外壳 + 访问门控。
 *
 * 门控只有一条链：有没有登录 → 这个账户在 IAM tc_main 下有没有权限。
 * 没有第二套登录、没有管理员令牌，因此也没有「管理端退出」——
 * 退出就是退出整个账户，走导航栏那一个入口。
 */
const AdminLayout = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { state, me, error, hasPermission, reload } = useAdmin();
  const [header, setHeader] = useState<AdminHeaderState>({ title: t("admin.title") });
  const [rail, setRail] = useState<"full" | "mini">("full");

  usePageTitle(state === "ready" ? `${header.title} · ${t("admin.title")}` : t("admin.title"));

  useEffect(() => {
    const onResize = () => setRail(window.innerWidth < RAIL_COLLAPSE_AT ? "mini" : "full");
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const setHeaderStable = useCallback((next: AdminHeaderState) => setHeader(next), []);

  const navItems = useMemo(
    () =>
      NAV.filter((n) =>
        Array.isArray(n.perm) ? n.perm.some((p) => hasPermission(p)) : hasPermission(n.perm as string),
      ),
    [hasPermission],
  );

  if (state === "loading") {
    return <StatusScreen kind="loading" title={t("admin.access.checking")} />;
  }

  if (state === "anonymous") {
    // 带上 redirect，让人登录完直接回到本来要去的那一页，而不是掉回首页。
    const target = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(target)}`} replace />;
  }

  if (state === "error") {
    return (
      <StatusScreen
        kind="error"
        title={t("admin.access.errorTitle")}
        description={error ?? t("error.generic")}
        actions={[{ label: t("common.retry"), onClick: reload, variant: "primary" }]}
      />
    );
  }

  // 登录成功了，但这个账户在 IAM 的 tc_main 下没有被授予任何权限。
  // 说清三件事：权限在哪配、找谁配、配完要重新登录 —— 只说「访问被拒绝」等于没说。
  // 有权限但缺二次验证：给的是**可执行的下一步**（去开二次验证），
  // 而不是和「没有权限」共用一个「请联系管理员」的死胡同。
  if (state === "needs-mfa") {
    return (
      <div className={styles.body}>
        <div className={styles.wide}>
          <Card>
            <EmptyState
              icon={<IconShield />}
              title={t("admin.access.needsMfaTitle")}
              description={t("admin.access.needsMfaDesc")}
              action={
                <Button variant="primary" to="/account">
                  {t("admin.access.needsMfaAction")}
                </Button>
              }
            />
            <div className={styles.row}>
              <Button variant="ghost" size="sm" onClick={reload}>
                {t("common.retry")}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (state === "no-access" || !me) {
    return (
      <div className={styles.body}>
        <div className={styles.wide}>
          <Card>
            <EmptyState
              icon={<IconShield />}
              title={t("admin.access.noAccessTitle")}
              description={t("admin.access.noAccessDesc")}
              action={
                <Button variant="secondary" to="/account">
                  {t("nav.account")}
                </Button>
              }
            />
            <p className={cx(styles.note, styles.noteSpaced)}>{t("admin.access.noAccessWhere")}</p>
            <p className={styles.note}>{t("admin.access.noAccessRelogin")}</p>
            <div className={styles.row}>
              <Button variant="ghost" size="sm" onClick={reload}>
                {t("admin.access.recheck")}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (navItems.length === 0) {
    return (
      <StatusScreen
        kind="error"
        title={t("admin.access.noSectionTitle")}
        description={t("admin.access.noSectionDesc")}
        actions={[{ label: t("nav.home"), to: "/" }]}
      />
    );
  }

  // /admin 入口按权限落到首个可访问分区，避免撞进一个自己没权限的页面吃 403。
  if (location.pathname === "/admin" || location.pathname === "/admin/") {
    return <Navigate to={navItems[0]!.to} replace />;
  }

  const displayName = me.displayName || me.username || t("admin.staff");
  const roleText = me.roles.length > 0 ? me.roles.join("、") : t("admin.access.directGrant");

  return (
    <div className={styles.shell} data-rail={rail}>
      <nav className={styles.rail} aria-label={t("admin.title")}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            P
          </span>
          <span className={styles.brandText}>
            <span className={styles.brandName}>{t("admin.brand")}</span>
            <span className={styles.brandSub}>{t("admin.brandSub")}</span>
          </span>
        </div>

        <div className={styles.nav}>
          <p className={styles.navGroup}>{t("admin.navGroup")}</p>
          {navItems.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              title={t(`admin.nav.${item.key}`)}
              className={({ isActive }) => cx(styles.navItem, isActive && styles.navItemActive)}
            >
              <span className={styles.navIcon} aria-hidden="true">
                {item.icon}
              </span>
              <span className={styles.navLabel}>{t(`admin.nav.${item.key}`)}</span>
            </NavLink>
          ))}
        </div>

        {/* 身份在左栏底部。这里不放退出：控制台复用你自己的账户会话，没有单独的管理会话可退。 */}
        <div className={styles.railFoot}>
          <Link
            to="/account"
            className={styles.me}
            aria-label={t("admin.identityLink", { name: displayName })}
          >
            <Avatar name={displayName} src={me.avatarUrl} size={30} />
            <span className={styles.meText}>
              <span className={styles.meName}>{displayName}</span>
              <span className={styles.meRole}>{roleText}</span>
            </span>
          </Link>
        </div>
      </nav>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.crumb}>
            {header.back && (
              <Button variant="ghost" size="sm" iconLeft={<IconBack />} to={header.back.to}>
                {header.back.label}
              </Button>
            )}
            <div>
              <div className={styles.row}>
                <h1 className={styles.title}>{header.title}</h1>
                {header.badges}
              </div>
              {header.subtitle && <p className={styles.subtitle}>{header.subtitle}</p>}
            </div>
          </div>
        </header>
        <div className={styles.body}>
          <div className={styles.wide}>
            <AdminHeaderContext.Provider value={setHeaderStable}>
              <Outlet />
            </AdminHeaderContext.Provider>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;
