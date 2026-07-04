// ============================================================================
// Pass C 端会话上下文
// 启动时静默续期（POST /v1/auth/refresh，HttpOnly refresh cookie）→ 拉取 /v1/me。
// 登录/资料更新后调用 refresh() 重新加载；监听 401 失效事件自动登出。
// ============================================================================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  clearUserAuth,
  clearAdminAuth,
  setUserToken,
  tryRefreshToken,
} from "../api/client";
import type { MeProfile } from "../api/types";

interface SessionContextValue {
  user: MeProfile | null;
  loading: boolean;
  /** 重新拉取 /v1/me（登录/资料更新后调用）。返回最新用户或 null。 */
  refresh: () => Promise<MeProfile | null>;
  /** 乐观更新本地用户。 */
  setUser: (user: MeProfile | null) => void;
  /** 登出并清空状态；API 失败时抛错（不清空本地态，调用方可就近反馈并重试）。 */
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<MeProfile | null> => {
    const res = await api.get<MeProfile>("/v1/me");
    if (res.ok && res.data) {
      setUser(res.data);
      return res.data;
    }
    setUser(null);
    return null;
  }, []);

  const logout = useCallback(async () => {
    const res = await api.post("/v1/auth/logout");
    // 不再静默吞掉失败：上抛给调用方（AppNav 已有 catch 反馈），避免服务端会话
    // 仍存活的「假登出」。会话本已失效(401)时,客户端会经 session-expired 事件清态。
    if (!res.ok) throw new Error(res.error.message);
    clearAdminAuth();
    clearUserAuth();
    setUser(null);
  }, []);

  // 启动：尝试续期恢复会话，再拉取资料。
  // 失败后等待 1s 重试一次，处理后端瞬态错误（500/502/429）。
  useEffect(() => {
    let alive = true;
    (async () => {
      const attempt = async (): Promise<boolean> => {
        const token = await tryRefreshToken();
        if (!alive) return false;
        if (token) {
          setUserToken(token);
          await refresh();
          return true;
        }
        return false;
      };

      const ok = await attempt();
      if (!ok && alive) {
        // 首次 refresh 失败：等待 1 秒后重试一次
        await new Promise((r) => setTimeout(r, 1000));
        if (alive) await attempt();
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  // 监听 401 自动失效（refresh 兑换失败）。
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener("pass:session-expired", onExpired);
    return () => window.removeEventListener("pass:session-expired", onExpired);
  }, []);

  return (
    <SessionContext.Provider value={{ user, loading, refresh, setUser, logout }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = (): SessionContextValue => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
};
