import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAdmin } from "../../context/AdminContext";
import { Avatar } from "../../components/Avatar";
import { cx } from "../../components/admin/cx";
import { StatusScreen } from "../../components/ui";
import admin from "./Admin.module.css";

const mk = (paths: React.ReactNode) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {paths}
  </svg>
);
const UsersIcon = () => mk(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>);
const ClientsIcon = () => mk(<><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M3 9h18" /><path d="M8 14h.01" /><path d="M12 14h4" /></>);
const AuditIcon = () => mk(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M9 13h6" /><path d="M9 17h4" /></>);

interface AdminNavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  perm: string;
}

/**
 * 管理后台外壳 + 管理台令牌门控。
 * 视觉对齐账户中心:居中单列 + 身份头 + 下划线标签导航(按 IAM 权限渲染),
 * 内容区不再吸附、不再有移动端网格选择栏。
 */
const AdminLayout = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { authed, loading, me, hasPermission } = useAdmin();

  if (!authed) {
    return <Navigate to="/login" replace />;
  }
  if (loading) {
    return <StatusScreen kind="loading" title={t("admin.verifying")} />;
  }
  // 身份/权限拉取失败(非 401,token 仍在但 /admin/me 出错)→ 提示重新登录,避免卡在加载态。
  if (!me) {
    return (
      <StatusScreen
        kind="error"
        title={t("admin.login.failed")}
        description={t("error.generic")}
        actions={[{ label: t("nav.login"), to: "/login" }]}
      />
    );
  }

  const allNav: AdminNavItem[] = [
    { to: "/admin/users", label: t("admin.nav.users"), icon: <UsersIcon />, perm: "pass.user:read" },
    { to: "/admin/clients", label: t("admin.nav.clients"), icon: <ClientsIcon />, perm: "pass.client:read" },
    { to: "/admin/audit", label: t("admin.nav.audit"), icon: <AuditIcon />, perm: "pass.audit:read" },
  ];
  const navItems = allNav.filter((i) => hasPermission(i.perm));

  if (navItems.length === 0) {
    return (
      <StatusScreen
        kind="error"
        title={t("admin.accessDenied")}
        description={t("admin.accessDeniedDetail")}
        actions={[{ label: t("nav.home"), to: "/" }]}
      />
    );
  }

  // /admin 入口按权限重定向到首个可访问的分区(避免落到无权限的 /admin/users → 403)。
  if (location.pathname === "/admin" || location.pathname === "/admin/") {
    return <Navigate to={navItems[0]!.to} replace />;
  }

  const name = me.displayName || me.username || t("admin.staff");

  return (
    <div className={admin.wrap}>
      <header className={admin.identity}>
        <Avatar name={name} src={me.avatarUrl} size={56} label={name} />
        <div className={admin.identityText}>
          <span className={admin.identityEyebrow}>{t("admin.title")}</span>
          <h1 className={admin.identityName}>{name}</h1>
          {me.email && <span className={admin.identitySub}>{me.email}</span>}
        </div>
      </header>

      <nav className={admin.nav} aria-label={t("admin.title")}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => cx(admin.navItem, isActive && admin.navItemActive)}
          >
            <span className={admin.navIcon} aria-hidden="true">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
};

export default AdminLayout;
