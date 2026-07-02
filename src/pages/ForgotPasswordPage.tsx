import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
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

/** 找回密码：POST /v1/auth/password/forgot { email } → 202（防枚举，恒成功提示）。 */
const ForgotPasswordPage = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  usePageTitle(t("forgot.title"));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post("/v1/auth/password/forgot", { email }, { noAuth: true });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <StatusScreen
        kind="success"
        title={t("forgot.doneTitle")}
        description={t("forgot.doneDesc")}
        actions={[{ label: t("nav.login"), to: "/login" }]}
      />
    );
  }

  return (
    <CenteredCard>
      <PageHeader align="center" title={t("forgot.title")} description={t("forgot.subtitle")} />
      {error && <Alert tone="error">{error}</Alert>}
      <form className={authStyles.form} onSubmit={submit}>
        <TextField
          label={t("login.email")}
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Button type="submit" variant="primary" fullWidth loading={busy}>
          {t("forgot.submit")}
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

export default ForgotPasswordPage;
