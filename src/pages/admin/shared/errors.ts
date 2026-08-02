import type { TFunction } from "i18next";
import type { ApiErrorBody } from "../../../api/client";

/**
 * 管理平面新增的错误码（api-delta）。
 *
 * 后端的 `message` 是给排障看的；这里对**需要用户改变行为**的码覆写成一句人话
 * （去哪配、找谁配、下一步做什么）。没覆写的码原样透传，不吞掉后端的细节。
 */
const EXPLAINED_CODES = new Set([
  "NO_ADMIN_ACCESS",
  "STAFF_TARGET_PROTECTED",
  "SELF_TARGET_FORBIDDEN",
  "STEP_UP_REQUIRED",
  "STALE_WRITE",
  "IMMUTABLE_FIELD",
  "IAM_UNAVAILABLE",
  "IAM_NOT_BOUND",
  "INVALID_SCOPE_COMBINATION",
  "INVALID_PAGE",
  "INVALID_PAGE_SIZE",
  "INVALID_SORT",
  // 幂等相关：这两个码必须说人话，否则管理员看到「请求内容不同」只会一头雾水，
  // 而正确的下一步（先去看当前状态，别盲目重试）恰恰最重要。
  "IDEMPOTENCY_KEY_MISMATCH",
  "IDEMPOTENCY_IN_PROGRESS",
  "PRECONDITION_REQUIRED",
  "STAFF_MFA_REQUIRED",
  "IAM_REJECTED",
]);

/** 把接口错误翻成控制台文案；未收录的码回落后端 message。 */
export function adminErrorText(t: TFunction, error: ApiErrorBody): string {
  if (EXPLAINED_CODES.has(error.code)) {
    const explained = t(`admin.errors.${error.code}`);
    // detail 里常带解锁路径等上下文，附在后面比丢掉有用。
    const detail = typeof error.details?.[0]?.reason === "string" ? error.details[0].reason : "";
    return detail ? `${explained} ${detail}` : explained;
  }
  return error.message;
}

/** 目标账户被工作人员保护挡下：整页要切成只读横幅，不只是弹一句错。 */
export function isStaffProtected(error: ApiErrorBody): boolean {
  return error.code === "STAFF_TARGET_PROTECTED";
}

/** 缺少有效 step-up：调用方据此把对话框升级到二次验证，而不是直接报错。 */
export function isStepUpRequired(error: ApiErrorBody): boolean {
  return error.code === "STEP_UP_REQUIRED";
}

/**
 * 乐观并发冲突：`error.data` 带服务端当前实体，用来展示「别人已经改成什么了」。
 * 拿不到就只显示提示 —— 但绝不能把本地草稿当成服务端值继续保存。
 */
export function staleWritePayload(error: ApiErrorBody): Record<string, unknown> | null {
  if (error.code !== "STALE_WRITE") return null;
  const data = error.data ?? null;
  if (!data) return null;
  // 后端把最新实体同时放在 data.current 与 data 顶层（契约写的是 current，
  // 早期实现摊在顶层）。优先取 current，取不到再回落顶层。
  const current = (data as { current?: unknown }).current;
  return current && typeof current === "object" ? (current as Record<string, unknown>) : data;
}
