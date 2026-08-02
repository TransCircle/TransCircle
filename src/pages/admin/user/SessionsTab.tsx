import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import type { AdminUserSession } from "../../../api/types";
import { AdminButton as Button, Alert, Spinner } from "../../../components/ui";
import { useFormatTs } from "../../../utils/datetime";
import { DangerDialog } from "../shared/DangerDialog";
import { DataTable, type Column } from "../shared/DataTable";
import { useAdminAction } from "../shared/useAdminAction";
import { useAdminList } from "../shared/useAdminResource";
import styles from "../Admin.module.css";

interface SessionsTabProps {
  userId: string;
  subject: string;
  canRevoke: boolean;
  onDone: (message: string) => void;
}

export function SessionsTab({ userId, subject, canRevoke, onDone }: SessionsTabProps) {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  const sessions = useAdminList<AdminUserSession>(`/v1/admin/users/${userId}/sessions`);
  const action = useAdminAction();
  const [target, setTarget] = useState<AdminUserSession | null>(null);

  const deviceOf = (s: AdminUserSession) => s.deviceSummary || t("admin.userDetail.sessions.unknownDevice");

  const revoke = async (session: AdminUserSession) => {
    // 动作 key 带上目标 ID：只写 "revoke" 的话，同一页面上吊销不同会话会共用一个
    // 幂等键，前一次响应丢失后再吊销下一个会被后端判成「同键不同请求」直接拒掉。
    const ok = await action.run(`revoke:${session.id}`, (idem) =>
      api.del(`/v1/admin/users/${userId}/sessions/${session.id}`, undefined, {
        plane: "user",
        idempotent: idem,
      }),
    );
    if (ok !== null) {
      onDone(t("admin.userDetail.sessions.revoked", { device: deviceOf(session) }));
      sessions.reload();
      setTarget(null);
      action.reset();
    }
  };

  const columns: ReadonlyArray<Column<AdminUserSession>> = [
    {
      key: "device",
      label: t("admin.userDetail.sessions.device"),
      primary: true,
      render: (s) => (
        <span className={styles.cellName}>
          {deviceOf(s)}
        </span>
      ),
    },
    {
      key: "ip",
      label: t("admin.userDetail.sessions.ip"),
      render: (s) => <code className={styles.mono}>{s.ipPrefix || "—"}</code>,
    },
    {
      key: "created",
      label: t("admin.userDetail.sessions.created"),
      hideAt: 1,
      render: (s) => <span className={styles.num}>{fmt(s.createdAt) || "—"}</span>,
    },
    {
      key: "last",
      label: t("admin.userDetail.sessions.last"),
      render: (s) => <span className={styles.num}>{fmt(s.lastUsedAt) || "—"}</span>,
    },
    {
      key: "act",
      label: "",
      align: "right",
      render: (s) =>
        canRevoke ? (
          <Button variant="ghost" size="sm" onClick={() => setTarget(s)}>
            {t("admin.userDetail.sessions.revoke")}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className={styles.stack}>
      {sessions.error && <Alert tone="error">{sessions.error}</Alert>}
      {sessions.loading && !sessions.data ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : (
        <DataTable
          columns={columns}
          rows={sessions.data ?? []}
          rowKey={(s) => s.id}
          ariaLabel={t("admin.userDetail.tabs.sessions")}
          emptyTitle={t("admin.userDetail.sessions.emptyTitle")}
          emptyDesc={t("admin.userDetail.sessions.emptyDesc")}
          sortAscLabel={t("admin.table.sortedAsc")}
          sortDescLabel={t("admin.table.sortedDesc")}
        />
      )}
      <p className={styles.note}>{t("admin.userDetail.sessions.privacyNote")}</p>

      {target && (
        <DangerDialog
          title={t("admin.userDetail.sessions.revokeTitle")}
          subject={`${subject} · ${deviceOf(target)}`}
          message={t("admin.userDetail.sessions.revokeDesc")}
          impact={t("admin.userDetail.sessions.revokeImpact")}
          confirmText={t("admin.userDetail.sessions.revoke")}
          busy={action.pending === `revoke:${target.id}`}
          error={action.error}
          onCancel={() => {
            setTarget(null);
            action.reset();
          }}
          onConfirm={() => void revoke(target)}
        />
      )}
    </div>
  );
}
