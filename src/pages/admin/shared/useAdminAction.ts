import { createContext, useCallback, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { newIdempotencyKey, type ApiErrorBody, type ApiResult } from "../../../api/client";
import { adminErrorText, isStaffProtected, isStepUpRequired, staleWritePayload } from "./errors";

/**
 * 目标账户被后端按工作人员挡下时，通知详情页重新判定一次。
 *
 * 判定是**实时查 IAM** 的，页面加载后到点下按钮之间权限可能刚被授予；
 * 这时只在对话框里报一句错、页面其余部分还显示可操作，人会以为是偶发失败反复重试。
 * 用 context 而不是逐层传回调：任何深度的分区触发写操作都能自动带上这条反馈。
 */
export const StaffGuardContext = createContext<() => void>(() => {});

/**
 * 幂等键存放在 sessionStorage，而不是组件里的 ref。
 *
 * 组件卸载（关对话框、切页）或刷新页面都会丢掉 ref —— 而「响应丢失后回来重试」
 * 恰恰常常伴随这些动作。键必须活得比组件久，才能真的挡住重复执行。
 * 作用域是标签页，随浏览器会话结束自然清理。
 */
const IDEMPOTENCY_PREFIX = "tc_admin_idem:";

/**
 * 键按「当前页面路径 + 动作名」分作用域。
 *
 * 只按动作名会串：管理员给客户端 A 轮换密钥后响应丢失，转头去给客户端 B 轮换，
 * 两次都叫 "rotate"，会复用同一个幂等键 —— 后端看到同键不同请求体，
 * 直接 409 拒掉这个**本该执行**的新操作。
 * 详情页路径里带着实体 ID，天然就是正确的作用域。
 */
function scopedKey(action: string): string {
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  return `${IDEMPOTENCY_PREFIX}${path}:${action}`;
}

function takeIdempotencyKey(action: string): string {
  const storageKey = scopedKey(action);
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const fresh = newIdempotencyKey();
    sessionStorage.setItem(storageKey, fresh);
    return fresh;
  } catch {
    // 隐私模式等场景写不进去：退化为一次性键。行为等同于没有幂等保护，
    // 但不该因此让操作做不了。
    return newIdempotencyKey();
  }
}

function clearIdempotencyKey(action: string): void {
  try {
    sessionStorage.removeItem(scopedKey(action));
  } catch {
    /* 同上 */
  }
}

export interface AdminActionState {
  /** 正在执行的动作 key；同页多个入口靠它区分 loading。 */
  pending: string | null;
  error: string | null;
  errorBody: ApiErrorBody | null;
  /** 后端要求二次验证：对话框据此就地升级，而不是把 403 当普通错误弹出来。 */
  stepUpRequired: boolean;
  /** 409 STALE_WRITE 附带的服务端当前值。 */
  staleValues: Record<string, unknown> | null;
}

/**
 * 管理端写操作的统一执行器。
 *
 * 三类响应必须分开处理，混成一句「操作失败」会让人无从下手：
 * - 403 STEP_UP_REQUIRED  → 就地升级到二次验证，原对话框不关（不丢一次性密钥）；
 * - 403 STAFF_TARGET_PROTECTED → 目标是工作人员，要展示解锁路径而不是重试；
 * - 409 STALE_WRITE       → 别人先改了，要把服务端当前值摆出来让人重新判断。
 */
export function useAdminAction() {
  const { t } = useTranslation();
  const reportStaffGuard = useContext(StaffGuardContext);
  const [state, setState] = useState<AdminActionState>({
    pending: null,
    error: null,
    errorBody: null,
    stepUpRequired: false,
    staleValues: null,
  });

  const reset = useCallback(() => {
    // **不清幂等键。**
    //
    // reset 是「关掉对话框」，而不是「这次操作没发生」。真正危险的路径恰恰是：
    // 请求已经提交 → 响应在网关丢了 → 前端显示失败 → 管理员关掉对话框去查状态 →
    // 再打开重试。此时若换了新键，后端会把它当成全新请求**再执行一次**。
    // 键只在**确认成功**后清除（run 里），或随浏览器会话结束自然失效。
    setState({ pending: null, error: null, errorBody: null, stepUpRequired: false, staleValues: null });
  }, []);

  const run = useCallback(
    async <T>(key: string, call: (idempotencyKey: string) => Promise<ApiResult<T>>): Promise<T | null> => {
      // 同一个动作在成功之前**复用同一个幂等键**。
      //
      // 每次点击都换新键的话，「请求已经提交、响应在网关丢了 → 用户点第二次」
      // 会被服务端当成全新请求再执行一遍。轮换签名密钥连做两次，会把仍在签发
      // 令牌的那把推进 retired —— 这是线上事故，不是体验问题。
      // 成功后清掉，下一次是真正的新意图。
      const idempotencyKey = takeIdempotencyKey(key);

      setState({ pending: key, error: null, errorBody: null, stepUpRequired: false, staleValues: null });
      const res = await call(idempotencyKey);
      if (res.ok) {
        clearIdempotencyKey(key);
        setState((s) => ({ ...s, pending: null }));
        return res.data;
      }
      // 服务端说「同键不同请求」：说明这个键属于**上一次**操作，不该再挡住本次。
      // 不清的话，用户按提示刷新后重试仍是同一个键，会一直撞同一堵墙 ——
      // 文案让人「确认状态后重试」，就得真的给得出可以重试的路径。
      if (res.error.code === "IDEMPOTENCY_KEY_MISMATCH") clearIdempotencyKey(key);

      setState({
        pending: null,
        error: adminErrorText(t, res.error),
        errorBody: res.error,
        stepUpRequired: isStepUpRequired(res.error),
        staleValues: staleWritePayload(res.error),
      });
      // 后端刚判定目标是工作人员：让详情页重查一次，整页切成只读横幅 + 解锁路径，
      // 而不是让人对着一个「看起来能点」的按钮反复失败。
      if (isStaffProtected(res.error)) reportStaffGuard();
      return null;
    },
    [t, reportStaffGuard],
  );

  const staffProtected = state.errorBody ? isStaffProtected(state.errorBody) : false;

  return { ...state, staffProtected, run, reset };
}
