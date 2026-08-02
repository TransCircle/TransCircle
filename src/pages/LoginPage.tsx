import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, setUserToken } from "../api/client";
import { useSession } from "../context/SessionContext";
import type { LoginResult, OAuthProviderInfo, WebAuthnRequestOptions } from "../api/types";
import { performAssertion, isWebAuthnSupported } from "../utils/webauthn";
import { sanitizeRedirect } from "../utils/url";
import {
  clearOidcInteraction,
  readOidcInteraction,
} from "../utils/oidcInteraction";
import { usePageTitle } from "../utils/usePageTitle";
import { saveIamMfaHandoff } from "./AuthMfaDonePage";
import { consumeMfaHandoff, hasMfaHandoff, type MfaHandoff } from "./mfaHandoff";
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
// 统一身份（IAM）。与 GitHub / X 并列，是同一层级的授权登录方式。
const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M12 2 4 5.5v6c0 5 3.4 9.2 8 10.5 4.6-1.3 8-5.5 8-10.5v-6L12 2Z" /><path d="m9 12 2 2 4-4" />
  </svg>
);
/** provider key → 图标。未知 provider 用盾牌兜底，不留空白按钮。 */
const providerIcon = (provider: string) => {
  if (provider === "github") return <GithubIcon />;
  if (provider === "x") return <XIcon />;
  return <ShieldIcon />;
};
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
/** provider 的 pending 用 provider key 本身表示，所以这里是开放字符串。 */
type PendingAction = "login" | "mfa" | "mfaPasskey" | "passkey" | (string & {});

const LoginPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, refresh, sessionExpired, clearSessionExpired } = useSession();
  const [params] = useSearchParams();

  const oidcUid = readOidcInteraction(params.get("oidc"));
  const showSessionExpired = params.get("reason") === "session_expired" && sessionExpired;
  // 来自 URL 的重定向目标必须净化，防开放重定向。
  const urlRedirect = sanitizeRedirect(params.get("redirect"), "/account");

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
  /** 登录被「注销冷静期」拒绝：展示撤销入口。 */
  const [pendingDeletion, setPendingDeletion] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const busy = pending !== null;

  /**
   * 第三方登录带回来的二次验证挑战（`/auth/callback?status=mfa_required`）。
   *
   * 第三方 OAuth 只是第一因素；账户若开着 TOTP / 通行密钥 / 统一身份接管，
   * 后端会签发挑战并把令牌交接过来。这里读一次（读完即删），
   * 然后向 `/v1/auth/mfa/challenge` 补齐"这次能用哪些方式"，
   * 之后就与密码登录走完全相同的二次验证界面。
   */
  // 存在待处理交接时，不能让「已登录自动跳转」把人带走 —— OAuth 往返期间
  // 旧会话可能被 refresh 恢复，那时二次验证还没做完就跳走等于绕过第二因素。
  const [handoff, setHandoff] = useState<MfaHandoff | null>(null);
  const [handoffPending, setHandoffPending] = useState(hasMfaHandoff());
  // **消费必须发生在 effect（提交阶段），不能在 render 里**：
  // render 可能被 React 丢弃并重跑（StrictMode 双调用、并发渲染），
  // 而 consumeMfaHandoff() 是破坏性读取 —— 在 render 里调，令牌可能被读掉后丢失。
  // ref 守卫保证 StrictMode 的双次 effect 只真正消费一次。
  const handoffConsumed = useRef(false);

  // 交接过来的目的地优先：用户是从 /auth/callback 转过来的，
  // 地址栏上的 ?redirect= 已经不在了，用它会把人送回默认页。
  const redirectTo = handoff ? sanitizeRedirect(handoff.redirectAfter, "/account") : urlRedirect;

  useEffect(() => {
    if (handoffConsumed.current) return;
    handoffConsumed.current = true;
    const data = consumeMfaHandoff();
    if (!data) {
      setHandoffPending(false);
      return;
    }
    setHandoff(data);
    setPending("mfa");
    void (async () => {
      const res = await api.post<{
        availableMethods: NonNullable<LoginResult["availableMethods"]>;
        passkey?: { publicKey: WebAuthnRequestOptions };
      }>("/v1/auth/mfa/challenge", { mfaChallengeToken: data.mfaChallengeToken }, { noAuth: true });
      setPending(null);
      setHandoffPending(false);
      if (!res.ok) {
        // 挑战过期或无效：这时没有任何可继续的上下文，只能请用户重新登录。
        const key = `authError.${res.error.code}`;
        const localized = t(key);
        setError(localized === key ? res.error.message : localized);
        return;
      }
      setMfaToken(data.mfaChallengeToken);
      setMfaMethods(res.data.availableMethods);
      setMfaPasskey(res.data.passkey?.publicKey ?? null);
    })();
    // 只在挂载时跑一次；t 只影响文案。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // 有待处理的二次验证交接时**必须让路**。
    // 第三方登录往返期间，旧会话可能被静默续期恢复；此时若按「已登录」直接跳走，
    // 后端刚签发的第二因素挑战就被跳过了 —— 等于用一次第三方登录绕开了 2FA。
    if (handoffPending || mfaToken) return;
    if (oidcUid) {
      void finish();
      return;
    }
    navigate(redirectTo, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, oidcUid, handoffPending, mfaToken]);

  const onTokens = async (data: LoginResult) => {
    // 登录成功即消掉「会话已过期」提示。
    // 远端此处还调了 clearAdminAuth()——那是旧双平面模型的管理员令牌，已随管理平面移除。
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
    setPendingDeletion(false);
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
        // 账户在注销冷静期：**必须给出可点的入口**。
        // 只显示一句「请先撤销注销」而不给路径，等于告诉用户「你有救，但我不告诉你怎么救」——
        // 撤销页是未登录可访问的，登录被拒的人恰恰只能从这里进去。
        if (res.error.code === "ACCOUNT_PENDING_DELETION") {
          setPendingDeletion(true);
          setError(res.error.message);
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
    setPendingDeletion(false);
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
    setPendingDeletion(false);
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

  /**
   * 可用的第三方登录方式，由后端 `/v1/auth/oauth/providers` 决定。
   *
   * 原先 GitHub / X 两个按钮是写死的，于是统一身份虽然早就是注册表里的 provider、
   * 后端也支持它走登录流，登录页却没有入口 —— 工作人员只能先用密码登进来。
   * 改由后端给列表还顺带解决了「未配置的提供商不该显示」：按钮点了必然报错的话，
   * 不如根本不画出来。
   */
  const [providers, setProviders] = useState<OAuthProviderInfo[]>([]);
  useEffect(() => {
    void (async () => {
      const res = await api.get<{ providers: OAuthProviderInfo[] }>(
        "/v1/auth/oauth/providers",
        { noAuth: true },
      );
      if (res.ok) setProviders(res.data.providers);
      // 取不到就退化为「只有密码 / 通行密钥」，不阻塞登录。
    })();
  }, []);

  const startOAuth = async (provider: string) => {
    if (busy) return;
    setError(null);
    setPendingDeletion(false);
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

  const loginWithPasskey = async () => {
    if (busy) return;
    setError(null);
    setPendingDeletion(false);
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
  // **但有待处理的二次验证交接时不能返回空**：那时上面的跳转 effect 已经让路，
  // 这里再返回 null 就是一片永久空白 —— 用户既看不到二次验证界面，也走不下去。
  // 两处的让路条件必须一致。
  if (user && !oidcUid && !handoffPending && !mfaToken) return null;

  return (
    <CenteredCard>
      <PageHeader align="center" title={oidcUid ? t("login.oidcTitle") : t("login.title")} />

      {showSessionExpired && <Alert tone="error">{t("login.sessionExpired")}</Alert>}
      {error && (
        <Alert tone="error">
          {error}
          {pendingDeletion && (
            <div className={authStyles.aside}>
              <Link to="/account/cancel-deletion">{t("cancelDeletion.entry")}</Link>
            </div>
          )}
        </Alert>
      )}

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

          {/* 提供商由后端按配置下发，可能一个都没有（未配置 / 接口失败）；
              此时连同 passkey 一起判空，否则会剩一条什么都没有的分隔线。 */}
          {(providers.length > 0 || isWebAuthnSupported()) && (
            <div className={authStyles.divider}>{t("login.orContinueWith")}</div>
          )}

          <div className={authStyles.oauthRow}>
            {providers.map((p) => (
              <Button
                key={p.provider}
                variant="ghost"
                className={authStyles.oauthBtn}
                fullWidth
                iconLeft={providerIcon(p.provider)}
                loading={pending === p.provider}
                disabled={busy}
                onClick={() => void startOAuth(p.provider)}
              >
                {/* 已知的三个用本地化文案，其余回落后端给的 label。 */}
                {p.provider === "github"
                  ? t("login.github")
                  : p.provider === "x"
                    ? t("login.x")
                    : p.provider === "iam"
                      ? t("login.iam")
                      : p.label}
              </Button>
            ))}
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

          {/*
            这里曾经有一个指向 /admin 的「管理员入口」文字链接 —— 但登录页上的用户按定义
            还没登录，点进去只会被控制台外壳打回登录页，是条死路。
            管理员没有独立登录流程：他就是普通 Pass 用户，用上面任一方式（含「统一身份」
            这颗按钮）登录即可；登录后 AppNav 会按 IAM 权限自动显示控制台入口。
          */}
        </>
      ) : (
        (() => {
          const legacy = mfaMethods.length === 0; // 旧契约:未下发 availableMethods
          const hasTotp = mfaMethods.includes("totp");
          // Passkey 二次验证需环境支持 WebAuthn(与独立 Passkey 登录按钮一致),否则展示的按钮点了必失败。
          const hasPasskey = isWebAuthnSupported() && mfaPasskey !== null && mfaMethods.includes("passkey");
          const hasRecovery = mfaMethods.includes("recovery_code");
          // 该账户把登录第二因素交给了统一身份接管：本地 passkey / TOTP 在登录路径上
          // 已被后端拒绝，这里只能引导去 IAM 完成；恢复码仍是可用的兜底。
          const hasIam = mfaMethods.includes("iam");
          // 无 availableMethods（旧契约兜底）时默认展示验证码输入(该输入兼容恢复码,见下)。
          const hasCode = hasTotp || legacy;

          /**
            * 跳去统一身份完成第二因素。
            * 整页跳转会清空 React 状态，所以挑战令牌与 verificationId 必须先落 sessionStorage，
            * 由 /auth/mfa/done 回来后据此向后端回查权威结果。
            */
          const startIamMfa = async () => {
            if (!mfaToken) return;
            setPending("mfa");
            setError(null);
            setPendingDeletion(false);
            const res = await api.post<{ verificationId: string; verifyUrl: string; expiresAt: number }>(
              "/v1/auth/mfa/iam/start",
              { mfaChallengeToken: mfaToken },
              { noAuth: true },
            );
            setPending(null);
            if (!res.ok) {
              const key = `authError.${res.error.code}`;
              const localized = t(key);
              setError(localized === key ? res.error.message : localized);
              return;
            }
            saveIamMfaHandoff({
              mfaChallengeToken: mfaToken,
              verificationId: res.data.verificationId,
              redirect: redirectTo,
              oidc: oidcUid ?? undefined,
            });
            window.location.href = res.data.verifyUrl;
          };

          const back = () => {
            setMfaToken(null);
            setMfaCode("");
            setMfaMethods([]);
            setMfaPasskey(null);
            setMfaRecoveryMode(false);
            setError(null);
            setPendingDeletion(false);
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

          // 统一身份接管：不展示本地 passkey / 验证码入口（后端会直接 409），
          // 只给「去统一身份验证」+ 恢复码兜底。
          if (hasIam) {
            return (
              <div className={authStyles.form}>
                <p className={authStyles.aside}>{t("login.mfaIamPrompt")}</p>
                <Button
                  type="button"
                  variant="primary"
                  fullWidth
                  loading={pending === "mfa"}
                  disabled={busy}
                  onClick={() => void startIamMfa()}
                >
                  {t("login.mfaIamGo")}
                </Button>
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
              </div>
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
