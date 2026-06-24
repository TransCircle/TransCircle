import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, setUserToken } from "../api/client";
import { useSession } from "../context/SessionContext";
import type { OAuthExchangeResult } from "../api/types";
import { StatusScreen } from "../components/ui";

/**
 * OAuth 浏览器回调落地（修正协议）：
 * 后端 302 → /auth/callback?status=login_ok&loginCode=...&redirectAfter=...
 * 用 loginCode 兑换 access token（refresh_token 已在回调时写入 HttpOnly Cookie）。
 */
const AuthCallbackPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refresh } = useSession();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  const status = params.get("status");
  // loginCode 经 URL 片段（#）传递，不进访问日志/Referer。
  const loginCode = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("loginCode");
  const redirectAfter = params.get("redirectAfter") || "/account/profile";

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (status !== "login_ok" || !loginCode) {
      setError(t("callback.failed"));
      return;
    }
    // 立即从地址栏抹去一次性 loginCode（已捕获到闭包），避免经浏览器历史/Referer 泄露。
    window.history.replaceState(null, "", window.location.pathname);
    void (async () => {
      const res = await api.post<OAuthExchangeResult>(
        "/v1/auth/oauth/exchange",
        { loginCode },
        { noAuth: true },
      );
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setUserToken(res.data.accessToken);
      await refresh();
      navigate(redirectAfter, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <StatusScreen
        kind="error"
        title={t("callback.failed")}
        description={error}
        actions={[{ label: t("nav.login"), to: "/login" }]}
      />
    );
  }
  return <StatusScreen kind="loading" title={t("callback.processing")} />;
};

export default AuthCallbackPage;
