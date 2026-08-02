import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, setUserToken, getCsrfToken, saveCsrfToken, clearCsrfToken } from "../api/client";
import { useSession } from "../context/SessionContext";
import { sanitizeRedirect } from "../utils/url";
import { usePageTitle } from "../utils/usePageTitle";
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
  /**
   * 本站可用的登录方式，**以后端注册表为准**。
   *
   * ⚠️ 这里曾经只取 `permanent` 一个布尔值，而合法性判定另写成
   * `provider === "github" || provider === "x"` 的硬编码白名单 —— 统一身份（iam）
   * 加进后端注册表时没人改这一行，于是「首次用统一身份登录」回跳到本页会被判成
   * 「无效的提供商」，建号这条路直接断掉。名单只有后端知道，前端别再自己维护第二份。
   *
   * 拉取失败时**不放行提交**：`permanent` 只能从这份名单得出，拿不到就默认 false，
   * 而统一身份恰恰是 permanent 的那个 —— 放行等于让用户在没见过「永久绑定」警告的情况下
   * 提交一个必然被后端 400 ACK_REQUIRED 打回的请求，且反复点都不会好。
   * 所以失败时给一条可重试的错误，而不是默认 false 硬着头皮往下走。
   */
  const [providers, setProviders] = useState<
    Array<{ provider: string; label?: string; permanent: boolean }> | null
  >(null);
  const [providersFailed, setProvidersFailed] = useState(false);
  /** 重试计数：递增即重跑下面的 effect。 */
  const [providersAttempt, setProvidersAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void (async () => {
      setProvidersFailed(false);
      const res = await api.get<{
        providers: Array<{ provider: string; label?: string; permanent: boolean }>;
      }>("/v1/auth/oauth/providers", { noAuth: true });
      if (!alive) return;
      if (res.ok) setProviders(res.data.providers);
      else setProvidersFailed(true);
    })();
    return () => {
      alive = false;
    };
  }, [providersAttempt]);
  const providerInfo = providers?.find((p) => p.provider === provider) ?? null;
  /**
   * 该提供商绑定后是否不可自行解除（统一身份如此）。
   * 经它首次登录 = 建号并**永久**绑定，所以要在提交前把话说在前面，
   * 后端也会要求 acknowledgedPermanent，两边一致。
   *
   * ⚠️ 这个值来自异步请求，名单没到手之前它是 false。提交因此必须等 `providers` 真的有值
   * 才放行 —— 否则手快的用户会在警告还没渲染出来时就提交，请求里缺 acknowledgedPermanent，
   * 后端直接 400 ACK_REQUIRED，而用户压根没见过那条警告。
   */
  const permanent = providerInfo?.permanent === true;
  // 来自 URL 的重定向目标必须净化，防开放重定向。
  const redirectAfter = sanitizeRedirect(params.get("redirectAfter"), "/account");

  /**
   * CSRF 双提交令牌，取定即固定（与绑定落地页同一套做法）。
   *
   * 曾经这里只把 URL 参数存进 sessionStorage，提交时走 `{ csrf: true }` ——
   * 而 getCsrfToken() 是 **Cookie 优先**：localhost 上多个服务共用一个 cookie jar，
   * 同名不同 path 的 oauth_pending_csrf 残留会盖掉本次流程的令牌，
   * 服务端与前端各读到一条，报出来仍然是 CSRF_TOKEN_INVALID。
   * 本次流程的权威值只有 URL 参数，固定下来显式发头。
   */
  const [csrfToken] = useState(() => params.get("csrfToken") || getCsrfToken());
  // 副作用放 effect（StrictMode 会把 state initializer 跑两次）。
  const [csrfPersisted, setCsrfPersisted] = useState(false);
  useEffect(() => {
    if (csrfToken) setCsrfPersisted(saveCsrfToken(csrfToken));
  }, [csrfToken]);
  // 令牌取定后从地址栏抹掉，别留在浏览器历史与 Referer 里；provider/redirectAfter 保留。
  // 存不下（隐私模式）就别抹：跨子域部署下 URL 是仅剩的通道。
  useEffect(() => {
    if (!csrfPersisted) return;
    const sp = new URLSearchParams(window.location.search);
    if (!sp.has("csrfToken")) return;
    sp.delete("csrfToken");
    const q = sp.toString();
    // 传 history.state 而非 null：React Router 的 key/index 存在里面。
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`,
    );
  }, [csrfPersisted]);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const mismatch = confirm.length > 0 && confirm !== password;
  // 名单没到手之前只认「参数缺失」这一种无效；拿到名单后才按名单判定，
  // 免得在 providers 请求回来之前把合法 provider 判死。
  const validProvider = !!provider && (providers === null || !!providerInfo);
  const providerLabel =
    providerInfo?.label || (provider === "x" ? "X" : provider === "github" ? "GitHub" : provider);

  usePageTitle(validProvider ? t("continue.title") : t("continue.invalidTitle"));

  // 提交失败：把焦点移到错误提示（Alert 自带 role=alert），读屏与键盘用户都能立刻定位。
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  if (!validProvider) {
    // provider 参数非法：这不是「重试就能好」的瞬时故障，而是链接本身无效/过期。
    return (
      <StatusScreen
        kind="error"
        title={t("continue.invalidTitle")}
        description={t("continue.invalidDesc")}
        actions={[{ label: t("nav.login"), to: "/login" }]}
      />
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // 硬门控，不能只靠按钮 disabled：回车隐式提交、requestSubmit()、以后新增的提交控件
    // 都绕得过 UI。名单没到手时 permanent 恒为 false，提交出去就是缺 acknowledgedPermanent
    // 的请求，用户根本没看过那条「永久绑定」警告。
    if (busy || !providers) return;
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
        // 不可解绑的提供商（统一身份）：后端要求先拿到不可逆确认。
        // 这一页上面已经把「绑定后无法自行解除」摆出来了，用户点提交即视为确认。
        { username, email, password, displayName, ...(permanent ? { acknowledgedPermanent: true } : {}) },
        { noAuth: true, headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined },
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
        size="card"
        eyebrow={t("continue.eyebrow", { provider: providerLabel })}
        title={t("continue.title")}
        description={t("continue.subtitle")}
      />
      {permanent && (
        // 统一身份绑定不可自行解除，这一步就是在建立它 —— 提交前必须让人看见。
        <Alert tone="info">
          <strong>{t("continue.permanentTitle", { provider: providerLabel })}</strong>
          <div>{t("continue.permanentDesc")}</div>
        </Alert>
      )}
      {/* 名单拿不到就不能提交（permanent 无从判定），给一条明确的重试出路，别让人干瞪眼。 */}
      {providersFailed && !providers && (
        <Alert tone="error">
          <div>{t("continue.providersFailed")}</div>
          <Button variant="secondary" onClick={() => setProvidersAttempt((n) => n + 1)}>
            {t("common.retry")}
          </Button>
        </Alert>
      )}
      {error && (
        <div ref={errorRef} tabIndex={-1}>
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <form className={authStyles.form} onSubmit={submit}>
        <TextField label={t("account.profile.displayName")} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        <TextField label={t("account.profile.username")} hint={t("register.usernameHint")} value={username} onChange={(e) => setUsername(e.target.value)} required />
        <TextField label={t("login.email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <TextField label={t("account.password.new")} type="password" autoComplete="new-password" hint={t("register.passwordHint")} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <TextField label={t("account.password.confirm")} type="password" autoComplete="new-password" invalid={mismatch} hint={mismatch ? t("account.password.mismatch") : undefined} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        {/* 名单到手才放行提交：permanent 警告与 acknowledgedPermanent 都依赖它。
            加载中显示 loading，加载失败则保持 disabled，由上面的重试提示接手。 */}
        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={busy || (!providers && !providersFailed)}
          disabled={!providers}
        >
          {t("continue.submit")}
        </Button>
        {/* 放弃补注册：回登录页换一种方式登录（pending Cookie 会自然过期）。 */}
        <Button variant="ghost" fullWidth to="/login" disabled={busy}>
          {t("continue.cancel")}
        </Button>
      </form>
    </CenteredCard>
  );
};

export default OAuthContinuePage;
