/**
 * 第三方登录 → 二次验证的跨页交接。
 *
 * 第三方 OAuth 登录是**跳转流**：第一因素在提供商那边完成，浏览器带着后端签发的
 * 一次性挑战令牌回到 `/auth/callback`。这一跳会清空所有 React 状态，所以挑战令牌
 * 必须先落地，才能交给登录页复用那一整套二次验证界面
 * （验证器 / 通行密钥 / 恢复码 / 统一身份接管）。
 *
 * 用 sessionStorage 而不是 URL：令牌绝不能留在地址栏与浏览器历史里。
 * 读取即删除，只用一次。
 */
const KEY = "tc_mfa_handoff";

export interface MfaHandoff {
  mfaChallengeToken: string;
  /** 验证通过后要去哪里；已经过 sanitizeRedirect。 */
  redirectAfter: string;
}

export function saveMfaHandoff(data: MfaHandoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 隐私模式等场景下写不进去。调用方会因为拿不到交接而回落到「请重新登录」，
    // 这是安全的失败方向。
  }
}

/**
 * 只探测有没有，**不消费**。
 * 用于在真正消费之前就知道「这次挂载是不是交接进来的」，
 * 好让「已登录自动跳转」先让路。
 */
export function hasMfaHandoff(): boolean {
  try {
    return sessionStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/** 取出并立即清除。拿不到返回 null。 */
export function consumeMfaHandoff(): MfaHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as Partial<MfaHandoff>;
    if (typeof parsed.mfaChallengeToken !== "string" || !parsed.mfaChallengeToken) return null;
    return {
      mfaChallengeToken: parsed.mfaChallengeToken,
      redirectAfter: typeof parsed.redirectAfter === "string" ? parsed.redirectAfter : "/account",
    };
  } catch {
    return null;
  }
}
