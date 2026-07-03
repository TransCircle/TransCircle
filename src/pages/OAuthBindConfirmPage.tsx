import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, clearCsrfToken } from "../api/client";
import { useSession } from "../context/SessionContext";
import { usePageTitle } from "../utils/usePageTitle";
import { StepUpDialog } from "../components/StepUpDialog";
import { CenteredCard, PageHeader, StatusScreen } from "../components/ui";

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

  usePageTitle(t("account.oauth.bindConfirmTitle"));

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
      // 循环保护：step-up 已通过却再次要求 step-up，说明验证未生效，
      // 不再反复弹窗，转错误屏（以一次为限）。
      if (verifiedRef.current) {
        setError(t("account.oauth.bindStepUpFailed"));
        return;
      }
      setStepUpOpen(true);
      return;
    }
    // 优先用已映射的本地化文案（authError.*），未命中再回落后端 message。
    const key = `authError.${res.error.code}`;
    const localized = t(key);
    setError(localized === key ? res.error.message : localized);
  };

  useEffect(() => {
    if (loading || ran.current) return;
    if (!user) {
      // 登录后必须回到本页：pending 绑定 Cookie 只有经由本页 complete-binding 才会被消费，
      // 跳去 /account/oauth 会让绑定永远无法完成。
      const self = `${window.location.pathname}${window.location.search}`;
      navigate(`/login?redirect=${encodeURIComponent(self)}`, { replace: true });
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
        actions={[{ label: t("account.oauth.title"), to: "/account" }]}
      />
    );
  }
  if (error) {
    return (
      <StatusScreen
        kind="error"
        title={t("account.oauth.bindConfirmTitle")}
        description={error}
        actions={[{ label: t("account.oauth.title"), to: "/account" }]}
      />
    );
  }

  return (
    <>
      {stepUpOpen ? (
        /* 对话框打开期间改用中性等待态（无 live region 的静态卡片），
           避免背景 loading StatusScreen 的 role=status 持续误播。 */
        <CenteredCard>
          <PageHeader
            align="center"
            size="card"
            as="h1"
            title={t("account.oauth.bindConfirmTitle")}
            description={t("account.oauth.stepUpWaiting")}
          />
        </CenteredCard>
      ) : (
        <StatusScreen kind="loading" title={t("account.oauth.bindProcessing")} />
      )}
      <StepUpDialog
        open={stepUpOpen}
        onClose={() => {
          setStepUpOpen(false);
          // 仅在用户「取消」（未验证）时离开；验证通过由 complete() 决定结果（成功/错误）。
          if (!verifiedRef.current) navigate("/account", { replace: true });
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
