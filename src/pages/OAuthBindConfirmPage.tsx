import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, clearCsrfToken } from "../api/client";
import { useSession } from "../context/SessionContext";
import { StepUpDialog } from "../components/StepUpDialog";
import { StatusScreen } from "../components/ui";

/**
 * 第三方账号绑定完成落地（修正缺失页）。
 * 后端 OAuth 绑定回调 302 → /settings/security/oauth-bind/confirm?status=pending_binding&provider=...，
 * 并已下发 oauth_pending_<provider>（HttpOnly）+ oauth_pending_csrf（可读）Cookie。
 * POST /v1/auth/oauth/complete-binding（X-CSRF-Token 双提交 + 需 step-up）完成绑定。
 */
const OAuthBindConfirmPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [done, setDone] = useState(false);
  const ran = useRef(false);
  const verifiedRef = useRef(false);

  const complete = async () => {
    const res = await api.post("/v1/auth/oauth/complete-binding", undefined, {
      csrf: true,
      idempotent: true,
    });
    if (res.ok) {
      clearCsrfToken();
      setDone(true);
      return;
    }
    // 绑定需要先完成二次验证。
    if (res.status === 403 && res.error.code === "STEP_UP_REQUIRED") {
      setStepUpOpen(true);
      return;
    }
    setError(res.error.message);
  };

  useEffect(() => {
    if (loading || ran.current) return;
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent("/account/oauth")}`, { replace: true });
      return;
    }
    ran.current = true;
    void complete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  if (done) {
    return (
      <StatusScreen
        kind="success"
        title={t("account.oauth.boundOk")}
        description={t("account.oauth.boundOkDesc")}
        actions={[{ label: t("account.oauth.title"), to: "/account/oauth" }]}
      />
    );
  }
  if (error) {
    return (
      <StatusScreen
        kind="error"
        title={t("account.oauth.bindConfirmTitle")}
        description={error}
        actions={[{ label: t("account.oauth.title"), to: "/account/oauth" }]}
      />
    );
  }

  return (
    <>
      <StatusScreen kind="loading" title={t("account.oauth.bindProcessing")} />
      <StepUpDialog
        open={stepUpOpen}
        onClose={() => {
          setStepUpOpen(false);
          // 仅在用户「取消」（未验证）时离开；验证通过由 complete() 决定结果（成功/错误）。
          if (!verifiedRef.current) navigate("/account/oauth", { replace: true });
        }}
        onVerified={() => {
          verifiedRef.current = true;
          setStepUpOpen(false);
          void complete();
        }}
      />
    </>
  );
};

export default OAuthBindConfirmPage;
