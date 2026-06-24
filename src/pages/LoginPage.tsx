import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, setUserToken } from "../api/client";
import { useSession } from "../context/SessionContext";
import type { LoginResult } from "../api/types";
import { performAssertion, isWebAuthnSupported } from "../utils/webauthn";
import {
  CenteredCard,
  PageHeader,
  TextField,
  AdminButton as Button,
  Alert,
} from "../components/ui";
import authStyles from "./Auth.module.css";

const GithubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.23c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.82.57A12 12 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
  </svg>
);
const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.24 2.25h3.31l-7.23 8.26L23.04 21.75h-6.66l-4.71-6.23-5.4 6.23H2.96l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12L17.08 19.77Z" />
  </svg>
);
const FingerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 13a7 7 0 0 1 14 0c0 1.96-.14 4-1 6" /><path d="M12 11a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" /><path d="M8 21c.5-2 1-4 1-8" />
  </svg>
);

/**
 * 登录屏（修正契约）：
 * - POST /v1/auth/login { identifier, password } → tokens 或 { mfaRequired, mfaChallengeToken }。
 * - MFA：POST /v1/auth/mfa/totp/verify { mfaChallengeToken, code }（支持 TOTP / 恢复码）。
 * - Passkey 登录：/v1/auth/passkey/login/start → 浏览器断言 → /finish。
 * - OAuth：GET /v1/auth/oauth/:provider/start 返回 { authorizationUrl }（需前端跳转，非 302）。
 * - OIDC 交互（?oidc=uid）：登录后 POST /oauth2/interaction/:uid/login → redirectTo。
 */
const LoginPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, refresh } = useSession();
  const [params] = useSearchParams();

  const oidcUid = params.get("oidc");
  const redirectTo = params.get("redirect") ?? "/account/profile";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** 登录态建立后的后续：OIDC 交互续跑或普通跳转。 */
  const finish = async () => {
    if (oidcUid) {
      const res = await api.post<{ redirectTo?: string }>(
        `/oauth2/interaction/${encodeURIComponent(oidcUid)}/login`,
      );
      if (res.ok && res.data?.redirectTo) {
        window.location.href = res.data.redirectTo;
        return;
      }
      navigate(`/oauth/consent?oidc=${encodeURIComponent(oidcUid)}`, { replace: true });
      return;
    }
    navigate(redirectTo, { replace: true });
  };

  /** 已登录且带 oidc：直接续跑交互。 */
  useEffect(() => {
    if (user && oidcUid) void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, oidcUid]);

  const onTokens = async (data: LoginResult) => {
    if (data.accessToken) setUserToken(data.accessToken);
    await refresh();
    await finish();
  };

  /** 邮箱未验证：跳转门户「重发验证邮件」页（带上邮箱以预填表单）。 */
  const goVerifyEmail = (email?: unknown) => {
    const q = new URLSearchParams({ reason: "email_not_verified" });
    if (typeof email === "string" && email) q.set("email", email);
    navigate(`/verify-email?${q.toString()}`, { replace: true });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<LoginResult>("/v1/auth/login", { identifier, password }, { noAuth: true });
      if (!res.ok) {
        if (res.error.code === "EMAIL_NOT_VERIFIED") {
          goVerifyEmail(res.error.data?.email);
          return;
        }
        setError(res.error.message);
        return;
      }
      if (res.data.mfaRequired) {
        setMfaToken(res.data.mfaChallengeToken ?? null);
        return;
      }
      await onTokens(res.data);
    } finally {
      setBusy(false);
    }
  };

  const handleMfa = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<LoginResult>(
        "/v1/auth/mfa/totp/verify",
        { mfaChallengeToken: mfaToken, code: mfaCode },
        { noAuth: true },
      );
      if (!res.ok) {
        if (res.error.code === "EMAIL_NOT_VERIFIED") {
          goVerifyEmail(res.error.data?.email);
          return;
        }
        setError(res.error.message);
        return;
      }
      await onTokens(res.data);
    } finally {
      setBusy(false);
    }
  };

  const startOAuth = async (provider: "github" | "x") => {
    setError(null);
    const next = oidcUid ? `/login?oidc=${encodeURIComponent(oidcUid)}` : redirectTo;
    const res = await api.get<{ authorizationUrl: string }>(
      `/v1/auth/oauth/${provider}/start?redirectAfter=${encodeURIComponent(next)}`,
      { noAuth: true },
    );
    if (res.ok && res.data.authorizationUrl) window.location.href = res.data.authorizationUrl;
    else setError(res.ok ? t("error.generic") : res.error.message);
  };

  // 管理员登录（IAM tc_main）统一收纳于登录页底部，不再有独立 /admin/login 入口。
  const startAdminLogin = async () => {
    setError(null);
    const res = await api.get<{ authorizationUrl: string }>("/v1/admin/oauth/iam/start", { noAuth: true });
    if (res.ok && res.data.authorizationUrl) window.location.href = res.data.authorizationUrl;
    else setError(res.ok ? t("error.generic") : res.error.message);
  };

  const loginWithPasskey = async () => {
    setError(null);
    setBusy(true);
    try {
      const start = await api.post<{ challengeId: string; publicKey: Parameters<typeof performAssertion>[0] }>(
        "/v1/auth/passkey/login/start",
        identifier ? { identifier } : {},
        { noAuth: true },
      );
      if (!start.ok) {
        setError(start.error.message);
        return;
      }
      const credential = await performAssertion(start.data.publicKey);
      const finishRes = await api.post<LoginResult>(
        "/v1/auth/passkey/login/finish",
        { challengeId: start.data.challengeId, credential },
        { noAuth: true },
      );
      if (!finishRes.ok) {
        if (finishRes.error.code === "EMAIL_NOT_VERIFIED") {
          goVerifyEmail(finishRes.error.data?.email);
          return;
        }
        setError(finishRes.error.message);
        return;
      }
      await onTokens(finishRes.data);
    } catch (err) {
      if ((err as DOMException)?.name !== "NotAllowedError") setError(t("login.passkeyFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CenteredCard>
      <PageHeader align="center" title={oidcUid ? t("login.oidcTitle") : t("login.title")} />

      {error && <Alert tone="error">{error}</Alert>}

      {!mfaToken ? (
        <>
          <form className={authStyles.form} onSubmit={handleSubmit}>
            <TextField
              label={t("login.identifier")}
              type="text"
              autoComplete="username"
              autoFocus
              placeholder={t("login.identifierPlaceholder")}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
            <div className={authStyles.fieldGroup}>
              <TextField
                label={t("login.password")}
                type="password"
                autoComplete="current-password"
                placeholder={t("login.passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <div className={authStyles.forgotRow}>
                <Link to="/password/forgot" className={authStyles.forgotLink}>
                  {t("login.forgotPassword")}
                </Link>
              </div>
            </div>
            <Button type="submit" variant="primary" fullWidth loading={busy}>
              {t("login.submit")}
            </Button>
          </form>

          <div className={authStyles.divider}>{t("login.orContinueWith")}</div>

          <div className={authStyles.oauthRow}>
            <Button variant="secondary" fullWidth iconLeft={<GithubIcon />} onClick={() => void startOAuth("github")}>
              {t("login.github")}
            </Button>
            <Button variant="secondary" fullWidth iconLeft={<XIcon />} onClick={() => void startOAuth("x")}>
              {t("login.x")}
            </Button>
            {isWebAuthnSupported() && (
              <Button variant="secondary" fullWidth iconLeft={<FingerIcon />} onClick={() => void loginWithPasskey()} disabled={busy}>
                {t("login.passkey")}
              </Button>
            )}
          </div>

          <p className={authStyles.aside}>
            {t("login.noAccount")}{" "}
            <Link to="/register" className={authStyles.link}>
              {t("login.register")}
            </Link>
          </p>

          {!oidcUid && (
            <div className={authStyles.adminEntry}>
              <button type="button" className={authStyles.adminLink} onClick={() => void startAdminLogin()}>
                {t("login.adminEntry")}
              </button>
            </div>
          )}
        </>
      ) : (
        <form className={authStyles.form} onSubmit={handleMfa}>
          <p className={authStyles.aside}>{t("login.mfaPrompt")}</p>
          <TextField
            label={t("login.mfaCode")}
            inputMode="text"
            autoComplete="one-time-code"
            autoFocus
            className={authStyles.mfaCode}
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            required
          />
          <Button type="submit" variant="primary" fullWidth loading={busy}>
            {t("login.mfaSubmit")}
          </Button>
          <Button variant="ghost" fullWidth onClick={() => { setMfaToken(null); setMfaCode(""); setError(null); }}>
            {t("common.back")}
          </Button>
        </form>
      )}
    </CenteredCard>
  );
};

export default LoginPage;
