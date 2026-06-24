import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSession } from "../../context/SessionContext";
import { SectionShell, type SectionNavItem } from "../../components/SectionShell";
import { StatusScreen } from "../../components/ui";

const mk = (paths: React.ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {paths}
  </svg>
);
const ProfileIcon = () => mk(<><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></>);
const KeyIcon = () => mk(<><path d="M2.5 12a6.5 6.5 0 1 1 12.7 2H22v4h-3v3h-4v-3h-1.8A6.5 6.5 0 0 1 2.5 12Z" /><circle cx="6.5" cy="12" r="1" /></>);
const ShieldIcon = () => mk(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>);
const FingerIcon = () => mk(<><path d="M5 13a7 7 0 0 1 14 0c0 1.96-.14 4-1 6" /><path d="M12 11a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" /><path d="M8 21c.5-2 1-4 1-8" /></>);
const LinkIcon = () => mk(<><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" /></>);
const DeviceIcon = () => mk(<><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8" /><path d="M12 16v4" /></>);
const DangerIcon = () => mk(<><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>);

/** 账户中心布局 + Pass 会话门控（设置式侧栏，嵌于全站统一导航之下）。 */
const AccountLayout = () => {
  const { t } = useTranslation();
  const { user, loading } = useSession();
  const location = useLocation();

  if (loading) {
    return <StatusScreen kind="loading" title={t("account.verifying")} />;
  }
  if (!user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  const navItems: SectionNavItem[] = [
    { to: "/account/profile", label: t("account.nav.profile"), icon: <ProfileIcon /> },
    { to: "/account/password", label: t("account.nav.password"), icon: <KeyIcon /> },
    { to: "/account/two-factor", label: t("account.nav.twoFactor"), icon: <ShieldIcon /> },
    { to: "/account/passkeys", label: t("account.nav.passkeys"), icon: <FingerIcon /> },
    { to: "/account/oauth", label: t("account.nav.oauth"), icon: <LinkIcon /> },
    { to: "/account/sessions", label: t("account.nav.sessions"), icon: <DeviceIcon /> },
    { to: "/account/danger", label: t("account.nav.danger"), icon: <DangerIcon /> },
  ];

  return (
    <SectionShell
      eyebrow={t("account.title")}
      identity={{ name: user.displayName || user.username, sub: user.email, avatarUrl: user.avatarUrl }}
      navItems={navItems}
      ariaLabel={t("account.title")}
    />
  );
};

export default AccountLayout;
