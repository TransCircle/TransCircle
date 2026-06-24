import type { BadgeTone } from './StatusBadge'

/** 投稿状态 → 徽标配色（api.md 状态机：pending/in_review/approved/rejected/published/hidden）。 */
export const CONTRIB_STATUS_TONE: Record<string, BadgeTone> = {
  pending: 'amber',
  in_review: 'blue',
  approved: 'green',
  rejected: 'red',
  published: 'accent',
  hidden: 'muted',
}

/** 用户状态 → 徽标配色。 */
export const USER_STATUS_TONE: Record<string, BadgeTone> = {
  active: 'green',
  banned: 'red',
  pending_deletion: 'amber',
  merged: 'muted',
  deleted: 'muted',
}

/** 编辑申请状态 → 徽标配色。 */
export const EDIT_REQUEST_STATUS_TONE: Record<string, BadgeTone> = {
  pending: 'amber',
  approved: 'green',
  rejected: 'red',
  applied: 'accent',
  superseded: 'muted',
}

/** 用户状态 → i18n 文案 key（徽标文字需本地化，避免直接展示后端英文枚举）。 */
export const USER_STATUS_LABEL_KEYS: Record<string, string> = {
  active: 'adminUsers.statusActive',
  banned: 'adminUsers.statusBanned',
  pending_deletion: 'adminUsers.statusPendingDeletion',
  merged: 'adminUsers.statusMerged',
  deleted: 'adminUsers.statusDeleted',
}

/** 编辑申请状态 → i18n 文案 key。 */
export const EDIT_REQUEST_STATUS_LABEL_KEYS: Record<string, string> = {
  pending: 'adminEditRequests.statusPending',
  approved: 'adminEditRequests.statusApproved',
  rejected: 'adminEditRequests.statusRejected',
  applied: 'adminEditRequests.statusApplied',
  superseded: 'adminEditRequests.statusSuperseded',
}
