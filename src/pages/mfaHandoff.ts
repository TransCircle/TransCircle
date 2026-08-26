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

/**
 * 落地交接数据，**返回是否真的存下了**。
 *
 * 返回值不是装饰：存不下（隐私模式、禁用站点数据）时若照常跳去登录页，
 * 那边 `hasMfaHandoff()` 会返回 false —— 于是页面既不知道有过一次交接、
 * 也不会进入失败终态，「已登录就自动续跑」可能拿浏览器里的旧会话把这次
 * OIDC 交互直接完成掉，而这次要求的第二因素根本没做。
 * 调用方必须检查返回值，存不下就地报错，不要往下走。
 */
export function saveMfaHandoff(data: MfaHandoff): boolean {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
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
