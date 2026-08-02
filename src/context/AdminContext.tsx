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
import { api } from "../api/client";
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
  const { user, loading: sessionLoading } = useSession();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [state, setState] = useState<AdminAccessState>("loading");
  const [error, setError] = useState<string | null>(null);
  // 递增即重跑下方 effect：既是重试入口，也是换号后强制重新判定的开关。
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (sessionLoading) {
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
    void (async () => {
      const res = await api.get<AdminMe>("/v1/admin/me", { plane: "user" });
      if (!alive) return;
      if (res.ok) {
        setMe(res.data);
        setState("ready");
        return;
      }
      setMe(null);
      // NO_ADMIN_ACCESS 是「登录成功但没被授权」，与请求失败是两回事：
      // 前者要给说人话的空态，后者要给重试按钮。混成一个会让人以为权限没配好。
      if (res.error.code === "STAFF_MFA_REQUIRED") {
        setState("needs-mfa");
        return;
      }
      if (res.status === 403 || res.error.code === "NO_ADMIN_ACCESS") {
        setState("no-access");
        return;
      }
      setError(res.error.message);
      setState("error");
    })();
    return () => {
      alive = false;
    };
  }, [sessionLoading, userId, attempt]);

  const hasPermission = useCallback(
    (perm: string) => !!me && (me.permissions.includes("*") || me.permissions.includes(perm)),
    [me],
  );

  const value = useMemo(
    () => ({ state, me, error, hasPermission, reload }),
    [state, me, error, hasPermission, reload],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
};

export const useAdmin = (): AdminContextValue => {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within an AdminProvider");
  return ctx;
};
