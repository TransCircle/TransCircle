import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, setUserToken } from "../../api/client";
import { useSession } from "../../context/SessionContext";
import { checkPasswordStrength } from "../../utils/string";
import { usePageTitle } from "../../utils/usePageTitle";
import { StepUpDialog } from "../../components/StepUpDialog";
import {
  PageHeader,
  TextField,
  AdminButton as Button,
  Alert,
} from "../../components/ui";
import page from "../Page.module.css";
import s from "./Account.module.css";

interface ChangeResult {
  passwordChanged?: boolean;
  accessToken?: string;
}

/** 与注册页一致的客户端最短长度规则(api.md §1.1:至少 8 位)。 */
const MIN_PASSWORD_LENGTH = 8;

/** 修改/设置登录密码：POST /v1/me/password；成功后用轮换的 accessToken 续期会话。 */
const PasswordPage = () => {
  const { t } = useTranslation();
  const { user, refresh } = useSession();
  const hasPassword = user?.passwordSet ?? true;

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const pendingBody = useRef<Record<string, unknown> | null>(null);

  usePageTitle(t("account.nav.password"));

  const mismatch = confirm.length > 0 && confirm !== next;
  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const strength = next ? checkPasswordStrength(next) : 0;
  const strengthLabels = [
    t("password.strength.weak"),
    t("password.strength.weak"),
    t("password.strength.fair"),
    t("password.strength.good"),
    t("password.strength.strong"),
  ];

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await api.post<ChangeResult>("/v1/me/password", body);
      if (!res.ok) {
        // 无密码账户首次设置密码需先完成二次验证。
        if (res.status === 403 && res.error.code === "STEP_UP_REQUIRED") {
          pendingBody.current = body;
          setStepUpOpen(true);
          return;
        }
        setError(res.error.message);
        return;
      }
      if (res.data?.accessToken) setUserToken(res.data.accessToken);
      // 刷新会话资料：首次设密码后 passwordSet 变更，避免安全页仍走「无密码」分支。
      await refresh();
      setOk(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(false);
    // 客户端先行校验:长度不足 / 两次不一致的错误已就近显示在输入框下。
    if (next.length < MIN_PASSWORD_LENGTH) return;
    if (next !== confirm) {
      setError(t("account.password.mismatch"));
      return;
    }
    const body: Record<string, unknown> = { newPassword: next };
    if (hasPassword) body.currentPassword = current;
    await send(body);
  };

  return (
    <div className={`${page.page} ${page.pageNarrow}`}>
      <PageHeader
        title={hasPassword ? t("account.password.title") : t("account.password.setTitle")}
        description={t("account.password.subtitle")}
      />
      {error && <Alert tone="error">{error}</Alert>}
      {ok && <Alert tone="success">{t("account.password.saved")}</Alert>}
      {!hasPassword && <Alert tone="info">{t("account.password.noPassword")}</Alert>}

      <section className={s.sectionFirst}>
        <form className={`${s.form} ${s.formNarrow}`} onSubmit={submit}>
          {hasPassword && (
            <TextField
              label={t("account.password.current")}
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          )}
          <TextField
            label={t("account.password.new")}
            type="password"
            autoComplete="new-password"
            invalid={tooShort}
            hint={
              next
                ? tooShort
                  ? t("account.password.tooShort")
                  : `${t("password.strengthLabel")}: ${strengthLabels[strength]}`
                : t("register.passwordHint")
            }
            value={next}
            onChange={(e) => setNext(e.target.value)}
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
          <div className={s.actions}>
            <Button type="submit" variant="primary" loading={busy}>
              {t("account.password.submit")}
            </Button>
          </div>
        </form>
      </section>

      <StepUpDialog
        open={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        onVerified={() => {
          setStepUpOpen(false);
          if (pendingBody.current) void send(pendingBody.current);
        }}
      />
    </div>
  );
};

export default PasswordPage;
