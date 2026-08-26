// ============================================================================
// Pass 管理控制台上下文
//
// 这里没有「管理员会话」这种东西。管理员就是普通 Pass 用户，进入控制台 =
// 用普通账户登录 + 该账户绑定了 IAM 且在 tc_main 下有权限。因此：
//   - 不存在独立的管理员令牌，不写 sessionStorage，也没有定时登出；
//   - 所有管理端请求走普通用户会话（apiRequest 的 plane: "user"）；
//   - 身份与权限来自 GET /v1/admin/me，无权限时后端返回 403 NO_ADMIN_ACCESS。
//
// 权限**不在令牌里**（tc_permissions 从不进 token，是刻意设计），只能问后端；
// 后端每次登录都重新向 IAM 拉取，不吃旧快照。
// ============================================================================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, NON_REJECTING_AUTH_CODES } from "../api/client";
// 本文件不是组件树里的展示层，拿不到 useTranslation；与 api/client 一样直接用 i18n 单例。
import i18n from "../i18n/config";
import type { AdminMe } from "../api/types";
import { useSession } from "./SessionContext";

/** 进入控制台的三种终态，外壳据此渲染。 */
export type AdminAccessState =
  /** 用户会话或 /admin/me 尚在加载。 */
  | "loading"
  /** 未登录：外壳跳 /login?redirect=…。 */
  | "anonymous"
  /** 登录了但没有 Pass 管理权限（403 NO_ADMIN_ACCESS）。 */
  | "no-access"
  /**
   * 有管理权限，但按安全策略必须先启用二次验证（403 STAFF_MFA_REQUIRED）。
   * 这跟「没有权限」是两回事：前者用户自己就能解决，后者只能找人授权。
   * 混成一个会让人白等着别人给他加权限。
   */
  | "needs-mfa"
  /** 请求本身失败（网络 / 5xx），可重试。 */
  | "error"
  | "ready";

interface AdminContextValue {
  state: AdminAccessState;
  me: AdminMe | null;
  /** state === "error" 时的原因，就近展示。 */
  error: string | null;
  /** 判断是否具备某权限（`*` = 超管）。 */
  hasPermission: (perm: string) => boolean;
  /** 重新拉取 /v1/admin/me（重试入口，或在 IAM 侧改权限后手动刷新）。 */
  reload: () => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export const AdminProvider = ({ children }: { children: ReactNode }) => {
  const { user, status: sessionStatus } = useSession();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [state, setState] = useState<AdminAccessState>("loading");
  const [error, setError] = useState<string | null>(null);
  // 递增即重跑下方 effect：既是重试入口，也是换号后强制重新判定的开关。
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const userId = user?.id ?? null;

  useEffect(() => {
    // 会话还没问出结果时按「加载中」处理。
    // **绝不能**把 unknown 当成未登录：那会让控制台在冷启动时先判一次 anonymous，
    // 用户看到一闪而过的「无权限」，随后才纠正过来。
    if (sessionStatus === "unknown") {
      setState("loading");
      return;
    }
    if (!userId) {
      // 换号 / 登出后必须把上一个人的权限清掉，否则导航会按旧权限渲染。
      setMe(null);
      setState("anonymous");
      return;
    }

    let alive = true;
    setState("loading");
    setError(null);

    // 登录成功后紧跟着的这次探测，最容易撞上会话/令牌刚建立还没完全稳定的窗口
    // （典型例子：refresh 竞态、后端瞬态 500/502/429）。这类请求失败会被判成 "error"
    // 或者错误地表现成一次性的 403。
    //
    // 这个 Provider 没有 SessionContext 那样的持续重试：探测一旦落地成失败，
    // 之后就不会再自己重跑，导航栏的入口从此消失，只能手动刷新页面才会重新挂载 ——
    // 这正是"登录了却看不到管理后台入口，手动开 /admin 才行"的成因。
    //
    // 所以这里做了**一次**兜底重试：失败后等 1 秒再试一遍（就一遍），
    // 且只重试真正的请求失败（网络/5xx），不重试后端已经明确给出的 no-access / needs-mfa。
    // 一次足以盖住上面那个「刚登录、还没稳」的窗口；再多就该做成退避阶梯了，
    // 而这个入口没重要到值得为它铺一套。
    const attemptFetch = async (): Promise<boolean> => {
      const res = await api.get<AdminMe>("/v1/admin/me", { plane: "user" });
      if (!alive) return true;
      if (res.ok) {
        // 2xx 也可能整个没有 data（网关吐了个空壳 200）。照单全收会得到
        //「state=ready 但 me=null」这种自相矛盾的状态：外壳按已就绪渲染，
        // 而每个读 me 的地方都得自己防空。按非法响应处理，走重试。
        if (!res.data || typeof res.data.userId !== "string") {
          setMe(null);
          setError(i18n.t("errors.unknown"));
          setState("error");
          return false;
        }
        setMe(res.data);
        setState("ready");
        return true;
      }
      // **先看错误码。** `auth_epoch_stale` / `auth_refresh_transient` 会原样保留
      // HTTP 状态码 —— 一个属于旧身份的请求返回 403 时，若按状态码先判，
      // 就会把「刚切过来的管理员 B」永久钉在「无权限」上，而且不再自动重试。
      // 这类结果只说明「这一次没问出结果」，重试即可。
      if (NON_REJECTING_AUTH_CODES.includes(res.error.code)) {
        setState("loading");
        return false;
      }
      setMe(null);
      // NO_ADMIN_ACCESS 是「登录成功但没被授权」，与请求失败是两回事：
      // 前者要给说人话的空态，后者要给重试按钮。混成一个会让人以为权限没配好。
      if (res.error.code === "STAFF_MFA_REQUIRED") {
        setState("needs-mfa");
        return true;
      }
      if (res.status === 403 || res.error.code === "NO_ADMIN_ACCESS") {
        setState("no-access");
        return true;
      }
      setError(res.error.message);
      setState("error");
      return false;
    };

    void (async () => {
      const settled = await attemptFetch();
      if (settled || !alive) return;
      await new Promise((r) => setTimeout(r, 1000));
      if (alive) await attemptFetch();
    })();

    return () => {
      alive = false;
    };
  }, [sessionStatus, userId, attempt]);

  /**
   * 手里这份管理员信息是否**属于当前登录的人**。
   *
   * 换号后清理是在 effect 里做的，而 effect 跑在渲染之后 —— 中间那一帧，
   * `me` 还是上一个人的、`state` 还是 `ready`，控制台会照着**前一个管理员**的
   * 身份与权限渲染一整帧（导航入口、角色、乃至子页面的数据）。
   * 服务端会各自重新鉴权，所以这不是后端越权；但让用户看见并可能点到
   * 另一个账号的管理入口，本身就不该发生。
   *
   * 渲染时同步比一次，不匹配就当作「还在加载」——一帧都不给。
   */
  const identitySettled = !me || (!!userId && me.userId === userId);

  const hasPermission = useCallback(
    (perm: string) =>
      !!me &&
      identitySettled &&
      (me.permissions.includes("*") || me.permissions.includes(perm)),
    [me, identitySettled],
  );

  const value = useMemo(
    () => ({
      state: identitySettled ? state : ("loading" as AdminAccessState),
      me: identitySettled ? me : null,
      error,
      hasPermission,
      reload,
    }),
    [state, me, error, hasPermission, reload, identitySettled],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
};

export const useAdmin = (): AdminContextValue => {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within an AdminProvider");
  return ctx;
};
