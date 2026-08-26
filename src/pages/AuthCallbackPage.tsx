import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, getIdentityGen, installAccessToken } from "../api/client";
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
  /**
   * 失败的是**拉档案**，不是登录本身。
   *
   * 会话此刻已经建立（兑换成功、令牌已装），只是 `/v1/me` 没答上来。
   * 这时该重试的是拉档案，**绝不能重跑兑换** —— `loginCode` 是一次性的。
   * 而且成功后要回到原来的目的地：它可能带着 `?oidc=`，跳去别处等于把一次
   * 仍然有效的授权请求丢掉，用户得回业务站重发一遍。
   */
  const [profileRetry, setProfileRetry] = useState(false);
  const [retrying, setRetrying] = useState(false);
  /** 令牌装上那一刻的身份代次。档案重试要锚在它上面，见 retryProfile。 */
  const installedGenRef = useRef(0);
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
      // 存不下就别跳：登录页那边看不到交接，会把这次二次验证当成不存在
      //（详见 saveMfaHandoff 的说明）。就地给出错误，让用户重新登录。
      if (!saveMfaHandoff({ mfaChallengeToken, redirectAfter })) {
        setError(t("callback.handoffUnavailable"));
        return;
      }
      navigate("/login", { replace: true });
      return;
    }

    if (status !== "login_ok" || !loginCode) {
      setError(t("callback.invalid"));
      return;
    }
    void (async () => {
      // 整条兑换流程开始前记下代次；拿到令牌时校验它是否仍属于当前身份。
      const identityGen = getIdentityGen();
      const res = await api.post<OAuthExchangeResult>(
        "/v1/auth/oauth/exchange",
        { loginCode },
        // 标 authWrite 的理由与别处略有不同：refresh cookie 与 `_session` 是
        // **回调那一步**（整页导航回来之前）写的，兑换本身只消费一次性的 loginCode
        // 并返回 JSON。但它仍属于「会改变本浏览器登录态」的一环，
        // 认证边界到来时应当能掐掉它 —— 掐掉之后至少不会再有令牌被装上。
        //（回调那一步写下的 cookie 已经落地，前端撤不回，属 README 记录的残余。）
        { noAuth: true, authWrite: true, requireIdentityGen: identityGen },
      );
      if (!res.ok) {
        /**
         * 这里曾经有一段「兑换没成就探测一次静默续期，成功即当作登录成功」的兜底。
         * **已删除**，因为它无法验证自己恢复的是谁。
         *
         * 那次续期用的是浏览器**当前**的 refresh cookie，与本次 `loginCode` 毫无关联。
         * 用户想登的是 B，而 cookie 可能因为另一个标签页、或一个迟到的续期响应
         * 而变成了 A —— 页面于是把 A 当作「B 登录成功」继续往下走，
         * 甚至用 A 完成本次 OIDC 授权。限定触发条件（只在 5xx/断网时兜底）也没用：
         * 它改变的是**什么时候猜**，而不是**猜得准不准**。
         *
         * 删掉的代价很小：登录页的启动探测本来就会用同一枚 cookie 把会话恢复出来，
         * 用户至多多点一次「重新登录」，而不会真的登不进去。
         */
        // 展示错误时优先用已映射的本地化文案（authError.*），未命中再回落后端 message。
        const key = `authError.${res.error.code}`;
        const localized = t(key);
        setError(localized === key ? res.error.message : localized);
        return;
      }
      // `res.data` 在 2xx 下仍可能整个缺失（网关返回了个空壳 200）。
      // 直接解引用会抛 TypeError 穿透出去，页面卡在「处理中」且没有任何收尾。
      // `installAccessToken` 收 unknown 并自行校验，这里用可选链把「缺 data」
      // 归到同一条失败路径上即可。
      if (!installAccessToken(res.data?.accessToken, identityGen)) {
        setError(t("login.identityChanged"));
        return;
      }
      // 记在**装上之后**：`installAccessToken()` 若检测到换人会顺手提一次代次，
      // 装之前记下的那个值已经过期了。
      installedGenRef.current = getIdentityGen();
      if ((await refresh()) === null) {
        // 兑换已经成功、会话已经建立，缺的只是档案。**不要重跑兑换** ——
        // loginCode 是一次性的，再兑一次只会拿到「已使用」。只重试拉档案即可，
        // 而且成功后仍要回到原来的目的地（它可能带着 `?oidc=`，
        // 直接跳去别处等于把一次仍然有效的授权请求丢掉）。
        setProfileRetry(true);
        setError(t("login.profileFetchFailed"));
        return;
      }
      navigate(redirectAfter, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    const retryProfile = async () => {
      if (retrying) return;
      // 重试也要锚在**令牌装上时**的代次。
      //
      // 这个页面是为某一次登录服务的。用户可能在错误屏上停留很久，期间另一个标签页
      // 换了账号 —— 那时重新 `refresh()` 拿回来的是**新账号**的档案，
      // 而随后的跳转目标（可能带着 `?oidc=`）是为原来那次登录准备的。
      // 代次对不上就不继续，如实说明。
      if (getIdentityGen() !== installedGenRef.current) {
        setProfileRetry(false);
        setError(t("login.identityChanged"));
        return;
      }
      setRetrying(true);
      const me = await refresh();
      setRetrying(false);
      if (getIdentityGen() !== installedGenRef.current) {
        setProfileRetry(false);
        setError(t("login.identityChanged"));
        return;
      }
      if (me) navigate(redirectAfter, { replace: true });
    };
    return (
      <StatusScreen
        kind="error"
        title={t("callback.failed")}
        description={error}
        actions={
          profileRetry
            ? [
                { label: t("mfa.done.retry"), onClick: () => void retryProfile() },
                { label: t("callback.retryLogin"), variant: "ghost" as const, to: "/login" },
              ]
            : [{ label: t("callback.retryLogin"), to: "/login" }]
        }
      />
    );
  }
  return <StatusScreen kind="loading" title={t("callback.processing")} />;
};

export default AuthCallbackPage;
