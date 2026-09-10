import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, getIdentityGen, NON_REJECTING_AUTH_CODES } from "../api/client";
import { isNonEmptyString } from "../api/shape";
import { useSession } from "../context/SessionContext";
import { checkPasswordStrength } from "../utils/string";
import { usePageTitle } from "../utils/usePageTitle";
import { clearOidcInteraction, readOidcInteraction } from "../utils/oidcInteraction";
import {
  CenteredCard,
  PageHeader,
  TextField,
  AdminButton as Button,
  Alert,
  StatusScreen,
} from "../components/ui";
import { TurnstileWidget } from "../components/ui/TurnstileWidget";
import authStyles from "./Auth.module.css";

/** 注册（修正缺失页）：POST /v1/auth/register { username, email, password, displayName }。
 *  成功后账户为 pending_verification，需查收验证邮件。 */
const RegisterPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, status } = useSession();
  const [params] = useSearchParams();
  const oidcUid = readOidcInteraction(params.get("oidc"));
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState(false);
  // 注册总开关：页面打开时读一次公开状态；关闭则只展示提示，不渲染表单。
  const [registrationEnabled, setRegistrationEnabled] = useState<boolean | null>(null);
  // 交互续跑的终态/可重试标记（仅 oidc 路径用），语义与 LoginPage 一致。
  const [interactionFailed, setInteractionFailed] = useState(false);
  const [interactionRetryable, setInteractionRetryable] = useState(false);
  const finished = useRef(false);

  usePageTitle(t("register.title"));

  /**
   * 已登录 + 带 OIDC 交互：完成这次授权并跳回发起方，而不是展示注册表单。
   * 与 LoginPage 的 finish() 同一模式：POST interaction/login，拿到 redirectTo 整页跳走。
   * 失败分类也一致——4xx 判确定性失败进终态，瞬态（断网/5xx/429）给重试。
   */
  const finishOidc = async (anchorGen: number) => {
    if (finished.current || !oidcUid) return;
    finished.current = true;
    const res = await api.post<{ redirectTo?: string }>(
      `/oauth2/interaction/${encodeURIComponent(oidcUid)}/login`,
      undefined,
      { authWrite: true, requireIdentityGen: anchorGen },
    );
    if (res.ok && isNonEmptyString(res.data?.redirectTo)) {
      clearOidcInteraction();
      window.location.href = res.data.redirectTo;
      return;
    }
    const errorCode = res.ok ? "" : res.error.code;
    const indeterminate =
      NON_REJECTING_AUTH_CODES.includes(errorCode) ||
      res.status === 0 ||
      res.status >= 500 ||
      res.status === 429;
    if (indeterminate) {
      finished.current = false;
      setInteractionRetryable(true);
      return;
    }
    clearOidcInteraction();
    setInteractionFailed(true);
  };

  /**
   * 已登录用户的两个分流都在 effect 里（render 可能被丢弃重跑，跳转是副作用）：
   * 带 oidc → 续跑交互；不带 → 渲染「已登录」状态屏（见下方门控），不跳走、不画表单。
   */
  useEffect(() => {
    if (!user) return;
    if (error || interactionRetryable || interactionFailed) return;
    if (oidcUid) void finishOidc(getIdentityGen());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, oidcUid, error, interactionRetryable, interactionFailed]);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ registrationEnabled: boolean }>(
          "/v1/auth/register/status",
          { noAuth: true },
        );
        if (!cancelled) setRegistrationEnabled(res.ok ? res.data.registrationEnabled : true);
      } catch {
        // 读不到状态时按「开放」处理，提交阶段后端仍会以 403 兜底。
        if (!cancelled) setRegistrationEnabled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const strength = password ? checkPasswordStrength(password) : 0;
  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      // 不匹配提示由确认密码字段的 hintError 就近呈现（组件自带 aria-live）。
      return;
    }
    if (import.meta.env.VITE_TURNSTILE_SITE_KEY && !turnstileToken) {
      setCaptchaError(true);
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { username, email, password, displayName };
      if (oidcUid) body.oidcInteraction = oidcUid;
      if (turnstileToken) body.turnstileToken = turnstileToken;
      const res = await api.post("/v1/auth/register", body, { noAuth: true });
      if (!res.ok) {
        if (res.error.code === "EMAIL_TAKEN" && res.error.data?.nextAction === "email_resend") {
          const q = new URLSearchParams({ email, reason: "email_not_verified" });
          if (oidcUid) q.set("oidc", oidcUid);
          navigate(`/verify-email?${q.toString()}`, { replace: true });
          return;
        }
        setError(res.error.message);
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  // ── 已登录门控 ────────────────────────────────────────────────────────────
  // 历史 bug：本页此前完全不读会话，已登录 PASS 用户经论坛「注册」链接 / signup 拦截器
  // 打开本页时照样看到注册表单（右上角还挂着头像），看起来就像「点登录却到了注册页」。
  // 这里按三态处理（对齐 LoginPage 的顺序：终态 → loading → 已登录分流）：
  //   · 已登录 + 带 oidc：由上面的 effect 续跑 OIDC 交互并整页跳回发起方；
  //   · 已登录 + 无 oidc：显示「已登录」状态屏，提供账户中心出口，不画注册表单；
  //   · status === "unknown"：会话还没问出结果，绝不能先画表单再跳变。
  // 终态必须先于 loading 门控，否则错误说明会被永远转圈的加载屏盖住。
  if (interactionFailed) {
    return (
      <StatusScreen
        kind="error"
        title={t("login.interactionFailedTitle")}
        description={t("login.interactionFailedDesc")}
        actions={[{ label: t("account.title"), to: "/account" }]}
      />
    );
  }
  if (interactionRetryable) {
    return (
      <StatusScreen
        kind="error"
        title={t("login.interactionRetryableTitle")}
        description={t("login.interactionRetryable")}
        actions={[
          {
            label: t("mfa.done.retry"),
            onClick: () => {
              setInteractionRetryable(false);
              void finishOidc(getIdentityGen());
            },
          },
          { label: t("account.title"), variant: "ghost" as const, to: "/account" },
        ]}
      />
    );
  }
  if (status === "unknown" && !error) {
    return (
      <StatusScreen
        kind="loading"
        title={oidcUid ? t("login.continuing") : t("common.loading")}
      />
    );
  }
  if (user && oidcUid && !error) {
    // effect 正在续跑交互，马上整页跳走；这一帧不画注册表单。
    return <StatusScreen kind="loading" title={t("login.continuing")} />;
  }
  if (user) {
    return (
      <StatusScreen
        kind="info"
        title={t("register.alreadyLoggedInTitle")}
        description={t("register.alreadyLoggedInDesc")}
        actions={[{ label: t("register.goAccount"), to: "/account" }]}
      />
    );
  }

  // 加载中：先不渲染表单，等注册状态确定后再展示正确内容，避免表单闪现后跳变。
  if (registrationEnabled === null) {
    return <StatusScreen kind="loading" title={t("common.loading")} />;
  }

  // 注册已关闭：只展示提示与返回登录，不渲染注册表单。
  if (registrationEnabled === false) {
    return (
      <StatusScreen
        kind="info"
        title={t("register.disabledTitle")}
        description={t("register.disabledDesc")}
        actions={[
          {
            label: t("nav.login"),
            to: oidcUid ? `/login?oidc=${encodeURIComponent(oidcUid)}` : "/login",
          },
        ]}
      />
    );
  }

  if (done) {
    return (
      <StatusScreen
        kind="success"
        title={t("register.doneTitle")}
        description={t("register.doneDesc", { email })}
        actions={[
          {
            label: t("nav.login"),
            to: oidcUid ? `/login?oidc=${encodeURIComponent(oidcUid)}` : "/login",
          },
          // 带上已填邮箱和交互标识，重发页免去二次输入并保持授权流程。
          {
            label: t("verify.resendTitle"),
            to: `/verify-email?${new URLSearchParams({
              email,
              ...(oidcUid ? { oidc: oidcUid } : {}),
            }).toString()}`,
          },
        ]}
      />
    );
  }

  const strengthLabels = [
    t("password.strength.weak"),
    t("password.strength.weak"),
    t("password.strength.fair"),
    t("password.strength.good"),
    t("password.strength.strong"),
  ];

  return (
    <CenteredCard>
      <PageHeader align="center" title={t("register.title")} description={t("register.subtitle")} />
      {error && <Alert tone="error">{error}</Alert>}
      <form className={authStyles.form} onSubmit={submit}>
        <TextField
          label={t("account.profile.displayName")}
          autoComplete="nickname"
          autoFocus
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
        <TextField
          label={t("account.profile.username")}
          autoComplete="username"
          hint={t("register.usernameHint")}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <TextField
          label={t("login.email")}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label={t("account.password.new")}
          type="password"
          autoComplete="new-password"
          hint={password ? `${t("password.strengthLabel")}: ${strengthLabels[strength]}` : t("register.passwordHint")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <TextField
          label={t("account.password.confirm")}
          type="password"
          autoComplete="new-password"
          invalid={mismatch}
          hint={mismatch ? t("account.password.mismatch") : undefined}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        {import.meta.env.VITE_TURNSTILE_SITE_KEY && (
          <div className={authStyles.fieldGroup}>
            {captchaError && <Alert tone="error">{t("register.captchaRequired")}</Alert>}
            <TurnstileWidget
              onToken={(token) => {
                setTurnstileToken(token);
                setCaptchaError(false);
              }}
              onError={() => setCaptchaError(true)}
            />
          </div>
        )}
        <Button type="submit" variant="primary" fullWidth loading={busy}>
          {t("register.submit")}
        </Button>
      </form>
      <p className={authStyles.aside}>
        {t("register.haveAccount")}{" "}
        <Link
          to={oidcUid ? `/login?oidc=${encodeURIComponent(oidcUid)}` : "/login"}
          className={authStyles.link}
        >
          {t("nav.login")}
        </Link>
      </p>
    </CenteredCard>
  );
};

export default RegisterPage;
