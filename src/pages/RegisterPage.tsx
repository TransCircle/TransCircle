import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { checkPasswordStrength } from "../utils/string";
import { usePageTitle } from "../utils/usePageTitle";
import { readOidcInteraction } from "../utils/oidcInteraction";
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

  usePageTitle(t("register.title"));

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
