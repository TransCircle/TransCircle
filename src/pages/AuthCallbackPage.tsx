import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, setUserToken, tryRefreshToken } from "../api/client";
import { useSession } from "../context/SessionContext";
import { sanitizeRedirect } from "../utils/url";
import { usePageTitle } from "../utils/usePageTitle";
import type { OAuthExchangeResult } from "../api/types";
import { StatusScreen } from "../components/ui";
import { saveMfaHandoff } from "./mfaHandoff";

/**
 * OAuth 浏览器回调落地（修正协议）：
 *
 * - `status=login_ok`     → 后端已建会话，用片段里的 loginCode 兑换 access token
 *                           （refresh_token 已在回调时写入 HttpOnly Cookie）。
 * - `status=mfa_required` → 第三方登录只是**第一因素**，该账户还开着 TOTP / 通行密钥 /
 *                           统一身份接管。片段里带的是一次性挑战令牌，交接给登录页
 *                           复用那一整套二次验证界面，不在这里另做一套。
 */
const AuthCallbackPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refresh } = useSession();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  const status = params.get("status");
  // 一次性凭据经 URL 片段（#）传递，不进访问日志/Referer。
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const loginCode = hash.get("loginCode");
  const mfaChallengeToken = hash.get("mfaChallengeToken");
  // 来自 URL 的重定向目标必须净化，防开放重定向。
  const redirectAfter = sanitizeRedirect(params.get("redirectAfter"), "/account");

  usePageTitle(error ? t("callback.failed") : t("callback.title"));

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // 第三方登录通过了第一因素，但账户还需要第二因素。
    // 无论后面走哪条分支，片段里都可能带着一次性凭据（loginCode / mfaChallengeToken）。
    // **先无条件清掉**，再判断 —— 之前只在成功路径上清，缺令牌的失败分支会把它
    // 留在地址栏与浏览器历史里。
    window.history.replaceState(null, "", window.location.pathname);

    if (status === "mfa_required") {
      if (!mfaChallengeToken) {
        setError(t("callback.invalid"));
        return;
      }
      saveMfaHandoff({ mfaChallengeToken, redirectAfter });
      navigate("/login", { replace: true });
      return;
    }

    if (status !== "login_ok" || !loginCode) {
      setError(t("callback.invalid"));
      return;
    }
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
