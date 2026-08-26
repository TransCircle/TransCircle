import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSession } from "../../context/SessionContext";
import { usePageTitle } from "../../utils/usePageTitle";
import { Avatar } from "../../components/Avatar";
import { StatusScreen, Alert, AdminButton as Button } from "../../components/ui";
import { AvatarDialog } from "./AvatarDialog";
import { IamMfaProvider } from "./IamMfaContext";
import { ProfileSection } from "./ProfileSection";
import { PasswordSection } from "./PasswordSection";
import { TwoFactorSection } from "./TwoFactorSection";
import { PasskeysSection } from "./PasskeysSection";
import { RecoveryCodesSection } from "./RecoveryCodesSection";
import { IamMfaSection } from "./IamMfaSection";
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
 * GET /v1/me 已回传 mustChangePassword（管理员置新密码后为真，改完后端自动清零）。
 * api/types.ts 归另一位实施者，这里就地扩展；类型补齐后可直接改回 MeProfile。
 */

/**
 * 单页账户中心:身份头(可点击头像 → 更换弹窗)+ 分组卡片,所有编辑均走弹窗。
 * Pass 会话门控(unknown → 加载屏;anonymous → 跳转登录)在此收口。
 */
const AccountPage = () => {
  const { t } = useTranslation();
  const { user, status, sessionExpired } = useSession();
  const location = useLocation();
  const [avatarOpen, setAvatarOpen] = useState(false);
  /** 递增即让「登录密码」分区打开修改弹窗（供强制改密提示调用）。 */
  const [passwordOpenRequest, setPasswordOpenRequest] = useState(0);

  usePageTitle(t("account.title"));

  // 三态各自有明确的落点：还没问出结果 → 加载屏；确定未登录 → 送去登录页；
  // 确定登录 → 往下渲染。`user` 在 status === "authenticated" 时必有值，
  // 下面那个 `!user` 只是给编译器的收窄。
  if (status === "unknown") {
    return <StatusScreen kind="loading" title={t("account.verifying")} />;
  }
  if (!user) {
    const params = new URLSearchParams({ redirect: location.pathname });
    if (sessionExpired) params.set("reason", "session_expired");
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }

  const displayName = user.displayName || user.username;
  const mustChangePassword = user.mustChangePassword === true;

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

      {/* 强制改密:管理员置了新密码,把提示放在最顶上并直接给到修改入口,
          不让用户自己在页面里找「登录密码」那一栏。 */}
      {mustChangePassword && (
        <Alert tone="error">
          <div className={s.noticeBody}>
            <span className={s.noticeText}>
              <strong className={s.noticeTitle}>{t("account.password.mustChangeTitle")}</strong>
              <span>{t("account.password.mustChangeDesc")}</span>
            </span>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setPasswordOpenRequest((n) => n + 1)}
            >
              {t("account.password.mustChangeAction")}
            </Button>
          </div>
        </Alert>
      )}

      {/* 统一身份接管状态由 Provider 统一读取:接管开关、通行密钥、动态口令三处共用一份，
          避免各拉各的、互相显示矛盾状态。 */}
      <IamMfaProvider>
        <ProfileSection />
        <PasswordSection openRequest={passwordOpenRequest} mustChange={mustChangePassword} />
        <TwoFactorSection />
        <PasskeysSection />
        <RecoveryCodesSection />
        <IamMfaSection />
        <OAuthSection />
        <SessionsSection />
        <DangerSection />
      </IamMfaProvider>

      <AvatarDialog open={avatarOpen} onClose={() => setAvatarOpen(false)} />
    </div>
  );
};

export default AccountPage;
