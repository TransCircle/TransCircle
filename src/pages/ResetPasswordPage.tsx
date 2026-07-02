import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { checkPasswordStrength } from "../utils/string";
import { usePageTitle } from "../utils/usePageTitle";
import {
  CenteredCard,
  PageHeader,
  TextField,
  AdminButton as Button,
  Alert,
  StatusScreen,
} from "../components/ui";
import authStyles from "./Auth.module.css";

/** 重置密码：从邮件链接 ?token 进入，POST /v1/auth/password/reset { token, newPassword }。 */
const ResetPasswordPage = () => {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  // 捕获一次性重置令牌后立即从地址栏抹去，避免经浏览器历史/Referer 泄露。
  const [token] = useState(() => params.get("token") ?? "");
  useEffect(() => {
    if (token) window.history.replaceState(null, "", window.location.pathname);
  }, [token]);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  usePageTitle(t("reset.title"));

  const mismatch = confirm.length > 0 && confirm !== password;
  const strength = password ? checkPasswordStrength(password) : 0;
  const strengthLabels = [
    t("password.strength.weak"),
    t("password.strength.weak"),
    t("password.strength.fair"),
    t("password.strength.good"),
    t("password.strength.strong"),
  ];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t("account.password.mismatch"));
      return;
    }
    setBusy(true);
    try {
      const res = await api.post("/v1/auth/password/reset", { token, newPassword: password }, { noAuth: true });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <StatusScreen
        kind="error"
        title={t("reset.invalidTitle")}
        description={t("reset.invalidDesc")}
        actions={[{ label: t("forgot.title"), to: "/password/forgot" }]}
      />
    );
  }

  if (done) {
    return (
      <StatusScreen
        kind="success"
        title={t("reset.doneTitle")}
        description={t("reset.doneDesc")}
        actions={[{ label: t("nav.login"), to: "/login" }]}
      />
    );
  }

  return (
    <CenteredCard>
      <PageHeader align="center" title={t("reset.title")} description={t("reset.subtitle")} />
      {error && <Alert tone="error">{error}</Alert>}
      <form className={authStyles.form} onSubmit={submit}>
        <TextField
          label={t("account.password.new")}
          type="password"
          autoComplete="new-password"
          autoFocus
          hint={password ? `${t("password.strengthLabel")}: ${strengthLabels[strength]}` : undefined}
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
          {t("reset.submit")}
        </Button>
      </form>
      <p className={authStyles.aside}>
        <Link to="/login" className={authStyles.link}>
          {t("common.back")}
        </Link>
      </p>
    </CenteredCard>
  );
};

export default ResetPasswordPage;
