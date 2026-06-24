import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { checkPasswordStrength } from "../utils/string";
import {
  CenteredCard,
  PageHeader,
  TextField,
  AdminButton as Button,
  Alert,
  StatusScreen,
} from "../components/ui";
import authStyles from "./Auth.module.css";

/** 注册（修正缺失页）：POST /v1/auth/register { username, email, password, displayName }。
 *  成功后账户为 pending_verification，需查收验证邮件。 */
const RegisterPage = () => {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const strength = password ? checkPasswordStrength(password) : 0;
  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t("account.password.mismatch"));
      return;
    }
    setBusy(true);
    try {
      const res = await api.post("/v1/auth/register", { username, email, password, displayName }, { noAuth: true });
      if (!res.ok) {
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
          { label: t("nav.login"), to: "/login" },
          { label: t("verify.resendTitle"), to: "/verify-email" },
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
        <Button type="submit" variant="primary" fullWidth loading={busy}>
          {t("register.submit")}
        </Button>
      </form>
      <p className={authStyles.aside}>
        {t("register.haveAccount")}{" "}
        <Link to="/login" className={authStyles.link}>
          {t("nav.login")}
        </Link>
      </p>
    </CenteredCard>
  );
};

export default RegisterPage;
