import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSession } from "../../context/SessionContext";
import { usePageTitle } from "../../utils/usePageTitle";
import { Avatar } from "../../components/Avatar";
import { cx } from "../../components/admin/cx";
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

/** 设置页左侧分组导航的锚点顺序（与下方分区渲染顺序一一对应）。 */
const SECTION_IDS = [
  "profile",
  "password",
  "two-factor",
  "passkeys",
  "recovery-codes",
  "iam-mfa",
  "oauth",
  "sessions",
  "danger",
] as const;

/**
 * 滚动监听：返回当前视口中最靠上的分区 id，供左侧导航高亮（§8「当前项粉色指示」）。
 *
 * `enabled` 为假（会话还没问出结果、分区尚未渲染）时不建观察器；它变真后 effect
 * 重跑，那时 DOM 里才真的有这些锚点。rootMargin 顶部留出顶栏高度，
 * 让「刚滚到标题下方」的分区就算作当前项，而不是等它整块进入视口。
 */
function useSectionSpy(enabled: boolean): string {
  const [active, setActive] = useState<string>(SECTION_IDS[0]);

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const nodes = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (n): n is HTMLElement => n !== null,
    );
    if (nodes.length === 0) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // 取「文档顺序里最靠前的可见分区」，避免多块同时可见时高亮来回跳。
        const first = SECTION_IDS.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: "-80px 0px -55% 0px", threshold: 0 },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [enabled]);

  return active;
}

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

  // 必须在下面的会话门控 return 之前调用：hooks 不能出现在条件返回之后。
  const activeSection = useSectionSpy(status === "authenticated");

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

  const navItems: { id: string; label: string }[] = [
    { id: "profile", label: t("account.nav.profile") },
    { id: "password", label: t("account.nav.password") },
    { id: "two-factor", label: t("account.nav.twoFactor") },
    { id: "passkeys", label: t("account.nav.passkeys") },
    { id: "recovery-codes", label: t("account.nav.recoveryCodes") },
    { id: "iam-mfa", label: t("mfa.iam.title") },
    { id: "oauth", label: t("account.nav.oauth") },
    { id: "sessions", label: t("account.nav.sessions") },
    { id: "danger", label: t("account.nav.danger") },
  ];

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

      {/* 桌面 ≥1024px：左侧粘性分组导航 + 右侧分组卡；≤1024px 导航隐藏、分组纵向堆叠（§8）。 */}
      <div className={s.layout}>
        <nav className={s.sideNav} aria-label={t("account.title")}>
          <ul className={s.sideNavList}>
            {navItems.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={cx(s.sideNavLink, activeSection === item.id && s.sideNavLinkActive)}
                  aria-current={activeSection === item.id ? "true" : undefined}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* 统一身份接管状态由 Provider 统一读取:接管开关、通行密钥、动态口令三处共用一份，
            避免各拉各的、互相显示矛盾状态。 */}
        <div className={s.sections}>
          <IamMfaProvider>
            {/* 锚点包一层 div：分区组件内部结构不动，只为左侧导航提供跳转目标。 */}
            <div id="profile" className={s.anchor}><ProfileSection /></div>
            <div id="password" className={s.anchor}>
              <PasswordSection openRequest={passwordOpenRequest} mustChange={mustChangePassword} />
            </div>
            <div id="two-factor" className={s.anchor}><TwoFactorSection /></div>
            <div id="passkeys" className={s.anchor}><PasskeysSection /></div>
            <div id="recovery-codes" className={s.anchor}><RecoveryCodesSection /></div>
            <div id="iam-mfa" className={s.anchor}><IamMfaSection /></div>
            <div id="oauth" className={s.anchor}><OAuthSection /></div>
            <div id="sessions" className={s.anchor}><SessionsSection /></div>
            <div id="danger" className={s.anchor}><DangerSection /></div>
          </IamMfaProvider>
        </div>
      </div>

      <AvatarDialog open={avatarOpen} onClose={() => setAvatarOpen(false)} />
    </div>
  );
};

export default AccountPage;
