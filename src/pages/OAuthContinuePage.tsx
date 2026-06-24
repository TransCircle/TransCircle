import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, setUserToken, clearCsrfToken } from "../api/client";
import { useSession } from "../context/SessionContext";
import type { OAuthExchangeResult } from "../api/types";
import {
  CenteredCard,
  PageHeader,
  TextField,
  AdminButton as Button,
  Alert,
  StatusScreen,
} from "../components/ui";
import authStyles from "./Auth.module.css";

/**
 * 首次第三方登录补全注册（修正缺失页）。
 * 后端 302 → /auth/oauth/continue?status=pending_registration&provider=<github|x>，
 * 并已下发 oauth_pending_<provider>（HttpOnly）+ oauth_pending_csrf（可读）Cookie。
 * 提交 POST /v1/auth/oauth/complete-registration?provider=... + X-CSRF-Token（双提交防护）。
 */
const OAuthContinuePage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refresh } = useSession();
  const [params] = useSearchParams();
  const provider = params.get("provider") ?? "";
  const redirectAfter = params.get("redirectAfter") || "/account/profile";

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && confirm !== password;
  const providerLabel = provider === "x" ? "X" : provider === "github" ? "GitHub" : provider;

  if (provider !== "github" && provider !== "x") {
    return (
      <StatusScreen
        kind="error"
        title={t("authError.title")}
        description={t("authError.OAUTH_ERROR")}
        actions={[{ label: t("nav.login"), to: "/login" }]}
      />
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t("account.password.mismatch"));
      return;
    }
    setBusy(true);
    try {
      // 完成注册：仅当 provider 已验证邮箱时后端才建会话并返回一次性 loginCode；
      // 否则返回 requiresEmailVerification，需先完成邮箱验证再登录。
      const res = await api.post<{ loginCode: string | null; requiresEmailVerification?: boolean }>(
        `/v1/auth/oauth/complete-registration?provider=${encodeURIComponent(provider)}`,
        { username, email, password, displayName },
        { noAuth: true, csrf: true },
      );
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      clearCsrfToken();
      // 邮箱未由 provider 验证：不自动登录，引导到「重发/完成邮箱验证」页（验证邮件已发出）。
      if (res.data.requiresEmailVerification || !res.data.loginCode) {
        navigate(
          `/verify-email?reason=email_not_verified&email=${encodeURIComponent(email)}`,
          { replace: true },
        );
        return;
      }
      // 用 loginCode 兑换 access token（refresh cookie 已就绪）。
      const ex = await api.post<OAuthExchangeResult>(
        "/v1/auth/oauth/exchange",
        { loginCode: res.data.loginCode },
        { noAuth: true },
      );
      if (!ex.ok) {
        setError(ex.error.message);
        return;
      }
      setUserToken(ex.data.accessToken);
      await refresh();
      // 续跑目标：OIDC 登录经首次注册时为 /login?oidc=...，否则回账户中心。
      navigate(redirectAfter, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <CenteredCard>
      <PageHeader
        align="center"
        eyebrow={t("continue.eyebrow", { provider: providerLabel })}
        title={t("continue.title")}
        description={t("continue.subtitle")}
      />
      {error && <Alert tone="error">{error}</Alert>}
      <form className={authStyles.form} onSubmit={submit}>
        <TextField label={t("account.profile.displayName")} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        <TextField label={t("account.profile.username")} hint={t("register.usernameHint")} value={username} onChange={(e) => setUsername(e.target.value)} required />
        <TextField label={t("login.email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <TextField label={t("account.password.new")} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <TextField label={t("account.password.confirm")} type="password" autoComplete="new-password" invalid={mismatch} hint={mismatch ? t("account.password.mismatch") : undefined} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        <Button type="submit" variant="primary" fullWidth loading={busy}>
          {t("continue.submit")}
        </Button>
      </form>
    </CenteredCard>
  );
};

export default OAuthContinuePage;
