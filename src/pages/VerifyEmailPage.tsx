import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useSession } from "../context/SessionContext";
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
import authStyles from "./Auth.module.css";

type Phase = "verifying" | "success" | "failed" | "resend";

/**
 * 邮箱验证（补全缺失页）：邮件链接 ?token 落地后自动 POST /v1/auth/email/verify { token }。
 * - 有 token：自动校验 → 成功 / 失败；失败时可在本页直接重新发送验证邮件。
 * - 无 token：作为「重新发送验证邮件」入口（POST /v1/auth/email/resend { email }）。
 */
const VerifyEmailPage = () => {
  const { t } = useTranslation();
  const { user, refresh } = useSession();
  const [params] = useSearchParams();
  const oidcUid = readOidcInteraction(params.get("oidc"), true);
  const [resumeOidc, setResumeOidc] = useState<string | null>(oidcUid);
  // 捕获一次性令牌后立即从地址栏抹去，避免经浏览器历史 / Referer 泄露。
  const [token] = useState(() => params.get("token") ?? "");
  useEffect(() => {
    if (token) window.history.replaceState(null, "", window.location.pathname);
  }, [token]);

  const [phase, setPhase] = useState<Phase>(token ? "verifying" : "resend");
  const [failMsg, setFailMsg] = useState<string | null>(null);
  const ran = useRef(false);

  // 重发表单子状态（被拦截登录跳转而来时，地址栏带 email 预填、reason 标识情境）
  const [email, setEmail] = useState(() => params.get("email") ?? "");
  const blocked = params.get("reason") === "email_not_verified";
  const [resendBusy, setResendBusy] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendDone, setResendDone] = useState(false);

  const failed = phase === "failed";
  usePageTitle(
    phase === "verifying"
      ? t("verify.verifying")
      : phase === "success"
        ? t("verify.successTitle")
        : resendDone
          ? t("verify.resendDoneTitle")
          : failed
            ? t("verify.failedTitle")
            : blocked
              ? t("verify.blockedTitle")
              : t("verify.resendTitle"),
  );

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    void (async () => {
      const res = await api.post<{ oidcInteraction?: string }>(
        "/v1/auth/email/verify",
        { token },
        { noAuth: true },
      );
      if (!res.ok) {
        setFailMsg(res.error.message);
        setPhase("failed");
        return;
      }
      const nextOidc = readOidcInteraction(res.data?.oidcInteraction, true);
      if (nextOidc) setResumeOidc(nextOidc);
      // 若当前已登录，刷新资料以更新「已验证」徽标。
      void refresh();
      setPhase("success");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submitResend = async (e: FormEvent) => {
    e.preventDefault();
    setResendError(null);
    setResendBusy(true);
    try {
      const body: Record<string, unknown> = { email };
      if (resumeOidc) body.oidcInteraction = resumeOidc;
      const res = await api.post("/v1/auth/email/resend", body, { noAuth: true });
      if (!res.ok) {
        setResendError(res.error.message);
        return;
      }
      setResendDone(true);
    } finally {
      setResendBusy(false);
    }
  };

  if (phase === "verifying") {
    return <StatusScreen kind="loading" title={t("verify.verifying")} />;
  }

  if (phase === "success") {
    return (
      <StatusScreen
        kind="success"
        title={t("verify.successTitle")}
        description={t("verify.successDesc")}
        actions={
          user
            ? [{ label: t("verify.toAccount"), to: "/account" }]
            : [{
                label: t("nav.login"),
                to: resumeOidc ? `/login?oidc=${encodeURIComponent(resumeOidc)}` : "/login",
              }]
        }
      />
    );
  }

  if (resendDone) {
    return (
      <StatusScreen
        kind="success"
        title={t("verify.resendDoneTitle")}
        description={t("verify.resendDoneDesc")}
        actions={[{
          label: t("nav.login"),
          to: resumeOidc ? `/login?oidc=${encodeURIComponent(resumeOidc)}` : "/login",
        }]}
      />
    );
  }

  // phase === "failed" | "resend"：均渲染重发表单，仅头部文案与错误提示不同。
  const headTitle = failed
    ? t("verify.failedTitle")
    : blocked
      ? t("verify.blockedTitle")
      : t("verify.resendTitle");
  const headDesc = failed
    ? t("verify.failedDesc")
    : blocked
      ? t("verify.blockedDesc")
      : t("verify.resendSubtitle");
  // 验证失败详情与重发失败不同时堆叠：一旦发起过重发，以重发结果为准。
  const alertMsg = resendError ?? (failed ? failMsg : null);
  return (
    <CenteredCard>
      <PageHeader align="center" title={headTitle} description={headDesc} />
      {alertMsg && <Alert tone="error">{alertMsg}</Alert>}
      <form className={authStyles.form} onSubmit={submitResend}>
        <TextField
          label={t("login.email")}
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Button type="submit" variant="primary" fullWidth loading={resendBusy}>
          {t("verify.resendSubmit")}
        </Button>
      </form>
      <p className={authStyles.aside}>
        <Link
          to={resumeOidc ? `/login?oidc=${encodeURIComponent(resumeOidc)}` : "/login"}
          className={authStyles.link}
        >
          {t("common.back")}
        </Link>
      </p>
    </CenteredCard>
  );
};

export default VerifyEmailPage;
