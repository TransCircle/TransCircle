// ============================================================================
// 身份提示（session hint）
//
// 冷启动时前端要等 POST /v1/auth/refresh 回来才知道「我是谁」。这枚存在
// localStorage 的小快照让首帧就能把头像与昵称画出来，把那段空窗从「看起来像未登录」
// 变成「看起来像已登录」——猜错了也只是几百毫秒后改回去，猜对了（绝大多数情况）
// 就完全没有闪烁。
//
// ⚠️ 它**不是凭据，也不是档案**。
//   - 类型被刻意收窄到三个纯展示字段：装不下 status / emailVerified / security，
//     于是任何「按状态判断能不能做某事」的代码根本无法误用它；
//   - 任何真实数据仍然来自接口，接口 401 就立刻清掉它；
//   - 它由 JS 可读，因此绝不允许放入任何敏感或安全相关的内容。
// ============================================================================
import type { MeProfile } from "../api/types";

const KEY = "pass_session_hint";

/**
 * 提示的最长寿命。
 *
 * ⚠️ 它**不是**「会话最长能活多久」的镜像。后端的会话是**滑动续期**的：
 * 每次成功刷新都会把 `expiresAt` 推到 `now + N`，所以一个持续活跃的用户
 * 完全可以有一条超过 7 天的有效会话。这里到期清掉，只是让那种用户在冷启动时
 * 少一次头像/昵称占位（照常停在 `unknown` 等权威答案），不影响登录态本身。
 *
 * 取 7 天是**隐私侧**的选择：这份快照带着昵称和头像地址，
 * 不该在一台可能是公用的机器上无限期留着。宁可少画一次占位。
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** 容许的时钟回拨。超出即认为记录不可信。 */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/** 仅用于渲染的最小身份快照。字段少是**刻意**的，见文件头。 */
export interface SessionHint {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  /** 写入时刻，用于过期判定。 */
  savedAt: number;
}

/** 读取提示；不存在、损坏或已过期一律返回 null（并顺手清掉）。 */
export function readSessionHint(): SessionHint | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // 隐私模式 / 禁用站点数据：没有提示就是了，不该影响任何功能。
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<SessionHint> | null;
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      typeof parsed.displayName !== "string" ||
      typeof parsed.savedAt !== "number"
    ) {
      clearSessionHint();
      return null;
    }
    // 未来时间戳同样作废：系统时钟被改过、或记录被手工篡改过。
    // 不拦的话 `Date.now() - savedAt` 恒为负，这条提示就永远不会过期。
    const age = Date.now() - parsed.savedAt;
    if (age > MAX_AGE_MS || age < -CLOCK_SKEW_MS) {
      clearSessionHint();
      return null;
    }
    return {
      id: parsed.id,
      displayName: parsed.displayName,
      avatarUrl: typeof parsed.avatarUrl === "string" ? parsed.avatarUrl : null,
      savedAt: parsed.savedAt,
    };
  } catch {
    clearSessionHint();
    return null;
  }
}

/** 按已确认的档案写入提示，并返回写入的内容（写不进去也返回，供本次渲染使用）。 */
export function writeSessionHint(user: MeProfile): SessionHint {
  const hint: SessionHint = {
    id: user.id,
    // 与全站展示口径一致：displayName 为空时回落用户名。
    displayName: user.displayName || user.username,
    avatarUrl: user.avatarUrl ?? null,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(hint));
  } catch {
    /* 存不下不影响本次会话，只是下次冷启动会闪一下 */
  }
  return hint;
}

export function clearSessionHint(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
