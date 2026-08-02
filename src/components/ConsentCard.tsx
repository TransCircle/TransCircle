import { useTranslation } from "react-i18next";
import { Avatar } from "./Avatar";
import { AdminButton as Button } from "./ui";
import { HUMAN_SCOPES } from "../utils/oidcConsent";
import styles from "./ConsentCard.module.css";

const ArrowRightIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M5 12h14" />
    <path d="M13 6l6 6-6 6" />
  </svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export interface ConsentCardProps {
  appName: string;
  logoUri: string | null;
  /** 当前登录身份（真实页面用会话资料；管理端预览用管理员自己的身份）。 */
  viewer: { name: string; email: string | null; avatarUrl: string | null };
  /** 本次请求/已配置的原始 scope 列表（可能含 openid，展示时会被过滤掉）。 */
  scopes: readonly string[];
  /** 授权后跳转的目标主机；解析不出时不展示这行提示。 */
  redirectHost: string | null;
  /** 预览模式：按钮整体禁用、不接 onAllow/onDeny，避免被误当成真的授权入口。 */
  disabled?: boolean;
  onAllow?: () => void;
  onDeny?: () => void;
  allowLoading?: boolean;
  denyLoading?: boolean;
}

/**
 * OIDC 同意屏内容（不含外层卡片容器，容器由调用方决定——真实页面用 CenteredCard 的
 * Card，管理端预览额外套一层假浏览器地址栏）。用户会看到什么，这里就渲染什么。
 */
export function ConsentCard({
  appName,
  logoUri,
  viewer,
  scopes,
  redirectHost,
  disabled,
  onAllow,
  onDeny,
  allowLoading,
  denyLoading,
}: ConsentCardProps) {
  const { t } = useTranslation();
  const lines = HUMAN_SCOPES.filter((s) => scopes.includes(s));

  return (
    <>
      <div className={styles.heads}>
        <Avatar name={appName} src={logoUri} size={44} label={appName} />
        <span className={styles.arrow} aria-hidden="true">
          <ArrowRightIcon />
        </span>
        <Avatar name={viewer.name} src={viewer.avatarUrl} size={44} label={viewer.name} />
      </div>
      <h1 className={styles.title}>{t("consent.cardTitle", { app: appName })}</h1>
      <p className={styles.asUser}>
        <span>{t("consent.asUser", { name: viewer.name })}</span>
        {viewer.email && <span className={styles.note}>{viewer.email}</span>}
      </p>
      {lines.length > 0 && (
        <div className={styles.scopes}>
          <span className={styles.scopesHead}>{t("consent.willAllow")}</span>
          <ul className={styles.scopeList}>
            {lines.map((s) => (
              <li key={s}>
                <span className={styles.tick} aria-hidden="true">
                  <CheckIcon />
                </span>
                <span>{t(`consent.scopeHuman.${s}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={styles.actions}>
        <Button
          variant="secondary"
          fullWidth
          disabled={disabled || allowLoading}
          loading={denyLoading}
          onClick={onDeny}
        >
          {t("consent.deny")}
        </Button>
        <Button
          variant="primary"
          fullWidth
          disabled={disabled || denyLoading}
          loading={allowLoading}
          onClick={onAllow}
        >
          {t("consent.allow")}
        </Button>
      </div>
      <p className={styles.note}>
        {redirectHost && <span>{t("consent.redirectNotice", { host: redirectHost })} </span>}
        <span>{t("consent.revocable")}</span>
      </p>
    </>
  );
}
