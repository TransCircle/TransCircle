import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSession } from "../../context/SessionContext";
import { usePageTitle } from "../../utils/usePageTitle";
import { Avatar } from "../../components/Avatar";
import { StatusScreen } from "../../components/ui";
import { AvatarDialog } from "./AvatarDialog";
import { ProfileSection } from "./ProfileSection";
import { PasswordSection } from "./PasswordSection";
import { TwoFactorSection } from "./TwoFactorSection";
import { PasskeysSection } from "./PasskeysSection";
import { OAuthSection } from "./OAuthSection";
import { SessionsSection } from "./SessionsSection";
import { DangerSection } from "./DangerSection";
import s from "./Account.module.css";

const PencilIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

/**
 * 单页账户中心:身份头(可点击头像 → 更换弹窗)+ 分组卡片,所有编辑均走弹窗。
 * Pass 会话门控(loading → 加载屏;未登录 → 跳转登录)在此收口。
 */
const AccountPage = () => {
  const { t } = useTranslation();
  const { user, loading } = useSession();
  const location = useLocation();
  const [avatarOpen, setAvatarOpen] = useState(false);

  usePageTitle(t("account.title"));

  if (loading) {
    return <StatusScreen kind="loading" title={t("account.verifying")} />;
  }
  if (!user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  const displayName = user.displayName || user.username;

  return (
    <div className={s.wrap}>
      <header className={s.identity}>
        <button
          type="button"
          className={s.avatarBtn}
          aria-label={t("account.profile.changeAvatar")}
          onClick={() => setAvatarOpen(true)}
        >
          <Avatar name={displayName} src={user.avatarUrl} size={72} />
          <span className={s.avatarEdit} aria-hidden="true">
            <PencilIcon />
          </span>
        </button>
        <div className={s.identityText}>
          <span className={s.identityEyebrow}>{t("account.title")}</span>
          <h1 className={s.identityName}>{displayName}</h1>
          <span className={s.identitySub}>{user.email}</span>
        </div>
      </header>

      <ProfileSection />
      <PasswordSection />
      <TwoFactorSection />
      <PasskeysSection />
      <OAuthSection />
      <SessionsSection />
      <DangerSection />

      <AvatarDialog open={avatarOpen} onClose={() => setAvatarOpen(false)} />
    </div>
  );
};

export default AccountPage;
