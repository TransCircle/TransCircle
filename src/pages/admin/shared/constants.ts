import type { BadgeTone } from "../../../components/ui";
import type { AccountStatus, ClientApplicationType } from "../../../api/types";

/** IAM tc_main 的权限 key（docs/iam-main-api.md §4.1 + api-delta §九 新增的 pass.user:write）。 */
export const PERM = {
  userRead: "pass.user:read",
  userWrite: "pass.user:write",
  userForceLogout: "pass.user:force-logout",
  userReset2fa: "pass.user:reset-2fa",
  userSuspend: "pass.user:suspend",
  userBan: "pass.user:ban",
  userDelete: "pass.user:delete",
  clientRead: "pass.client:read",
  clientManage: "pass.client:manage",
  auditRead: "pass.audit:read",
  keyRotate: "pass.key:rotate",
  policyManage: "pass.policy:manage",
} as const;

/** 账户状态 → 语义色。始终与文字标签同时出现，不靠颜色单独表意（WCAG 1.4.1）。 */
export function accountStatusTone(status: AccountStatus): BadgeTone {
  switch (status) {
    case "active":
      return "green";
    case "banned":
      return "red";
    case "suspended":
    case "pending_verification":
      return "amber";
    default:
      return "muted";
  }
}

/** 概览「账户状态分布」的展示顺序：由轻到重，读起来是一条恶化曲线。 */
export const ACCOUNT_STATUS_ORDER: readonly AccountStatus[] = [
  "active",
  "pending_verification",
  "suspended",
  "banned",
  "pending_deletion",
  "merged",
  "deleted",
];

/** 应用类型列表：向导的单选顺序（从最常见、最安全的一档排起）。 */
export const APPLICATION_TYPES: readonly ClientApplicationType[] = [
  "web_backend",
  "spa",
  "native",
  "m2m",
];

/** 「据此推导的配置」逐类型的行 key（文案走 i18n：admin.appType.<type>.derived.<key>）。 */
export const DERIVED_ROW_KEYS: Record<ClientApplicationType, readonly string[]> = {
  web_backend: ["clientKind", "authMethod", "flow", "secret", "refresh"],
  spa: ["clientKind", "authMethod", "flow", "secret", "refresh"],
  native: ["clientKind", "authMethod", "flow", "secret", "redirect"],
  m2m: ["clientKind", "authMethod", "flow", "secret", "redirect"],
};

export interface ScopeDef {
  key: string;
  /** openid 恒开：没有它就不签发 id_token，这个客户端也就无从确认「这是谁」。 */
  locked?: boolean;
  /** 仅第一方可用；取消可信第一方时必须同步移除，否则是非法组合（422）。 */
  firstParty?: boolean;
}

export const SCOPES: readonly ScopeDef[] = [
  { key: "openid", locked: true },
  { key: "profile" },
  { key: "email" },
  { key: "offline_access" },
  { key: "pass.profile.full", firstParty: true },
];

/** 授权中间页能说人话的 scope；其余（如 openid）不单独成句。 */
export const HUMAN_SCOPES: readonly string[] = [
  "profile",
  "email",
  "offline_access",
  "pass.profile.full",
];

/** 令牌策略各档位（api-delta §五 的取值域，前后端必须一致）。 */
export const ACCESS_TTL_OPTIONS = ["300", "900", "1800", "3600"] as const;
export const REFRESH_TTL_OPTIONS = ["604800", "1209600", "2592000", "0"] as const;
/**
 * 授权绝对寿命的可选档位。
 *
 * **没有「不设上限」**：Grant 必须有到期时间，那个选项做不到它承诺的事
 * （详见 api-delta.md §4 的令牌策略一节）。m2m 客户端的该字段恒为 0 且不可编辑。
 */
export const ABSOLUTE_TTL_OPTIONS = ["2592000", "7776000", "15552000"] as const;
export const LOCK_AFTER_OPTIONS = ["3", "5", "10"] as const;

/** 密钥超过这个天数就在列表里标黄——现有后台没有这个信息，没人知道多久没换过。 */
export const SECRET_STALE_DAYS = 90;

/** 危险操作的原因下限（后端同样校验 ≥4 字）。 */
export const REASON_MIN_LENGTH = 4;

/** 管理员代设密码的长度下限。 */
export const PASSWORD_MIN_LENGTH = 12;

/** 生成临时密码用的字符集：剔除 0/O、1/l/I 等抄写易混字符。 */
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** 用 CSPRNG 生成临时密码；取模偏差在这个字符集规模下可忽略，但仍避免 Math.random。 */
export function generatePassword(length = 16): string {
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[(buf[i] ?? 0) % PASSWORD_ALPHABET.length];
  }
  return out;
}
