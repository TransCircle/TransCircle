// ============================================================================
// Pass 管理台会话上下文
// token 经 POST /v1/admin/oauth/exchange 获取，存 sessionStorage（无 refresh）。
// 权限不在 access_token 中：登录后调 GET /v1/admin/me 取身份 + IAM 角色/权限，
// 供前端按能力渲染导航并展示管理员身份（含头像）。
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
import {
  adminApi,
  clearAdminAuth,
  getAdminToken,
  setAdminToken as persistAdminToken,
} from "../api/client";

interface AdminTokenClaims {
  sub?: string;
  stfId?: string;
  exp?: number;
}

export interface AdminMe {
  stfId: string;
  username: string | null;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  roles: string[];
  permissions: string[];
}

function decodeAdminToken(token: string | null): AdminTokenClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as AdminTokenClaims;
  } catch {
    return null;
  }
}

function isValid(claims: AdminTokenClaims | null): boolean {
  if (!claims) return false;
  if (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now()) return false;
  return true;
}

interface AdminContextValue {
  authed: boolean;
  /** 已登录但身份/权限尚在加载。 */
  loading: boolean;
  me: AdminMe | null;
  /** 判断是否具备某权限（'*' = 超管）。 */
  hasPermission: (perm: string) => boolean;
  setToken: (token: string | null) => void;
  logout: () => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export const AdminProvider = ({ children }: { children: ReactNode }) => {
  const [token, setTokenState] = useState<string | null>(() => getAdminToken());
  const [me, setMe] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(false);

  const claims = useMemo(() => decodeAdminToken(token), [token]);
  const authed = isValid(claims);

  const setToken = useCallback((value: string | null) => {
    persistAdminToken(value);
    setTokenState(value);
    // 任何 token 变更都清空身份缓存，按新管理员身份重新拉取 /admin/me，
    // 避免同标签页换号登录后沿用上一个管理员的权限/导航。
    setMe(null);
  }, []);

  const logout = useCallback(() => {
    clearAdminAuth();
    setTokenState(null);
    setMe(null);
  }, []);

  const hasPermission = useCallback(
    (perm: string) => !!me && (me.permissions.includes("*") || me.permissions.includes(perm)),
    [me],
  );

  // 启动时清理过期 token。
  useEffect(() => {
    const existing = getAdminToken();
    if (existing && !isValid(decodeAdminToken(existing))) {
      clearAdminAuth();
      setTokenState(null);
    }
  }, []);

  // 监听管理台 401 失效事件。
  useEffect(() => {
    const onExpired = () => {
      setTokenState(null);
      setMe(null);
    };
    window.addEventListener("pass:admin-expired", onExpired);
    return () => window.removeEventListener("pass:admin-expired", onExpired);
  }, []);

  // token 有效但尚无身份 → 拉取 /v1/admin/me。
  useEffect(() => {
    if (!authed || me) return;
    let alive = true;
    setLoading(true);
    void (async () => {
      const res = await adminApi.get<AdminMe>("/v1/admin/me");
      if (!alive) return;
      if (res.ok) setMe(res.data);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [authed, me]);

  // 到期定时清理。
  useEffect(() => {
    if (typeof claims?.exp !== "number") return;
    const ms = claims.exp * 1000 - Date.now();
    if (ms <= 0) {
      logout();
      return;
    }
    const timer = window.setTimeout(() => logout(), ms);
    return () => window.clearTimeout(timer);
  }, [claims, logout]);

  return (
    <AdminContext.Provider value={{ authed, loading, me, hasPermission, setToken, logout }}>
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = (): AdminContextValue => {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within an AdminProvider");
  return ctx;
};
