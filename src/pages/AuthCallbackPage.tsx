import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, setUserToken, tryRefreshToken } from "../api/client";
import { useSession } from "../context/SessionContext";
import { sanitizeRedirect } from "../utils/url";
import { usePageTitle } from "../utils/usePageTitle";
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
  // 来自 URL 的重定向目标必须净化，防开放重定向。
  const redirectAfter = sanitizeRedirect(params.get("redirectAfter"), "/account");

  usePageTitle(error ? t("callback.failed") : t("callback.title"));

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (status !== "login_ok" || !loginCode) {
      setError(t("callback.invalid"));
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
        // 兑换失败但会话可能已实际建立（refresh cookie 已随回调写入）：
        // 探测一次静默续期，成功即按登录成功处理，避免「实际已登录却显示失败」。
        const token = await tryRefreshToken();
        if (token) {
          setUserToken(token);
          const me = await refresh();
          if (me) {
            navigate(redirectAfter, { replace: true });
            return;
          }
        }
        // 展示错误时优先用已映射的本地化文案（authError.*），未命中再回落后端 message。
        const key = `authError.${res.error.code}`;
        const localized = t(key);
        setError(localized === key ? res.error.message : localized);
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
        actions={[{ label: t("callback.retryLogin"), to: "/login" }]}
      />
    );
  }
  return <StatusScreen kind="loading" title={t("callback.processing")} />;
};

export default AuthCallbackPage;
