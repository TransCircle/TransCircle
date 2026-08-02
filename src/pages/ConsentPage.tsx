import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useSession } from "../context/SessionContext";
import { usePageTitle } from "../utils/usePageTitle";
import { hostOf } from "../utils/oidcConsent";
import type { OidcInteractionInfo } from "../api/types";
import { ConsentCard } from "../components/ConsentCard";
import { CenteredCard, Alert, StatusScreen } from "../components/ui";

/**
 * OIDC 同意页：
 * GET /oauth2/interaction/:uid/info → { uid, prompt, params:{ client_id, scope, redirect_uri } }
 * POST .../confirm | .../abort → { redirectTo }。
 * 卡片内容（应用/身份头像、标题、权限清单、动作区）与 admin 的 ConsentPreview 共用
 * 同一个 ConsentCard——用户实际看到的就是管理员在客户端配置页预览到的那个样子。
 */
const ConsentPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useSession();
  const [params] = useSearchParams();
  // 后端交互重定向用 ?oidc=<uid>；兼容历史 ?uid=。
  const uid = params.get("oidc") ?? params.get("uid");

  const [info, setInfo] = useState<OidcInteractionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 同意/拒绝分离 busy：spinner 只出现在被点的那个按钮上，另一个仅禁用。
  const [pending, setPending] = useState<"confirm" | "abort" | null>(null);

  usePageTitle(t("consent.pageTitle"));

  useEffect(() => {
    if (!uid) {
      setError(t("consent.loadFailed"));
      setLoading(false);
      return;
    }
    // uid 变化时(同一 SPA 会话内从一个授权请求切到另一个:pathname 同为
    // /oauth/consent,RootLayout 按 pathname 重挂载→不重挂载,组件不卸载)必须
    // 先清空上一交互的 info 并回到 loading,否则会用旧 client/scopes 渲染卡片却把
    // 同意/拒绝提交到新 uid,造成「看到的与授权的不一致」。
    setInfo(null);
    setError(null);
    setLoading(true);
    let cancelled = false;
    void (async () => {
      const res = await api.get<OidcInteractionInfo>(
        `/oauth2/interaction/${encodeURIComponent(uid)}/info`,
      );
      if (cancelled) return;
      if (!res.ok) {
        // 需要先登录时后端以 prompt=login 表达；统一跳登录并带回 uid。
        if (res.status === 401 || res.error.code === "login_required") {
          navigate(`/login?oidc=${encodeURIComponent(uid)}`, { replace: true });
          return;
        }
        setError(res.error.message);
        setLoading(false);
        return;
      }
      if (res.data.prompt === "login") {
        navigate(`/login?oidc=${encodeURIComponent(uid)}`, { replace: true });
        return;
      }
      setInfo(res.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, navigate, t]);

  const decide = async (action: "confirm" | "abort") => {
    if (!uid || pending) return;
    setPending(action);
    setError(null);
    const res = await api.post<{ redirectTo?: string }>(
      `/oauth2/interaction/${encodeURIComponent(uid)}/${action}`,
    );
    if (res.ok && res.data?.redirectTo) {
      window.location.href = res.data.redirectTo;
      return;
    }
    setError(res.ok ? t("error.generic") : res.error.message);
    setPending(null);
  };

  if (loading) return <StatusScreen kind="loading" title={t("consent.loading")} />;
  if (!info) {
    return (
      <StatusScreen
        kind="error"
        title={t("consent.loadFailed")}
        description={error ?? undefined}
        actions={[{ label: t("error.backHome"), to: "/" }]}
      />
    );
  }

  const appName = (info.client?.clientName ?? info.params.client_id).trim() || t("consent.unnamed");
  const logoUri = info.client?.logoUri ?? null;
  const scopes = (info.params.scope ?? "").split(/\s+/).filter(Boolean);
  const identityName = user ? user.displayName || user.username : "";
  const redirectHost = hostOf(info.params.redirect_uri) || null;

  return (
    <CenteredCard>
      <ConsentCard
        appName={appName}
        logoUri={logoUri}
        viewer={{ name: identityName, email: user?.email ?? null, avatarUrl: user?.avatarUrl ?? null }}
        scopes={scopes}
        redirectHost={redirectHost}
        allowLoading={pending === "confirm"}
        denyLoading={pending === "abort"}
        onAllow={() => void decide("confirm")}
        onDeny={() => void decide("abort")}
      />
      {error && <Alert tone="error">{error}</Alert>}
    </CenteredCard>
  );
};

export default ConsentPage;
