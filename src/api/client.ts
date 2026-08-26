// ============================================================================
// TransCircle Pass 门户统一 API 客户端
//
// 设计要点（对齐故事站 client）：
// - access token 仅存内存；401 自动 refresh（POST /v1/auth/refresh，refresh_token
//   走 HttpOnly Cookie 一次性轮换）后重试一次。
// - **只有一条身份平面**。管理控制台复用用户自己的 Pass 会话：管理员就是普通用户，
//   「进入控制台」只是访问了一个需要 IAM 权限的页面，不再有独立的管理员令牌、
//   不再有 sessionStorage、也不再有管理端登出。
// - 统一解析后端响应封装：成功 { data, requestId }（游标列表附 pagination；
//   管理端列表改为 offset，分页字段落在 data 里，见 OffsetPage），
//   失败 { error: { code, message, details?, data? }, requestId }。
// - 自动注入 Authorization / Content-Type / X-CSRF-Token / If-Match /
//   Idempotency-Key / X-Request-Id。
// ============================================================================

// 非 React 环境的兜底文案:直接用 i18n 单例(config 不反向依赖本模块,无循环);
// 统一在错误发生时调用 i18n.t 惰性取值,跟随用户当前语言。
import i18n from "../i18n/config";
import type { MeProfile } from "./types";

/** Pass 后端基址：默认相对路径（同源，经 Vite 代理到 :1146），可用 VITE_PASS_API_BASE 覆盖。 */
export const API_BASE: string = import.meta.env.VITE_PASS_API_BASE ?? "";

// ─── Token 存储 ──────────────────────────────────────────────────

let _userToken: string | null = null;

export function setUserToken(token: string | null): void {
  _userToken = token;
}

/**
 * 安装一次登录流程换来的 access token，**并校验它是否仍属于当前身份**。
 *
 * 登录、OAuth 回调、二次验证落地、补全注册、改密……这些流程都是「先发请求、后拿令牌」。
 * 请求在途时用户完全可能登出或换个账号登进来；此时把迟到的令牌直接装上，
 * 就是「登出之后又被旧请求登了回去」，或者把 B 的会话换成 A 的令牌。
 *
 * 用法：流程**开始前**记下 `getIdentityGen()`，拿到令牌时把它传进来。
 * 返回是否真的装上了 —— 没装上说明这次流程的结果已经作废，调用方不该再往下走。
 *
 * 比的是**身份代次**而不是认证代次：期间若只是某条旧会话过期作废（没有新身份上位），
 * 这次登录仍然有效，不该被连坐。理由见 `getIdentityGen()` 的说明。
 */
export function installAccessToken(token: unknown, identityGen: number): boolean {
  // 收 `unknown` 并在运行时校验：类型声明说这里是 string，但它描述的是**契约**，
  // 不是实际收到的字节。响应体真的缺了这个字段时，`_userToken` 会被写成 undefined ——
  // 之后所有请求都不带 Authorization、靠 cookie 兜底「碰巧还能用」，
  // 而故障现场早已远离真正的原因。
  if (typeof token !== "string" || token === "") {
    console.warn("[auth] 登录响应缺少 access token，拒绝安装");
    return false;
  }
  if (_identityGen !== identityGen) {
    console.warn("[auth] 登录结果已过期（期间发生过登出/换号），丢弃该令牌");
    return false;
  }
  // 装进来的是**另一个人**：这同样是一条认证边界，与续期那条路对称处理。
  //
  // 少了这一步，「A 的请求在途 → B 在同一代次内登录成功 → A 的请求返回」会被判成
  // 「代次没变，结果有效」：A 的数据照样写进界面；更糟的是 A 那个请求若收到 401，
  // handle401 会拿刚装上的 **B 的令牌**去重放它。
  const subject = subjectOf(token);
  const switched = subject !== null && _lastSubject !== null && subject !== _lastSubject;
  if (switched) {
    console.warn("[auth] 登录换了身份，作废此前在途的请求");
    _authEpoch += 1;
    _identityGen += 1; // 确实有个**新的**身份上位了
  }
  if (subject !== null) _lastSubject = subject;
  _userToken = token;

  // **无条件**掐掉在途续期，不看是不是「换了人」。
  //
  // 判断换人依赖 `_lastSubject`，而冷启动时它是 null —— 恰恰是最容易出事的时刻：
  // 页面刚打开、一次续期正在飞，用户完成登录装上新令牌，那次续期随后落地，
  // 把**旧账号**的 refresh cookie 写回浏览器。代次能丢弃它的响应体，拦不住 `Set-Cookie`。
  //
  // 而且这里不存在「掐错」的可能：走到这一行说明刚刚完成了一次登录，
  // 任何在它之前发出的续期都是基于旧凭据的，其结果对当前身份没有意义。
  abortInflightRefresh();
  // 注意这里**不**连带去掐在途的 authWrite。
  //
  // 「一次成功的写会话请求作废其它在途的写会话请求」这条规则是对的，但它有方向：
  // 只作废**比它早发出**的那些。在这里无条件全掐会误伤更新的用户意图 ——
  // 改密的响应回来时，用户可能已经点了退出登录，掐掉那次登出就等于
  // 「点了退出却还留在登录态」。所以这件事交给 `apiRequest` 按发起序号去做
  //（见 `_authWrites` 与 `abortInflightAuthWrites(beforeSeq)`）。

  if (switched) {
    // 与 `doRefresh()` 那条路对称：提代次只作废**在途请求**，并不会让会话上下文
    // 把手里那份旧档案丢掉。少了这一步，「装上 B 的令牌 → 紧接着取档案失败」
    // 会让界面继续显示 A，而请求已经以 B 的身份发出去了。
    //
    // 带上新主体：会话上下文要靠它给「已经对外宣告过谁」记账，
    // 否则随后的 `commitUser()` 会把同一次换人再宣告一遍（见 SessionContext 的防回声）。
    dispatchAuthEvent(SESSION_IDENTITY_CHANGED, { subject });
  }
  // **每一次成功安装都要说一声**，不只是换人那次。
  //
  // 这个函数只有「用户此刻亲手做的、会换来新令牌的动作」会调 ——
  // 登录（密码/二次验证/Passkey）、OAuth 兑换，以及改密后的会话换发。
  // 三者都是明确的用户动作，都该重新对外宣告一次。
  // 会话上下文要靠它把「已经宣告过谁」的记账清掉，好让随后的 `commitUser()`
  // 一定会对外广播一次。
  //
  // 少了它会漏播这一幕：别的标签页登出并广播 → 本页对齐时连续撞上网关抖动、
  // 始终没能落定 → 记账里还留着**登出之前**那个人 → 用户重新登录**同一个人** →
  // `commitUser()` 判定「和上次宣告的一样」而保持沉默 —— 别的标签页于是
  // 一直以为自己是登出状态。
  dispatchAuthEvent(SESSION_TOKEN_INSTALLED, { subject });
  return true;
}
export function getUserToken(): string | null {
  return _userToken;
}

/**
 * 认证代次。**每次登录态被作废时 +1。**
 *
 * 网络请求是可以「迟到」的：页面正在等 `/v1/me` 或一次静默续期时，用户点了登出
 *（或换了个账号登进来）。旧请求晚一步返回，如果照单全收就会把**上一个身份**恢复出来 ——
 * 界面显示着已经登出的账户，随后每个操作再各自吃一个 401。
 * 清空变量拦不住已经发出去的请求，只有代次能：发起时记下代次，落定前比一次，
 * 对不上就整个丢弃。
 */
let _authEpoch = 0;

export function getAuthEpoch(): number {
  return _authEpoch;
}

/**
 * 身份代次。**只在「确立了一个不同的身份」或用户显式登出时 +1。**
 *
 * 与认证代次的区别，是「谁死了」和「谁上位了」的区别：
 *
 * - 后台一次静默续期吃了 401（会话过期/被吊销）—— 有个身份结束了，此前以它名义发出的
 *   请求确实都该作废，所以 `_authEpoch` 要 +1。但**没有任何新身份被确立**。
 * - 另一个标签页登录了别的账号 —— 浏览器的 cookie 已经是那个人的了，此时把本标签页
 *   正在跑的登录流程换来的令牌装上，界面与 cookie 就是两个人。这才需要拦。
 *
 * 登录流程（密码/MFA/OAuth 兑换/改密换发）要拦的是后者。它们从发起到拿到令牌之间
 * 隔着好几个来回，期间完全可能撞上前者 —— 一条早就该死的旧续期返回 401，
 * `_authEpoch` +1，于是这次**完全有效**的登录被判成「已过期」，令牌被丢弃。
 * OAuth 兑换尤其糟：后端那枚一次性 `loginCode` 已经被消费掉了，前端还没法重兑，
 * 用户只能从头再走一遍 OAuth。
 *
 * 所以登录流程一律记 `getIdentityGen()`、比 `getIdentityGen()`；
 * 而「丢弃迟到的响应体」这类用途仍然用 `getAuthEpoch()`。
 */
let _identityGen = 0;

export function getIdentityGen(): number {
  return _identityGen;
}

/**
 * 只提代次，不动内存令牌。
 *
 * 用在「换了个人」这条边界上：多标签页共享同一枚 refresh cookie，另一个标签页登录了
 * 别的账号之后，本标签页续期回来的就是新账号 —— 此时刚拿到的令牌是**要**保留的，
 * 该作废的是此前以旧身份发出、还没回来的那些请求。`clearUserAuth()` 会连令牌一起清，
 * 在这里用就等于把刚建立的新会话也一并毁掉。
 */
export function bumpAuthEpoch(): void {
  _authEpoch += 1;
}

/**
 * 身份边界：**别的标签页**改变了这个浏览器的登录态（登录了别的账号 / 登出了）。
 *
 * 认证代次与身份代次都要动。只动认证代次是不够的 —— 那样本标签页正在跑的登录流程
 * 记的还是旧的身份代次，它随后拿到的令牌会**顺利装上**：
 * 别的标签页刚刚登出，这边却把那个身份又装了回来、还对外宣告了一遍。
 * 而浏览器的 cookie 此刻已经是「登出后」的状态，界面与 cookie 就此各说各话。
 */
export function bumpIdentityBoundary(publishedAt?: number): void {
  // **先看因果：这条通知是不是比本页正在跑的写会话请求还早产生的。**
  //
  // 广播只保证「送到」，不保证「按发生顺序送到」。A 标签页产生一条登出通知，
  // 传输路上耽搁了一会儿；这期间用户在本标签页开始了一次新的登录。
  // 通知随后才到 —— 若照单全收地提代次 + 掐在途请求，那次**更新的**登录就被
  // 一个**更早发生**的事件取消了，用户得重新登录一遍，而他什么都没做错。
  //
  // 有发出时刻可比时就按时刻判；没有（旧版本的通知）则退回原行为。
  const staleRelativeToLocalWrite =
    publishedAt !== undefined && _lastAuthWriteAt > 0 && publishedAt < _lastAuthWriteAt;

  _authEpoch += 1;
  if (staleRelativeToLocalWrite) {
    // 仍然作废在途的**读**结果并重新对齐（浏览器的登录态确实可能已经变了），
    // 但不动身份代次、也不掐那次登录 —— 它比这条通知新。
    console.warn("[auth] 收到的登录态通知早于本页正在进行的登录，只重新对齐、不取消它");
    return;
  }
  _identityGen += 1;
  // 本页在途的登录/兑换若此刻落地，会把**这个**身份的 cookie 盖到
  // 别的标签页刚建立（或刚清掉）的登录态上。掐掉，让用户重来一次。
  abortInflightAuthWrites();
}

/**
 * 只丢掉内存里的令牌，**不动任何代次、不掐任何在途请求**。
 *
 * 用在「落定为未登录、但没有任何身份被终结」这条路上：本标签页得出「这个浏览器
 * 现在没有可用会话」的结论时，手里那枚 access token 就不该再往外发了 ——
 * 界面显示未登录、请求却仍带着一枚**仍然有效**的令牌（服务端那条会话可能还活着），
 * 是状态与实际身份的直接矛盾：用户看到自己已登出，却还能访问受保护接口。
 *
 * 与 `clearUserAuth()` 的区别正是「不提代次」：提了会把此刻可能正在跑的登录流程
 * 一并误伤（它随后拿到的令牌会因代次对不上而装不上，页面卡在处理中）。
 */
export function clearUserTokenOnly(): void {
  _userToken = null;
  _lastSubject = null;
}

/** 清除登录态（全站唯一一条会话），并作废所有在途请求的结果。 */
export function clearUserAuth(): void {
  _userToken = null;
  // 主体记忆一并清空：不清的话，下次登录（哪怕是同一个人）会被误判成「换了人」而多提一次代次。
  _lastSubject = null;
  _authEpoch += 1;
  // 身份代次也要动：这条路是**用户显式登出**或会话上下文判定「这个身份到此为止」。
  // 登出之前发起、之后才拿到令牌的流程必须被拦下 —— 否则就是「登出之后又被登了回去」。
  // 注意这与续期吃 401 的那条路不同：那里只死了一个身份、没有新身份上位，故只提认证代次。
  _identityGen += 1;
  // **同一个标签页里登出/换号，也要把在途的续期掐掉。**
  //
  // 只提代次是不够的：那只能丢弃迟到响应的**响应体**，而浏览器照样会处理它的
  // `Set-Cookie`，把刚被终结的那个账号的 refresh cookie 又写回去。
  // 掐掉是唯一能真正阻止它的办法（掐得掉的话响应根本不会被处理）。
  //
  // 掐掉之后把 `_refresh` 一并清空是安全的：串行链的意义在于「别与在途那次并发轮换」，
  // 而被中止的请求已经不会再产生任何结果，没有什么可等的。
  // 若它其实已经到达服务端并完成了轮换，浏览器手里就是一枚旧 cookie ——
  // 后端的 race-grace 窗口（RACE_GRACE_MS）正是为这种情况准备的，会再轮出一枚可用的。
  abortInflightRefresh();
  // 在途的登录/兑换同样要掐：它们的响应会把刚被清掉的会话 cookie 重新写回来，
  // 那就是「登出之后又被登了回去」——而且是浏览器层面的，前端拒装令牌也拦不住。
  abortInflightAuthWrites();
}

// ─── refresh token 轮换（C 端平面）──────────────────────────────

/**
 * 续期结果。
 *
 * `user` 是后端在同一次响应里附带的完整档案（见 Pass 的 POST /v1/auth/refresh）。
 * 有它就不必再发一次 `GET /v1/me` —— 那两次请求是**串行**的（第二次要用第一次的
 * 令牌），冷启动时这段时间里前端对「我是谁」还没有权威答案，
 * 只能停在 `unknown`（配合本地身份提示画个占位）。省掉的正是这一段。
 * 老后端不带 `user` 时它是 undefined，调用方回落到单独请求 /v1/me。
 */
export interface RefreshResult {
  accessToken: string;
  user?: MeProfile;
}

/**
 * 续期为什么没成。
 *
 * `expired`：后端明确说这条会话不能用了（401）。这时清登录态是对的。
 * `transient`：网关 5xx / 限流 / 网络中断 / 响应异常 —— 只说明这一次没问到。
 *   **绝不能据此登出**：用户的 refresh cookie 好好的，把他踢回登录页只会让他
 *   在同一个抖动的网关上再走一遍登录。
 * `stale`：这次续期属于上一个身份（期间登出/换号了），结果整个作废。
 */
export type RefreshFailure = "expired" | "transient" | "stale";

/** 续期结果：成功带令牌，失败带原因。 */
export type RefreshOutcome =
  | { ok: true; value: RefreshResult }
  | { ok: false; reason: RefreshFailure };

/**
 * 上一次续期拿到的令牌属于谁（access token 的 `sub`）。
 *
 * 「换了人」这条认证边界不能只靠响应里带不带 `user` 来判断 —— 那把一件安全相关的事
 * 挂在了「档案组装有没有成功」和「React 有没有挂上监听」这两个无关条件上。
 * 令牌自己就写着主体，客户端自行比对，判断就不会漏。
 */
let _lastSubject: string | null = null;

/**
 * 取 access token 的 `sub`，**仅用于识别身份是否变化**。
 *
 * 这里不做也不需要做签名校验：客户端本来就无权判定令牌真伪，真伪由后端每次请求校验。
 * 解析失败返回 null（当作「不知道」，不据此推进任何状态）。
 */
function subjectOf(token: string): string | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}

/**
 * 在途的续期请求，**连同它属于哪个认证代次**。
 *
 * 只记 Promise 是不够的：代次变了（换号/登出）之后，旧代次那次续期的结论对新身份毫无意义 ——
 * 它会因为代次校验返回 null，而调用方看到「续期失败」就把当前这个**合法**的新会话判成失效。
 * 复用必须以「同一代次」为前提。
 */
interface RefreshEntry {
  epoch: number;
  promise: Promise<RefreshOutcome>;
  /**
   * 结算这条续期的结果。**取消时必须由取消方调用**。
   *
   * 被取消的续期可能正排在 Web Locks 的队里 —— 那时它既没有 `AbortController`
   * 可掐，也不会自己跑到「拿到锁后检查 cancelled」那一步（锁可能被另一个标签页
   * 长时间持有）。不主动结算的话，所有 `await` 这个 Promise 的调用方会**一直挂着**。
   */
  settle: (outcome: RefreshOutcome) => void;
  /**
   * 等待方共享的那个 promise（`promise` 套上一层软超时预算，见 `awaitRefresh`）。
   *
   * **必须整条共享，不能每个调用方各自套一层。** 各套一层的话，请求被代理挂住时
   * 第一个调用方等 45 秒、第 46 秒来的第二个又从头等 45 秒 ——
   * 启动阶梯几轮下来能累计好几分钟，用户对着加载屏干等。
   * 共享之后，这一条续期的「放弃」只发生一次，之后来的调用方立刻拿到那个已定的结果。
   */
  wait: Promise<RefreshOutcome>;
  /**
   * 已被作废。
   *
   * `AbortController` 只够得着**已经进入 `fetch()`** 的请求。而续期可能正排在
   * Web Locks 的队里等着 —— 那时还没有 controller 可 abort，登出/换号之后
   * 这个回调仍会拿到锁、照常发出请求，它的 `Set-Cookie` 会把旧账号的
   * refresh cookie 写回浏览器。拿到锁之后必须再看一眼这面旗子。
   */
  cancelled: boolean;
}

let _refresh: RefreshEntry | null = null;

/**
 * 在途续期的中止句柄。
 *
 * 认证代次能丢弃迟到的**响应体**，却撤不回浏览器已经处理掉的 `Set-Cookie` ——
 * 一个很久以前发出的续期请求落地时，会把当时那个账号的 refresh cookie 重新写回去。
 * 唯一能真正阻止它的办法是**在响应到达前把请求掐掉**。
 * 别的标签页登录/登出时会经 BroadcastChannel 通知到这里（见 SessionContext）。
 */
/**
 * 在途续期请求的中止句柄，**是个集合而不是一个引用**。
 *
 * 软超时放弃等待之后，`_refresh` 会被让出来，后来的调用因此可以发起第二发续期 ——
 * 而第一发还在飞。用单个引用的话，第二发会把它覆盖掉：
 * 此后任何一次认证边界（登出、换号、收到广播）只掐得到第二发，
 * 第一发继续跑到底，它迟到的 `Set-Cookie` 会把**旧账号的 refresh token**
 * 写回浏览器 —— 新身份的会话就此被旧的盖掉，或者下一次续期直接撞上重用检测。
 *
 * 认证边界要掐的是「属于旧身份的一切」，那就得一个不漏。
 */
const _refreshAborts = new Set<AbortController>();

/**
 * 中止在途的续期请求。
 *
 * 用在「别处已经换了身份」的时刻。掐得掉就掐 —— 掐掉之后那个响应的 `Set-Cookie`
 * 不会被应用；掐不掉（响应已在路上）也不会更糟，代次仍会丢弃它的结果。
 */
/**
 * 在途的「会写会话 cookie」的请求（见 `RequestOptions.authWrite`），连同它们的发起序号。
 *
 * 用 Map 而不是单个引用：这几条路本来就可能重叠（比如 OAuth 兑换还没回来，
 * 用户又在另一个入口提交了密码登录）。
 *
 * 记序号是为了分清**谁先谁后**。「一次成功的写会话请求应当作废在途的其它写会话请求」
 * 这句话只在「其它那些比它早」时才成立 —— 改密的响应回来时，用户可能已经
 * 点了退出登录，那次登出是**更新的意图**，掐掉它等于让用户点了退出却还留在登录态。
 */
const _authWrites = new Map<AbortController, number>();
let _authWriteSeq = 0;
/**
 * 最近一次「会写会话 cookie」的请求是**什么时候发出的**。
 *
 * 用来判因果：一条跨标签页的通知若**产生**得比它还早、只是晚到了，
 * 就不该把这次请求取消掉 —— 那是用户更新的意图。见 `bumpIdentityBoundary`。
 */
let _lastAuthWriteAt = 0;


/**
 * 中止在途的「会写会话 cookie」的请求。
 *
 * @param beforeSeq 只掐发起序号小于它的（即「比我早的」）。不给则全掐。
 *
 * 认证边界上必须做这件事，理由见 `RequestOptions.authWrite`。
 */
export function abortInflightAuthWrites(beforeSeq?: number): void {
  for (const [controller, seq] of _authWrites) {
    if (beforeSeq !== undefined && seq >= beforeSeq) continue;
    try {
      controller.abort();
    } catch {
      /* noop */
    }
    _authWrites.delete(controller);
  }
}

export function abortInflightRefresh(): void {
  const entry = _refresh;
  // 三件事都要做：置旗（拦住还在排队的）、abort（掐掉已经在飞的）、
  // **结算**（让所有等待方立刻拿到 stale，而不是无限期挂着）。
  if (entry) {
    entry.cancelled = true;
    entry.settle({ ok: false, reason: "stale" });
  }
  try {
    for (const c of _refreshAborts) c.abort();
  } catch {
    /* noop */
  }
  _refreshAborts.clear();
  _refresh = null;
}

/**
 * 等一次续期落地，但**不无限期地等**。
 *
 * 这是一个**软**超时：到点只让等待方放弃，**绝不 abort** 那个请求。
 *
 * 为什么不能 abort：后端在事务里就完成了令牌轮换并提交，之后才组装档案、才发响应。
 * 中途 abort 会让服务端那边旧令牌已是 rotated、而浏览器仍握着那枚旧 cookie ——
 * 而不 abort 的话，那个请求继续跑：真回来了，浏览器照样处理它的 `Set-Cookie`，
 * 会话完好无损。
 *
 * ⚠️ **这个预算与后端的 `RACE_GRACE_MS` 是一对耦合的数字。**
 * 放弃之后，后来的调用会带着那枚**没更新的**旧 cookie 再发一次续期；
 * 若服务端那次其实已经轮换过，这一发就落在「已轮换的令牌又被提交了」这条路上。
 * 后端只有在 `RACE_GRACE_MS` 之内才把它当成重试（再轮出一枚可用的），
 * 超出就按重用处理、**吊销整条会话族** —— 所有标签页一起掉线。
 * 所以后端那个窗口必须**大于**这里的预算；改动任何一个之前，先去看另一个
 *（`TransCircle-Pass/src/routes/auth.ts` 的 RACE_GRACE_MS）。
 *
 * 那这个超时到底救了什么：救的是**等待方**。没有它，一个被代理挂住、永不返回的
 * 连接会让启动探测停在第一次 await 上（连后面装 wake 监听那几行都执行不到）、
 * 让广播对齐的轮次永远跑不完、
 * 让整个门户停在加载屏且没有任何后续触发点。「浏览器自己会超时」不是可靠的兜底：
 * 代理保持连接不返回响应就能复现。
 *
 * 时长取得比任何合理的服务端耗时都长：到了这个点，「服务端还在算」已经不是解释了。
 */
const REFRESH_WAIT_BUDGET_MS = 45000;

function awaitRefresh(
  promise: Promise<RefreshOutcome>,
  onGiveUp?: () => void,
): Promise<RefreshOutcome> {
  if (typeof setTimeout !== "function") return promise;
  return new Promise<RefreshOutcome>((resolve) => {
    let done = false;
    const finish = (outcome: RefreshOutcome) => {
      if (done) return;
      done = true;
      resolve(outcome);
    };
    const timer = setTimeout(() => {
      console.warn("[auth] 续期迟迟没有结果，等待方先放弃（请求本身继续，不中止）");
      onGiveUp?.();
      finish({ ok: false, reason: "transient" });
    }, REFRESH_WAIT_BUDGET_MS);
    void promise.then(
      (outcome) => {
        clearTimeout(timer);
        finish(outcome);
      },
      () => {
        clearTimeout(timer);
        finish({ ok: false, reason: "transient" });
      },
    );
  });
}

/** 经 POST /v1/auth/refresh 刷新 C 端 access token；同代次内并发共享同一请求。 */
function doRefresh(): Promise<RefreshOutcome> {
  const startedAt = _authEpoch;
  if (_refresh && _refresh.epoch === startedAt) return _refresh.wait;

  // 代次已变：旧的那次不能复用，但也不能与它并发 ——
  // 两次续期同时拿同一枚 refresh cookie 去轮换，正是后端重用检测要拦的东西。
  // 等它落地，再发起属于当前代次的这一次。
  const previous = _refresh?.promise;
  // 出发时手里的令牌。401 分支要用它判断「这期间是不是已经有人装上了新令牌」——
  // 只比代次不够：同一个人重新登录时主体没变，代次也就不会变。
  const tokenAtStart = _userToken;
  const run = async (): Promise<RefreshOutcome> => {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    if (controller) _refreshAborts.add(controller);
    try {
      // ⚠️ **这里刻意没有硬超时。** 曾经加过 20 秒的，是个错误的交换，记下来免得再犯：
      //
      // 后端的令牌轮换在事务里就完成并提交了，之后才组装档案、才发响应。
      // 中途 abort 的话，服务端那边旧令牌**已经是 rotated 状态**，而浏览器手里
      // 仍是那枚旧 cookie。随后的重试带着它过去，只要距离轮换超过 `RACE_GRACE_MS`
      //（那个窗口现在按本文件的 `REFRESH_WAIT_BUDGET_MS` 配过，两者必须一起改），
      // 后端就会判成**刷新令牌重用** —— 整条会话族被吊销，
      // 用户连同其它标签页一起被踢下线，还得重新登录。
      // 也就是说：一次「正常但偏慢」的响应会被硬超时变成一次强制登出。
      //
      // 它本来要防的是「fetch 永远挂着、页面停在 unknown」。那个问题真实存在，
      // 但更罕见、后果更轻（一次加载屏），而且已有别的缓解：启动探测的退避阶梯、
      // 回到前台 / 网络恢复时的重探，以及浏览器自身的网络层超时。
      // 在「偶尔多转一会儿圈」和「正常慢一点就被踢下线」之间，选前者。
      const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (res.status === 401) {
        // 同样要比代次：这可能是**上一个身份**发出的续期请求迟到了。
        // 无条件清令牌的话，会把此刻已经登录进来的新账号一起踢掉。
        if (_authEpoch !== startedAt) {
          console.warn("[auth] refresh 的 401 已过期（登录态在此期间被作废），忽略");
          return { ok: false, reason: "stale" };
        }
        // 这期间已经有人装上了新令牌（同一个人重新登录 —— 主体没变，所以代次也没变）：
        // 这条 401 说的是**那条已经死掉的旧会话**，与刚建立的新会话无关。
        // 不加这道判断，「会话过期 → 用户当场重新登录 → 旧续期的 401 迟到」
        // 会把刚登录成功的人再踢出去一次。
        if (_userToken !== tokenAtStart) {
          console.warn("[auth] refresh 的 401 属于已被替换的旧令牌，忽略");
          return { ok: false, reason: "stale" };
        }
        console.warn("[auth] refresh failed: 401 — session expired or revoked");
        // **只有本来就有身份，才谈得上「作废」。**
        //
        // 冷启动时 `tokenAtStart` 与 `_lastSubject` 都是 null —— 那时的 401 只是说
        //「这个浏览器没有可用的会话」，没有任何东西需要被终结。
        // 而此刻页面上很可能正跑着一条登录流程（OAuth 回调兑换、二次验证落地）：
        // 提代次会让它随后 `installAccessToken()` 失败，一次**有效的登录**
        // 就这样被一个后台探测打掉了。
        //
        // 有身份时照旧一次做完（清令牌、清主体、提代次、广播）——
        // 分散到调用方去做，就会出现「有的路径广播了、有的没有」。
        const hadIdentity = tokenAtStart !== null || _lastSubject !== null;
        if (hadIdentity) {
          _userToken = null;
          _lastSubject = null;
          _authEpoch += 1;
          dispatchAuthEvent("pass:session-expired");
        }
        return { ok: false, reason: "expired" };
      }
      if (!res.ok) {
        // **只有 401 才算「会话没了」。**
        //
        // 「缺少 refresh token」（另一个标签页登出、清掉了共享 cookie）已经由后端改成
        // 401 INVALID_REFRESH_TOKEN，所以真实的失效场景都会走上面那条分支。
        // 剩下的非 401 一律按瞬态处理、保留会话 —— 因为它们大多根本不是本服务答的：
        // 反向代理/WAF/路由错误会吐出 403、404、413、422……拿它们去清掉一个
        // 完好的登录态，是在替一段谁也没审过的中间链路做终审。
        // 代价对比很清楚：判错成瞬态最多让用户多等一次自动续期；
        // 判错成失效则是当场把人踢下线。
        // 走到这里必然不是 401（401 在上面已经处理并返回），一律按瞬态处理、保留会话。
        console.warn(`[auth] refresh failed: HTTP ${res.status} — transient, token preserved`);
        try {
          const body = await res.json().catch(() => ({}));
          console.warn(`[auth] refresh error body:`, body);
        } catch { /* empty */ }
        return { ok: false, reason: "transient" };
      }
      const body = (await res.json()) as { data?: { accessToken?: unknown; user?: MeProfile } };
      const issued = body.data?.accessToken;
      // 与 installAccessToken 同样的理由：类型断言描述的是契约，不是实际收到的字节。
      // 只判 truthy 的话，`accessToken: {}` 或数字会被原样写进 `_userToken`，
      // 之后每个请求都带着一个非法的 Authorization 头出门。
      if (typeof issued === "string" && issued !== "") {
        // 这次续期发出之后登录态被作废过（登出 / 换号 / 会话失效）：
        // 结果整个丢弃，既不写内存令牌，也不广播档案 —— 否则就把刚登出的人又「登回来」了。
        //
        // 两个条件都要查，与 401 分支对称。只查代次挡不住这一幕：
        // 冷启动时 `tokenAtStart` 与 `_lastSubject` 都是 null，此时另一条流程登录了 B，
        // 因为「此前没有主体」而不会提代次 —— 于是 A 的旧续期响应会顺利通过代次检查，
        // 把 A 的令牌盖到刚登录的 B 头上，还顺带广播一份 A 的档案。
        if (_authEpoch !== startedAt || _userToken !== tokenAtStart) {
          console.warn("[auth] refresh 结果已过期（期间登录态被作废或已装上新令牌），丢弃");
          return { ok: false, reason: "stale" };
        }
        // 续期回来的是**另一个人**：这本身就是一条认证边界，就地提代次。
        // 不能等 SessionContext 拿到档案再判断 —— 响应可能根本没带档案，
        // 而 handle401 已经准备好拿这枚新令牌去重放上一个身份发出的请求了。
        const subject = subjectOf(issued);
        const switched = subject !== null && _lastSubject !== null && subject !== _lastSubject;
        if (switched) {
          console.warn("[auth] 续期返回了另一个身份，作废此前在途的请求");
          _authEpoch += 1;
          _identityGen += 1; // 确实有个**新的**身份上位了（浏览器 cookie 已经是他的）
          // 在途的登出/改密/登录属于上一个身份，其响应会把 cookie 写回旧状态。
          abortInflightAuthWrites();
        }
        if (subject !== null) _lastSubject = subject;

        _userToken = issued;
        const value: RefreshResult = { accessToken: issued };
        if (body.data?.user) value.user = body.data.user;
        // 401 自动续期也会走到这里。把档案广播出去，让会话上下文顺手把
        // 「谁登录着」刷新一遍 —— 否则只有启动那一次能拿到它。
        // 换人了就**无条件**广播，不能只在带回档案时才说。
        //
        // 后端的档案组装是允许失败的（失败时只回令牌、不回 user）。撞上那一次，
        // 页面会停在「上一个人」的档案上，而内存里的令牌已经是新人的 ——
        // 界面显示 A、请求却以 B 的身份执行，用户在 A 的界面上做的操作会落到 B 头上。
        // 广播之后由 SessionContext 把旧档案丢掉、退回 unknown 并重新拉取。
        if (switched) dispatchAuthEvent(SESSION_IDENTITY_CHANGED, { subject });
        if (value.user) dispatchUserEvent(value.user);
        return { ok: true, value };
      }
      // 声称成功却没给令牌：响应体不对劲，按瞬态处理而不是判定会话失效。
      console.warn("[auth] refresh response missing accessToken, body:", body);
      return { ok: false, reason: "transient" };
    } catch (err) {
      console.warn("[auth] refresh network error:", err);
      return { ok: false, reason: "transient" };
    } finally {
      // 请求已经结束，从可中止清单里摘掉 —— 留着的话集合会随页面停留时间无限增长，
      // 而且下一次认证边界会去 abort 一堆早已完成的 controller。
      if (controller) _refreshAborts.delete(controller);
    }
  };

  /**
   * **条目必须在 worker 启动之前就存在。**
   *
   * 之前写成「先跑 IIFE、再给 `entry` 赋值」，在**没有 Web Locks 且没有上一次续期**
   * 的环境里必炸：async 函数体会同步执行到第一个 await，而那条路径上
   * `return await guarded()` 是同步调用的 —— 那时 `entry` 还是 undefined，
   * 读 `entry.cancelled` 直接 TypeError，异常穿透出 `doRefresh`，
   * 启动探测变成未处理 rejection、状态永久停在 unknown。
   *
   * 用一个 deferred 把「条目」与「开始干活」拆开：先建好条目登记进 `_refresh`，
   * 再启动 worker，顺序上就不可能再读到未初始化的它。
   */
  let resolveOnce!: (outcome: RefreshOutcome) => void;
  const promise = new Promise<RefreshOutcome>((resolve) => {
    resolveOnce = resolve;
  });
  // Promise 只认第一次 resolve，但用一面旗子把「已经结算过」显式记下来，
  // 免得后来的代码以为自己那次生效了。
  let settled = false;
  const settle = (outcome: RefreshOutcome): void => {
    if (settled) return;
    settled = true;
    resolveOnce(outcome);
  };
  const entry: RefreshEntry = {
    epoch: startedAt,
    promise,
    cancelled: false,
    settle,
    // 软超时的计时**在这里起一次**，此后所有等待方共享同一份结果。
    //
    // 放弃时还要把 `_refresh` 让出来。不让的话，这个已经结算成 transient 的
    // `wait` 会被后续每一次调用直接复用 —— 启动重试、401 重试、唤醒探测拿到的
    // 全是同一个「失败」，而且**再也不会发出新的续期请求**，页面就此长期停在 unknown。
    // 那等于把软超时本来要救的东西又原样堵死了一遍。
    //
    // 让出来之后，后来的调用会发起一次**新的**续期，与那个还挂着的旧请求并发。
    // 这看起来违反了「别与在途那次并发轮换」，但那条规矩在这里已经无事可做了：
    // 旧请求要么根本没到达服务端（没轮换，新请求完全安全），
    // 要么已经轮换过而响应丢了 —— 那时浏览器手里本来就是一枚过期 cookie，
    // **任何**后续续期都会撞上重用检测，堵着不发一样救不了它，只是多堵一个页面。
    wait: awaitRefresh(promise, () => {
      if (_refresh === entry) _refresh = null;
    }),
  };
  _refresh = entry;

  /** 拿到锁之后、真正发请求之前的最后一道闸。 */
  const stillWanted = (): boolean => !entry.cancelled && _authEpoch === startedAt;
  const guarded = async (): Promise<RefreshOutcome> => {
    if (!stillWanted()) {
      console.warn("[auth] 续期在排队期间被作废（登出/换号），不再发出请求");
      return { ok: false, reason: "stale" };
    }
    return run();
  };

  void (async () => {
    if (previous) await previous.catch(() => null);
    try {
      // 跨标签页串行化：多个标签共用同一 HttpOnly refresh cookie，并发刷新会用到已轮换的
      // 旧 cookie 触发轮换竞态/误判重用。用 Web Locks 串行，确保每次刷新都基于最新 cookie。
      //
      // ⚠️ 没有 Web Locks 的浏览器（Chrome<69 / Firefox<96 / Safari<15.4）退化为
      // 仅同标签页串行：两个标签页仍可能同时轮换同一枚 cookie。后端有一段
      // race-grace 窗口兜底（见 auth.ts 的 RACE_GRACE_MS，窗口内会再轮换出可用令牌），
      // 超出则触发重用检测、吊销整条令牌族 —— 后果是误登出，不是越权。
      // 目标浏览器全都支持 Web Locks，暂不为此再叠一层 BroadcastChannel 租约。
      if (typeof navigator !== "undefined" && navigator.locks?.request) {
        settle(await navigator.locks.request("pass-refresh", guarded));
        return;
      }
      settle(await guarded());
    } catch (err) {
      // Web Locks 本身也可能失败（锁被抢占/中止）。绝不能让这个 Promise 悬着 ——
      // 所有等它的调用方都会永远挂住。按瞬态收尾，不动当前会话。
      console.warn("[auth] 续期调度失败:", err);
      settle({ ok: false, reason: "transient" });
    } finally {
      // **只清自己那一份。** `clearUserAuth()` 会把 `_refresh` 置空，
      // 之后可能已经有一次新的续期挂在上面；旧请求晚一步结束时无条件置空，
      // 就把别人正在共享的那个引用抹掉了 —— 后续调用会再发一次续期，
      // 在没有 Web Locks 的浏览器上足以撞上后端的刷新令牌重用检测。
      if (_refresh === entry) _refresh = null;
    }
  })();

  return entry.wait;
}

/**
 * 应用启动时尝试静默续期，恢复 C 端会话。
 * 返回 access token 与（后端支持时）同批下发的用户档案。
 */
export async function tryRefreshToken(): Promise<RefreshResult | null> {
  const outcome = await doRefresh();
  return outcome.ok ? outcome.value : null;
}

/**
 * 与 `tryRefreshToken()` 同一次续期，但**保留失败原因**。
 *
 * 启动探测需要这个区别：`expired` 才是「你确实没登录」，可以落定未登录；
 * `transient`（网关 502 / 限流 / 断网）只是「这一次没问到」，把它当成未登录，
 * 就是让一个 refresh cookie 完好的用户在首屏看到登录入口。
 */
export async function tryRefreshOutcome(): Promise<RefreshOutcome> {
  return doRefresh();
}

/** 续期响应携带用户档案时广播；SessionContext 据此更新已确认的用户。 */
export const SESSION_USER_EVENT = "pass:session-user";

/**
 * 续期发现**换了个人**时广播。
 *
 * 与 `SESSION_USER_EVENT` 的区别：那个说的是「这是最新的档案」，
 * 这个说的是「你手里那份档案已经不是当前身份的了，丢掉它」——
 * 后者必须无条件发出，不能依赖响应里恰好带回了新档案。
 */
export const SESSION_IDENTITY_CHANGED = "pass:identity-changed";
/**
 * 一次**本地登录动作**换来的令牌刚刚装好（无论是不是换了人）。
 *
 * `detail` 带着新令牌的主体。会话上下文据此**立刻**对外宣告一次
 *（而不是等 `/v1/me` 回来才在 `commitUser()` 里宣告）—— 那中间隔着一整个往返，
 * 别的标签页在这段时间里若有属于旧身份的写会话请求落地，就把刚建立的 cookie 盖掉了。
 * 宣告得越早，别的标签页掐掉在途请求的机会越大。
 */
export const SESSION_TOKEN_INSTALLED = "pass:token-installed";

function dispatchUserEvent(user: MeProfile): void {
  try {
    window.dispatchEvent(new CustomEvent<MeProfile>(SESSION_USER_EVENT, { detail: user }));
  } catch {
    /* noop */
  }
}

// ─── CSRF（OAuth 注册/绑定双提交防护）──────────────────────────

/**
 * 读取 oauth_pending_csrf：优先 Cookie，回退 sessionStorage（跨页导航存活）。
 *
 * ⚠️ 跨子域部署（门户 ↔ api.*）下这个 Cookie 是 API 主机的 host-only Cookie，这里**必然读空**，
 * 只能回退 sessionStorage —— 令牌由后端回调重定向的 `csrfToken` URL 参数交到页面手里，
 * 由页面 saveCsrfToken() 存进来。新增 OAuth 落地页时别忘了消费那个参数。
 * 匹配必须锚在 Cookie 边界（开头或 `; `），否则会误命中形如 `xx_oauth_pending_csrf` 的同后缀 Cookie。
 */
export function getCsrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)oauth_pending_csrf=([^;]*)/);
  if (match?.[1]) return match[1];
  try {
    return sessionStorage.getItem("oauth_pending_csrf") || "";
  } catch {
    return "";
  }
}
/**
 * 落盘 CSRF 令牌，**返回是否真的存下了**。
 *
 * 返回值不是装饰：调用方（OAuth 落地页）存完就要把令牌从地址栏抹掉，
 * 而隐私模式/嵌入环境下 sessionStorage 会抛异常。存不下还抹 URL，
 * 等于把跨子域部署下仅剩的那条通道也掐了，流程只能以 CSRF_TOKEN_INVALID 收场。
 */
export function saveCsrfToken(token: string): boolean {
  try {
    sessionStorage.setItem("oauth_pending_csrf", token);
    return true;
  } catch {
    return false;
  }
}
export function clearCsrfToken(): void {
  try {
    sessionStorage.removeItem("oauth_pending_csrf");
  } catch {
    /* noop */
  }
  document.cookie = "oauth_pending_csrf=; Max-Age=0; path=/; SameSite=Lax";
}

// ─── Idempotency-Key ────────────────────────────────────────────

/** 生成指定字节数的随机十六进制串；无 randomUUID 环境用 crypto.getRandomValues 兜底。 */
function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 无 randomUUID 环境下的 UUID v4 兜底（RFC 4122）。 */
function randomUuidV4(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return randomUuidV4();
}

// ─── 响应类型 ────────────────────────────────────────────────────

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Array<{ field: string; reason: string }>;
  data?: Record<string, unknown>;
}

export interface Pagination {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * 管理平面列表的 offset 分页响应体（api-delta §二）。
 *
 * C 端仍是游标分页（上面的 `Pagination`，随响应顶层下发）；管理端为了「点页码直达第 N 页」
 * 改成 offset —— 游标只知道下一段从哪开始，跳不到任意页。分页字段落在 `data` 里而非顶层，
 * 因此用本接口作为 `apiRequest<OffsetPage<T>>` 的泛型参数。
 *
 * `total` 必须返回，否则前端算不出页数；越界统一返回空 `items` + 真实 `total`，
 * 不报错也不自动夹到末页（夹页会让「粘贴一个页码链接」的结果和粘贴者看到的不一样）。
 */
export interface OffsetPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** 管理端列表允许的每页条数（后端白名单，其余值返回 400 INVALID_PAGE_SIZE）。 */
export const PAGE_SIZES = [10, 20, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

/** 收窄任意输入到合法每页条数；非法值回落默认 10（与后端默认一致）。 */
export function toPageSize(raw: string | number | null | undefined): PageSize {
  const n = typeof raw === "string" ? Number(raw) : raw;
  return PAGE_SIZES.find((s) => s === n) ?? 10;
}

type ApiResultBase = { requestId: string; status: number };

export type ApiResult<T = unknown> = ApiResultBase &
  (
    | { ok: true; data: T; pagination?: Pagination }
    | { ok: false; error: ApiErrorBody }
  );

/**
 * 身份平面只剩 `user` 一条。
 *
 * 保留这个字面量类型（而非直接删掉 `plane` 选项）是为了让调用点显式写出
 * `plane: "user"`，读代码时一眼看到「管理端也走用户会话」，而不是靠默认值默会。
 */
export type ApiPlane = "user";

export interface ApiRequestOptions {
  /** 身份平面：仅 user（管理端同样复用用户会话，没有第二条平面）。 */
  plane?: ApiPlane;
  /** 跳过自动注入 Authorization。 */
  noAuth?: boolean;
  /** 合并自定义请求头。 */
  headers?: Record<string, string>;
  /** 注入 Idempotency-Key。 */
  /**
   * 幂等键。
   *
   * `true` = 本次调用自动生成一个新键，只保护「同一次调用内部的自动重试」
   *（如 401 后刷新令牌再发一次）。
   *
   * 传**字符串**则用调用方给的键。**用户可能手动重试的危险操作应当传字符串**：
   * 键在一次「用户意图」内保持不变，服务端才认得出「这是同一个请求」。
   * 否则「请求已提交、响应在网关丢了 → 用户点第二次」会被当成全新请求再执行一遍 ——
   * 轮换签名密钥连做两次会把仍在签发令牌的那把推进 retired，是线上事故。
   * 用 `newIdempotencyKey()` 生成，随对话框/表单的生命周期保存。
   */
  idempotent?: boolean | string;
  /** 注入 X-CSRF-Token（OAuth 注册/绑定流）。 */
  csrf?: boolean;
  /**
   * 乐观并发控制：注入 `If-Match: <updatedAt>`。
   * 不一致时后端返回 409 STALE_WRITE 并附当前值 —— 没有这条，
   * 两个管理员同时编辑会静默互相覆盖。
   */
  ifMatch?: string | number;
  /** 不在 401 时尝试 refresh。 */
  skipRefresh?: boolean;
  /**
   * 这个请求的响应会**设置会话 cookie**（登录、二次验证、OAuth 兑换、改密换发）。
   *
   * 标上之后，它会被登记进可中止清单：一旦在它在途期间发生认证边界
   *（本页登出、别的标签页登录/登出），它会被 `abort()` 掉。
   *
   * 为什么非中止不可：认证代次只能丢弃**响应体**，拦不住浏览器处理 `Set-Cookie`。
   * 一个迟到的登录响应会把 `tcpass_refresh_token` 和 `_session` 重新写回去 ——
   * 前端明明拒绝安装了那枚 access token，浏览器却已经握着那个身份的凭据，
   * 之后直接访问 `/oauth2/auth` 就会以它静默通过。中止是唯一能真正拦住的办法。
   */
  authWrite?: boolean;
  /**
   * 只在身份代次仍等于这个值时才**发出**请求；对不上就地失败，一个字节都不发。
   *
   * 中止清单管的是「已经在飞的」，管不到「还没发的」。二次验证这类流程会在页面上
   * 停留很久（用户去翻验证码 App、去统一身份走一趟），期间别的标签页完全可能换了号 ——
   * 那之后用户点「提交」，请求照样发得出去，后端照样验证通过并写下**旧身份**的 cookie，
   * 前端才在装令牌那一步因为锚定的代次对不上而拒绝。用户看到「身份已变化」，
   * 而浏览器的 cookie 已经被污染了。
   *
   * 所以把校验提到发出之前：锚是流程开始时记的（见各登录页的 `*GenRef`）。
   */
  requireIdentityGen?: number;
  /**
   * 请求级硬超时（毫秒）。到点中止并返回 `request_timeout`。
   *
   * `fetch` 本身**没有**超时：连接建立后服务端不回、或中间设备默默吞掉了响应，
   * 这个 promise 就一直挂着。轮询循环里「每轮开始前检查总预算」的写法拦不住它 ——
   * 代码卡在 `await` 上，根本走不到下一轮的检查。页面于是既不超时也不给出路，
   * 只剩一个转个不停的圈。
   */
  timeoutMs?: number;
  signal?: AbortSignal;
}

// ─── 工具 ────────────────────────────────────────────────────────

function newRequestId(): string {
  const rand =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 20)
      : randomHex(10);
  return `req_fe_${rand}`;
}

/**
 * 401 自动处理：尝试 refresh + 重试；续期失败才清登录态并广播。
 *
 * `epoch` 是**发起这次请求时**的认证代次。等待续期的这段时间里用户完全可能登出、
 * 换个账号登进来 —— 此时既不能拿新身份去重放旧请求（那会以 B 的身份执行 A 的
 * `PATCH /v1/me`），也不能因为旧请求的 401 就把新身份判成失效。
 */
async function handle401(
  res: Response,
  url: string,
  init: RequestInit,
  headers: Headers,
  skipRefresh: boolean,
  epoch: number,
): Promise<{ response: Response; refreshFailure?: RefreshFailure }> {
  if (res.status !== 401) return { response: res };
  if (skipRefresh) return { response: res };

  const outcome = await doRefresh();
  if (outcome.ok) {
    // 换过人了：这个请求属于上一个身份，绝不能用新令牌重放。
    // 原样把 401 交回调用方，由它决定要不要在新身份下重新发起。
    if (_authEpoch !== epoch) return { response: res };
    // ReadableStream 请求体只能消费一次,已被首次请求耗尽,无法透明重放;
    // 会话已续期,把 401 交回调用方自行决定是否重发(不误清登录态)。
    if (init.body instanceof ReadableStream) return { response: res };
    headers.set("Authorization", `Bearer ${outcome.value.accessToken}`);
    try {
      return { response: await fetch(url, { ...init, headers }) };
    } catch (err) {
      // 重试这一发也可能断网/被 abort。首次 fetch 有归一化，这里没有的话异常会直接
      // 穿透出 apiRequest —— 调用方的 finally/setPending 收尾不执行，界面卡在「处理中」，
      // 还可能冒出一个未处理的 rejection。按瞬态失败归一，绝不清理当前会话。
      console.warn("[auth] 401 重试的网络错误:", err);
      return { response: res, refreshFailure: "transient" };
    }
  }

  // 收尾（清令牌 + 提代次 + 广播失效）已经在 `doRefresh` 的 401 分支里原子完成了。
  //
  // 放在那里而不是这里，是因为「会话是否终结」只有续期本人判断得了：
  // 它知道自己出发时手里是哪枚令牌、属于哪个代次。搬到调用方就必然出现
  // 「有的路径广播了、有的没有」—— 启动探测与 OAuth 回调直接调 `tryRefreshToken()`，
  // 根本不经过这里。
  //
  // 至于 transient / stale：前者是「这一次没问到」（网关抖动、限流、断网），
  // 后者是上一个身份的续期迟到了，两者都不该动当前会话。
  //
  // **但必须把原因带回去。** 只把 401 原样交回调用方是不够的：
  // `SessionContext.refresh()` 看到 401 就会落定 anonymous —— 于是
  //「令牌过期 + 续期恰好撞上网关 503」会把一个 refresh cookie 完好的用户直接登出，
  // 正是「瞬态错误维持原状」要避免的那件事。
  return { response: res, refreshFailure: outcome.reason };
}

function dispatchAuthEvent(name: string, detail?: unknown): void {
  try {
    window.dispatchEvent(new CustomEvent(name, detail === undefined ? undefined : { detail }));
  } catch {
    /* noop */
  }
}

// ─── 核心请求 ────────────────────────────────────────────────────

export async function apiRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  options: ApiRequestOptions = {},
): Promise<ApiResult<T>> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const headers = new Headers(options.headers ?? {});

  const isForm =
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof URLSearchParams ||
    body instanceof ReadableStream;

  if (body !== undefined && !isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  // 这个请求是否带着身份发出。带身份的请求，其结果只对**那个身份**有意义。
  const identityBound = !options.noAuth && !!_userToken;
  if (identityBound) {
    headers.set("Authorization", `Bearer ${_userToken}`);
  }

  if (options.csrf) {
    const csrf = getCsrfToken();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }

  if (options.ifMatch !== undefined) {
    headers.set("If-Match", String(options.ifMatch));
  }

  // 调用方给了键就用它（跨用户重试保持同一个）；给 true 则本次生成一个。
  // 401 自动重试复用同一 headers 对象，因此键在自动重试之间也保持一致。
  if (options.idempotent) {
    headers.set(
      "Idempotency-Key",
      typeof options.idempotent === "string" ? options.idempotent : newIdempotencyKey(),
    );
  }

  if (!headers.has("X-Request-Id")) headers.set("X-Request-Id", newRequestId());

  // 锚定的身份已经不是当前身份了：不发。理由见 `requireIdentityGen`。
  if (options.requireIdentityGen !== undefined && options.requireIdentityGen !== _identityGen) {
    return {
      ok: false,
      error: { code: "auth_epoch_stale", message: i18n.t("errors.identityChanged") },
      requestId: "",
      status: 0,
    };
  }

  // 会写会话 cookie 的请求一律登记进可中止清单。
  //
  // **调用方自带 signal 时也要登记**，只是把两个信号串起来。此前的写法是
  // `authWrite && !options.signal` 才建 controller —— 于是「既标了 authWrite、
  // 又传了自己的 signal」的调用完全落在清单外面：认证边界掐不到它，
  // 它的响应照样把会话 cookie 写回浏览器 —— 而调用方不会知道自己绕过了保护。
  //（`AuthMfaDonePage` 正是这么用的：它另有一个页面级 controller 用来在离开页面时收尾。）
  const needsController =
    (options.authWrite === true || options.timeoutMs !== undefined) &&
    typeof AbortController !== "undefined";
  const authWriteController = needsController ? new AbortController() : null;
  const registerAuthWrite = authWriteController !== null && options.authWrite === true;
  const authWriteSeq = registerAuthWrite ? ++_authWriteSeq : 0;
  let unlinkCallerSignal: (() => void) | null = null;
  /** 中止是**本次超时**造成的（而不是认证边界）。两者都表现为 AbortError，得分得清。 */
  let timedOut = false;
  if (authWriteController && options.timeoutMs !== undefined) {
    setTimeout(() => {
      timedOut = true;
      authWriteController.abort();
    }, options.timeoutMs);
  }
  if (registerAuthWrite && authWriteController) {
    _authWrites.set(authWriteController, authWriteSeq);
    // **一发出就掐掉比它早的**，不等自己完成。
    //
    // 「成功完成时作废更早的」只在自己先回来时才管用。同一个标签页里连着发出两条
    // 写会话请求（先起了一条登录、又起了另一条），若**先发的那条后回来**，
    // 它的 `Set-Cookie` 会盖掉后发那条刚建立的会话与 `_session` ——
    // 而认证代次只丢弃响应体，拦不住这个。
    _lastAuthWriteAt = Date.now();
    // 在发起点就掐，同一标签页任何时刻至多只有一条写会话请求在飞，
    // 谁是「最新的意图」这件事从时序上就确定了，不再取决于谁先回来。
    //（跨标签页那一半掐不掉：controller 不共享，只能靠广播尽快通知 —— 见 README 的残余说明。）
    abortInflightAuthWrites(authWriteSeq);
  }
  // 调用方自带的 signal 要串到内部 controller 上 —— **无论内部 controller 是为了
  // authWrite 还是为了 timeoutMs 建的**。只在 authWrite 分支里串的话，
  // 「只设了 timeoutMs 又传了自己 signal」的调用会发现自己的 signal 完全失灵：
  // `init.signal` 用的是内部那个，调用方 abort 掉的是另一个对象，请求照发不误。
  if (authWriteController && options.signal) {
    const caller = options.signal;
    if (caller.aborted) {
      authWriteController.abort();
    } else {
      const onCallerAbort = () => authWriteController.abort();
      caller.addEventListener("abort", onCallerAbort, { once: true });
      unlinkCallerSignal = () => caller.removeEventListener("abort", onCallerAbort);
    }
  }
  /** 摘除登记，并解开与调用方 signal 的联动（不解会把监听器留在调用方的 signal 上）。 */
  /**
   * 从可中止清单里摘除。
   *
   * **不碰超时计时器** —— 两者的生命周期不一样长：
   * 登记的意义在「别让这一发的 `Set-Cookie` 落地」，响应头一到就已经落地了，摘掉正好；
   * 而超时要一直管到函数真正返回，因为响应头之后还有 `res.json()` 那一段 ——
   * 服务端先发 200 头、响应体迟迟不结束时，body 的读取同样会无限期挂着。
   */
  const releaseAuthWrite = (): void => {
    if (!authWriteController) return;
    _authWrites.delete(authWriteController);
    unlinkCallerSignal?.();
    unlinkCallerSignal = null;
  };
  // 计时器**不主动清**，让它自然烧完。
  //
  // 要清就得清得对：它必须一直管到函数真正返回（响应头之后还有 `res.json()`，
  // 服务端先发 200 头、响应体迟迟不结束时那一段同样会无限期挂着），
  // 而那需要给整个后半段套一层 try/finally。相比之下，让它烧完的代价只是
  // 一个至多存活 `timeoutMs` 的闭包 —— 到点时 `abort()` 打在一个早已完成的
  // controller 上，是个空操作。用便宜的那个换正确的那个。

  const init: RequestInit = {
    method,
    headers,
    credentials: "include",
    signal: authWriteController?.signal ?? options.signal,
  };
  if (body !== undefined) {
    init.body = isForm ? (body as BodyInit) : JSON.stringify(body);
  }

  // 记下发起时的认证代次：401 续期与重试都要据此判断「这个请求还属于当前身份吗」。
  const epoch = _authEpoch;

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    // 被认证边界掐掉的请求要给出**能看懂**的理由。
    // 落到下面的 network_error 分支的话，用户看到的是浏览器那句
    //「The user aborted a request.」—— 既没本地化，也完全说不出发生了什么。
    const aborted = e instanceof Error && e.name === "AbortError";
    const byTimeout = timedOut;
    releaseAuthWrite();
    return {
      ok: false,
      error: aborted && byTimeout
        ? { code: "request_timeout", message: i18n.t("errors.requestTimeout") }
        : aborted
        ? { code: "auth_boundary_aborted", message: i18n.t("errors.authBoundaryAborted") }
        : {
            code: "network_error",
            message: e instanceof Error ? e.message : i18n.t("errors.networkFailed"),
          },
      requestId: "",
      status: 0,
    };
  }

  // `noAuth` 蕴含 `skipRefresh`：一个明确声明「不带身份」的请求（登录、兑换、公开查询）
  // 收到 401 时，去续期当前会话再带着 Authorization 重试是没道理的 ——
  // 「已登录用户输错密码」会变成「先刷一次自己的令牌，再带着它重发登录请求」，
  // 续期若也失败还会顺手广播一次全局会话过期，把人从别处踢下线。
  const skipRefresh = options.skipRefresh ?? options.noAuth ?? false;
  const handled = await handle401(res, url, init, headers, skipRefresh, epoch);
  // **摘除要等到这里**，不能在首个 fetch 返回时就摘。
  //
  // 401 自动续期成功后，`handle401` 会带着新令牌**重放**这个请求（复用同一个 init，
  // 因而也复用同一个 signal）。首个 fetch 一返回就摘掉的话，重放那一发就落在清单外面：
  // 认证边界到来时掐不到它，它的响应照样会把会话 cookie 写回浏览器 ——
  // 而这正是登记清单要防的那件事。响应体的读取不用 signal 覆盖：
  // 走到那一步时响应头（连同 `Set-Cookie`）早已被浏览器处理，掐也来不及了。
  res = handled.response;
  if (authWriteController) {
    // 这一发成功了：**比它早发出**的写会话请求就此作废。
    //
    // 用户在同一个标签页里连着做了两件会写会话 cookie 的事（先提交改密、
    // 又点了退出；或先起了一条登录、又起了另一条），先发的那个若晚到，
    // 它的 `Set-Cookie` 会把后发的那次结果盖掉 —— 用户看到的是「刚做的操作被撤销了」。
    // 按发起序号掐，而不是按到达顺序，才对得上用户的意图顺序。
    //
    // 判据必须取 `handled.response` —— 也就是**重试之后**的那个。
    // 用首发的响应判的话，「首发 401 → 续期成功 → 重试 2xx」这条路会被当成失败：
    // 一次实际成功的改密不会去作废更早的在途请求，那些请求随后照样把
    // 旧的会话 cookie 写回来。这条路在改密上是真实可达的。
    if (registerAuthWrite && res.ok) abortInflightAuthWrites(authWriteSeq);
    releaseAuthWrite();
  }

  /**
   * 身份变了，这个响应就不作数了。
   *
   * 401 那条路已经防住了「拿新令牌重放旧请求」，但成功响应同样危险：
   * 账号 A 的 `/v1/me/sessions` 在途期间会话切成了 B，A 的设备列表照样会返回 200，
   * 调用方拿到就往界面上写 —— 用户看到的是**别人的**数据。
   * 只拦带身份的请求：登录、兑换、公开列表这些 `noAuth` 请求与身份无关，放行。
   *
   * **解析响应体之前和之后各查一次。** 只查一次是不够的：`res.json()` 本身是异步的，
   * 响应头到达与响应体解析完成之间还有一段时间，身份完全可能在这段时间里变掉。
   */
  const identityStale = (): ApiResult<T> | null => {
    if (!identityBound || _authEpoch === epoch) return null;
    return {
      ok: false,
      error: { code: "auth_epoch_stale", message: i18n.t("errors.identityChanged") },
      requestId: res.headers.get("X-Request-Id") ?? "",
      status: res.status,
    };
  };
  const staleBeforeParse = identityStale();
  if (staleBeforeParse) return staleBeforeParse;

  const status = res.status;
  const contentType = res.headers.get("content-type") ?? "";

  if (status === 204) {
    return {
      ok: true,
      data: undefined as T,
      requestId: res.headers.get("X-Request-Id") ?? "",
      status,
    };
  }

  if (contentType.includes("application/json")) {
    // 声称 JSON 但响应体为空 / 被网关截断 / 非法 JSON 时,res.json() 会抛错。
    // 收敛为统一的错误结果,避免异常穿透到调用方(否则调用方的 setPending 等收尾不执行)。
    let json: Record<string, unknown>;
    try {
      const parsed: unknown = await res.json();
      // 声称是 JSON、也确实解析出来了，但**内容不是个对象**（`null`、数组、裸字符串）。
      // 这在网关出问题时并不罕见，而下面每一行都当它是对象在用：`json.requestId`
      // 对 `null` 会直接抛 TypeError，穿透出 apiRequest —— 调用方的收尾不执行，
      // 页面停在「处理中」。归到和「解析失败」同一条路上处理。
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new TypeError("response body is not a JSON object");
      }
      json = parsed as Record<string, unknown>;
    } catch {
      // 解析失败这条路同样要走末尾的身份校验：解析是异步的，
      // 失败与否都不影响「这期间身份可能已经变了」这个事实。
      const staleOnParseError = identityStale();
      if (staleOnParseError) return staleOnParseError;
      // 响应头到了、响应体没读完就被超时掐断：这是**超时**，不是「响应体不对劲」。
      // 归错了的话，调用方会以为服务端返回了畸形数据，而实际上它只是没说完。
      if (timedOut) {
        return {
          ok: false,
          error: { code: "request_timeout", message: i18n.t("errors.requestTimeout") },
          requestId: res.headers.get("X-Request-Id") ?? "",
          status: 0,
        };
      }
      return {
        ok: false,
        // transient 标记优先：原始 401 的响应体为空/被网关截断时，
        // 若在这里退回 invalid_response，「令牌过期 + 续期撞上 503」就又会被
        // SessionContext 当成会话失效而登出 —— 恰恰是上一轮要修的那件事。
        error: refreshFailureError(status, handled.refreshFailure)
          ?? { code: "invalid_response", message: i18n.t("errors.unknown") },
        requestId: res.headers.get("X-Request-Id") ?? "",
        status,
      };
    }
    const staleAfterParse = identityStale();
    if (staleAfterParse) return staleAfterParse;
    const requestId =
      (json.requestId as string) ?? res.headers.get("X-Request-Id") ?? "";

    if (status >= 200 && status < 300) {
      const csrf = json.csrfToken as string | undefined;
      if (csrf) saveCsrfToken(csrf);
      const pagination = json.pagination as Pagination | undefined;
      return pagination
        ? { ok: true, data: json.data as T, pagination, requestId, status }
        : { ok: true, data: json.data as T, requestId, status };
    }

    const csrf = json.csrfToken as string | undefined;
    if (csrf) saveCsrfToken(csrf);
    const error = json.error as ApiErrorBody | undefined;
    return {
      ok: false,
      error: refreshFailureError(status, handled.refreshFailure)
        ?? error
        ?? { code: "unknown", message: i18n.t("errors.unknown") },
      requestId,
      status,
    };
  }

  if (status >= 200 && status < 300) {
    return { ok: true, data: undefined as T, requestId: "", status };
  }
  return {
    ok: false,
    error: refreshFailureError(status, handled.refreshFailure)
      ?? { code: "http_error", message: i18n.t("errors.requestFailed", { status }) },
    requestId: "",
    status,
  };
}

/**
 * 401 但**续期只是暂时没成**（网关抖动/限流/断网）时用的错误码。
 *
 * 与「会话确实失效」必须分得开：调用方（尤其 `SessionContext.refresh()`）看到 401
 * 就会落定未登录，而这种情况下用户的 refresh cookie 完好无损，
 * 把他登出等于让他在同一个正在抖的网关上再走一遍登录。
 */
export const REFRESH_TRANSIENT_CODE = "auth_refresh_transient";

/** 身份已变 / 结果已过期。同样不代表「这条会话没了」。 */
export const IDENTITY_STALE_CODE = "auth_epoch_stale";

/**
 * 这些错误码的含义是「这一次没问出结果」，**不是**「你没登录」。
 * 调用方（尤其 `SessionContext.refresh()`）见到它们不得落定未登录。
 */
export const NON_REJECTING_AUTH_CODES: readonly string[] = [
  REFRESH_TRANSIENT_CODE,
  IDENTITY_STALE_CODE,
];

function refreshFailureError(
  status: number,
  failure: RefreshFailure | undefined,
): ApiErrorBody | undefined {
  if (status !== 401 || !failure) return undefined;
  // `stale` 同样不能当成会话失效。
  //
  // 同一个人重新登录时主体没变、代次也不会变，于是 `auth_epoch_stale` 那条按代次
  // 判断的路径根本不会触发；而 `doRefresh` 明明已经识别出「这次续期属于一枚
  // 已被替换的旧令牌」。不在这里翻译出来，`refresh()` 就会拿这个 401 去
  // `commitAnonymous()`，把刚装上的新令牌清掉 —— 用户刚登录就被登出。
  if (failure === "stale") {
    return { code: IDENTITY_STALE_CODE, message: i18n.t("errors.identityChanged") };
  }
  if (failure === "transient") {
    return { code: REFRESH_TRANSIENT_CODE, message: i18n.t("errors.networkFailed") };
  }
  return undefined;
}

// ─── 便捷方法（全站唯一一条平面）─────────────────────────────────

export function get<T = unknown>(path: string, options?: ApiRequestOptions) {
  return apiRequest<T>("GET", path, undefined, options);
}
export function post<T = unknown>(path: string, body?: unknown, options?: ApiRequestOptions) {
  return apiRequest<T>("POST", path, body, options);
}
export function patch<T = unknown>(path: string, body?: unknown, options?: ApiRequestOptions) {
  return apiRequest<T>("PATCH", path, body, options);
}
export function del<T = unknown>(path: string, body?: unknown, options?: ApiRequestOptions) {
  return apiRequest<T>("DELETE", path, body, options);
}

/** 便捷命名空间（与故事站 api.* 风格一致）。 */
export const api = { get, post, patch, del };
