import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, getIdentityGen, installAccessToken } from "../api/client";
import type { LoginResult } from "../api/types";
import { useSession } from "../context/SessionContext";
import { readSignoutEpoch } from "../context/signoutEpoch";
import { sanitizeRedirect } from "../utils/url";
import { usePageTitle } from "../utils/usePageTitle";
import {
  CenteredCard,
  PageHeader,
  StatusScreen,
  TextField,
  AdminButton as Button,
  Alert,
} from "../components/ui";
import authStyles from "./Auth.module.css";

// ============================================================================
// 登录第二因素由统一身份接管时的交接数据
//
// 流程：登录页拿到 mfaRequired + availableMethods 含 'iam' → POST /v1/auth/mfa/iam/start
// → 整页跳到 IAM 的验证页 → IAM 验证完回跳本页（?verification_id=&status=）。
//
// 整页跳转会清空 React 状态，而回查 POST /v1/auth/mfa/iam/verify 必须带上
// mfaChallengeToken —— 它只在登录页的内存里。因此跳转前必须把它落到 sessionStorage。
// 用 sessionStorage 而非 localStorage：挑战是一次性的，关掉标签就该作废。
// ============================================================================

export const IAM_MFA_HANDOFF_KEY = "pass_iam_mfa_handoff";

export interface IamMfaHandoff {
  /** 本次登录的 MFA 挑战令牌（后端回查与恢复码兜底都要用它）。 */
  mfaChallengeToken: string;
  /** /mfa/iam/start 返回的验证请求 id，仅用于让后端比对，不作信任凭据。 */
  verificationId?: string;
  /** 登录成功后的站内去向（使用时仍会再净化一次）。 */
  redirect?: string;
  /** OIDC 交互 uid：有值时回登录页由既有交互续跑逻辑接手。 */
  oidc?: string;
  /**
   * 跳去统一身份**之前**，这个浏览器登录着谁（没登录则不写）。
   *
   * 身份代次（`api/client.ts`）是页面内存变量，而统一身份验证是**整页跳转**出去再回来：
   * 回来时 SPA 重新加载，代次从 0 重新开始 —— 也就是说跨过这一跳之后，
   * 「期间有没有换过人」这件事在内存里没有任何痕迹，`requireIdentityGen` 形同虚设。
   *
   * 于是把「出发时这个浏览器是谁」写进交接数据里（sessionStorage 随标签页存活，
   * 跨得过整页导航）。回来时拿它和**此刻**浏览器的真实身份比一比：
   * 出发时没登录、回来却已经是 A 了，说明期间另一个标签页登录了 A ——
   * 这条属于上一次尝试的挑战不能再完成，否则它会把 A 的会话覆盖成挑战里那个人。
   */
  priorUserId?: string | null;
  /**
   * 跳去统一身份**之前**的登出代次（见 `signoutEpoch.ts`）。
   *
   * `priorUserId` 只挡得住「回来时浏览器是**另一个人**」；挡不住「回来时浏览器
   * 是**没有人**」—— 而那正是「出去这一趟期间用户在别的标签页登出了」的样子，
   * 与「本来就没登录、正在走登录流程」长得一模一样。
   * 登出代次把这两种情况分开：它变了，说明这中间确实有人登出过。
   */
  priorSignoutEpoch?: string | null;
}

/**
 * 落地统一身份交接数据，**返回是否真的存下了**。
 *
 * 存不下不会造成安全问题（回来后本页找不到交接，进 `missing` 终态，
 * 引导重新登录 —— 方向是安全的），但会让用户白跑一趟统一身份：
 * 验证做完了，回来却被告知要重新登录。调用方应当据此在**跳转之前**就说清楚。
 */
export function saveIamMfaHandoff(handoff: IamMfaHandoff): boolean {
  try {
    sessionStorage.setItem(IAM_MFA_HANDOFF_KEY, JSON.stringify(handoff));
    return true;
  } catch {
    return false;
  }
}

/** 逐字段校验后再返回：存储可能被手改，形状不对就当没有。 */
export function readIamMfaHandoff(): IamMfaHandoff | null {
  try {
    const raw = sessionStorage.getItem(IAM_MFA_HANDOFF_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const o = parsed as Record<string, unknown>;
    if (typeof o.mfaChallengeToken !== "string" || !o.mfaChallengeToken) return null;
    return {
      mfaChallengeToken: o.mfaChallengeToken,
      verificationId: typeof o.verificationId === "string" ? o.verificationId : undefined,
      redirect: typeof o.redirect === "string" ? o.redirect : undefined,
      oidc: typeof o.oidc === "string" ? o.oidc : undefined,
      priorUserId: typeof o.priorUserId === "string" ? o.priorUserId : null,
      priorSignoutEpoch:
        typeof o.priorSignoutEpoch === "string" || o.priorSignoutEpoch === null
          ? o.priorSignoutEpoch
          : undefined,
    };
  } catch {
    return null;
  }
}

export function clearIamMfaHandoff(): void {
  try {
    sessionStorage.removeItem(IAM_MFA_HANDOFF_KEY);
  } catch {
    /* noop */
  }
}

// ─── 轮询节奏 ────────────────────────────────────────────────────

/** 2 秒一次：与后端 30 次/分的限流留出余量，撞到限流也只退避不失败。 */
const POLL_INTERVAL_MS = 2000;

/**
 * 等会话状态落定的上限。
 *
 * 落不定就不能动手（见轮询 effect 里的说明），但也不能无限等 ——
 * 启动探测在连续瞬态失败时会**故意**停在 unknown，那时这一页就永远转圈了。
 */
const SESSION_SETTLE_BUDGET_MS = 15000;

/**
 * 单次请求的硬超时。
 *
 * `fetch` 没有超时：服务端不回、或中间设备默默吞掉响应，这个 await 就一直挂着 ——
 * 轮询循环「每轮开始前检查总预算」的写法根本走不到检查那一行，
 * 于是 120 秒的总预算也不会触发，页面既不超时也不给恢复码/重新登录的出路。
 * 定在 20 秒：比一次正常回查宽裕得多，又远短于总预算，挂住时还能重试几轮。
 */
const REQUEST_TIMEOUT_MS = 20000;
/** 总预算约 2 分钟；超出即判超时并给出路，不无限转圈。 */
const POLL_BUDGET_MS = 120_000;
/** 限流 / 网络抖动时的退避。 */
const BACKOFF_MS = 5000;

/** 回跳 URL 里 status 的「已通过」取值域；其余值只当提示，权威结果一律以后端回查为准。 */
const OK_STATUSES = new Set(["verified", "success", "approved", "ok", "completed"]);

/** POST /v1/auth/mfa/iam/verify：未完成时 200 {verified:false}，完成时返回登录结果。 */
type IamVerifyResult = LoginResult & { verified?: boolean; status?: string };

type Phase = "polling" | "landing" | "missing" | "failed" | "timeout" | "recovery";

/**
 * /auth/mfa/done —— 统一身份完成第二因素后的落地页。
 *
 * 三条铁律：
 * 1. 回跳参数（verification_id / status）只作提示，绝不可作信任凭据；真正的结论
 *    来自 POST /v1/auth/mfa/iam/verify 的后端回查，且回查用的是交接数据里的
 *    verificationId（后端还会再与挑战里记着的那一个比对）。
 * 2. 后端未完成时返回 200 {verified:false}，需要轮询——有节制地轮询。
 * 3. 失败/超时必须给出路：重试，或改用恢复码登录（恢复码是接管开启时唯一的破窗通道）。
 */
const AuthMfaDonePage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, status, refresh } = useSession();
  const [params] = useSearchParams();

  usePageTitle(t("mfa.done.title"));

  // 只在挂载时读一次：轮询期间不该被别处改写。
  const [handoff] = useState<IamMfaHandoff | null>(() => readIamMfaHandoff());
  const [phase, setPhase] = useState<Phase>("polling");
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);
  /**
   * 整条落地流程的身份代次，**挂载时锚定一次**。
   *
   * 轮询与恢复码两条路都用它。恢复码是在页面上停留一段时间后才提交的，
   * 那时若重读当前代次，就把「这期间发生的登出/换号」一起锚了进去 ——
   * 保护形同虚设。代次必须锚在流程开始的那一刻。
   */
  const flowGenRef = useRef(getIdentityGen());
  /**
   * 本页在途的写会话请求（IAM 回查 / 恢复码验证）的中止句柄。
   *
   * 用户点「返回登录」或直接离开页面时，这些请求还在飞。它们**验证成功**的话，
   * 后端照样会写下 refresh cookie 与 `_session` —— 而用户明明已经放弃了这条流程。
   * `alive = false` 只挡得住响应体，挡不住浏览器处理 `Set-Cookie`。
   * 给本页自己的 controller，卸载时一并掐掉。
   */
  const pageAbortRef = useRef<AbortController | null>(null);
  // controller **在挂载 effect 里建、在卸载时连同 ref 一起丢掉**。
  //
  // 上一版是在 render 阶段建、只建一次（`if (ref.current === null)`），卸载时 abort ——
  // 在 StrictMode 下这是致命的：React 会「挂载 → 卸载 → 再挂载」，
  // 第一次卸载把 controller abort 了，第二次挂载因为 ref 非空而复用同一个，
  // 于是本页所有请求一发出就带着 `aborted=true` 的 signal，立刻返回
  // `auth_boundary_aborted` —— 页面误报「身份已变化」，二次验证根本做不下去。
  // 每次挂载都换一个新的，问题就不存在了。
  //
  // 这个 effect 必须**声明在轮询 effect 之前**：同一次提交里 effect 按声明顺序执行，
  // 轮询发请求时要能读到已经建好的 controller。
  useEffect(() => {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    pageAbortRef.current = controller;
    return () => {
      try {
        controller?.abort();
      } catch {
        /* noop */
      }
      // 只清自己那一份：卸载晚于下一次挂载时，别把新建的那个抹掉。
      if (pageAbortRef.current === controller) pageAbortRef.current = null;
    };
  }, []);
  /**
   * 跨过整页跳转的身份守卫：**出发时是谁 vs 此刻是谁**。
   *
   * `flowGenRef` 拦不住这一幕 —— 统一身份验证是整页跳转出去再回来，回来时 SPA
   * 重新加载，模块级的身份代次从 0 重新开始，锚和当前值又相等了。
   * 于是「出发前 T1 还没登录 → 跳出去期间 T2 在同一浏览器登录了 A → T1 回来」
   * 这条路上，属于上一次尝试的挑战会照常完成，把 A 的会话覆盖成挑战里那个人。
   *
   * sessionStorage 跨得过整页导航，所以把「出发时这个浏览器是谁」存了进去
   *（见 IamMfaHandoff.priorUserId），回来后与会话上下文落定的身份比对。
   *
   * 只在**此刻确实有一个不同的身份**时才拦：
   * - 此刻匿名 → 没有会被覆盖的东西，放行（这正是最常见的情形：登录途中被要求 MFA）。
   * - 此刻是同一个人 → 重新认证，放行。
   * - 此刻是另一个人 → 拦下，这条挑战属于上一次尝试。
   */
  const identityDrifted =
    handoff !== null && status === "authenticated" && !!user && user.id !== (handoff.priorUserId ?? null);
  /**
   * 出去这一趟期间，有人**登出**过。
   *
   * 与 `identityDrifted` 是两件事：那个问「现在是不是另一个人」，这个问
   * 「中间有没有人主动结束过一个身份」。登出之后浏览器是 anonymous，
   * `identityDrifted` 恒为 false —— 于是这笔挑战会照常完成、把用户又登了回去，
   * 而他刚刚明确点过「退出登录」。
   *
   * 交接数据里没记（旧版本留下的）就不拦：宁可放过，也不要把一笔正常的验证
   * 判成失败让用户白跑一趟。
   */
  const signedOutMeanwhile =
    handoff !== null &&
    handoff.priorSignoutEpoch !== undefined &&
    handoff.priorSignoutEpoch !== readSignoutEpoch();
  /** 令牌装上那一刻的身份代次。档案重试锚在它上面，见 retryProfile。 */
  const installedGenRef = useRef(0);
  /** 重试计数：递增即重跑轮询 effect。 */
  const [round, setRound] = useState(0);

  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);

  // IAM 回跳时自称的状态：只用来给一句提示，不参与任何判定。
  const hintedStatus = params.get("status");
  const hintedFailure = !!hintedStatus && !OK_STATUSES.has(hintedStatus.toLowerCase());

  /** 邮箱未验证：与登录页同一条出路（重发验证邮件）。 */
  const goVerifyEmail = useCallback(
    (email?: unknown) => {
      const q = new URLSearchParams({ reason: "email_not_verified" });
      if (typeof email === "string" && email) q.set("email", email);
      navigate(`/verify-email?${q.toString()}`, { replace: true });
    },
    [navigate],
  );

  /**
   * 把一条「已经在后端建好、但本页决定不要」的会话放弃掉。
   *
   * 走到这里说明后端**已经**验证通过了：新的 C 端会话建好了，refresh cookie 与
   * `_session` 也随响应头写进了浏览器 —— 拒装内存令牌撤不回这些。
   * 界面上是「不算数」，而浏览器手里握着一条活着的会话，
   * 随后的 `/oauth2/auth` 会拿它静默授权。
   *
   * 用的是 `/v1/auth/session/abandon` 而**不是** `/logout`：后者清的是浏览器级的
   * cookie，会把用户此刻可能正用着的**另一条**登录态一起砸掉。
   * 为了绕开那个副作用，这里先后写过四版守卫（内存有没有令牌 / 身份代次变没变 /
   * 挂载后装过令牌没有 / 当前 status 是不是 authenticated），每一版都是近似、
   * 每一版都被找出反例 —— 根子在于**拿一个浏览器级的操作去解决一个会话级的问题**。
   * 换成只吊销「这枚令牌自己那条会话」的端点之后，这个调用**永远是安全的**，
   * 守卫也就整个不需要了。
   *
   * SSO 不必显式销毁：绑定回查会因为该会话已吊销而判死它。
   */
  const revokeOrphanSession = useCallback(async (token: unknown) => {
    if (typeof token !== "string" || !token) return;
    const revoked = await api.post("/v1/auth/session/abandon", undefined, {
      noAuth: true,
      headers: { Authorization: `Bearer ${token}` },
    });
    // 尽力而为：失败了也只能如实记一笔 —— 那时会话确实还在，
    // 但用户至少不会以为自己还登录着。
    if (!revoked.ok) console.warn("[mfa] 未能放弃本页不要的那条会话:", revoked.error.code);
  }, []);

  /** 验证通过：落地会话并跳转，与登录页的成功路径一致。 */
  const land = useCallback(
    async (
      data: IamVerifyResult | undefined,
      epoch: number,
      priorSignoutEpoch?: string | null,
    ) => {
      clearIamMfaHandoff();
      // **落地之前再看一眼登出代次。**
      //
      // 发请求前那道判断只覆盖到发出的那一刻。验证在服务端成功、响应正在回来的路上时，
      // 用户完全可能在别的标签页点了退出 —— 广播还没送到，而这枚令牌马上就要装上。
      // 装上就等于「用户明确退出了，却被一个他早已放弃的流程登了回去」。
      // 这里读的是持久值，不依赖广播是否已经送达。
      if (priorSignoutEpoch !== undefined && priorSignoutEpoch !== readSignoutEpoch()) {
        // **光是不装令牌还不够。**
        //
        // 走到这里说明后端**已经**验证通过了：新的 C 端会话建好了，refresh cookie 与
        // `_session` 也随响应头写进了浏览器 —— 拒装内存令牌撤不回这些。
        // 界面上是「已登出」，而浏览器手里握着一条活着的会话，
        // 随后的 `/oauth2/auth` 会拿它静默授权。用户明确退出过，业务站却拿到了他。
        //
        // 所以要主动把这条刚出生的会话**放弃掉**（见 revokeOrphanSession —— 它调的是
        // 只吊销本令牌那条会话、不碰任何 cookie 的端点，因此没有任何前置条件）。
        await revokeOrphanSession(data?.accessToken);
        setFailure({ code: "IDENTITY_CHANGED", message: t("login.identityChanged") });
        setPhase("failed");
        return;
      }
      // 2xx 也可能整个没有 data（网关返回了个空壳 200）。直接解引用会抛 TypeError，
      // 而此刻交接数据已经清掉了 —— 页面会停在「正在完成登录」，没有任何出路。
      if (!data) {
        setFailure({ code: "TOKEN_MISSING", message: t("login.identityChanged") });
        setPhase("failed");
        return;
      }
      // 二次验证通过就必须拿到令牌。没拿到说明协议异常，绝不能拿浏览器里
      // 上一个人的旧令牌接着往下走 —— 那会以别人的身份完成这次登录。
      if (!data.accessToken) {
        setFailure({ code: "TOKEN_MISSING", message: t("login.identityChanged") });
        setPhase("failed");
        return;
      }
      // 带代次安装：回查往返期间用户可能已经登出或换号，迟到的令牌不能装到新会话上。
      // 装不上必须给出出路 —— 静默 return 会把页面永远停在「正在完成登录」。
      if (!installAccessToken(data.accessToken, epoch)) {
        // 拒装令牌**撤不回**已经随响应头写进浏览器的 refresh cookie 与 `_session` ——
        // 那条会话是活的，`/oauth2/auth` 会拿它静默授权。与「期间有人登出」那条路
        // 同样的处理：把它销掉（同样带守卫，见 revokeOrphanSession）。
        await revokeOrphanSession(data.accessToken);
        setFailure({ code: "IDENTITY_CHANGED", message: t("login.identityChanged") });
        setPhase("failed");
        return;
      }
      // 记在装上之后：`installAccessToken()` 检测到换人时会顺手提代次。
      installedGenRef.current = getIdentityGen();
      if ((await refresh()) === null) {
        setFailure({ code: "PROFILE_UNAVAILABLE", message: t("login.profileFetchFailed") });
        setPhase("failed");
        return;
      }
      if (handoff?.oidc) {
        // OIDC 交互的续跑（含 consent 分支）已在登录页实现，不在这里复制第二份：
        // 会话此刻已建立，登录页看到 user + oidc 会直接续跑，不再要求输密码。
        navigate(`/login?oidc=${encodeURIComponent(handoff.oidc)}`, { replace: true });
        return;
      }
      // mustChangePassword 为真时不做特判：账户中心顶部已有强制改密提示，
      // 这里硬拐弯反而会把用户原本要去的地方吞掉。
      navigate(sanitizeRedirect(handoff?.redirect, "/account"), { replace: true });
    },
    [handoff, navigate, refresh, revokeOrphanSession, t],
  );

  useEffect(() => {
    if (phase !== "polling") return;
    if (!handoff) {
      setPhase("missing");
      return;
    }
    // **会话状态没落定（unknown）之前一个请求都不发。**
    //
    // `identityDrifted` 要靠 `status`/`user` 才判得出来，而页面刚加载时它们是 unknown ——
    // 此时开跑等于在「还不知道这个浏览器是谁」的情况下就把挑战完成掉：
    // 后端写下挑战里那个人的 refresh cookie 与 `_session`，之后上下文才落定成另一个人。
    // effect 的 `alive` 只丢弃响应体，撤不回已经处理掉的 `Set-Cookie`。
    // 正常登录途中 `priorUserId` 恰好是 null，是最容易撞上这一幕的路径。
    //
    // 等待本身不会让用户干等：会话探测就在同时跑，落定后 `status` 变化会重跑本 effect。
    // 万一它始终落不定（网关连续抖动），下面另有一条超时闸把人放出去。
    if (status === "unknown") return;
    // 外跳期间浏览器换了人、或有人登出过：这条挑战属于那之前，不能再完成。
    if (identityDrifted || signedOutMeanwhile) {
      clearIamMfaHandoff();
      setFailure({ code: "IDENTITY_CHANGED", message: t("login.identityChanged") });
      setPhase("failed");
      return;
    }

    // 用整条流程的代次（挂载时锚定），轮询与恢复码共用一份 ——
    // 恢复码是在页面上停留一段时间后才提交的，那时重读当前代次，
    // 等于把「这期间发生的登出/换号」一起锚了进去，保护就此失效。
    //
    // 轮询期可能长达数分钟：记下开始时的身份代次，
    // 期间用户若在别处登出/换号，回查换来的令牌就不该再装上。
    //
    // 「外跳期间在别的标签页换了身份」这一段身份代次覆盖不到（跳转后它从 0 重新开始），
    // 由 `identityDrifted` 用交接数据里的 priorUserId 接手 —— 见它的说明。
    const epoch = flowGenRef.current;
    let alive = true;
    // **这一轮轮询自己的中止句柄。**
    //
    // 页面级的那个（pageAbortRef）只在离开页面时才 abort，管不了「还在这一页、
    // 但已经不轮询了」这种切换 —— 用户点「使用恢复码」时轮询 effect 会 cleanup，
    // 而那一发 IAM 回查还在飞。它在后端**验证成功**的话，挑战被消费掉、
    // C 会话建起来、refresh cookie 与 `_session` 一并写下；前端因为 `alive=false`
    // 丢掉了响应体，用户却在同一页提交恢复码 —— 用的是同一张已被消费的挑战，
    // 只会拿到 410「已失效」，看起来像是自己输错了。
    // 切走就掐掉它。
    const pollAbort = typeof AbortController !== "undefined" ? new AbortController() : null;
    const deadline = Date.now() + POLL_BUDGET_MS;
    // 卸载/重试时要能立刻唤醒挂在 sleep 上的循环，否则它会永远挂着不释放闭包。
    let wake: (() => void) | null = null;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        wake = resolve;
        timerRef.current = window.setTimeout(() => {
          wake = null;
          resolve();
        }, ms);
      });

    void (async () => {
      while (alive && Date.now() < deadline) {
        const body: Record<string, unknown> = { mfaChallengeToken: handoff.mfaChallengeToken };
        if (handoff.verificationId) body.verificationId = handoff.verificationId;
        const res = await api.post<IamVerifyResult>("/v1/auth/mfa/iam/verify", body, {
          noAuth: true,
          authWrite: true,
          // 轮询要跑好几分钟，两轮之间发生的身份边界必须挡住下一轮 ——
          // 否则后端验证通过、写下**旧身份**的 cookie，前端才在装令牌那一步拒绝。
          requireIdentityGen: epoch,
          timeoutMs: REQUEST_TIMEOUT_MS,
          signal: pollAbort?.signal ?? pageAbortRef.current?.signal,
        });
        if (!alive) {
          // 本轮的响应已经回来了，只是这个循环已经作废（用户切到恢复码、或离开了页面）。
          //
          // **响应体可以丢，会话不能丢着不管。** 它若是成功的，后端已经建好了 C 会话、
          // refresh cookie 与 `_session` 也随响应头进了浏览器 —— 而用户已经放弃这条流程。
          // 不销掉的话，他放弃了却还是被登了进去，随后的 `/oauth2/auth` 会拿它静默授权。
          // 守卫在 revokeOrphanSession 里：此刻若有活着的登录态就不动它。
          if (res.ok) await revokeOrphanSession(res.data?.accessToken);
          return;
        }

        if (res.ok) {
          if (res.data?.accessToken) {
            setPhase("landing");
            await land(res.data, epoch, handoff.priorSignoutEpoch);
            return;
          }
          // **只有后端明确说「还没完成」才继续等。**
          //
          // 原先是「没拿到令牌就当作还在等」—— 那把「2xx 但响应不对劲」
          //（`{verified:true}` 却没有令牌、空对象、被代理截断）也算进了「等待」。
          // 而那种情况下挑战很可能**已经在服务端被消费掉了**，再等只是白等到超时，
          // 用户要过整整两分钟才看到失败，且看到的还是「超时」这种误导性结论。
          if (res.data?.verified === false) {
            await sleep(POLL_INTERVAL_MS);
            continue;
          }
          setFailure({ code: "TOKEN_MISSING", message: t("login.identityChanged") });
          setPhase("failed");
          return;
        }

        if (res.error.code === "EMAIL_NOT_VERIFIED") {
          goVerifyEmail(res.error.data?.email);
          return;
        }
        // 被认证边界掐掉（已发出的被 abort → auth_boundary_aborted；
        // 还没发的被发起侧的闸拦下 → auth_epoch_stale）都是**结论**，不是抖动：
        // 别的标签页已经改变了这个浏览器的登录态，
        // 本页锚定的身份代次也随之作废。两者的 status 都是 0，会掉进下面那条
        // 「网络抖动」分支里 —— 继续轮询只会白等到 120 秒超时，
        // 而且此后每一次重试/恢复码提交都用着那个旧代次，令牌**永远**装不上 ——
        // 用户对着一个转圈的页面，看不到「登录状态变了，请重新登录」这句该说的话。
        if (res.error.code === "auth_boundary_aborted" || res.error.code === "auth_epoch_stale") {
          setFailure({ code: "IDENTITY_CHANGED", message: t("login.identityChanged") });
          setPhase("failed");
          return;
        }
        // 网络抖动(status 0，含单次请求超时)与轮询限流(429)都不是结论，退避后继续。
        // 单次超时之所以能落到这里，正是因为它**没有**挂死在 await 上 ——
        // 有了硬超时，总预算才真正生效。
        if (res.status === 0 || res.status === 429) {
          await sleep(BACKOFF_MS);
          continue;
        }
        setFailure({ code: res.error.code, message: res.error.message });
        setPhase("failed");
        return;
      }
      if (alive) setPhase("timeout");
    })();

    return () => {
      alive = false;
      try {
        pollAbort?.abort();
      } catch {
        /* noop */
      }
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      // 唤醒后循环立刻走到 !alive 分支退出，闭包随之释放。
      wake?.();
    };
  }, [
    phase,
    round,
    handoff,
    land,
    goVerifyEmail,
    identityDrifted,
    signedOutMeanwhile,
    revokeOrphanSession,
    status,
    t,
  ]);

  // 会话状态迟迟落不定时的出路。
  //
  // 上面的闸让轮询在 `unknown` 时停手，那就必须有人保证它不会永远停在那里 ——
  // 启动探测在连续瞬态失败时**故意**维持 unknown（把活着的会话说成未登录更糟），
  // 于是这一页会一直转圈，而用户什么也看不到。给它一个上限，到点如实说明并给出重试。
  useEffect(() => {
    if (phase !== "polling" || status !== "unknown") return;
    const timer = window.setTimeout(() => {
      setFailure({ code: "SESSION_UNKNOWN", message: t("mfa.done.sessionUnknown") });
      setPhase("failed");
    }, SESSION_SETTLE_BUDGET_MS);
    return () => window.clearTimeout(timer);
  }, [phase, status, t]);

  /** 恢复码兜底：统一身份不可达时唯一能登进来的方式（后端在接管开启时仍接受恢复码）。 */
  const submitRecovery = async (e: FormEvent) => {
    e.preventDefault();
    if (recoveryBusy || !handoff || !recoveryCode) return;
    setRecoveryError(null);
    // 与轮询同一道闸。先是「还不知道是谁」——那就先别提交，让用户等状态落定
    //（这一步通常已经落定了：恢复码表单要等轮询超时之后才出现）。
    if (status === "unknown") {
      setRecoveryError(t("mfa.done.sessionSettling"));
      return;
    }
    // 再是「知道了，而且不是出发时那个人」、或者「中间有人登出过」：这条挑战不能再用。
    if (identityDrifted || signedOutMeanwhile) {
      clearIamMfaHandoff();
      setFailure({ code: "IDENTITY_CHANGED", message: t("login.identityChanged") });
      setPhase("failed");
      return;
    }
    const epoch = flowGenRef.current;
    setRecoveryBusy(true);
    try {
      const res = await api.post<IamVerifyResult>(
        "/v1/auth/mfa/totp/verify",
        { mfaChallengeToken: handoff.mfaChallengeToken, code: recoveryCode },
        {
          noAuth: true,
          authWrite: true,
          requireIdentityGen: epoch,
          timeoutMs: REQUEST_TIMEOUT_MS,
          signal: pageAbortRef.current?.signal,
        },
      );
      if (!res.ok) {
        if (res.error.code === "EMAIL_NOT_VERIFIED") {
          goVerifyEmail(res.error.data?.email);
          return;
        }
        setRecoveryError(res.error.message);
        return;
      }
      setPhase("landing");
      await land(res.data, epoch, handoff.priorSignoutEpoch);
    } finally {
      setRecoveryBusy(false);
    }
  };

  const startRecovery = () => {
    setRecoveryCode("");
    setRecoveryError(null);
    setPhase("recovery");
  };

  const retry = () => {
    setFailure(null);
    setRound((n) => n + 1);
    setPhase("polling");
  };

  /**
   * 二次验证**已经通过**、只是随后取档案失败时的重试。
   *
   * 这时绝不能重跑轮询：那张 MFA 挑战已经被消费掉了，再投一次只会拿到
   * 「已使用/无效」，把一次本来成功的登录变成失败。会话此刻是真的已经建立了，
   * 缺的只是档案 —— 重新拉一次即可。
   */
  const retryProfile = async () => {
    // 与回调页同理：用户可能在错误屏上停留很久，期间别的标签页换了账号。
    // 那时重新拉档案拿回来的是新账号的，而落点（可能带 `?oidc=`）是为原来那次登录准备的。
    if (getIdentityGen() !== installedGenRef.current) {
      setFailure({ code: "IDENTITY_CHANGED", message: t("login.identityChanged") });
      setPhase("failed");
      return;
    }
    setFailure(null);
    setPhase("landing");
    if ((await refresh()) === null) {
      setFailure({ code: "PROFILE_UNAVAILABLE", message: t("login.profileFetchFailed") });
      setPhase("failed");
      return;
    }
    // 落点必须与 land() 一致 —— 带着 OIDC 交互进来的，重试成功后也要回到那条交互上去，
    // 直接跳普通目的地等于把一次仍然有效的授权请求丢掉，用户得回业务站重发一遍。
    if (handoff?.oidc) {
      navigate(`/login?oidc=${encodeURIComponent(handoff.oidc)}`, { replace: true });
      return;
    }
    navigate(sanitizeRedirect(handoff?.redirect, "/account"), { replace: true });
  };

  const backToLogin = () => {
    clearIamMfaHandoff();
    navigate("/login", { replace: true });
  };

  // ── 恢复码兜底界面 ──
  if (phase === "recovery") {
    return (
      <CenteredCard>
        <PageHeader
          align="center"
          size="card"
          as="h1"
          title={t("mfa.done.recoveryTitle")}
          description={t("mfa.done.recoveryDesc")}
        />
        <form className={authStyles.form} onSubmit={submitRecovery}>
          {recoveryError && <Alert tone="error">{recoveryError}</Alert>}
          <TextField
            label={t("mfa.done.recoveryLabel")}
            autoComplete="one-time-code"
            autoFocus
            className={`${authStyles.mfaCode} ${authStyles.mfaCodeLong}`}
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value)}
            required
          />
          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={recoveryBusy}
            disabled={!recoveryCode || recoveryBusy}
          >
            {t("mfa.done.recoverySubmit")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            fullWidth
            disabled={recoveryBusy}
            onClick={retry}
          >
            {t("mfa.done.backToIam")}
          </Button>
          {/* 恢复码也用不了时的最后一条出路，别把人困在这两个按钮之间。 */}
          <button
            type="button"
            className={authStyles.mfaAltLink}
            disabled={recoveryBusy}
            onClick={backToLogin}
          >
            {t("mfa.done.backToLogin")}
          </button>
        </form>
      </CenteredCard>
    );
  }

  // ── 交接数据缺失：无从回查，只能重新登录 ──
  if (phase === "missing") {
    return (
      <StatusScreen
        kind="error"
        title={t("mfa.done.missingTitle")}
        description={t("mfa.done.missingDesc")}
        actions={
          user
            ? [{ label: t("account.title"), to: "/account" }]
            : [{ label: t("mfa.done.backToLogin"), onClick: backToLogin }]
        }
      />
    );
  }

  // ── 回查失败：给重试与恢复码两条出路 ──
  if (phase === "failed" && failure) {
    // 优先用本地化的错误说明，未收录的错误码回落后端 message。
    const key = `mfa.done.error.${failure.code}`;
    const localized = t(key);
    // 挑战已失效/耗尽时重试没有意义，只留「重新登录」。
    const terminal =
      failure.code === "TOKEN_INVALID_OR_EXPIRED" ||
      failure.code === "MFA_CHALLENGE_EXHAUSTED" ||
      failure.code === "IAM_MFA_USER_MISMATCH" ||
      failure.code === "MFA_IAM_NOT_STARTED" ||
      // 这两种同样重试不出结果，只能重新登录：
      //  - IDENTITY_CHANGED：代次锚在挂载那一刻，而身份已经变了 ——
      //    重试用的还是那个旧代次，令牌**永远**装不上，点多少次都一样。
      //  - TOKEN_MISSING：验证多半已经在服务端成功、挑战已被消费，
      //    重投同一张只会拿到「已使用」。
      failure.code === "IDENTITY_CHANGED" ||
      failure.code === "TOKEN_MISSING";
    // 验证已通过、只是档案没拉到：重试的对象是**拉档案**，不是那张已被消费的挑战。
    const profileOnly = failure.code === "PROFILE_UNAVAILABLE";
    return (
      <StatusScreen
        kind="error"
        title={t("mfa.done.errorTitle")}
        description={localized === key ? failure.message : localized}
        detail={failure.code}
        actions={
          profileOnly
            ? [
                { label: t("mfa.done.retry"), onClick: () => void retryProfile() },
                { label: t("mfa.done.backToLogin"), variant: "ghost" as const, onClick: backToLogin },
              ]
            : terminal
            ? [{ label: t("mfa.done.backToLogin"), onClick: backToLogin }]
            : [
                { label: t("mfa.done.retry"), onClick: retry },
                { label: t("mfa.done.useRecovery"), onClick: startRecovery },
                { label: t("mfa.done.backToLogin"), variant: "ghost" as const, onClick: backToLogin },
              ]
        }
      />
    );
  }

  // ── 超时：两分钟没等到结论 ──
  if (phase === "timeout") {
    return (
      <StatusScreen
        kind="error"
        title={t("mfa.done.timeoutTitle")}
        description={t("mfa.done.timeoutDesc")}
        actions={[
          { label: t("mfa.done.retry"), onClick: retry },
          { label: t("mfa.done.useRecovery"), onClick: startRecovery },
          { label: t("mfa.done.backToLogin"), variant: "ghost" as const, onClick: backToLogin },
        ]}
      />
    );
  }

  // ── 轮询中 / 正在落地 ──
  return (
    <StatusScreen
      kind="loading"
      title={phase === "landing" ? t("mfa.done.successTitle") : t("mfa.done.title")}
      description={
        phase === "landing" ? (
          t("mfa.done.successDesc")
        ) : (
          <>
            {t("mfa.done.desc")}
            {/* IAM 自称未通过时也照样回查——它只是提示，不是结论。 */}
            {hintedFailure && (
              <>
                {" "}
                {t("mfa.done.hintedFailure")}
              </>
            )}
          </>
        )
      }
      actions={
        phase === "landing"
          ? undefined
          : [{ label: t("mfa.done.useRecovery"), variant: "secondary" as const, onClick: startRecovery }]
      }
    />
  );
};

export default AuthMfaDonePage;
