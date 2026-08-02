import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "../../api/client";

/** GET /v1/me/mfa/iam —— 两步验证是否已交给统一身份接管。 */
export interface IamMfaState {
  /** 是否已绑定统一身份；未绑定时后端拒绝开启接管（409 IAM_NOT_BOUND）。 */
  available: boolean;
  /** 是否已开启接管：为真时本地通行密钥与动态口令在登录路径上不生效。 */
  delegated: boolean;
}

interface IamMfaContextValue {
  /** null = 尚未读到（加载中或失败）——刻意不用 false 冒充「未接管」。 */
  state: IamMfaState | null;
  loading: boolean;
  failed: boolean;
  reload: () => Promise<void>;
  /** 开关成功后由接管分区直接写入（后端已回传权威值），省一次往返。 */
  apply: (next: IamMfaState) => void;
}

/**
 * 默认值刻意不抛错：本上下文的主要用途是给「通行密钥 / 动态口令」两个分区
 * 附加一条状态说明。万一某个分区将来被搬到 Provider 之外，退化成「不显示说明」
 * 比让整个账户中心白屏合理得多。
 */
const FALLBACK: IamMfaContextValue = {
  state: null,
  loading: false,
  failed: false,
  reload: async () => {},
  apply: () => {},
};

const IamMfaContext = createContext<IamMfaContextValue>(FALLBACK);

/**
 * 统一身份接管状态的单一读取点。
 * 三个分区都要用它（接管开关自己、通行密钥、动态口令），各自去拉一遍会出现
 * 「一个分区已刷新、另一个还显示旧状态」的自相矛盾，所以在账户中心顶层收口。
 */
export function IamMfaProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<IamMfaState | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await api.get<IamMfaState>("/v1/me/mfa/iam");
    if (res.ok) {
      setState(res.data);
      setFailed(false);
    } else {
      // 读不到就当「未知」：绝不猜 delegated=false，否则会给出「本地因素仍然生效」的错误安心感。
      setState(null);
      setFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <IamMfaContext.Provider value={{ state, loading, failed, reload, apply: setState }}>
      {children}
    </IamMfaContext.Provider>
  );
}

export const useIamMfa = (): IamMfaContextValue => useContext(IamMfaContext);
