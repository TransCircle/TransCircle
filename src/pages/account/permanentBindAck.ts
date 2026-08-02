// ============================================================================
// 「此绑定不可自行解除」的用户确认凭据 —— 跨整页跳转传递
//
// 绑定统一身份要经过一次离站往返：账户中心 → IAM 授权页 → 后端回调 →
// /settings/security/oauth-bind/confirm。React 状态在整页跳转中必然丢失，而
// POST /v1/auth/oauth/complete-binding 对不可解绑的 provider 要求请求体带
// acknowledgedPermanent: true，缺失即 400 ACK_REQUIRED。
//
// 所以「用户已经看过并接受了不可逆警告」这件事必须落在会话级存储里，由落地页
// 取回后一次性消费。用 sessionStorage 而不是 localStorage：这个确认只对本标签页
// 里的这一次绑定有效，关掉标签就该作废，绝不能被下一次绑定悄悄复用。
// ============================================================================

const KEY_PREFIX = "pass_bind_ack_permanent:";

const key = (provider: string) => `${KEY_PREFIX}${provider}`;

/** 用户在确认框里点了「继续绑定」时调用，随后即可跳转授权页。 */
export function markPermanentBindAck(provider: string): void {
  try {
    sessionStorage.setItem(key(provider), "1");
  } catch {
    // 隐私模式等场景下 sessionStorage 不可用：不阻断绑定流程，
    // 落地页取不到确认时会重新弹一次警告，用户仍有出路。
  }
}

/**
 * 落地页读取确认，**不清除**。
 *
 * ⚠️ 曾经这里是「读取并立即清除」，而落地页在 `useState` 初始化函数里调用它。
 * React StrictMode 会把 state initializer 调用两次以检测副作用：第一次读到 true 并删掉，
 * 第二次读到 false，而 React 保留的是**第二次**的结果 —— 于是开发环境下确认凭空消失，
 * 后端返回 400 ACK_REQUIRED，看起来像「绑定又坏了」。
 * 读取必须幂等；清除交给明确的终态（绑定成功 / 走到错误屏）调用 clearPermanentBindAck。
 */
export function peekPermanentBindAck(provider: string): boolean {
  try {
    return sessionStorage.getItem(key(provider)) === "1";
  } catch {
    return false;
  }
}

/** 用户取消确认框、或绑定走到终态时清掉，别把上一次的确认留到下一次。 */
export function clearPermanentBindAck(provider: string): void {
  try {
    sessionStorage.removeItem(key(provider));
  } catch {
    /* noop */
  }
}
