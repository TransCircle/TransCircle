// ============================================================================
// 跨标签页的登录态广播
//
// ── 它解决的是什么 ──────────────────────────────────────────────────────────
// refresh cookie 与 `_session` 都是**浏览器级**的：同一浏览器的所有标签页共用一套。
// 认证代次（api/client.ts）能丢弃迟到的响应体，却撤不回浏览器已经处理掉的
// `Set-Cookie` —— 一个很久以前发出的续期请求落地时，会把当时那个账号的 cookie
// 重新写回去。于是「标签页 B 刚登录成 B，标签页 A 的旧续期迟到，cookie 变回 A」
// 这种事从前端是拦不住的。
//
// 拦不住，但可以**大幅缩短它的存活时间**：
//   1. 别的标签页一登录/登出，就立刻通知过来；
//   2. 收到通知的标签页把在途续期**掐掉**（掐得掉的话，那个响应的 Set-Cookie
//      根本不会被应用），并重新对齐当前的登录态。
// 没有这条通道时，发散状态要等到本标签页下一次续期才会被发现 —— 而续期**没有固定周期**：
// 它只发生在页面启动、某个请求吃了 401、以及登录/兑换这类显式流程上。
// 一个开着不动的标签页可能很久都不会续期，分裂就一直挂着。
//
// ⚠️ 这是**一致性**机制，不是安全机制：消息只在同源标签页之间传递，
// 内容不含任何凭据，收到后一律以「重新去问服务端」收场，绝不据此直接改变身份。
// ============================================================================

/** 频道名。同源同名即互通。 */
const CHANNEL = "pass:session";

/**
 * `BroadcastChannel` 不可用时的退路：`localStorage` 的 `storage` 事件。
 *
 * `storage` 事件只在**其它**标签页触发（写入的那个标签页自己收不到），
 * 正好就是这里要的语义。值带一个随机后缀，保证连续两次同类事件也一定触发
 *（写入相同的值不会派发 `storage`）。
 *
 * 没有这条退路的话，不支持 `BroadcastChannel` 的环境里跨标签页通知**完全失效** ——
 * 而那正是最需要它的时候：发散状态要等到本标签页下一次续期才被发现，
 * 而续期没有固定周期（启动 / 401 / 显式流程时才发生），空闲标签页下可能很久都不来；
 * 期间在途的写会话请求一个都掐不掉。
 */
const STORAGE_KEY = "pass:session:signal";

function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { type?: unknown; id?: unknown; at?: unknown };
  if (v.type !== "signed-in" && v.type !== "signed-out") return false;
  if (typeof v.id !== "string" || v.id.length === 0) return false;
  // `at` **可以没有**：滚动发布期间，用户开着的旧标签页发出的通知就没有它。
  // 强制要求的话，那些通知会被整条丢掉 —— 旧标签页登出，新标签页毫无察觉，
  // 继续以为自己还登录着。宁可少一项因果信息，也不能把通知本身丢了。
  return v.at === undefined || (typeof v.at === "number" && Number.isFinite(v.at));
}

/** 广播的事件。刻意只有「发生了什么」，不带任何身份数据。 */
export type SessionBroadcast =
  | { type: "signed-in" }
  | { type: "signed-out" };

/**
 * 线上格式：事件本身 + 用于去重的随机 id + **发出时刻**。
 *
 * `at` 是给收端判因果用的：一条「比本页刚发起的登录还早**产生**、却晚到」的通知，
 * 不该把那次登录取消掉（见 SessionContext 里对它的使用）。
 * 同源标签页共用系统时钟，这个比较是有意义的；系统时间被改动时最坏退回原行为。
 */
type Envelope = SessionBroadcast & { id: string; at?: number };

/**
 * 去重表的容量上限。
 *
 * 为什么必须去重：同一条通知会**两次**送达（BroadcastChannel 与 storage 并联发送），
 * 而收到广播的处理并不是「重复也无所谓」那么简单 —— 它会 `abortInflightRefresh()`
 * 再发起一次续期。处理两遍 = 掐掉刚发出的续期 R1、再发一次 R2。若 R1 其实已经到达
 * 后端并完成了轮换、只是响应慢，R2 带着的就是**旧的** refresh token ——
 * 超出后端的 race-grace 窗口就会被判成重用，整条会话族被吊销，用户当场掉线。
 *
 * **刻意不按时间过期。** 曾经是「5 分钟窗口 + 条数兜底」，那个时间维度是有害的：
 * 标签页被浏览器冻结再恢复，两条通道的副本相隔可以远超任何合理窗口；
 * 窗口一过，第二份副本就被当成新事件 —— 掐掉刚发出的续期 R1 再发 R2，
 * 而 R1 若已在后端完成轮换，R2 带的就是旧令牌，超出 race-grace 即被判成重用，
 * **整条会话族被吊销**。
 *
 * 条数上限本身也曾定得太小（64 条）：广播密集时会把「还没等到副本」的 id 挤出去，
 * 那条副本随后就被当成新事件 —— 同一个洞。现在给到 512：
 * 登录/登出本来就是低频事件，对一次会话而言约等于「永不淘汰」，
 * 代价只是几百个短字符串。
 */
const DEDUPE_MAX_ENTRIES = 512;

/**
 * 去重表**每个订阅各一份**，不是模块级共享的。
 *
 * 共享的话，同一个 realm 里若存在两个订阅者（多个 SessionProvider），
 * 第一个标记过 id 之后，第二个会被判成「重复」而完全收不到这条通知 ——
 * 它于是继续显示旧账号。两条通道的重复是**同一个订阅内部**的事，
 * 去重也就该在订阅内部做。
 */
function createDeduper(): (id: string) => boolean {
  const seen = new Set<string>();
  return (id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    // Set 按插入序迭代，超出上限就删最早的那些。
    while (seen.size > DEDUPE_MAX_ENTRIES) {
      const oldest = seen.values().next().value;
      if (oldest === undefined) break;
      seen.delete(oldest);
    }
    return true;
  };
}

function newEventId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* 落到下面的退路 */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

type Listener = (event: SessionBroadcast, publishedAt?: number) => void;

/**
 * 订阅其它标签页的登录态变化。返回取消订阅函数。
 *
 * 两条通道并联：`BroadcastChannel` 与 `localStorage` 的 `storage` 事件。
 * 前者不可用（老浏览器、部分隐私模式）时后者顶上；两条都送达时按事件 id 去重
 *（**必须**去重，理由见 `seen`）。
 */
export function subscribeSessionBroadcast(listener: Listener): () => void {
  const teardown: Array<() => void> = [];
  const markSeen = createDeduper();

  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(CHANNEL);
      const onMessage = (e: MessageEvent) => {
        if (!isEnvelope(e.data) || !markSeen(e.data.id)) return;
        listener({ type: e.data.type }, e.data.at);
      };
      channel.addEventListener("message", onMessage);
      teardown.push(() => {
        channel.removeEventListener("message", onMessage);
        channel.close();
      });
    }
  } catch {
    /* 拿不到频道就只靠下面那条退路 */
  }

  // storage 退路。两条通道都送到时按事件 id 去重（见 `createDeduper`）。
  // **不能靠「重复也无所谓」蒙混过去** —— 收到广播的处理并不是幂等的：
  // 它会掐掉在途的续期再发一次新的，做两遍就是一次多余的令牌轮换，
  // 撞上后端的重用检测会把整条会话族吊销。
  //
  // 这道 id 去重是**唯一**的一道。曾经在 SessionContext 那边加过第二道
  //（「正在对齐就跳过后来的通知」），但那道会把两条不同的边界当成重复吞掉一条，
  // 代价是身份分裂 —— 比多一次续期严重得多，已经撤掉。
  // 所以这里不设时间过期（见 DEDUPE_MAX_ENTRIES 的说明）。
  try {
    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      const onStorage = (e: StorageEvent) => {
        if (e.key !== STORAGE_KEY || !e.newValue) return;
        try {
          const parsed: unknown = JSON.parse(e.newValue);
          if (!isEnvelope(parsed) || !markSeen(parsed.id)) return;
          listener({ type: parsed.type }, parsed.at);
        } catch {
          /* 值被手改成了非法 JSON：忽略 */
        }
      };
      window.addEventListener("storage", onStorage);
      teardown.push(() => window.removeEventListener("storage", onStorage));
    }
  } catch {
    /* 隐私模式下访问 localStorage 可能直接抛 */
  }

  return () => {
    for (const fn of teardown) {
      try {
        fn();
      } catch {
        /* noop */
      }
    }
  };
}

/**
 * 告知其它标签页本标签页的登录态变了。
 *
 * **只在本标签页自己做了动作时调用**（登录成功、登出），不要在「收到广播后」再转发 ——
 * 那会在两个标签页之间形成回声。
 */
export function publishSessionBroadcast(event: SessionBroadcast): void {
  // 两条通道发的是**同一个** id，收端据此去重（见 `seen`）。
  // 这个 id 同时解决了 storage 的另一个毛病：写入相同的值不会派发事件，
  // 连播两次同类事件会丢掉第二次。
  const envelope: Envelope = { ...event, id: newEventId(), at: Date.now() };
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(CHANNEL);
      channel.postMessage(envelope);
      channel.close();
    }
  } catch {
    /* 广播失败不影响本标签页的任何行为 */
  }
  // 两条都发：BroadcastChannel 可能存在但被策略掐断（部分隐私模式），
  // 而这条通知一旦丢了，别的标签页就掐不掉在途的写会话请求。宁可重复，不可漏。
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    }
  } catch {
    /* 配额满 / 隐私模式：同样不影响本标签页 */
  }
}
