import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import type { AdminUserDetail } from "../../../api/types";
import { AdminButton as Button, Card, SectionLabel } from "../../../components/ui";
import { DangerDialog } from "../shared/DangerDialog";
import { PERM } from "../shared/constants";
import { useAdminAction } from "../shared/useAdminAction";
import { MergeDialog } from "./MergeDialog";
import styles from "../Admin.module.css";

interface DangerTabProps {
  user: AdminUserDetail;
  subject: string;
  isSelf: boolean;
  /** 目标是工作人员（含 fail-closed 的 staff_assumed）：整区替换成解锁说明。 */
  lockedStaff: boolean;
  hasPermission: (perm: string) => boolean;
  onDone: (message: string) => void;
  onChanged: () => void;
}

interface DangerAction {
  key: string;
  perm: string;
  /** 需要二次验证 / 必须写原因：逐端点定，不一刀切（api-delta §三）。 */
  stepUp: boolean;
  reason: boolean;
  /** 自指也允许（只影响自己的会话或只是导出）。 */
  selfAllowed?: boolean;
  path: (u: AdminUserDetail) => string;
  variant: "danger" | "secondary";
}

export function DangerTab({
  user,
  subject,
  isSelf,
  lockedStaff,
  hasPermission,
  onDone,
  onChanged,
}: DangerTabProps) {
  const { t } = useTranslation();
  const action = useAdminAction();
  const [open, setOpen] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  const suspended = user.status === "suspended";
  // 封禁是可逆的，后端一直有 /unban —— 但界面只画了「封禁」，于是被封的账户
  // 谁也解不开：本人登不进来，管理员点「封禁」又会因状态迁移非法而失败。
  const banned = user.status === "banned";

  /**
   * 状态 → 允许的生命周期操作。
   *
   * 后端对每个操作都限定了合法的来源状态（`validFrom`），前端零散用布尔量拼条件
   * 必然对不齐 —— 于是终态账户上会摆出一排点了必然 409 的按钮，
   * 看的人只会以为系统坏了。这里一次性把矩阵写清楚，入口按它生成。
   */
  const LIFECYCLE_BY_STATUS: Record<string, readonly string[]> = {
    active: ["suspend", "ban", "delete", "merge"],
    pending_verification: ["suspend", "ban", "delete", "merge"],
    suspended: ["unsuspend", "ban", "delete", "merge"],
    banned: ["unban", "delete", "merge"],
    // 已在注销宽限期内：撤销注销是**用户本人**凭邮件里的链接完成的，管理端没有入口；
    // 再叠加暂停/封禁/合并都会被后端按非法迁移拒掉。
    pending_deletion: [],
    // 已合并到别的账户：只剩注销这一条路。
    merged: ["delete"],
    // 终态，什么都不能做。
    deleted: [],
  };
  const allowedLifecycle = LIFECYCLE_BY_STATUS[user.status] ?? [];
  /** 生命周期类操作按状态过滤；非生命周期操作（强制下线/重置 2FA/导出）不受此限。 */
  const LIFECYCLE_KEYS = new Set(["suspend", "unsuspend", "ban", "unban", "delete", "merge"]);

  const ACTIONS: readonly DangerAction[] = [
    {
      key: "forceLogout",
      perm: PERM.userForceLogout,
      stepUp: false,
      reason: false,
      // 后端的 userWriteChain 一律经过 requireNotSelf —— 标成允许自指的话，
      // 按钮看起来能点，点了必然 403 SELF_TARGET_FORBIDDEN。
      selfAllowed: false,
      variant: "secondary",
      path: (u) => `/v1/admin/users/${u.id}/force-logout`,
    },
    {
      key: "reset2fa",
      perm: PERM.userReset2fa,
      stepUp: true,
      reason: true,
      variant: "danger",
      path: (u) => `/v1/admin/users/${u.id}/reset-2fa`,
    },
    // 已封禁的账户不提供「暂停/恢复」：后端会按非法状态迁移拒绝，
    // 摆一个必定失败的按钮只会让人以为是系统出错。
    ...(banned
      ? []
      : [
          {
            key: suspended ? "unsuspend" : "suspend",
            perm: PERM.userSuspend,
            stepUp: false,
            reason: true,
            variant: "danger" as const,
            path: (u: AdminUserDetail) => `/v1/admin/users/${u.id}/${suspended ? "unsuspend" : "suspend"}`,
          },
        ]),
    {
      key: banned ? "unban" : "ban",
      perm: PERM.userBan,
      stepUp: true,
      reason: true,
      // 解封同样走危险操作流程（要二次验证 + 写原因）：它同样改变账户的可访问性，
      // 审计里必须留下「谁在什么时候因为什么把人放出来」。
      variant: banned ? "secondary" : "danger",
      path: (u) => `/v1/admin/users/${u.id}/${banned ? "unban" : "ban"}`,
    },
    {
      key: "delete",
      perm: PERM.userDelete,
      stepUp: true,
      reason: true,
      variant: "danger",
      path: (u) => `/v1/admin/users/${u.id}/delete`,
    },
    {
      key: "export",
      perm: PERM.userRead,
      stepUp: false,
      reason: false,
      selfAllowed: true,
      variant: "secondary",
      path: (u) => `/v1/admin/users/${u.id}/export`,
    },
  ];

  const allowed = ACTIONS.filter(
    (a) => hasPermission(a.perm) && (!LIFECYCLE_KEYS.has(a.key) || allowedLifecycle.includes(a.key)),
  );
  const hidden = ACTIONS.length - allowed.length;
  const current = allowed.find((a) => a.key === open) ?? null;

  const run = async (a: DangerAction, reason: string) => {
    const result = await action.run<unknown>(a.key, (idem) =>
      api.post(a.path(user), a.reason ? { reason } : undefined, { plane: "user", idempotent: idem }),
    );
    if (result !== null) {
      // 导出返回的是**可携权导出文档本身**，不是一个状态。
      // 之前这里把它连同其它危险操作一起丢掉、只弹一句「完成」——
      // 于是 GDPR 导出这个功能实际上拿不到任何东西。
      if (a.key === "export") downloadExport(result);
      onDone(t(`admin.userDetail.danger.${a.key}.done`));
      setOpen(null);
      action.reset();
      onChanged();
    }
  };

  /** 把导出文档存成本地 JSON 文件。 */
  const downloadExport = (document: unknown): void => {
    try {
      const blob = new Blob([JSON.stringify(document, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      // 文件名用可读标识而不是内部 ID（IA 规则 4）。
      link.download = `transcircle-export-${subject.replace(/[^\w.-]+/g, "_")}.json`;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      // 立刻回收：Blob URL 不主动释放会一直占着内存直到页面卸载。
      URL.revokeObjectURL(url);
    } catch {
      // 下载失败不该让整个操作看起来失败 —— 数据已经取到了，只是没能存盘。
      onDone(t("admin.userDetail.danger.export.downloadFailed"));
    }
  };

  return (
    <div className={styles.stack}>
      <Card accent>
        <SectionLabel as="h2">{t("admin.userDetail.danger.lifecycleTitle")}</SectionLabel>
        {lockedStaff ? (
          // 不渲染一排灰按钮 —— 灰按钮只会让人反复去点。直接换成一句说明加解锁路径。
          <p className={styles.note}>{t("admin.userDetail.danger.staffLocked")}</p>
        ) : allowed.length === 0 ? (
          <p className={styles.note}>{t("admin.userDetail.danger.noPermission")}</p>
        ) : (
          <div className={styles.row}>
            {allowed.map((a) => (
              <Button
                key={a.key}
                variant={a.variant}
                size="sm"
                disabled={isSelf && !a.selfAllowed}
                onClick={() => setOpen(a.key)}
              >
                {t(`admin.userDetail.danger.${a.key}.label`)}
              </Button>
            ))}
          </div>
        )}
        {hidden > 0 && (
          <p className={styles.note}>{t("admin.userDetail.danger.hiddenCount", { count: hidden })}</p>
        )}
      </Card>

      {/* 合并同样受状态矩阵约束：注销宽限期内/已合并/已删除的账户合并必被后端拒。 */}
      {allowedLifecycle.includes("merge") && (
        <Card>
          <SectionLabel as="h2">{t("admin.userDetail.merge.cardTitle")}</SectionLabel>
          <p className={styles.note}>{t("admin.userDetail.merge.cardDesc")}</p>
          <div className={styles.row}>
            <Button
              variant="danger"
              size="sm"
              disabled={!hasPermission(PERM.userDelete) || isSelf || lockedStaff}
              onClick={() => setMerging(true)}
            >
              {t("admin.userDetail.merge.start")}
            </Button>
          </div>
        </Card>
      )}

      {current && (
        <DangerDialog
          title={t(`admin.userDetail.danger.${current.key}.label`)}
          subject={subject}
          message={t(`admin.userDetail.danger.${current.key}.message`)}
          impact={t(`admin.userDetail.danger.${current.key}.impact`, {
            sessions: user.security.activeSessions,
            grants: user.grantCount,
            passkeys: user.security.passkeyCount,
          })}
          confirmText={t(`admin.userDetail.danger.${current.key}.label`)}
          needStepUp={current.stepUp}
          needReason={current.reason}
          busy={action.pending === current.key}
          error={action.error}
          forceStepUp={action.stepUpRequired}
          onCancel={() => {
            setOpen(null);
            action.reset();
          }}
          onConfirm={(reason) => void run(current, reason)}
        />
      )}

      {merging && (
        <MergeDialog
          userId={user.id}
          subject={subject}
          onCancel={() => setMerging(false)}
          onDone={(name) => {
            setMerging(false);
            onDone(t("admin.userDetail.merge.done", { name }));
            onChanged();
          }}
        />
      )}
    </div>
  );
}
