import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, getIdentityGen, installAccessToken, NON_REJECTING_AUTH_CODES } from "../api/client";
import { hasStringFields, isNonEmptyString } from "../api/shape";
import { useSession } from "../context/SessionContext";
import { readSignoutEpoch } from "../context/signoutEpoch";
import type { LoginResult, OAuthProviderInfo, WebAuthnRequestOptions } from "../api/types";
import { performAssertion, isWebAuthnSupported } from "../utils/webauthn";
import { sanitizeRedirect } from "../utils/url";
import {
  clearOidcInteraction,
  readOidcInteraction,
} from "../utils/oidcInteraction";
import { usePageTitle } from "../utils/usePageTitle";
import { saveIamMfaHandoff } from "./AuthMfaDonePage";
import { consumeMfaHandoff, hasMfaHandoff, type MfaHandoff } from "./mfaHandoff";
import {
  CenteredCard,
  PageHeader,
  TextField,
  AdminButton as Button,
  Alert,
  StatusScreen,
} from "../components/ui";
import { TurnstileWidget } from "../components/ui/TurnstileWidget";
import authStyles from "./Auth.module.css";

const GithubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.23c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.82.57A12 12 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
  </svg>
);
const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M18.24 2.25h3.31l-7.23 8.26L23.04 21.75h-6.66l-4.71-6.23-5.4 6.23H2.96l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12L17.08 19.77Z" />
  </svg>
);
// 统一身份（IAM）。与 GitHub / X 并列，是同一层级的授权登录方式。
const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M12 2 4 5.5v6c0 5 3.4 9.2 8 10.5 4.6-1.3 8-5.5 8-10.5v-6L12 2Z" /><path d="m9 12 2 2 4-4" />
  </svg>
);
/** provider key → 图标。未知 provider 用盾牌兜底，不留空白按钮。 */
const providerIcon = (provider: string) => {
  if (provider === "github") return <GithubIcon />;
  if (provider === "x") return <XIcon />;
  return <ShieldIcon />;
};
const FingerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M5 13a7 7 0 0 1 14 0c0 1.96-.14 4-1 6" /><path d="M12 11a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" /><path d="M8 21c.5-2 1-4 1-8" />
  </svg>
);

/**
 * 登录屏（修正契约）：
 * - POST /v1/auth/login { identifier, password } → tokens 或 { mfaRequired, mfaChallengeToken, availableMethods, passkey }。
 * - MFA（密码后二次验证，任一 2FA 方式即触发）：
 *     · TOTP / 恢复码：POST /v1/auth/mfa/totp/verify { mfaChallengeToken, code }。
 *     · Passkey：      POST /v1/auth/mfa/passkey/verify { mfaChallengeToken, credential }。
 * - Passkey 免密登录：/v1/auth/passkey/login/start → 浏览器断言 → /finish。
 * - OAuth：GET /v1/auth/oauth/:provider/start 返回 { authorizationUrl }（需前端跳转，非 302）。
 * - OIDC 交互（?oidc=uid）：登录后 POST /oauth2/interaction/:uid/login → redirectTo。
 */
/** 在途动作标识：任一在途时其余入口全部禁用，且各自按钮能显示自己的 loading。 */
/** provider 的 pending 用 provider key 本身表示，所以这里是开放字符串。 */
type PendingAction = "login" | "mfa" | "mfaPasskey" | "passkey" | (string & {});

const LoginPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, status, hint, refresh, sessionExpired, clearSessionExpired } = useSession();
  const [params] = useSearchParams();

  const oidcUid = readOidcInteraction(params.get("oidc"));
  const showSessionExpired = params.get("reason") === "session_expired" && sessionExpired;
  // 来自 URL 的重定向目标必须净化，防开放重定向。
  const urlRedirect = sanitizeRedirect(params.get("redirect"), "/account");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  /**
   * 二次验证挑战诞生时的身份代次（`getIdentityGen()`，不是 `getAuthEpoch()`）。
   *
   * **完成二次验证时不能重新读当前代次。** 从拿到挑战到用户输完验证码之间可能过去几十秒，
   * 期间另一个标签页完全可能登录了别的账号；用完成时刻的代次去校验，等于「变化发生了但没人发现」，
   * 于是这条属于旧身份的挑战换来的令牌会盖掉新身份的会话。代次必须锚在挑战签发的那一刻。
   */
  const mfaGenRef = useRef<number | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  // 二次验证可用方式与（如有）Passkey 断言参数——由 /login 的挑战响应下发。
  const [mfaMethods, setMfaMethods] = useState<NonNullable<LoginResult["availableMethods"]>>([]);
  const [mfaPasskey, setMfaPasskey] = useState<WebAuthnRequestOptions | null>(null);
  // Passkey 与验证码为同级主方式并列展示；恢复码为回退：开启此模式后切到恢复码专用输入。
  const [mfaRecoveryMode, setMfaRecoveryMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [captchaError, setCaptchaError] = useState(false);
  /** 登录被「注销冷静期」拒绝：展示撤销入口。 */
  const [pendingDeletion, setPendingDeletion] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const busy = pending !== null;

  /**
   * 第三方登录带回来的二次验证挑战（`/auth/callback?status=mfa_required`）。
   *
   * 第三方 OAuth 只是第一因素；账户若开着 TOTP / 通行密钥 / 统一身份接管，
   * 后端会签发挑战并把令牌交接过来。这里读一次（读完即删），
   * 然后向 `/v1/auth/mfa/challenge` 补齐"这次能用哪些方式"，
   * 之后就与密码登录走完全相同的二次验证界面。
   */
  // 存在待处理交接时，不能让「已登录自动跳转」把人带走 —— OAuth 往返期间
  // 旧会话可能被 refresh 恢复，那时二次验证还没做完就跳走等于绕过第二因素。
  const [handoff, setHandoff] = useState<MfaHandoff | null>(null);
  const [handoffPending, setHandoffPending] = useState(hasMfaHandoff());
  /**
   * 二次验证交接**失败**了（挑战过期/无效，或期间身份发生了变化）。
   *
   * 这是个终态，必须与「还在处理中」区分开。只把 `handoffPending` 置回 false 是不够的：
   * 那样一来，「已登录就自动续跑」的 effect 会立刻接管 —— 浏览器里若还留着一条旧的
   * Pass 会话，它就会拿着那条会话去完成 OIDC 交互，而**这次要求的第二因素根本没做**。
   * 等于用一次第三方登录 + 一个失败的交接，绕开了 2FA。
   */
  const [handoffFailed, setHandoffFailed] = useState(false);
  // **消费必须发生在 effect（提交阶段），不能在 render 里**：
  // render 可能被 React 丢弃并重跑（StrictMode 双调用、并发渲染），
  // 而 consumeMfaHandoff() 是破坏性读取 —— 在 render 里调，令牌可能被读掉后丢失。
  // ref 守卫保证 StrictMode 的双次 effect 只真正消费一次。
  const handoffConsumed = useRef(false);

  // 交接过来的目的地优先：用户是从 /auth/callback 转过来的，
  // 地址栏上的 ?redirect= 已经不在了，用它会把人送回默认页。
  const redirectTo = handoff ? sanitizeRedirect(handoff.redirectAfter, "/account") : urlRedirect;

  useEffect(() => {
    if (handoffConsumed.current) return;
    handoffConsumed.current = true;
    const data = consumeMfaHandoff();
    if (!data) {
      // 探测时说有（handoffPending 的初值就来自 hasMfaHandoff()），真去取却取不到：
      // 数据损坏、写了一半、或被别处清掉了。这同样是「交接失败」，
      // 必须进终态 —— 只把 pending 置回 false 的话，自动续跑会接管，
      // 拿浏览器里的旧会话把这次交互完成掉，而第二因素没做。
      //
      // 但**保留可用的登录表单**：重新登录正是这里的恢复路径，
      // 给一块只能看不能动的错误屏反而把出路堵死了。说明原因即可。
      if (handoffPending) {
        setHandoffFailed(true);
        setError(t("login.handoffLost"));
      }
      setHandoffPending(false);
      return;
    }
    setHandoff(data);
    setPending("mfa");
    // 身份代次记在**发起挑战查询之前**。在返回之后才读，等于把「这期间发生的登出/换号」
    // 一起锚进了新代次 —— 那条属于旧身份的挑战反而变成「合法」的了。
    const handoffGen = getIdentityGen();
    void (async () => {
      const res = await api.post<{
        availableMethods: NonNullable<LoginResult["availableMethods"]>;
        passkey?: { publicKey: WebAuthnRequestOptions };
      }>("/v1/auth/mfa/challenge", { mfaChallengeToken: data.mfaChallengeToken }, { noAuth: true });
      setPending(null);
      if (!res.ok) {
        // 挑战过期或无效：这时没有任何可继续的上下文，只能请用户重新登录。
        // 标成终态而不是「不再 pending」—— 否则自动续跑会拿旧会话把这次二次验证跳过去。
        const key = `authError.${res.error.code}`;
        const localized = t(key);
        setError(localized === key ? res.error.message : localized);
        setHandoffFailed(true);
        setHandoffPending(false);
        return;
      }
      // 代次在这期间变了：这条挑战属于已经被终结的身份，直接丢弃，
      // **绝不能**重新锚定到新代次上。
      if (getIdentityGen() !== handoffGen) {
        setError(t("login.identityChanged"));
        setHandoffFailed(true);
        setHandoffPending(false);
        return;
      }
      // 挑战确实拿到了，才解除等待 —— 顺序要紧：先落 mfaToken 再解 pending 的话
      // 中间那一帧两者皆假，自动续跑 effect 会插进来。
      // 2xx 也可能没有 data、或 data 里没有 availableMethods（网关吐了个空壳 200）。
      // 直接解引用会抛 TypeError 穿透出去，而此刻页面正停在中性等待屏上 ——
      // 用户会一直对着它，既没有说明也没有出路。归到「交接失败」终态。
      if (!Array.isArray(res.data?.availableMethods)) {
        setError(t("login.handoffLost"));
        setHandoffFailed(true);
        setHandoffPending(false);
        return;
      }
      mfaGenRef.current = handoffGen;
      setHandoffPending(false);
      setMfaToken(data.mfaChallengeToken);
      setMfaMethods(res.data.availableMethods);
      setMfaPasskey(res.data.passkey?.publicKey ?? null);
    })();
    // 只在挂载时跑一次；t 只影响文案。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  usePageTitle(oidcUid ? t("login.oidcTitle") : t("login.title"));

  /**
   * 登录态建立后的后续：OIDC 交互续跑或普通跳转。
   * onTokens 里的 refresh() 会让 useEffect([user, oidcUid]) 再次触发 finish，
   * 用 ref 保证一次性交互 POST 只执行一次，避免双发竞态。
   */
  const finished = useRef(false);
  /** OIDC 交互续跑失败：终态，需要用户回业务站重新发起授权。 */
  const [interactionFailed, setInteractionFailed] = useState(false);
  /** OIDC 交互续跑遇到瞬态错误：交互本身多半还有效，给重试。 */
  const [interactionRetryable, setInteractionRetryable] = useState(false);
  /**
   * @param anchorGen 这次续跑所依据的身份代次。
   *
   * **必须由调用方给**，不能在这里现取。`onTokens()` 那条路上，取锚（提交登录时）
   * 与走到这里之间隔着一整个「拉档案 + 退避重试」—— 那段时间里别的标签页完全可能
   * 登录/登出，把浏览器换成了另一个人。现取等于把这段变化一起锚了进去，闸门形同虚设：
   * 请求照发，后端照样消费掉那笔 interaction 并写下 `_session`，
   * 而它属于的是**上一个**身份。
   * 由效果/重试触发（没有登录流程在跑）时，调用方现取即可 —— 那时「此刻」就是它的起点。
   */
  const finish = async (anchorGen: number) => {
    if (finished.current) return;
    finished.current = true;
    if (oidcUid) {
      const res = await api.post<{ redirectTo?: string }>(
        `/oauth2/interaction/${encodeURIComponent(oidcUid)}/login`,
        undefined,
        // 后端在这一步会 ensureSsoSession()，也就是**写 `_session`**。
        // 与登录同属「响应会写会话 cookie」，同样要能被认证边界掐掉。
        { authWrite: true, requireIdentityGen: anchorGen },
      );
      // 跳转地址必须是**非空字符串**。只判 truthy 的话，`redirectTo: {}` 会一路走到
      // `location.href = {}`，浏览器把它转成字符串 "[object Object]" 当相对路径跳过去 ——
      // 用户落在一个 404，而屏幕上没有任何东西说明刚才发生了什么。
      if (res.ok && isNonEmptyString(res.data?.redirectTo)) {
        clearOidcInteraction();
        window.location.href = res.data.redirectTo;
        return;
      }
      // 交互续跑失败。区分两类，不能一概而论：
      //
      //  - **确定性失败**（4xx，最常见 INTERACTION_INVALID：授权请求过期，
      //    或它引用的那条 SSO 会话已被吊销 —— oidc-provider 直接判 SessionNotFound，
      //    没有原地自愈的余地）：这条路走不通了，进终态。
      //  - **不确定**（断网 / 5xx / 限流）：交互本身很可能还好好的，
      //    把它清掉并宣布「授权请求已失效」是在替一次网关抖动做终审。留着 uid，给重试。
      //
      // 顺带一提，原先这里统一 `navigate("/login")` —— 而此刻用户是**登录着的**，
      // 登录页会立刻把他转去账户中心：一次授权请求就这么无声无息地消失了。
      // 分类要**先看错误码**：`auth_refresh_transient` / `auth_epoch_stale` 会原样保留
      // 原始的 401，只看状态码就会把「令牌过期 + 续期恰好撞上网关抖动」判成确定性失败，
      // 于是一次抖动就宣布「授权请求已失效」并把 uid 清掉 —— 而交互本身好好的。
      // `res` 也可能是「成功但没给 redirectTo」（上面的 if 只在两者都满足时返回），
      // 那种情况没有 error 可读，按确定性失败处理即可。
      const errorCode = res.ok ? "" : res.error.code;
      const indeterminate =
        NON_REJECTING_AUTH_CODES.includes(errorCode) ||
        res.status === 0 ||
        res.status >= 500 ||
        res.status === 429;
      if (indeterminate) {
        // 允许再试一次：把一次性守卫放开，uid 也留着。
        // 必须同时置 `interactionRetryable` —— 否则「已登录 + 有 oidcUid」的渲染门控
        // 会继续画「正在跳转」的加载屏，把错误文案整个盖住，用户对着一个永远转圈的
        // 页面既看不到原因、也没有重试入口。
        finished.current = false;
        setInteractionRetryable(true);
        return;
      }
      clearOidcInteraction();
      setInteractionFailed(true);
      return;
    }
    navigate(redirectTo, { replace: true });
  };

  /** 已登录：带 oidc 直接续跑交互；普通访问不再展示登录表单，直接跳转目的地。 */
  useEffect(() => {
    if (!user) return;
    // 交接已经失败：这条路彻底走不通了，绝不能拿浏览器里那条旧会话替它把交互完成掉。
    if (handoffFailed) return;
    // **本次登录已经失败过并给出了错误，同样不能自动往下走。**
    //
    // 典型：二次验证通过、令牌也装上了，但随后取档案撞上 503 —— `onTokens()` 会清掉
    // MFA 状态并报错。此时浏览器内存里可能还留着同账号的旧 `user`，effect 一重跑就发现
    // 「已登录且没有待处理的二次验证」，于是替用户把 OIDC 交互完成掉 ——
    // 而这次登录的结果**根本没有确认过**。有错误在屏幕上，就该由用户决定下一步。
    if (error) return;
    // 交互已进入可重试终态：等用户点「重试」，别自作主张再跑一遍 ——
    // 那会绕过他刚看到的那个按钮，而失败原因（网关抖动）多半还没消失。
    if (interactionRetryable || interactionFailed) return;
    // 有待处理的二次验证交接时**必须让路**。
    // 第三方登录往返期间，旧会话可能被静默续期恢复；此时若按「已登录」直接跳走，
    // 后端刚签发的第二因素挑战就被跳过了 —— 等于用一次第三方登录绕开了 2FA。
    if (handoffPending || mfaToken) return;
    if (oidcUid) {
      // 这条路没有在跑的登录流程，「此刻」就是它的起点，现取即可。
      void finish(getIdentityGen());
      return;
    }
    navigate(redirectTo, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, oidcUid, handoffPending, mfaToken, handoffFailed, error, interactionRetryable, interactionFailed]);

  /** 清掉本次二次验证流程的全部残留（挑战已被服务端消费，不能再让用户对着它提交）。 */
  const clearMfaFlow = () => {
    setMfaToken(null);
    setMfaPasskey(null);
    setMfaMethods([]);
    setMfaRecoveryMode(false);
    setMfaCode("");
    mfaGenRef.current = null;
  };

  const onTokens = async (data: LoginResult | undefined, identityGen: number) => {
    // `data` 在 2xx 下仍可能整个缺失（网关返回了个空壳 200）。
    // 直接往下走会在 `data.accessToken` 处抛 TypeError 穿透出去 ——
    // 调用方的 finally 收不了尾，MFA 状态也不会被清理，页面就停在那张已被消费的表单上。
    if (!data) {
      clearMfaFlow();
      setError(t("login.identityChanged"));
      return;
    }
    // 登录成功即消掉「会话已过期」提示。
    // 远端此处还调了 clearAdminAuth()——那是旧双平面模型的管理员令牌，已随管理平面移除。
    clearSessionExpired();
    // 走到这里就是「登录成功、无需二次验证」，响应**必须**带令牌。
    // 没带说明协议出了岔子；此时若照常往下走，用的会是浏览器里**上一个人**的旧令牌 ——
    // 一次异常响应就变成了「以别人的身份完成了这次登录」。协议异常一律 fail closed。
    // 缺令牌与装不上，两者都必须**先把已被消费的挑战状态清掉**再报错。
    // 留着的话，页面会继续显示那张二次验证表单 —— 而服务端那边挑战已经用掉了，
    // 用户再提交一次只会拿到「无效/已使用」，看起来像是自己输错了。
    if (!data.accessToken) {
      clearMfaFlow();
      setError(t("login.identityChanged"));
      return;
    }
    // 带代次安装：请求在途时用户可能已经登出或换号登进来，
    // 这时把迟到的令牌装上就是「登出之后又被旧请求登了回去」。
    if (!installAccessToken(data.accessToken, identityGen)) {
      clearMfaFlow();
      setError(t("login.identityChanged"));
      return;
    }
    setTurnstileToken(null);
    // **确认档案真的到手了才往下走。** refresh() 在 5xx / 限流 / 断网 / 身份已变时返回 null
    // 并且**不改状态**；此时若照常 finish()，会话状态还停在 unknown，
    // 跳过去的账户页只会一直转圈（或被弹回登录页），而令牌其实已经装好了。
    // 拉档案带退避重试，与身份变化处理同款。
    //
    // 只试一次是不够的：会话上下文那边的重试是**它自己的**，而 single-flight 只合并
    //「同一时刻的第一发」—— 第一发撞上 503 时这里立刻判失败，几秒后那边重试成功、
    // 状态落定，本页却已经停在错误上，而 OIDC 交互还悬着没完成。
    let profile = await refresh();
    if (!profile) {
      for (const delay of [800, 2400]) {
        await new Promise((r) => setTimeout(r, delay));
        profile = await refresh();
        if (profile) break;
      }
    }
    if (!profile) {
      // 挑战在服务端已经被消费掉了 —— 留着这套 MFA 状态，用户点「重试」只会
      // 再提交一次同样的挑战，拿到「无效/已使用」，看起来像是自己输错了。
      // 会话其实已经建立，缺的只是档案：清掉流程、如实说明，让他重来一次登录即可。
      clearMfaFlow();
      setError(t("login.profileFetchFailed"));
      return;
    }
    await finish(identityGen);
  };

  /** 邮箱未验证：跳转门户「重发验证邮件」页（带上邮箱以预填表单）。 */
  const goVerifyEmail = (email?: unknown) => {
    const q = new URLSearchParams({ reason: "email_not_verified" });
    if (typeof email === "string" && email) q.set("email", email);
    if (oidcUid) q.set("oidc", oidcUid);
    navigate(`/verify-email?${q.toString()}`, { replace: true });
  };

  const handleSubmit = async (e: FormEvent) => {
    // 记下本次登录流程开始时的身份代次：请求在途时用户可能登出或换号，
    // 迟到的令牌不能装到已经换了人的会话上。
    const identityGen = getIdentityGen();
    e.preventDefault();
    if (busy) return;
    setError(null);
    setPendingDeletion(false);
    setPending("login");
    try {
      const body: Record<string, unknown> = { identifier, password };
      if (turnstileToken) body.turnstileToken = turnstileToken;
      const res = await api.post<LoginResult>("/v1/auth/login", body, {
        noAuth: true,
        // 响应会写会话 cookie：在途期间若发生认证边界必须掐掉它，见 authWrite。
        authWrite: true,
        // 锚就在上面几行同步取的，这道闸此刻恒真 —— 带上它是为了**统一不变量**：
        // 「每一个 authWrite 都随身带着自己的身份锚」。哪天有人把取锚那行往上挪
        // （挪进 useMemo、挪到组件顶层、挪进某个 hook），窗口就出现了，
        // 而那时不会有人记得回来补这个参数。
        requireIdentityGen: identityGen,
      });
      if (!res.ok) {
        if (res.error.code === "EMAIL_NOT_VERIFIED") {
          goVerifyEmail(res.error.data?.email);
          return;
        }
        // 账户在注销冷静期：**必须给出可点的入口**。
        // 只显示一句「请先撤销注销」而不给路径，等于告诉用户「你有救，但我不告诉你怎么救」——
        // 撤销页是未登录可访问的，登录被拒的人恰恰只能从这里进去。
        if (res.error.code === "ACCOUNT_PENDING_DELETION") {
          setPendingDeletion(true);
          setError(res.error.message);
          return;
        }
        if (res.error.code === "CAPTCHA_REQUIRED" || res.error.code === "CAPTCHA_FAILED") {
          setCaptchaError(true);
          return;
        }
        setError(res.error.message);
        return;
      }
      // 2xx 也可能整个没有 data（网关吐了个空壳 200）。直接解引用会抛 TypeError，
      // 用户看不到任何反馈。归到与「协议异常」同一条路径。
      if (!res.data) {
        setError(t("login.identityChanged"));
        return;
      }
      if (res.data.mfaRequired) {
        if (!res.data.mfaChallengeToken) {
          // 服务端声明需要 MFA 却未下发挑战令牌：显式报错，而非静默停留。
          setError(t("login.mfaChallengeMissing"));
          return;
        }
        // 与交接路径同样的校验：非数组会在后面 `.length` / `.includes()` 处抛 TypeError，
        // 而那时挑战已经签发出去了，页面却没有任何可操作的恢复路径。
        // 字段缺失按空数组兼容（后端可能确实没有可选方式），但类型不对必须 fail closed。
        const methods = res.data.availableMethods;
        if (methods !== undefined && !Array.isArray(methods)) {
          setError(t("login.identityChanged"));
          return;
        }
        mfaGenRef.current = identityGen;
        setMfaToken(res.data.mfaChallengeToken);
        setMfaMethods(methods ?? []);
        setMfaPasskey(res.data.passkey?.publicKey ?? null);
        setMfaRecoveryMode(false);
        return;
      }
      await onTokens(res.data, identityGen);
    } finally {
      setPending(null);
    }
  };

  const handleMfa = async (e: FormEvent) => {
    // 用**挑战签发时**的身份代次，不是此刻的（见 mfaGenRef）。
    const identityGen = mfaGenRef.current ?? getIdentityGen();
    e.preventDefault();
    if (busy) return;
    setError(null);
    setPendingDeletion(false);
    setPending("mfa");
    try {
      const res = await api.post<LoginResult>(
        "/v1/auth/mfa/totp/verify",
        { mfaChallengeToken: mfaToken, code: mfaCode },
        // 二次验证表单会在页面上停留很久（用户去翻验证码）。
        // 期间别的标签页换了号的话，这一发根本不该出门 —— 见 requireIdentityGen。
        { noAuth: true, authWrite: true, requireIdentityGen: identityGen },
      );
      if (!res.ok) {
        if (res.error.code === "EMAIL_NOT_VERIFIED") {
          goVerifyEmail(res.error.data?.email);
          return;
        }
        setError(res.error.message);
        return;
      }
      await onTokens(res.data, identityGen);
    } finally {
      setPending(null);
    }
  };

  /** 密码通过后以 Passkey 完成二次验证（仅有 Passkey / 或与 TOTP 并存时可选）。 */
  const handleMfaPasskey = async () => {
    // 用**挑战签发时**的身份代次，不是此刻的（见 mfaGenRef）。
    const identityGen = mfaGenRef.current ?? getIdentityGen();
    if (busy || !mfaToken || !mfaPasskey) return;
    setError(null);
    setPendingDeletion(false);
    setPending("mfaPasskey");
    try {
      const credential = await performAssertion(
        mfaPasskey as Parameters<typeof performAssertion>[0],
      );
      const res = await api.post<LoginResult>(
        "/v1/auth/mfa/passkey/verify",
        { mfaChallengeToken: mfaToken, credential },
        { noAuth: true, authWrite: true, requireIdentityGen: identityGen },
      );
      if (!res.ok) {
        if (res.error.code === "EMAIL_NOT_VERIFIED") {
          goVerifyEmail(res.error.data?.email);
          return;
        }
        setError(res.error.message);
        return;
      }
      await onTokens(res.data, identityGen);
    } catch (err) {
      if ((err as DOMException)?.name !== "NotAllowedError") setError(t("login.passkeyFailed"));
    } finally {
      setPending(null);
    }
  };

  /**
   * 可用的第三方登录方式，由后端 `/v1/auth/oauth/providers` 决定。
   *
   * 原先 GitHub / X 两个按钮是写死的，于是统一身份虽然早就是注册表里的 provider、
   * 后端也支持它走登录流，登录页却没有入口 —— 工作人员只能先用密码登进来。
   * 改由后端给列表还顺带解决了「未配置的提供商不该显示」：按钮点了必然报错的话，
   * 不如根本不画出来。
   */
  const [providers, setProviders] = useState<OAuthProviderInfo[]>([]);
  useEffect(() => {
    void (async () => {
      const res = await api.get<{ providers: OAuthProviderInfo[] }>(
        "/v1/auth/oauth/providers",
        { noAuth: true },
      );
      // 同样要校验形状：不是数组就当作没取到（下面那条注释说的退化路径），
      // 而不是让 `res.data.providers` 在 effect 里抛异常。
      if (res.ok && Array.isArray(res.data?.providers)) setProviders(res.data.providers);
      // 取不到就退化为「只有密码 / 通行密钥」，不阻塞登录。
    })();
  }, []);

  const startOAuth = async (provider: string) => {
    if (busy) return;
    setError(null);
    setPendingDeletion(false);
    setPending(provider);
    const next = oidcUid ? `/login?oidc=${encodeURIComponent(oidcUid)}` : redirectTo;
    // try/catch:api.get 若因异常(如 2xx 空/非法响应体解析失败)reject,必须复位 pending,
    // 否则 busy 恒为 true、所有登录入口被永久禁用且无反馈,只能刷新页面。
    try {
      const res = await api.get<{ authorizationUrl: string }>(
        `/v1/auth/oauth/${provider}/start?redirectAfter=${encodeURIComponent(next)}`,
        { noAuth: true },
      );
      // 跳转地址必须是**非空字符串**。只判 truthy 的话，`redirectTo: {}` 会一路走到
      // `location.href = {}`，浏览器把它转成字符串 "[object Object]" 当相对路径跳过去 ——
      // 用户落在一个 404，而屏幕上没有任何东西说明刚才发生了什么。
      if (res.ok && isNonEmptyString(res.data?.authorizationUrl)) {
        // 保持 pending 直到整页跳转，避免离开前按钮短暂恢复可点。
        window.location.href = res.data.authorizationUrl;
        return;
      }
      setError(res.ok ? t("error.generic") : res.error.message);
      setPending(null);
    } catch {
      setError(t("error.generic"));
      setPending(null);
    }
  };

  const loginWithPasskey = async () => {
    // 记下本次登录流程开始时的身份代次：请求在途时用户可能登出或换号，
    // 迟到的令牌不能装到已经换了人的会话上。
    const identityGen = getIdentityGen();
    if (busy) return;
    setError(null);
    setPendingDeletion(false);
    setPending("passkey");
    try {
      const start = await api.post<{ challengeId: string; publicKey: Parameters<typeof performAssertion>[0] }>(
        "/v1/auth/passkey/login/start",
        identifier ? { identifier } : {},
        { noAuth: true },
      );
      if (!start.ok) {
        setError(start.error.message);
        return;
      }
      const credential = await performAssertion(start.data.publicKey);
      const finishRes = await api.post<LoginResult>(
        "/v1/auth/passkey/login/finish",
        { challengeId: start.data.challengeId, credential },
        { noAuth: true, authWrite: true, requireIdentityGen: identityGen },
      );
      if (!finishRes.ok) {
        if (finishRes.error.code === "EMAIL_NOT_VERIFIED") {
          goVerifyEmail(finishRes.error.data?.email);
          return;
        }
        setError(finishRes.error.message);
        return;
      }
      await onTokens(finishRes.data, identityGen);
    } catch (err) {
      if ((err as DOMException)?.name !== "NotAllowedError") setError(t("login.passkeyFailed"));
    } finally {
      setPending(null);
    }
  };

  // 已登录且非 OIDC 交互：上方 effect 即将跳转，不再闪现登录表单。
  // **但有待处理的二次验证交接时不能返回空**：那时上面的跳转 effect 已经让路，
  // 这里再返回 null 就是一片永久空白 —— 用户既看不到二次验证界面，也走不下去。
  // 两处的让路条件必须一致。
  // `!error`：有错要说时不能返回空 —— 那会得到一个**彻底空白**的页面，
  // 既没有错误、没有重试入口，也没有登录表单。
  if (user && !oidcUid && !error && !handoffPending && !mfaToken && !handoffFailed) return null;

  /**
   * 会话尚未问出结果时**绝不能画登录表单**。
   *
   * 这正是「OAuth 登录先跳到 Pass 登录页、过一会才反应过来已经登录」的直接来源：
   * 旧代码只看 `user`，而 `user === null` 在启动阶段的真实含义是「还不知道」。
   * 于是已登录用户会先看到一整屏登录表单，几百毫秒后才被跳走 —— 界面明确地
   * 传达了一件假事（「你需要重新登录」）。
   *
   * 两种等待文案分开：带交互 uid（或有身份提示）时说的是「就要跳转了」，
   * 没有任何依据时才说「正在检查登录状态」。
   */
  // ⚠️ **终态必须排在所有 loading 门控之前。**
  // 排在后面的话，`status === "unknown"` 或「已登录 + 有 oidcUid」这两个加载屏会先命中，
  // 把错误说明与重试入口整个盖住 —— 用户对着一个永远转圈的页面，既不知道发生了什么，
  // 也没有下一步可点。
  // 交互续跑失败：给出说明与出路，而不是把人静默送去账户中心。
  if (interactionFailed) {
    return (
      <StatusScreen
        kind="error"
        title={t("login.interactionFailedTitle")}
        description={t("login.interactionFailedDesc")}
        actions={[{ label: t("account.title"), to: "/account" }]}
      />
    );
  }

  // 交互续跑撞上瞬态错误：交互多半还有效，给说明和重试，别继续假装在跳转。
  if (interactionRetryable) {
    return (
      <StatusScreen
        kind="error"
        title={t("login.interactionRetryableTitle")}
        description={t("login.interactionRetryable")}
        actions={[
          {
            label: t("mfa.done.retry"),
            onClick: () => {
              setInteractionRetryable(false);
              void finish(getIdentityGen());
            },
          },
          { label: t("account.title"), variant: "ghost" as const, to: "/account" },
        ]}
      />
    );
  }

  // `!error`：有话要对用户说的时候就别再画加载屏了 —— 否则错误文案会被整个盖住，
  // 页面看起来只是一直在转圈。
  if (status === "unknown" && !error && !handoffPending && !mfaToken && !handoffFailed) {
    return (
      <StatusScreen
        kind="loading"
        title={oidcUid || hint ? t("login.continuing") : t("login.checkingSession")}
      />
    );
  }

  // 第三方登录带回了二次验证交接、但挑战还没取回来（handoffPending 且尚无 mfaToken）：
  // 这时**同样不能画密码登录表单**。用户刚在 GitHub/统一身份那边验完，
  // 眼前突然出现一个要密码的表单，读起来就是「刚才那一步白做了」。
  if (handoffPending && !mfaToken) {
    return <StatusScreen kind="loading" title={t("login.continuing")} />;
  }

  // 已登录 + 带交互 uid：上方 effect 正在续跑 OIDC 交互，马上就会整页跳走。
  // 这里同样不能画表单 —— 那一瞬间的表单会让人以为「又要登录一次」。
  if (user && oidcUid && !error && !handoffPending && !mfaToken && !handoffFailed) {
    return <StatusScreen kind="loading" title={t("login.continuing")} />;
  }

  return (
    <CenteredCard>
      <PageHeader align="center" title={oidcUid ? t("login.oidcTitle") : t("login.title")} />

      {showSessionExpired && <Alert tone="error">{t("login.sessionExpired")}</Alert>}
      {error && (
        <Alert tone="error">
          {error}
          {pendingDeletion && (
            <div className={authStyles.aside}>
              <Link to="/account/cancel-deletion">{t("cancelDeletion.entry")}</Link>
            </div>
          )}
        </Alert>
      )}

      {!mfaToken ? (
        <>
          <form className={authStyles.form} onSubmit={handleSubmit}>
            <TextField
              label={t("login.identifier")}
              type="text"
              autoComplete="username"
              autoFocus
              placeholder={t("login.identifierPlaceholder")}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
            <div className={authStyles.fieldGroup}>
              <TextField
                label={t("login.password")}
                type="password"
                autoComplete="current-password"
                placeholder={t("login.passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <div className={authStyles.forgotRow}>
                <Link to="/password/forgot" className={authStyles.forgotLink}>
                  {t("login.forgotPassword")}
                </Link>
              </div>
            </div>
            {import.meta.env.VITE_TURNSTILE_SITE_KEY && (
              <div className={authStyles.fieldGroup}>
                {captchaError && <Alert tone="error">{t("login.captchaRequired")}</Alert>}
                <TurnstileWidget
                  onToken={(token) => {
                    setTurnstileToken(token);
                    setCaptchaError(false);
                  }}
                  onError={() => setCaptchaError(true)}
                />
              </div>
            )}
            <Button type="submit" variant="primary" fullWidth loading={pending === "login"} disabled={busy}>
              {t("login.submit")}
            </Button>
          </form>

          {/* 提供商由后端按配置下发，可能一个都没有（未配置 / 接口失败）；
              此时连同 passkey 一起判空，否则会剩一条什么都没有的分隔线。 */}
          {(providers.length > 0 || isWebAuthnSupported()) && (
            <div className={authStyles.divider}>{t("login.orContinueWith")}</div>
          )}

          <div className={authStyles.oauthRow}>
            {providers.map((p) => (
              <Button
                key={p.provider}
                variant="ghost"
                className={authStyles.oauthBtn}
                fullWidth
                iconLeft={providerIcon(p.provider)}
                loading={pending === p.provider}
                disabled={busy}
                onClick={() => void startOAuth(p.provider)}
              >
                {/* 已知的三个用本地化文案，其余回落后端给的 label。 */}
                {p.provider === "github"
                  ? t("login.github")
                  : p.provider === "x"
                    ? t("login.x")
                    : p.provider === "iam"
                      ? t("login.iam")
                      : p.label}
              </Button>
            ))}
            {isWebAuthnSupported() && (
              <Button
                variant="ghost"
                className={authStyles.oauthBtn}
                fullWidth
                iconLeft={<FingerIcon />}
                loading={pending === "passkey"}
                disabled={busy}
                onClick={() => void loginWithPasskey()}
              >
                {t("login.passkey")}
              </Button>
            )}
          </div>

          <p className={authStyles.aside}>
            {t("login.noAccount")}{" "}
            <Link
              to={oidcUid ? `/register?oidc=${encodeURIComponent(oidcUid)}` : "/register"}
              className={authStyles.link}
            >
              {t("login.register")}
            </Link>
          </p>

          {/*
            这里曾经有一个指向 /admin 的「管理员入口」文字链接 —— 但登录页上的用户按定义
            还没登录，点进去只会被控制台外壳打回登录页，是条死路。
            管理员没有独立登录流程：他就是普通 Pass 用户，用上面任一方式（含「统一身份」
            这颗按钮）登录即可；登录后 AppNav 会按 IAM 权限自动显示控制台入口。
          */}
        </>
      ) : (
        (() => {
          const legacy = mfaMethods.length === 0; // 旧契约:未下发 availableMethods
          const hasTotp = mfaMethods.includes("totp");
          // Passkey 二次验证需环境支持 WebAuthn(与独立 Passkey 登录按钮一致),否则展示的按钮点了必失败。
          const hasPasskey = isWebAuthnSupported() && mfaPasskey !== null && mfaMethods.includes("passkey");
          const hasRecovery = mfaMethods.includes("recovery_code");
          // 该账户把登录第二因素交给了统一身份接管：本地 passkey / TOTP 在登录路径上
          // 已被后端拒绝，这里只能引导去 IAM 完成；恢复码仍是可用的兜底。
          const hasIam = mfaMethods.includes("iam");
          // 无 availableMethods（旧契约兜底）时默认展示验证码输入(该输入兼容恢复码,见下)。
          const hasCode = hasTotp || legacy;

          /**
            * 跳去统一身份完成第二因素。
            * 整页跳转会清空 React 状态，所以挑战令牌与 verificationId 必须先落 sessionStorage，
            * 由 /auth/mfa/done 回来后据此向后端回查权威结果。
            */
          const startIamMfa = async () => {
            if (!mfaToken) return;
            setPending("mfa");
            setError(null);
            setPendingDeletion(false);
            const res = await api.post<{ verificationId: string; verifyUrl: string; expiresAt: number }>(
              "/v1/auth/mfa/iam/start",
              { mfaChallengeToken: mfaToken },
              { noAuth: true },
            );
            setPending(null);
            if (!res.ok) {
              const key = `authError.${res.error.code}`;
              const localized = t(key);
              setError(localized === key ? res.error.message : localized);
              return;
            }
            // 2xx ≠ 响应成形。少了 verifyUrl 就会 `location.href = undefined`
            //（浏览器当成相对路径，跳到一个不存在的页面）；少了 verificationId
            // 则是带着空 id 回来，向后端回查权威结果时必然失败 —— 两种都得在跳走之前拦下。
            if (!hasStringFields(res.data, ["verificationId", "verifyUrl"])) {
              setError(t("authError.MALFORMED_RESPONSE"));
              return;
            }
            // 存不下就别跳：验证做完回来也找不到交接，等于让用户白跑一趟统一身份。
            const saved = saveIamMfaHandoff({
              mfaChallengeToken: mfaToken,
              verificationId: res.data.verificationId,
              redirect: redirectTo,
              oidc: oidcUid ?? undefined,
              // 出发时这个浏览器是谁。回来时要拿它比对，见 IamMfaHandoff.priorUserId。
              // 一般是 null（正在登录，还没有身份）；重新认证的场景下是当前用户。
              priorUserId: user?.id ?? null,
              // 出去这一趟期间若有人登出，回来时浏览器是 anonymous ——
              // 那时 priorUserId 那道判断恒为 false，拦不住。见 signoutEpoch.ts。
              priorSignoutEpoch: readSignoutEpoch(),
            });
            if (!saved) {
              setError(t("callback.handoffUnavailable"));
              return;
            }
            window.location.href = res.data.verifyUrl;
          };

          const back = () => {
            setMfaToken(null);
            setMfaCode("");
            setMfaMethods([]);
            setMfaPasskey(null);
            setMfaRecoveryMode(false);
            setError(null);
            setPendingDeletion(false);
          };

          // 回退模式：恢复码专用界面（正常方式不可用时的兜底）。
          if (mfaRecoveryMode) {
            return (
              <form className={authStyles.form} onSubmit={handleMfa}>
                <p className={authStyles.aside}>{t("login.mfaRecoveryPrompt")}</p>
                <TextField
                  label={t("login.mfaRecoveryCode")}
                  inputMode="text"
                  autoComplete="one-time-code"
                  autoFocus
                  className={`${authStyles.mfaCode} ${authStyles.mfaCodeLong}`}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  required
                />
                <Button type="submit" variant="primary" fullWidth loading={pending === "mfa"} disabled={busy}>
                  {t("login.mfaSubmit")}
                </Button>
                <button
                  type="button"
                  className={authStyles.mfaAltLink}
                  disabled={busy}
                  onClick={() => { setMfaRecoveryMode(false); setMfaCode(""); setError(null); }}
                >
                  {t("login.mfaBackToOther")}
                </button>
                <Button type="button" variant="ghost" fullWidth disabled={busy} onClick={back}>
                  {t("common.back")}
                </Button>
              </form>
            );
          }

          // 统一身份接管：不展示本地 passkey / 验证码入口（后端会直接 409），
          // 只给「去统一身份验证」+ 恢复码兜底。
          if (hasIam) {
            return (
              <div className={authStyles.form}>
                <p className={authStyles.aside}>{t("login.mfaIamPrompt")}</p>
                <Button
                  type="button"
                  variant="primary"
                  fullWidth
                  loading={pending === "mfa"}
                  disabled={busy}
                  onClick={() => void startIamMfa()}
                >
                  {t("login.mfaIamGo")}
                </Button>
                {hasRecovery && (
                  <button
                    type="button"
                    className={authStyles.mfaAltLink}
                    disabled={busy}
                    onClick={() => { setMfaRecoveryMode(true); setMfaCode(""); setError(null); }}
                  >
                    {t("login.mfaUseRecovery")}
                  </button>
                )}
                <Button type="button" variant="ghost" fullWidth disabled={busy} onClick={back}>
                  {t("common.back")}
                </Button>
              </div>
            );
          }

          // 正常模式：Passkey 与验证码为同级主方式并列展示；恢复码为回退链接。
          const prompt =
            hasCode && hasPasskey
              ? t("login.mfaChoosePrompt")
              : hasPasskey
                ? t("login.mfaPasskeyPrompt")
                : t("login.mfaPrompt");

          return (
            <form className={authStyles.form} onSubmit={handleMfa}>
              <p className={authStyles.aside}>{prompt}</p>

              {/* 验证器验证码：与 Passkey 同级的主方式。 */}
              {hasCode && (
                <>
                  <TextField
                    label={t("login.mfaCode")}
                    // 旧契约兜底:此字段需兼容恢复码(更长),故不限 6 位数字、字距随长度降级。
                    inputMode={legacy ? "text" : "numeric"}
                    maxLength={legacy ? undefined : 6}
                    autoComplete="one-time-code"
                    autoFocus
                    className={
                      legacy && mfaCode.length > 8
                        ? `${authStyles.mfaCode} ${authStyles.mfaCodeLong}`
                        : authStyles.mfaCode
                    }
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    required
                  />
                  <Button type="submit" variant="primary" fullWidth loading={pending === "mfa"} disabled={busy}>
                    {t("login.mfaSubmit")}
                  </Button>
                </>
              )}

              {hasCode && hasPasskey && <div className={authStyles.divider}>{t("login.mfaOr")}</div>}

              {/* Passkey：与验证码同级的主方式（无验证码时为唯一主操作）。 */}
              {hasPasskey && (
                <Button
                  type="button"
                  variant={hasCode ? "secondary" : "primary"}
                  fullWidth
                  iconLeft={<FingerIcon />}
                  loading={pending === "mfaPasskey"}
                  disabled={busy}
                  onClick={() => void handleMfaPasskey()}
                >
                  {t("login.mfaPasskey")}
                </Button>
              )}

              {/* 恢复码：回退策略，次要链接。 */}
              {hasRecovery && (
                <button
                  type="button"
                  className={authStyles.mfaAltLink}
                  disabled={busy}
                  onClick={() => { setMfaRecoveryMode(true); setMfaCode(""); setError(null); }}
                >
                  {t("login.mfaUseRecovery")}
                </button>
              )}

              <Button type="button" variant="ghost" fullWidth disabled={busy} onClick={back}>
                {t("common.back")}
              </Button>
            </form>
          );
        })()
      )}
    </CenteredCard>
  );
};

export default LoginPage;
