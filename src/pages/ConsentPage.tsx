import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, NON_REJECTING_AUTH_CODES, SESSION_IDENTITY_CHANGED } from "../api/client";
import { hasStringFields, isNonEmptyString, isPlainObject } from "../api/shape";
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
/**
 * 授权信息的最小运行时校验。
 *
 * 这一页要在用户点「允许」之前把「哪个应用、要什么权限、回跳到哪」讲清楚，
 * 三者都来自这个响应。让一个残缺的对象走到渲染，轻则白屏，重则展示不全 ——
 * 而用户是照着屏幕上的内容做授权决定的。
 */
function isInteractionInfo(value: unknown): value is OidcInteractionInfo {
  if (!isPlainObject(value)) return false;
  if (!isNonEmptyString(value.uid)) return false;
  const params = value.params;
  // 三个字段各自对应屏幕上的一句话，缺哪个都会让用户在信息不全的情况下做授权决定：
  // client_id → 「哪个应用」（没有 clientName 时它就是应用名）
  // scope     → 「要什么权限」（缺了会渲染出一张**空权限清单**的授权卡，
  //              而后端在 confirm 时仍按真实 scope 发放授权 —— 看到的与授权的不一致）
  // redirect_uri → 「授权完会去哪」
  if (!hasStringFields(params, ["client_id", "scope", "redirect_uri"])) return false;
  // 回跳地址还得是个能解析的绝对地址：`hostOf()` 解析失败会返回空串，
  // 于是「将跳转到 …」后面空着 —— 那一行等于没说。
  return hostOf((params as { redirect_uri: string }).redirect_uri) !== "";
}

const ConsentPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, status } = useSession();
  const [params] = useSearchParams();
  // 后端交互重定向用 ?oidc=<uid>；兼容历史 ?uid=。
  const uid = params.get("oidc") ?? params.get("uid");

  const [info, setInfo] = useState<OidcInteractionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 同意/拒绝分离 busy：spinner 只出现在被点的那个按钮上，另一个仅禁用。
  const [pending, setPending] = useState<"confirm" | "abort" | null>(null);
  /** 递增即重新拉取交互信息（身份变化后丢弃旧 info 用）。 */
  const [reloadKey, setReloadKey] = useState(0);

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
      // 瞬态失败要退避重试，不能一次就判死。
      //
      // 续期撞上一次 503，这一页就直接落进错误态、只剩「回首页」一个出口 ——
      // 而一秒后会话其实已经恢复，用户却只能从头再发起一次授权。
      let lastError: string | null = null;
      for (const delay of [0, 800, 2400]) {
        if (delay) {
          await new Promise((r) => setTimeout(r, delay));
          if (cancelled) return;
        }
        const res = await api.get<OidcInteractionInfo>(
          `/oauth2/interaction/${encodeURIComponent(uid)}/info`,
        );
        if (cancelled) return;
        if (!res.ok) {
          // 需要先登录时后端以 prompt=login 表达；统一跳登录并带回 uid。
          //
          // **401 要先看错误码。** `auth_refresh_transient`（令牌过期、而续期这次撞上
          // 网关抖动）与 `auth_epoch_stale`（这个结果属于已被替换的旧身份）都不是
          // 「你没登录」—— 把它们当成未登录会在一次网关抖动时打断正常的授权流程，
          // 而用户的会话其实好好的。
          if (NON_REJECTING_AUTH_CODES.includes(res.error.code)) {
            lastError = res.error.message;
            continue; // 退避后再问一次
          }
          if (res.status === 401 || res.error.code === "login_required") {
            navigate(`/login?oidc=${encodeURIComponent(uid)}`, { replace: true });
            return;
          }
          setError(res.error.message);
          setLoading(false);
          return;
        }
        // 2xx 也可能给回一个不成形的东西（缺 `data`、`{}`、数组）。
        // 只判 truthy 是不够的：`{}` 会被存进 `info`，页面随即离开 loading，
        // 然后在渲染时解引用 `info.params.client_id` 抛异常 —— 授权页白屏。
        // 归到与「读取失败」同一条路径；这是契约不符，重试也不会变好，直接终态。
        if (!isInteractionInfo(res.data)) {
          setError(t("consent.loadFailed"));
          setLoading(false);
          return;
        }
        // 卡片按这份 info 渲染，而同意/拒绝提交到 URL 里的 uid。两者必须是同一笔交互，
        // 否则就是「看着 A 的授权请求、批准了 B」。
        if (res.data.uid !== uid) {
          setError(t("consent.loadFailed"));
          setLoading(false);
          return;
        }
        if (res.data.prompt === "login") {
          navigate(`/login?oidc=${encodeURIComponent(uid)}`, { replace: true });
          return;
        }
        setInfo(res.data);
        setLoading(false);
        return;
      }
      // 阶梯跑完仍然只拿到瞬态错误：给出错误态（带重试入口），而不是继续空转。
      if (cancelled) return;
      setError(lastError ?? t("consent.loadFailed"));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, navigate, t, reloadKey]);

  // 身份变了（本标签页换号，或别的标签页换号后本页对齐过来）。
  //
  // 手里这份 info 是上一个身份下取到的。留着它，用户会对着「以 A 的名义取到的
  // 授权请求」以 B 的身份点下「允许」—— 屏幕上说的和实际发生的不是一回事。
  // 丢掉重取。
  useEffect(() => {
    const onIdentityChanged = () => {
      setInfo(null);
      setError(null);
      setLoading(true);
      setReloadKey((n) => n + 1);
    };
    window.addEventListener(SESSION_IDENTITY_CHANGED, onIdentityChanged);
    return () => window.removeEventListener(SESSION_IDENTITY_CHANGED, onIdentityChanged);
  }, []);

  const decide = async (action: "confirm" | "abort") => {
    if (!uid || pending) return;
    setPending(action);
    setError(null);
    const res = await api.post<{ redirectTo?: string }>(
      `/oauth2/interaction/${encodeURIComponent(uid)}/${action}`,
    );
    // 回跳地址必须是**非空字符串**。只判 truthy 的话，`redirectTo: {}` 会一路走到
    // `location.href = {}`，浏览器把它转成 "[object Object]" 当相对路径跳过去 ——
    // 用户落在一个 404，而这一步恰恰是授权流程的终点，出错必须说出来。
    if (res.ok && isNonEmptyString(res.data?.redirectTo)) {
      window.location.href = res.data.redirectTo;
      return;
    }
    setError(res.ok ? t("error.generic") : res.error.message);
    setPending(null);
  };

  // 会话未落定时不渲染授权卡片。
  // 这不是美观问题：授权屏的核心信息之一就是「你正在以哪个账号授权」，
  // 身份区空着的卡片会让用户在看不清主体的情况下点下「允许」。
  if (loading || status === "unknown") {
    return <StatusScreen kind="loading" title={t("consent.loading")} />;
  }
  // 确定未登录：交互本身要求的是「同意」而不是「登录」（否则上面的 effect 已经跳走了），
  // 但没有 C 端会话就发不出 confirm（该端点需要鉴权）。先去登录再回来续跑，
  // 别让用户对着一张没有身份的卡片点「允许」然后吃一个 401。
  if (status === "anonymous" && uid) {
    return <Navigate to={`/login?oidc=${encodeURIComponent(uid)}`} replace />;
  }
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
