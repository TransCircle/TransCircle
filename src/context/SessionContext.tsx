// ============================================================================
// Pass C 端会话上下文
//
// ── 这里解决的问题 ──────────────────────────────────────────────────────────
// 旧模型是 `{ user: MeProfile | null, loading: boolean }`。要命的是 `user === null`
// 有**两种**含义：「确定没登录」和「还不知道」。全站只有 AccountPage 一处正确区分了，
// 登录页与导航栏都把「还不知道」当成了「没登录」—— 于是每次冷启动导航栏都闪一下
// 「登录」，而带 ?oidc= 落到登录页时会先画出登录表单，几百毫秒后才反应过来
// 「其实早就登录了」再跳走。用户看到的就是「让我重新登录 → 又不用了」。
//
// 现在改成三态判别式 `status`，并且**不再导出 `loading`**：调用方拿不到那个
// 「二选一」的布尔，必须显式写清楚 unknown 时该显示什么，同样的 bug 写不出来。
//
// ── 冷启动为什么还是会快 ────────────────────────────────────────────────────
// 1. 同步读 localStorage 里的身份提示（hint），首帧就能把头像/昵称画出来；
// 2. 后端的 POST /v1/auth/refresh 现在同批带回完整档案，两次串行往返压成一次。
//
// hint 只是**渲染提示**，绝不是凭据：它的类型被刻意收窄成三个字段，装不下
// 权限、状态、安全信息，从类型上就没法被误当成已确认的档案用。真实数据一律来自
// 接口，接口 401 就立刻纠正为 anonymous。
// ============================================================================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  SESSION_IDENTITY_CHANGED,
  SESSION_USER_EVENT,
  abortInflightRefresh,
  api,
  bumpAuthEpoch,
  bumpIdentityBoundary,
  SESSION_TOKEN_INSTALLED,
  clearUserAuth,
  clearUserTokenOnly,
  getAuthEpoch,
  getUserToken,
  NON_REJECTING_AUTH_CODES,
  tryRefreshOutcome,
} from "../api/client";
import type { MeProfile } from "../api/types";
import {
  publishSessionBroadcast,
  subscribeSessionBroadcast,
} from "./sessionBroadcast";
import {
  clearSessionHint,
  readSessionHint,
  writeSessionHint,
  type SessionHint,
} from "./sessionHint";
import { markSignedOut } from "./signoutEpoch";

/**
 * 会话三态。
 *
 * - `unknown`：还没问过后端。**不等于未登录**，任何「未登录才显示」的 UI 都不该在此时出现。
 * - `authenticated`：后端确认过的登录态，`user` 必有值。
 * - `anonymous`：后端确认过的未登录态。
 */
export type SessionStatus = "unknown" | "authenticated" | "anonymous";

/**
 * 档案的最小运行时校验。
 *
 * 类型声明描述的是**契约**，不是实际收到的字节。网关吐个空壳 200、代理截断响应体、
 * 后端组装出半截对象 —— 这些都会让一个不成形的东西一路走到「已登录」。
 * 这里只查身份主键与几个全站都在读的字段：查得太细会在后端加字段时误伤，
 * 查得太松等于没查。
 */
export function isMeProfile(value: unknown): value is MeProfile {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const v = value as Partial<MeProfile>;
  if (typeof v.id !== "string" || v.id === "") return false;
  if (typeof v.username !== "string") return false;
  if (typeof v.displayName !== "string") return false;
  // `security` 是账户中心到处在解引用的那个对象（`user.security.totpEnabled` 等）。
  // 只查 id/username 的话，一个缺了它的半截档案照样能落定成「已登录」，
  // 然后在某个分区渲染时才炸 —— 离真正的原因已经很远了。
  const sec = v.security as Partial<MeProfile["security"]> | undefined;
  if (typeof sec !== "object" || sec === null) return false;
  if (typeof sec.hasPassword !== "boolean") return false;
  if (typeof sec.totpEnabled !== "boolean") return false;
  if (typeof sec.passkeyCount !== "number") return false;
  if (!Array.isArray(sec.oauthProviders)) return false;
  return true;
}

interface SessionContextValue {
  status: SessionStatus;
  /** 已确认的用户档案；`status !== "authenticated"` 时恒为 null。 */
  user: MeProfile | null;
  /**
   * 上次登录留下的身份提示（localStorage）。仅供 `unknown` 期间渲染头像/昵称，
   * 让冷启动不闪。**不可用于任何授权或状态判断** —— 它可能已经过期或被吊销。
   */
  hint: SessionHint | null;
  /** 会话因失效被清除；受保护页面据此给登录页一次性反馈。 */
  sessionExpired: boolean;
  clearSessionExpired: () => void;
  /** 重新拉取 /v1/me（登录/资料更新后调用）。返回最新用户或 null。 */
  refresh: () => Promise<MeProfile | null>;
  /** 乐观更新本地用户。 */
  setUser: (user: MeProfile | null) => void;
  /** 登出并清空状态；API 失败时抛错（不清空本地态，调用方可就近反馈并重试）。 */
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<SessionStatus>("unknown");
  const [user, setUserState] = useState<MeProfile | null>(null);
  // 同步初始化：localStorage 是同步 API，首帧就能拿到，不需要等任何网络。
  const [hint, setHint] = useState<SessionHint | null>(() => readSessionHint());
  const [sessionExpired, setSessionExpired] = useState(false);
  /** 当前已确认的用户 id。用于识别「换了人」这条认证边界，见 commitUser。 */
  const currentUserIdRef = useRef<string | null>(null);
  /**
   * `status` 的镜像。
   *
   * 启动探测是个长跑的异步流程，闭包里读到的 `status` 永远是它启动那一刻的值；
   * 要判断「这期间别人有没有把会话建起来」只能靠 ref。
   */
  const statusRef = useRef<SessionStatus>("unknown");
  /**
   * 本标签页**最近一次对外宣告过**的身份（用户 id；宣告过登出则是 null）。
   *
   * 这是防回声的全部机制。此前用的是「正在处理广播」的布尔旗，两种圈法都不成立：
   *
   * - 圈住整段异步处理 —— 广播处理里要退避重试、等好几秒，这期间用户在本标签页
   *   正常登录所触发的广播会被一并吞掉，第三个标签页于是继续显示旧账号。
   * - 只圈住同步的落定动作 —— 漏掉了**间接**路径：续期成功时 `api/client` 会派发
   *   `SESSION_USER_EVENT`，那个监听器在圈外调用 `commitUser`；而广播处理刚把
   *   `currentUserIdRef` 清成了 null，于是它判定「首次登录」又播了出去。
   *   A 播给 B、B 又播回 A，两边无限「续期 → 重置 → 再续期」，
   *   轻则限流，重则把刷新令牌族轮换到触发后端的重用检测。
   *
   * 问题出在用**时序**（现在算不算在处理广播）去猜**因果**。改用内容判重：
   * 一个标签页对同一个身份只宣告一次。落定到的身份与上次宣告的相同 → 不播；
   * 不同 → 播一次并记下。这样无论经由哪条路径落定，回声都会在一跳之内自然停住，
   * 而本地真实的换号/登录仍然照播不误。
   */
  const lastAnnouncedIdRef = useRef<string | null>(null);
  /**
   * 对齐的轮次。每开一轮 +1；循环里比对，发现自己已被更新的一轮取代就退出。
   *
   * 有了它，「对齐中途来了个不同类型的广播」才能安全地重开一轮 ——
   * 否则旧循环会继续跑到底，用它那次的结果覆盖新一轮的结论。
   */
  const alignRunRef = useRef(0);
  /**
   * 作废当前这一轮广播对齐。
   *
   * **本地发生的身份变化也要作废它** —— 对齐轮次此前只由广播自己递增，
   * 于是「正在对齐 B 时用户在本标签页登录了 C」这一幕没人管：
   * 那一轮会继续跑它的退避阶梯，用 B 的 cookie 再刷一次，
   * 甚至把 B 的档案装回界面 —— 页面从 C 又切回了 B。
   * 本地登录是比那条广播**更新**的事实，它必须让旧轮次立刻失效。
   */
  const supersedeAlignment = useCallback(() => {
    alignRunRef.current += 1;
  }, []);
  /** 在途的 `/v1/me`，连同它属于哪个认证代次。见 refresh() 里的 single-flight 说明。 */
  const meInFlight = useRef<{
    epoch: number;
    promise: Promise<MeProfile | null>;
  } | null>(null);
  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  /**
   * 落定为已登录：写入用户、同步身份提示。
   *
   * **换了人也是一条认证边界。** 多标签页共享同一枚 refresh cookie：另一个标签页登录了
   * 别的账号后，本标签页续期回来的就是新账号。此前以旧身份发出、还没回来的
   * `/v1/me` 之类必须一并作废，否则它们晚一步落地会把页面又切回旧账号 ——
   * 而内存里的令牌已经是新账号的，界面与身份就此错开。
   * 这里用 `bumpAuthEpoch()` 而不是 `clearUserAuth()`：刚拿到的新令牌是要留着的。
   */
  const commitUser = useCallback((next: MeProfile) => {
    // 用 ref 而不是 setState 的更新函数来做这个判断：更新函数必须是纯的，
    // StrictMode 会双调用它，把提代次这种副作用放进去会跑两遍。
    const switched =
      currentUserIdRef.current !== null && currentUserIdRef.current !== next.id;
    if (switched) bumpAuthEpoch();
    // 首次登录与换号都要告诉别的标签页：它们可能正挂着一个属于旧身份的续期请求，
    // 那个请求落地时会把旧账号的 cookie 写回来。
    if (lastAnnouncedIdRef.current !== next.id) {
      publishSessionBroadcast({ type: "signed-in" });
      lastAnnouncedIdRef.current = next.id;
    }
    currentUserIdRef.current = next.id;
    statusRef.current = "authenticated";
    setUserState(next);
    setStatus("authenticated");
    setHint(writeSessionHint(next));
  }, []);

  /**
   * 落定为未登录。
   *
   * `invalidate` 决定要不要连带作废在途请求（提代次 + 清令牌）：
   *
   * - **true**（登出、会话失效、`/v1/me` 明确 401）：确实有一个身份被终结了，
   *   此前以它名义发出的请求必须一并作废，否则比登出慢半拍的响应会把人又写回来。
   * - **false**（启动探测最终没问出结果）：**这里没有任何身份被终结**，
   *   只是本次探测得不出结论。提代次会把此刻正在进行的登录流程一并误伤 ——
   *   OAuth 兑换/二次验证落地页随后拿到的令牌会因为代次对不上而装不上，
   *   页面就永远停在「处理中」。
   */
  /**
   * @param alreadyMarked 调用方**自己**已经写过登出印记了，这里不要再写第二遍。
   *
   * 为什么是个显式参数而不是一面「待消费」的旗子：旗子是「下一次谁碰到就消费谁」，
   * 而 `commitAnonymous(true)` 有好几个触发源（登出、会话失效事件、`/v1/me` 401）。
   * `logout()` 点击时置旗、`await` 期间另一个来源先跑到，就把旗子吃掉了 ——
   * 随后 logout 自己再写一个新的印记，于是同一次登出**换了两次值**。
   * 中间那个值恰好被某笔外跳流程抄走的话，它回来一比又变了，
   * 一次本不该被拦的正常登录被判成「期间有人登出」。
   * 参数只作用于这一次调用，没有这种串台。
   */
  const commitAnonymous = useCallback((invalidate = true, alreadyMarked = false) => {
    if (invalidate) {
      // 确实有一个身份被终结了：换一个**持久**的登出印记。
      // 外跳流程（统一身份二次验证）靠它才知道「我出去这一趟期间有人登出过」——
      // 页面内存里的身份代次跨不过整页跳转，而登出后的 anonymous 与「还没登录」
      // 长得一模一样，两者都拦不住那笔迟到的挑战。见 signoutEpoch.ts。
      //
      // 调用方已经记过就别再记第二遍（见 alreadyMarked 的说明）。
      if (!alreadyMarked) markSignedOut();
      clearUserAuth();
      // 只有「确实有个身份被终结了」才广播；启动探测得不出结论时（invalidate=false）
      // 什么都没发生，广播出去只会让别的标签页白白重来一遍。
      // 同样按内容判重：已经宣告过登出就不再重复播，否则会与别的标签页来回对播。
      if (lastAnnouncedIdRef.current !== null) {
        publishSessionBroadcast({ type: "signed-out" });
      }
    }
    else {
      // `invalidate=false` 也要把内存里那枚令牌丢掉。
      //
      // 不丢的话，界面显示未登录、请求却仍带着它出门 —— 而服务端那条会话完全可能
      // 还活着（比如另一个标签页登出的是它自己那条），于是这个标签页「已登出」
      // 却仍能访问受保护接口。状态与实际身份就此对不上。
      // 用 `clearUserTokenOnly()` 而不是 `clearUserAuth()`：后者会提代次，
      // 把此刻可能正在跑的登录流程一并误伤。
      clearUserTokenOnly();
    }
    // 无论有没有播出去，落定为匿名之后本标签页就不再为任何身份背书了。
    // 不清的话会漏播：`invalidate=false` 那条路（探测无结论、或对齐到别的标签页的登出）
    // 不播也不清，等用户重新登录**同一个人**时，`commitUser` 会因为「和上次宣告的一样」
    // 而保持沉默 —— 别的标签页就永远不知道这里又登录了。
    lastAnnouncedIdRef.current = null;
    currentUserIdRef.current = null;
    statusRef.current = "anonymous";
    setUserState(null);
    setStatus("anonymous");
    clearSessionHint();
    setHint(null);
  }, []);

  /** 已装上的唤醒监听的拆卸函数（同时也是「已经装过了」的标记）。 */
  const wakeTeardownRef = useRef<(() => void) | null>(null);
  /**
   * `refresh` 的稳定引用。
   *
   * `armWakeProbe` 声明在 `refresh` 之前（它要被前面的代码引用），
   * 直接闭包会拿到「声明那一刻」的值；用 ref 转一道，唤醒时取到的才是当前那个。
   */
  const refreshRef = useRef<(() => Promise<MeProfile | null>) | null>(null);

  /**
   * 状态停在 `unknown` 且**再没有别的触发点**时，留一个会自己醒过来的口子。
   *
   * 探测/对齐的退避阶梯跑完仍然问不出结论时，正确的做法是维持 `unknown`
   *（把一个可能还活着的会话说成未登录是更糟的结论）—— 但那意味着全站的加载屏
   * 会一直转下去，而网络往往早就恢复了。回到前台、或网络重新连上，
   * 都是重问一次的好时机。
   *
   * 装一次就够：重复装会让一次唤醒发出多个续期。
   */
  const armWakeProbe = useCallback(() => {
    if (typeof window === "undefined") return;
    if (statusRef.current !== "unknown") return;
    if (wakeTeardownRef.current) return;
    const onWake = () => {
      if (statusRef.current !== "unknown") {
        // 期间已被别处落定：把监听撤掉，别留着白响。
        wakeTeardownRef.current?.();
        wakeTeardownRef.current = null;
        return;
      }
      // 后台标签页不必抢着问，等它回到前台那一下。
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refreshRef.current?.();
    };
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);
    wakeTeardownRef.current = () => {
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, []);

  const refresh = useCallback(async (): Promise<MeProfile | null> => {
    // 请求发出前记下代次，落定前比一次：期间若发生过登出/换号，这次结果就不再作数。
    const epoch = getAuthEpoch();

    // **同代次内合并成一次请求（single-flight）。**
    //
    // 身份变化事件会触发一次拉取，而登录落地页紧接着自己也会调一次 —— 两个请求各自
    // 独立地成功或失败。一旦分叉（一个拿到档案、另一个撞上 503），落地页就会按
    // 自己那次的失败报「登录没完成」，而会话其实早已建立好。
    // 合并之后两边看到的是同一个结论，不可能一个说成、一个说败。
    const shared = meInFlight.current;
    if (shared && shared.epoch === epoch) return shared.promise;

    const promise = (async (): Promise<MeProfile | null> => {
      const res = await api.get<MeProfile>("/v1/me");
      if (getAuthEpoch() !== epoch) return null;
      if (res.ok) {
        if (isMeProfile(res.data)) {
          commitUser(res.data);
          return res.data;
        }
        // 声称成功却没给出**像样的**档案：响应体不对劲，不是「没登录」。
        // 只判 truthy 是不够的 —— `{}`、数组、缺 id 的半截对象都会被当成合法档案落定，
        // 于是状态变成 authenticated、身份提示里写进一个没有 id 的人，
        // 而调用方还以为拉取成功、不再重试。维持原状，让它重试。
        return null;
      }
      // **只有后端明确说「这条会话不能用」才落定为未登录。**
      //
      // 网关 502/503、限流 429、网络中断（status 0）都只说明这一次没问到，
      // 不说明用户没登录。把它们当成未登录，等于「密码刚验过、令牌和 cookie 都好好的，
      // 却因为一次网关抖动被踢回登录页」—— 而重新登录同样要过这个网关。
      // 拿不准就维持原状：调用方拿到 null 会自行重试，状态仍是 unknown 的话
      // 页面继续显示加载态，不会闪出一个错误的结论。
      //
      // 401 也不能一概而论。`NON_REJECTING_AUTH_CODES` 里的两种都不是「会话没了」：
      //  - `auth_refresh_transient`：令牌过期了，而续期这一次撞上了网关抖动 ——
      //    refresh cookie 完好，把人登出等于让他在同一个正在抖的网关上再走一遍登录；
      //  - `auth_epoch_stale`：这个结果属于一个已经被替换掉的旧身份/旧令牌，
      //    与当前会话无关，清它就是把刚登录成功的人踢出去。
      //
      // **先看错误码，再看状态码。** `auth_epoch_stale` 会原样保留响应的 HTTP 状态；
      // 一个属于旧身份的请求返回 403 时，若按状态码先判，就会把刚登录的新身份清掉 ——
      // 而那个 403 说的是上一个人的事。
      const nonRejecting = NON_REJECTING_AUTH_CODES.includes(res.error.code);
      const sessionRejected =
        !nonRejecting && (res.status === 401 || res.status === 403);
      if (sessionRejected) commitAnonymous();
      return null;
    })();

    meInFlight.current = { epoch, promise };
    try {
      return await promise;
    } finally {
      // 只清自己那一份：期间可能已经有一次新代次的请求挂上来了。
      if (meInFlight.current?.promise === promise) meInFlight.current = null;
    }
  }, [commitUser, commitAnonymous]);
  refreshRef.current = refresh;

  const setUser = useCallback(
    (next: MeProfile | null) => {
      if (next) commitUser(next);
      else commitAnonymous(true);
    },
    [commitUser, commitAnonymous],
  );

  const logout = useCallback(async () => {
    // **登出代次在这里就推进，不等服务端回应。**
    //
    // 用户点下「退出登录」的那一刻，意图就已经确定了。等响应回来才推进的话，
    // 中间那段（请求在途）正好是别处一笔外跳流程（统一身份二次验证）落地的窗口：
    // 它建起一条**新的**会话 S1，而这次 logout 针对的是 S0 —— 撤销不了 S1，
    // 用户点了退出却发现自己还登录着，而且是被一个他早已放弃的流程登回去的。
    // 跨标签页的中止清单不共享，靠 abort 拦不住它，只能靠这个持久标记。
    //
    // 代价：logout 请求若失败，印记已经换过了，一笔正在外跳的合法验证会被拒绝。
    // 那是 fail closed 的方向 —— 用户重新登录一次，而不是「以为退出了其实没有」。
    markSignedOut();
    // logout 的响应写的是「清除」——方向相反，危害一样。
    // 本页发出 logout 之后、响应到达之前，若别的标签页登录了新账号，
    // 这个迟到的响应会把**刚建立**的 refresh cookie 与 `_session` 一并清掉，
    // 那个标签页于是莫名其妙被登出。所以它同样登记进可中止清单。
    const res = await api.post("/v1/auth/logout", undefined, {
      authWrite: true,
    });
    // 不再静默吞掉失败：上抛给调用方（AppNav 已有 catch 反馈），避免服务端会话
    // 仍存活的「假登出」。会话本已失效(401)时,客户端会经 session-expired 事件清态。
    if (!res.ok) throw new Error(res.error.message);
    // clearUserAuth() 已由 commitAnonymous 调用（它同时提代次作废在途请求）。
    // 印记上面已经记过了，这里显式告诉它别再记 —— 同一次登出只该换一次值。
    commitAnonymous(true, true);
  }, [commitAnonymous]);

  // 启动：静默续期恢复会话。
  // 续期响应现在同批带回档案（见 api/client 的 RefreshResult），拿到就不必再请求
  // /v1/me —— 那两次是串行的，省掉的正是「前端不知道自己是谁」的那段时间。
  // 后端未带档案（旧版本）时回落到单独请求。
  // 失败后按退避阶梯重试（见下方的 delay 数组），处理后端瞬态错误（500/502/429）。
  //
  // **不要**在这里加「只跑一次」的 ref 守卫。StrictMode 会「挂载 → 清理 → 再挂载」，
  // 守卫会让第二次挂载直接返回，而第一次的异步流程已被清理函数的 alive=false 掐断 ——
  // 结果是开发环境下 status 永远停在 unknown，整个门户卡在加载屏。
  // 重复调用本身无害：api/client 的 doRefresh 用 _refresh（RefreshEntry）+ Web Locks 去重，
  // 并发的第二次会复用同一个在途请求。
  useEffect(() => {
    let alive = true;

    void (async () => {
      // 续期本身是否成功过。**拿到过令牌就证明会话存在**，哪怕随后取档案失败
      //（老后端才需要单独请求 /v1/me，而它可能正好在抖）也绝不能落定成「未登录」。
      let sessionProven = false;
      // 后端是否**明确说过**「这条会话不能用」。只有它才够格把状态落定成未登录。
      let sessionRejected = false;

      const attempt = async (): Promise<boolean> => {
        const epoch = getAuthEpoch();
        const outcome = await tryRefreshOutcome();
        if (!alive) return false;
        if (!outcome.ok) {
          // 区分「确实没登录」和「这一次没问到」。混作一谈的话，
          // 一个 refresh cookie 完好的用户会在网关抖动时于首屏看到登录入口。
          if (outcome.reason === "expired") sessionRejected = true;
          return false;
        }
        const refreshed = outcome.value;
        // 启动续期期间用户就登出了（多标签页共享同一会话时会发生）：结果作废。
        if (getAuthEpoch() !== epoch) return false;
        sessionProven = true;
        // 不再重复 setUserToken()：`doRefresh()` 内部已经在做完
        //「代次未变 + 令牌仍是出发时那枚」两道校验之后装好了。
        // 在这里再写一次等于绕过那两道校验，把一枚可能已经被替换掉的令牌又装回去。
        //
        // 档案同样要过校验：不合格就当没带回来，回落到单独请求 /v1/me。
        if (isMeProfile(refreshed.user)) {
          commitUser(refreshed.user);
          return true;
        }
        return (await refresh()) !== null;
      };

      // 退避阶梯，而不是「再试一次就算了」。
      //
      // 这里**不能**因为失败就落定成 anonymous —— 瞬态错误（网关 502 / 限流 / 断网）
      // 会让已登录用户看到一次「未登录」闪烁。但只试两次同样不行：两次都撞上 503 的话
      // `sessionProven`、`sessionRejected` 全是 false，状态就此永久停在 unknown，
      // 而**此后没有任何后续触发点** —— 导航栏、账户页、受保护路由的加载屏会一直转下去，
      // 哪怕网关一秒后就恢复了。所以要一直退避重试到问出结论为止。
      for (const delay of [0, 1000, 3000, 8000, 20000]) {
        if (delay) {
          await new Promise((r) => setTimeout(r, delay));
          if (!alive) return;
        }
        if (await attempt()) return;
        if (!alive) return;
        // 这两种情况都已经有结论了，不该继续走「瞬态重试」：
        // 明确被拒 → 由下面落定为未登录；会话已证实存在 → 由下面单独补拉档案。
        if (sessionRejected || sessionProven) break;
      }
      // **只在会话状态仍然是「还不知道」时才落定为未登录。**
      //
      // 这一秒的重试窗口里，页面完全可能已经从别处登录成功了 ——
      // OAuth 回调页 / 二次验证落地页 / 补全注册页都会在拿到令牌后调 refresh()，
      // 而 SessionProvider 不随路由跳转卸载，这个启动探测还在跑。
      // 此时无条件 commitAnonymous() 会把刚建立的会话连同令牌、档案、身份提示一起清掉，
      // 用户刚登录完就被打回登录页。启动探测只对「自己还没得出结论」的情况负责。
      //
      // 同理，续期成功过（sessionProven）就说明会话确实存在，只是档案没取到；
      // 那种情况维持 unknown（页面继续显示加载态），而不是给出一个已知错误的结论。
      // 传 false：探测没问出结果 ≠ 有个身份被终结。此刻可能正有一条登录流程在跑
      //（OAuth 兑换、二次验证落地），提代次会把它的令牌判成过期，页面就此卡死。
      //
      // 另外还要看**有没有令牌已经装上了**：某条登录流程可能已经成功拿到令牌、
      // 只是取档案那一步还在路上。此时落定 anonymous 会造成「内存里有有效令牌、
      // 状态却是未登录」——账户页看到 anonymous 又把人弹回登录页，而他其实已经登录了。
      //
      // 而**只有后端明确拒绝过**（sessionRejected）才落定未登录：
      // 两次都撞上网关抖动不构成「你没登录」的结论，维持 unknown 等下一次触发的续期。
      if (
        sessionRejected &&
        !sessionProven &&
        statusRef.current === "unknown" &&
        !getUserToken()
      ) {
        commitAnonymous(false);
        return;
      }

      // 拿到过令牌、却始终没拿到档案：状态会停在 `unknown`，而全站的加载屏都在等它。
      //
      // 停在 unknown 本身是对的（会话确实存在，只是档案没到手），
      // 但**必须有人继续问** —— 否则没有任何后续触发点，页面就一直转圈到用户手动刷新。
      // 退避重试而不是改判 anonymous：把一个还活着的会话说成未登录是更糟的结论。
      if (sessionProven && statusRef.current === "unknown") {
        for (const delay of [1000, 3000, 8000]) {
          await new Promise((r) => setTimeout(r, delay));
          if (!alive || statusRef.current !== "unknown") return;
          if (await refresh()) return;
        }
      }

      // 阶梯跑完仍然没有结论：维持 unknown（把一个可能还活着的会话说成未登录更糟），
      // 但**必须留一个自己会醒过来的口子**。否则用户只能盯着加载屏，直到手动刷新页面 ——
      // 而网络往往早就恢复了。回到前台、或网络重新连上，都是重问一次的好时机。
      if (!alive) return;
      armWakeProbe();
    })();

    return () => {
      alive = false;
    };
  }, [commitUser, commitAnonymous, refresh, armWakeProbe]);

  // 续期发现换了个人：手里这份档案已经不属于当前身份了。
  //
  // **不能只是等新档案送上门** —— 后端的档案组装允许失败，那一次只会回令牌不回 user。
  // 撞上它，界面会继续显示上一个人，而请求已经以新身份发出去了。
  // 先退回 unknown（旧档案与身份提示一并丢掉，导航栏什么都不画），再主动拉一次。
  useEffect(() => {
    const onIdentityChanged = (e: Event) => {
      // 换人了：在跑的广播对齐同样过时。
      supersedeAlignment();
      // 也要告诉别的标签页。
      //
      // 只在 `commitUser()` 里广播是不够的：装上新身份的令牌之后，若紧接着的
      // `/v1/me` 失败，`commitUser()` 根本不会执行 —— 于是浏览器的 `_session`
      // 已经是 B 的了，而别的标签页还以为自己是 A，那边发起 OAuth 会被静默授权成 B。
      // 绑定校验拦不住它：B 的 SSO 确实由 B 的有效会话背书，一切「合法」，只是人错了。
      //
      // 事件带着新令牌的主体（JWT 的 `sub`，就是用户 id）。记下它，
      // 随后的 `commitUser()` 才知道「这个人已经宣告过了」而不再播第二遍 ——
      // 否则同一次换人会被反复宣告，在多标签页之间来回激起额外的续期。
      const subject = (e as CustomEvent<{ subject?: unknown }>).detail?.subject;
      const nextId =
        typeof subject === "string" && subject !== "" ? subject : null;
      if (lastAnnouncedIdRef.current !== nextId) {
        publishSessionBroadcast({ type: "signed-in" });
        lastAnnouncedIdRef.current = nextId;
      }
      currentUserIdRef.current = null;
      statusRef.current = "unknown";
      setUserState(null);
      setStatus("unknown");
      clearSessionHint();
      setHint(null);
      // 带退避的有限重试：一次 fire-and-forget 不够 —— 拉档案若恰好撞上 503，
      // 状态就永久停在 unknown（导航栏空着、账户页一直转圈），而且没有任何后续触发点。
      void (async () => {
        for (const delay of [0, 800, 2400]) {
          if (delay) await new Promise((r) => setTimeout(r, delay));
          if (statusRef.current !== "unknown") return; // 期间已被别处落定
          if (await refresh()) return;
        }
        // 三次都没问出结论：维持 unknown，但要留一个自己会醒过来的口子 ——
        // 启动探测那条路早已结束，这里不留的话页面就一直转圈。
        armWakeProbe();
      })();
    };
    window.addEventListener(SESSION_IDENTITY_CHANGED, onIdentityChanged);
    return () =>
      window.removeEventListener(SESSION_IDENTITY_CHANGED, onIdentityChanged);
  }, [refresh]);

  // 别的标签页登录/登出了。
  //
  // 关键动作是**掐掉本标签页在途的续期请求** —— 它携带的是旧身份的 cookie，
  // 落地时会把那份 cookie 重新写回浏览器，而认证代次只能丢弃响应体、拦不住 Set-Cookie。
  // 掐掉之后再重新问一次服务端，让本标签页与浏览器当前的真实登录态对齐。
  useEffect(() => {
    return subscribeSessionBroadcast((event, publishedAt) => {
      // 别人宣告了登出：本标签页记账里那个人已经不在了，清掉。
      //
      // 不清的话会漏播这一幕 —— A 登出并广播，B 收到后对齐时若连续撞上网关抖动、
      // 始终没落定（落定成匿名的那条路会自己清），记账里就还留着登出前那个人；
      // 用户随后在 B 重新登录**同一个人**，`commitUser()` 判定「和上次宣告的一样」
      // 而保持沉默，A 于是一直以为自己是登出状态。
      //
      // **只在收到 signed-out 时清**。收到 signed-in 也清的话，防回声就没了：
      // B 对齐到广播里那个人之后会判定「这个人还没宣告过」，于是播回给 A，
      // A 再播回来 —— 两个标签页无限对播。
      if (event.type === "signed-out") lastAnnouncedIdRef.current = null;
      // **已经在对齐了就别重来一遍。**
      //
      // 去重（sessionBroadcast 的 seen 表）是尽力而为的：窗口过期、条数淘汰、
      // 副本延迟，都可能让同一条通知被处理两次。而这里的处理**不是幂等的** ——
      // 它会掐掉刚发出的续期 R1、再发一个 R2。若 R1 其实已经到达后端完成了轮换、
      // 只是响应还没回来，R2 带的就是旧令牌：超出后端的 race-grace 窗口就会被判成
      // 刷新令牌重用，整条会话族被吊销，用户连同其它标签页一起被踢下线。
      //
      // 与其把正确性全押在去重上，不如让处理本身扛得住重复：正在对齐的那一轮
      // 本来就会问出「浏览器现在是谁」，重复的通知问的是同一个问题，跳过即可。
      // **每一条送到这里的广播都要处理，一条都不跳过。**
      //
      // 这里先后写错过两版，记下来免得再走回去：
      //
      //  1. 「正在对齐就一律跳过」—— 对齐 `signed-in` 的过程中别的标签页登出了，
      //     那条 `signed-out` 被一并吞掉，于是本标签页在登出之后又把旧用户显示了回来。
      //  2. 「只跳过同类型的」—— 同类型也可能是**两条不同的边界**：
      //     A 先登录成 X 播一次，紧接着换登 Y 又播一次，两条都是 `signed-in`。
      //     跳掉第二条就不会去中止那次为 X 发起的续期，它晚一步落地会把 X 的
      //     refresh cookie 写回浏览器，而 `_session` 已经是 Y —— 两个平面就此分裂。
      //
      // 真正的重复由**事件 id** 在 `sessionBroadcast` 里挡掉（每订阅一份，不按时间过期）；
      // 而「同一件事被处理两遍」的代价（多一次续期）远小于「两件事只处理一遍」的代价
      //（身份分裂）。所以这里不再做第二层过滤，只靠 `alignRunRef` 让新一轮取代旧一轮。
      abortInflightRefresh();
      // 提的是**身份边界**（认证代次 + 身份代次），不是只提认证代次。
      // 别的标签页登录别的账号 / 登出，都意味着浏览器的 cookie 已经不是本页
      // 正在跑的那条登录流程所设想的那个人了 —— 它随后拿到的令牌必须装不上。
      bumpIdentityBoundary(publishedAt);
      currentUserIdRef.current = null;
      statusRef.current = "unknown";
      setUserState(null);
      setStatus("unknown");
      // 身份提示留着：它只是渲染占位，而下面这次探测马上就会给出结论；
      // 提前清掉反而会让导航栏白闪一下。
      const run = ++alignRunRef.current;
      void (async () => {
        try {
          // 与身份变化处理同款的有限退避：一次撞上 503 就永久停在 unknown 的话，
          // 页面会一直显示加载态 —— 而此时启动探测早已结束，不会再有别的触发点。
          for (const delay of [0, 800, 2400]) {
            if (delay) await new Promise((r) => setTimeout(r, delay));
            if (alignRunRef.current !== run) return; // 已被更新的一轮取代
            if (statusRef.current !== "unknown") return; // 期间已被别处落定
            const outcome = await tryRefreshOutcome();
            if (alignRunRef.current !== run) return;
            if (outcome.ok) {
              // 落定即可，不必再管回声：`commitUser` 只在「落定到的身份与上次宣告的不同」
              // 时才播。对齐到广播里那个人时两者相同，自然就不播了（见 lastAnnouncedIdRef）。
              const profile = outcome.value.user;
              if (isMeProfile(profile)) {
                commitUser(profile);
                return;
              }
              // 续期成功但没带回合格档案，回落单独请求 —— 那一次同样可能失败
              //（503 / 限流 / 断网 / 2xx 但形状不对）。失败就得留个醒来的口子，
              // 否则状态停在 unknown 而此处直接 return，页面就一直转圈。
              if (await refresh()) return;
              armWakeProbe();
              return;
            }
            if (outcome.reason === "expired") {
              // 这期间若有一条本地登录成功装上了令牌，「这个浏览器没会话」就不成立了 ——
              // 落定为未登录会把刚建立的那条连同令牌一起抹掉。
              if (getUserToken()) return;
              commitAnonymous(false);
              return;
            }
          }
          // 阶梯跑完仍然没有结论：维持 unknown，但**必须留一个会自己醒过来的口子**，
          // 否则页面就此一直转圈 —— 启动探测那条路早已结束，不会再有别的触发点。
          armWakeProbe();
        } finally {
          /* 轮次由 alignRunRef 自己管，无需额外收尾 */
        }
      })();
    });
  }, [commitUser, commitAnonymous, refresh, armWakeProbe]);

  // 一次本地登录动作刚把令牌装好：把「已经宣告过谁」的记账清掉。
  //
  // 记账是用来防回声的（见 lastAnnouncedIdRef），但它对「本地重新登录同一个人」
  // 会误伤：别的标签页登出并广播后，本页若因网关抖动一直没能落定，
  // 记账里就还留着登出之前那个人；用户重新登录他，`commitUser()` 会判定
  // 「和上次宣告的一样」而不广播 —— 别的标签页永远不知道这里又登录了。
  //
  // 登录动作是**因果上确定**的重新宣告点。
  // 而广播对齐这条路不经过 `installAccessToken()`，所以防回声仍然成立。
  useEffect(() => {
    const onInstalled = (e: Event) => {
      // 本地登录成功：任何在跑的广播对齐都已经过时了。
      supersedeAlignment();
      const subject = (e as CustomEvent<{ subject?: unknown }>).detail?.subject;
      const nextId =
        typeof subject === "string" && subject !== "" ? subject : null;
      // **就地宣告**，不等 `/v1/me` 回来。
      //
      // 等 `commitUser()` 才播的话，中间隔着一整个档案往返。别的标签页在这段时间里
      // 若有一个属于旧身份的写会话请求落地，它的 `Set-Cookie` 就把刚建立的会话盖掉了 ——
      // 而那个标签页要等广播到达才会去掐在途请求。宣告得越早，它掐得住的机会越大。
      if (nextId !== null && lastAnnouncedIdRef.current !== nextId) {
        publishSessionBroadcast({ type: "signed-in" });
        lastAnnouncedIdRef.current = nextId;
        return;
      }
      // 拿不到主体（令牌里没有 sub）就退回原来的做法：把记账清掉，
      // 让随后的 `commitUser()` 一定会宣告一次。
      if (nextId === null) lastAnnouncedIdRef.current = null;
    };
    window.addEventListener(SESSION_TOKEN_INSTALLED, onInstalled);
    return () =>
      window.removeEventListener(SESSION_TOKEN_INSTALLED, onInstalled);
  }, []);

  // 401 自动续期时后端顺带回传的档案：不额外发请求，直接更新。
  useEffect(() => {
    const onUser = (e: Event) => {
      const detail = (e as CustomEvent<MeProfile>).detail;
      // 与 refresh() 同一道校验：这份档案来自续期响应，同样可能是半截的。
      // 不合格就当没收到 —— 令牌仍然有效，下一次 /v1/me 会把它补上。
      if (isMeProfile(detail)) commitUser(detail);
    };
    window.addEventListener(SESSION_USER_EVENT, onUser);
    return () => window.removeEventListener(SESSION_USER_EVENT, onUser);
  }, [commitUser]);

  // 监听 401 自动失效（refresh 兑换失败）。
  useEffect(() => {
    const onExpired = () => {
      commitAnonymous();
      setSessionExpired(true);
    };
    window.addEventListener("pass:session-expired", onExpired);
    return () => window.removeEventListener("pass:session-expired", onExpired);
  }, [commitAnonymous]);

  return (
    <SessionContext.Provider
      value={{
        status,
        user,
        hint,
        sessionExpired,
        clearSessionExpired,
        refresh,
        setUser,
        logout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = (): SessionContextValue => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
};

/**
 * 已确认登录的作用域内取用户档案。
 *
 * 给「只可能渲染在登录门控之后」的组件用（账户中心的各个分区都是）。
 * 它们过去每个都要写一遍 `if (!user) return null`，那既是噪音，也让人误以为
 * 「这里真的可能没有用户」。抛错而不是返回 null，是因为走到这里说明**门控漏了**，
 * 静默渲染一个空壳只会把 bug 藏起来。
 */
export const useAuthenticatedUser = (): MeProfile => {
  const { user } = useSession();
  if (!user) {
    throw new Error(
      "useAuthenticatedUser 必须用在登录门控之内（status === 'authenticated' 之后）",
    );
  }
  return user;
};
