import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, setUserToken, clearAdminAuth } from "../api/client";
import { useSession } from "../context/SessionContext";
import type { LoginResult, WebAuthnRequestOptions } from "../api/types";
import { performAssertion, isWebAuthnSupported } from "../utils/webauthn";
import { sanitizeRedirect } from "../utils/url";
import {
  clearOidcInteraction,
  readOidcInteraction,
} from "../utils/oidcInteraction";
import { usePageTitle } from "../utils/usePageTitle";
import {
  CenteredCard,
  PageHeader,
  TextField,
  AdminButton as Button,
  Alert,
} from "../components/ui";
import { TurnstileWidget } from "../components/ui/TurnstileWidget";
import authStyles from "./Auth.module.css";

const GithubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.23c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.82.57A12 12 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
  </svg>
);
const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M18.24 2.25h3.31l-7.23 8.26L23.04 21.75h-6.66l-4.71-6.23-5.4 6.23H2.96l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12L17.08 19.77Z" />
  </svg>
);
const FingerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M5 13a7 7 0 0 1 14 0c0 1.96-.14 4-1 6" /><path d="M12 11a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" /><path d="M8 21c.5-2 1-4 1-8" />
  </svg>
);

/**
 * 登录屏（修正契约）：
 * - POST /v1/auth/login { identifier, password } → tokens 或 { mfaRequired, mfaChallengeToken, availableMethods, passkey }。
 * - MFA（密码后二次验证，任一 2FA 方式即触发）：
 *     · TOTP / 恢复码：POST /v1/auth/mfa/totp/verify { mfaChallengeToken, code }。
 *     · Passkey：      POST /v1/auth/mfa/passkey/verify { mfaChallengeToken, credential }。
 * - Passkey 免密登录：/v1/auth/passkey/login/start → 浏览器断言 → /finish。
 * - OAuth：GET /v1/auth/oauth/:provider/start 返回 { authorizationUrl }（需前端跳转，非 302）。
 * - OIDC 交互（?oidc=uid）：登录后 POST /oauth2/interaction/:uid/login → redirectTo。
 */
/** 在途动作标识：任一在途时其余入口全部禁用，且各自按钮能显示自己的 loading。 */
type PendingAction = "login" | "mfa" | "mfaPasskey" | "github" | "x" | "passkey" | "admin";

const LoginPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, refresh, sessionExpired, clearSessionExpired } = useSession();
  const [params] = useSearchParams();

  const oidcUid = readOidcInteraction(params.get("oidc"));
  const showSessionExpired = params.get("reason") === "session_expired" && sessionExpired;
  // 来自 URL 的重定向目标必须净化，防开放重定向。
  const redirectTo = sanitizeRedirect(params.get("redirect"), "/account");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  // 二次验证可用方式与（如有）Passkey 断言参数——由 /login 的挑战响应下发。
  const [mfaMethods, setMfaMethods] = useState<NonNullable<LoginResult["availableMethods"]>>([]);
  const [mfaPasskey, setMfaPasskey] = useState<WebAuthnRequestOptions | null>(null);
  // Passkey 与验证码为同级主方式并列展示；恢复码为回退：开启此模式后切到恢复码专用输入。
  const [mfaRecoveryMode, setMfaRecoveryMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [captchaError, setCaptchaError] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const busy = pending !== null;

  usePageTitle(oidcUid ? t("login.oidcTitle") : t("login.title"));

  /**
   * 登录态建立后的后续：OIDC 交互续跑或普通跳转。
   * onTokens 里的 refresh() 会让 useEffect([user, oidcUid]) 再次触发 finish，
   * 用 ref 保证一次性交互 POST 只执行一次，避免双发竞态。
   */
  const finished = useRef(false);
  const finish = async () => {
    if (finished.current) return;
    finished.current = true;
    if (oidcUid) {
      const res = await api.post<{ redirectTo?: string }>(
        `/oauth2/interaction/${encodeURIComponent(oidcUid)}/login`,
      );
      if (res.ok && res.data?.redirectTo) {
        clearOidcInteraction();
        window.location.href = res.data.redirectTo;
        return;
      }
      clearOidcInteraction();
      navigate("/login", { replace: true });
      return;
    }
    navigate(redirectTo, { replace: true });
  };

  /** 已登录：带 oidc 直接续跑交互；普通访问不再展示登录表单，直接跳转目的地。 */
  useEffect(() => {
    if (!user) return;
    if (oidcUid) {
      void finish();
      return;
    }
    navigate(redirectTo, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, oidcUid]);

  const onTokens = async (data: LoginResult) => {
    clearAdminAuth();
    clearSessionExpired();
    if (data.accessToken) setUserToken(data.accessToken);
    setTurnstileToken(null);
    await refresh();
    await finish();
  };

  /** 邮箱未验证：跳转门户「重发验证邮件」页（带上邮箱以预填表单）。 */
  const goVerifyEmail = (email?: unknown) => {
    const q = new URLSearchParams({ reason: "email_not_verified" });
    if (typeof email === "string" && email) q.set("email", email);
    if (oidcUid) q.set("oidc", oidcUid);
    navigate(`/verify-email?${q.toString()}`, { replace: true });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setPending("login");
    try {
      const body: Record<string, unknown> = { identifier, password };
      if (turnstileToken) body.turnstileToken = turnstileToken;
      const res = await api.post<LoginResult>("/v1/auth/login", body, { noAuth: true });
      if (!res.ok) {
        if (res.error.code === "EMAIL_NOT_VERIFIED") {
          goVerifyEmail(res.error.data?.email);
          return;
        }
        if (res.error.code === "CAPTCHA_REQUIRED" || res.error.code === "CAPTCHA_FAILED") {
          setCaptchaError(true);
          return;
        }
        setError(res.error.message);
        return;
      }
      if (res.data.mfaRequired) {
        if (!res.data.mfaChallengeToken) {
          // 服务端声明需要 MFA 却未下发挑战令牌：显式报错，而非静默停留。
          setError(t("login.mfaChallengeMissing"));
          return;
        }
        setMfaToken(res.data.mfaChallengeToken);
        setMfaMethods(res.data.availableMethods ?? []);
        setMfaPasskey(res.data.passkey?.publicKey ?? null);
        setMfaRecoveryMode(false);
        return;
      }
      await onTokens(res.data);
    } finally {
      setPending(null);
    }
  };

  const handleMfa = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setPending("mfa");
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
      setPending(null);
    }
  };

  /** 密码通过后以 Passkey 完成二次验证（仅有 Passkey / 或与 TOTP 并存时可选）。 */
  const handleMfaPasskey = async () => {
    if (busy || !mfaToken || !mfaPasskey) return;
    setError(null);
    setPending("mfaPasskey");
    try {
      const credential = await performAssertion(
        mfaPasskey as Parameters<typeof performAssertion>[0],
      );
      const res = await api.post<LoginResult>(
        "/v1/auth/mfa/passkey/verify",
        { mfaChallengeToken: mfaToken, credential },
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
    } catch (err) {
      if ((err as DOMException)?.name !== "NotAllowedError") setError(t("login.passkeyFailed"));
    } finally {
      setPending(null);
    }
  };

  const startOAuth = async (provider: "github" | "x") => {
    if (busy) return;
    setError(null);
    setPending(provider);
    const next = oidcUid ? `/login?oidc=${encodeURIComponent(oidcUid)}` : redirectTo;
    // try/catch:api.get 若因异常(如 2xx 空/非法响应体解析失败)reject,必须复位 pending,
    // 否则 busy 恒为 true、所有登录入口被永久禁用且无反馈,只能刷新页面。
    try {
      const res = await api.get<{ authorizationUrl: string }>(
        `/v1/auth/oauth/${provider}/start?redirectAfter=${encodeURIComponent(next)}`,
        { noAuth: true },
      );
      if (res.ok && res.data.authorizationUrl) {
        // 保持 pending 直到整页跳转，避免离开前按钮短暂恢复可点。
        window.location.href = res.data.authorizationUrl;
        return;
      }
      setError(res.ok ? t("error.generic") : res.error.message);
      setPending(null);
    } catch {
      setError(t("error.generic"));
      setPending(null);
    }
  };

  // 管理员登录（IAM tc_main）统一收纳于登录页底部，不再有独立 /admin/login 入口。
  const startAdminLogin = async () => {
    if (busy) return;
    setError(null);
    setPending("admin");
    try {
      const res = await api.get<{ authorizationUrl: string }>("/v1/admin/oauth/iam/start", { noAuth: true });
      if (res.ok && res.data.authorizationUrl) {
        window.location.href = res.data.authorizationUrl;
        return;
      }
      setError(res.ok ? t("error.generic") : res.error.message);
      setPending(null);
    } catch {
      setError(t("error.generic"));
      setPending(null);
    }
  };

  const loginWithPasskey = async () => {
    if (busy) return;
    setError(null);
    setPending("passkey");
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
      setPending(null);
    }
  };

  // 已登录且非 OIDC 交互：上方 effect 即将跳转，不再闪现登录表单。
  if (user && !oidcUid) return null;

  return (
    <CenteredCard>
      <PageHeader align="center" title={oidcUid ? t("login.oidcTitle") : t("login.title")} />

      {showSessionExpired && <Alert tone="error">{t("login.sessionExpired")}</Alert>}
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
            {import.meta.env.VITE_TURNSTILE_SITE_KEY && (
              <div className={authStyles.fieldGroup}>
                {captchaError && <Alert tone="error">{t("login.captchaRequired")}</Alert>}
                <TurnstileWidget
                  onToken={(token) => {
                    setTurnstileToken(token);
                    setCaptchaError(false);
                  }}
                  onError={() => setCaptchaError(true)}
                />
              </div>
            )}
            <Button type="submit" variant="primary" fullWidth loading={pending === "login"} disabled={busy}>
              {t("login.submit")}
            </Button>
          </form>

          <div className={authStyles.divider}>{t("login.orContinueWith")}</div>

          <div className={authStyles.oauthRow}>
            <Button
              variant="ghost"
              className={authStyles.oauthBtn}
              fullWidth
              iconLeft={<GithubIcon />}
              loading={pending === "github"}
              disabled={busy}
              onClick={() => void startOAuth("github")}
            >
              {t("login.github")}
            </Button>
            <Button
              variant="ghost"
              className={authStyles.oauthBtn}
              fullWidth
              iconLeft={<XIcon />}
              loading={pending === "x"}
              disabled={busy}
              onClick={() => void startOAuth("x")}
            >
              {t("login.x")}
            </Button>
            {isWebAuthnSupported() && (
              <Button
                variant="ghost"
                className={authStyles.oauthBtn}
                fullWidth
                iconLeft={<FingerIcon />}
                loading={pending === "passkey"}
                disabled={busy}
                onClick={() => void loginWithPasskey()}
              >
                {t("login.passkey")}
              </Button>
            )}
          </div>

          <p className={authStyles.aside}>
            {t("login.noAccount")}{" "}
            <Link
              to={oidcUid ? `/register?oidc=${encodeURIComponent(oidcUid)}` : "/register"}
              className={authStyles.link}
            >
              {t("login.register")}
            </Link>
          </p>

          {!oidcUid && (
            <div className={authStyles.adminEntry}>
              <button
                type="button"
                className={authStyles.adminLink}
                disabled={busy}
                aria-busy={pending === "admin" || undefined}
                onClick={() => void startAdminLogin()}
              >
                {pending === "admin" ? t("common.processing") : t("login.adminEntry")}
              </button>
            </div>
          )}
        </>
      ) : (
        (() => {
          const legacy = mfaMethods.length === 0; // 旧契约:未下发 availableMethods
          const hasTotp = mfaMethods.includes("totp");
          // Passkey 二次验证需环境支持 WebAuthn(与独立 Passkey 登录按钮一致),否则展示的按钮点了必失败。
          const hasPasskey = isWebAuthnSupported() && mfaPasskey !== null && mfaMethods.includes("passkey");
          const hasRecovery = mfaMethods.includes("recovery_code");
          // 无 availableMethods（旧契约兜底）时默认展示验证码输入(该输入兼容恢复码,见下)。
          const hasCode = hasTotp || legacy;

          const back = () => {
            setMfaToken(null);
            setMfaCode("");
            setMfaMethods([]);
            setMfaPasskey(null);
            setMfaRecoveryMode(false);
            setError(null);
          };

          // 回退模式：恢复码专用界面（正常方式不可用时的兜底）。
          if (mfaRecoveryMode) {
            return (
              <form className={authStyles.form} onSubmit={handleMfa}>
                <p className={authStyles.aside}>{t("login.mfaRecoveryPrompt")}</p>
                <TextField
                  label={t("login.mfaRecoveryCode")}
                  inputMode="text"
                  autoComplete="one-time-code"
                  autoFocus
                  className={`${authStyles.mfaCode} ${authStyles.mfaCodeLong}`}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  required
                />
                <Button type="submit" variant="primary" fullWidth loading={pending === "mfa"} disabled={busy}>
                  {t("login.mfaSubmit")}
                </Button>
                <button
                  type="button"
                  className={authStyles.mfaAltLink}
                  disabled={busy}
                  onClick={() => { setMfaRecoveryMode(false); setMfaCode(""); setError(null); }}
                >
                  {t("login.mfaBackToOther")}
                </button>
                <Button type="button" variant="ghost" fullWidth disabled={busy} onClick={back}>
                  {t("common.back")}
                </Button>
              </form>
            );
          }

          // 正常模式：Passkey 与验证码为同级主方式并列展示；恢复码为回退链接。
          const prompt =
            hasCode && hasPasskey
              ? t("login.mfaChoosePrompt")
              : hasPasskey
                ? t("login.mfaPasskeyPrompt")
                : t("login.mfaPrompt");

          return (
            <form className={authStyles.form} onSubmit={handleMfa}>
              <p className={authStyles.aside}>{prompt}</p>

              {/* 验证器验证码：与 Passkey 同级的主方式。 */}
              {hasCode && (
                <>
                  <TextField
                    label={t("login.mfaCode")}
                    // 旧契约兜底:此字段需兼容恢复码(更长),故不限 6 位数字、字距随长度降级。
                    inputMode={legacy ? "text" : "numeric"}
                    maxLength={legacy ? undefined : 6}
                    autoComplete="one-time-code"
                    autoFocus
                    className={
                      legacy && mfaCode.length > 8
                        ? `${authStyles.mfaCode} ${authStyles.mfaCodeLong}`
                        : authStyles.mfaCode
                    }
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    required
                  />
                  <Button type="submit" variant="primary" fullWidth loading={pending === "mfa"} disabled={busy}>
                    {t("login.mfaSubmit")}
                  </Button>
                </>
              )}

              {hasCode && hasPasskey && <div className={authStyles.divider}>{t("login.mfaOr")}</div>}

              {/* Passkey：与验证码同级的主方式（无验证码时为唯一主操作）。 */}
              {hasPasskey && (
                <Button
                  type="button"
                  variant={hasCode ? "secondary" : "primary"}
                  fullWidth
                  iconLeft={<FingerIcon />}
                  loading={pending === "mfaPasskey"}
                  disabled={busy}
                  onClick={() => void handleMfaPasskey()}
                >
                  {t("login.mfaPasskey")}
                </Button>
              )}

              {/* 恢复码：回退策略，次要链接。 */}
              {hasRecovery && (
                <button
                  type="button"
                  className={authStyles.mfaAltLink}
                  disabled={busy}
                  onClick={() => { setMfaRecoveryMode(true); setMfaCode(""); setError(null); }}
                >
                  {t("login.mfaUseRecovery")}
                </button>
              )}

              <Button type="button" variant="ghost" fullWidth disabled={busy} onClick={back}>
                {t("common.back")}
              </Button>
            </form>
          );
        })()
      )}
    </CenteredCard>
  );
};

export default LoginPage;
