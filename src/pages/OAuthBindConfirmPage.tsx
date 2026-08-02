import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, clearCsrfToken, getCsrfToken, saveCsrfToken } from "../api/client";
import { useSession } from "../context/SessionContext";
import { usePageTitle } from "../utils/usePageTitle";
import { StepUpDialog } from "../components/StepUpDialog";
import { clearPermanentBindAck, peekPermanentBindAck } from "./account/permanentBindAck";
import { CenteredCard, PageHeader, StatusScreen } from "../components/ui";

/**
 * 第三方账号绑定完成落地（修正缺失页）。
 * 后端 OAuth 绑定回调 302 → /settings/security/oauth-bind/confirm?status=pending_binding&provider=...&csrfToken=...，
 * 并已下发 oauth_pending_<provider> + oauth_pending_csrf 两条 Cookie（均为 API 主机的 host-only Cookie）。
 * POST /v1/auth/oauth/complete-binding（X-CSRF-Token 双提交 + 需 step-up）完成绑定；
 * 双提交的「前端那一半」取自 URL 参数而非 Cookie，理由见下方 csrfToken 注释。
 */
const OAuthBindConfirmPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading } = useSession();
  /**
   * URL 参数在挂载时一次性取定。
   *
   * 取定之后下面的 effect 会把 csrfToken 从地址栏抹掉（别把双提交令牌留在浏览器历史与
   * Referer 里），所以后续渲染不能再依赖 `params` —— provider 也一并固定在这里。
   */
  const [flow] = useState(() => ({
    provider: params.get("provider") ?? "",
    /**
     * CSRF 双提交令牌，**优先取 URL 参数**。
     *
     * oauth_pending_csrf 是后端下发的 host-only Cookie（cookieDomain() 恒为 undefined）。
     * 门户与 Pass API 不同源时（生产：transcircle.org ↔ api.transcircle.org），
     * 这个 Cookie 只会随请求发回服务端，document.cookie **读不到** —— 于是页面发不出
     * X-CSRF-Token，complete-binding 必然 403 CSRF_TOKEN_INVALID。
     * 后端为此在绑定回调的重定向里也带了 csrfToken 参数（与补全注册那条路同一方案），
     * 这里必须消费它，否则整条绑定流在跨域部署下 100% 失败。
     * 同源部署下 URL 参数缺失也能从 Cookie/sessionStorage 兜底。
     */
    csrfToken: params.get("csrfToken") || getCsrfToken(),
    /**
     * 不可自行解除的绑定（统一身份）要求显式确认，后端缺了就返 400 ACK_REQUIRED。
     * 确认是在账户中心发起绑定时做的，经 sessionStorage 传到这里。
     * 这里只**读**不删：StrictMode 会把 state initializer 跑两次，读取必须幂等
     * （见 permanentBindAck.ts）。删除放在下面的终态里。
     */
    ack: params.get("provider") ? peekPermanentBindAck(params.get("provider")!) : false,
  }));
  const [error, setError] = useState<string | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [done, setDone] = useState(false);
  const ran = useRef(false);
  const verifiedRef = useRef(false);

  usePageTitle(t("account.oauth.bindConfirmTitle"));

  // 令牌落一份到 sessionStorage：登录跳转 / 手动刷新之后 URL 参数可能已被下面抹掉，
  // 那时只剩这一条通道能把它找回来。副作用放 effect 里，别放 state initializer
  // （StrictMode 会跑两次）。
  const [csrfPersisted, setCsrfPersisted] = useState(false);
  useEffect(() => {
    if (flow.csrfToken) setCsrfPersisted(saveCsrfToken(flow.csrfToken));
  }, [flow.csrfToken]);

  // 令牌取定后从地址栏抹掉，别让它留在浏览器历史与 Referer 里。
  //
  // 三个刻意的限制：
  // - **只删 csrfToken**：provider/status 要留给「未登录先去登录、登录后回到本页」那条路，
  //   整条 search 抹掉会让回来时认不出这是哪个 provider 的绑定。
  // - **等 user 到手再删**：未登录时本页会整页跳去 /login 再回来，URL 得原样留着。
  // - **存不下就不删**：sessionStorage 不可用（隐私模式）时 URL 是仅剩的通道，抹了就没了。
  useEffect(() => {
    if (!user || !csrfPersisted) return;
    const sp = new URLSearchParams(window.location.search);
    if (!sp.has("csrfToken")) return;
    sp.delete("csrfToken");
    const q = sp.toString();
    // 传 history.state 而非 null：React Router 把自己的 key/index 存在里面，
    // 覆盖成 null 会让前进/后退与相对导航退化。
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`,
    );
  }, [user, csrfPersisted]);

  /**
   * 本次绑定尝试到此为止：过渡态凭据全部作废。
   *
   * 「不可逆绑定确认」是**一次 OAuth 尝试对应一次明确确认**，残留下来会被下一次绑定
   * 静默复用 —— 那就等于用户没确认也照样永久绑定。所以成功、终态失败、
   * 以及用户取消 step-up 三条路都必须走这里。
   */
  const discardFlowCredentials = () => {
    if (flow.provider) clearPermanentBindAck(flow.provider);
    clearCsrfToken();
  };

  /** 走到终态（成功或不可重试的失败）。 */
  const finish = (fail?: string) => {
    discardFlowCredentials();
    if (fail) setError(fail);
    else setDone(true);
  };

  const complete = async () => {
    const res = await api.post(
      // 显式带上 provider：后端否则只能扫 Cookie 猜，10 分钟内放弃过的另一个 provider
      // 的 pending Cookie 会把本次绑定顶掉（见 complete-binding 的注释）。
      `/v1/auth/oauth/complete-binding${flow.provider ? `?provider=${encodeURIComponent(flow.provider)}` : ""}`,
      flow.ack ? { acknowledgedPermanent: true } : undefined,
      // 不用 { csrf: true }：那条路只读 Cookie/sessionStorage，会被同名的陈旧 Cookie
      // 盖掉本次流程的令牌（localhost 下多个服务共用一个 cookie jar，这很容易发生）。
      // 本次流程的权威值就在 flow.csrfToken 里，直接显式发。
      { headers: flow.csrfToken ? { "X-CSRF-Token": flow.csrfToken } : undefined, idempotent: true },
    );
    if (res.ok) {
      finish();
      return;
    }
    // 绑定需要先完成二次验证。
    if (res.status === 403 && res.error.code === "STEP_UP_REQUIRED") {
      // 循环保护：step-up 已通过却再次要求 step-up，说明验证未生效，
      // 不再反复弹窗，转错误屏（以一次为限）。
      if (verifiedRef.current) {
        finish(t("account.oauth.bindStepUpFailed"));
        return;
      }
      setStepUpOpen(true);
      return;
    }
    // 优先用已映射的本地化文案（authError.*），未命中再回落后端 message。
    const key = `authError.${res.error.code}`;
    const localized = t(key);
    finish(localized === key ? res.error.message : localized);
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
          if (!verifiedRef.current) {
            // 放弃也是终点：确认凭据与 CSRF 令牌都不能留到下一次绑定。
            discardFlowCredentials();
            navigate("/account", { replace: true });
          }
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
