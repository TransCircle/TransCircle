import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import type { AdminUserGrant } from "../../../api/types";
import { AdminButton as Button, Alert, Pill, Spinner } from "../../../components/ui";
import { useFormatTs } from "../../../utils/datetime";
import { DangerDialog } from "../shared/DangerDialog";
import { DataTable, type Column } from "../shared/DataTable";
import { useAdminAction } from "../shared/useAdminAction";
import { useAdminList } from "../shared/useAdminResource";
import styles from "../Admin.module.css";

interface GrantsTabProps {
  userId: string;
  subject: string;
  canRevoke: boolean;
  onDone: (message: string) => void;
}

/** 授权：可以只切断某一个站的 SSO，而不影响用户在其他站的登录。 */
export function GrantsTab({ userId, subject, canRevoke, onDone }: GrantsTabProps) {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  const grants = useAdminList<AdminUserGrant>(`/v1/admin/users/${userId}/grants`);
  const action = useAdminAction();
  const [target, setTarget] = useState<AdminUserGrant | null>(null);

  const nameOf = (g: AdminUserGrant) => g.clientName || t("admin.userDetail.grants.deletedClient");

  const revoke = async (grant: AdminUserGrant) => {
    // 动作 key 带上目标：同一页面撤销不同业务站的授权不能共用幂等键。
    const ok = await action.run(`revoke:${grant.clientId}`, (idem) =>
      api.del(`/v1/admin/users/${userId}/grants/${grant.clientId}`, undefined, {
        plane: "user",
        idempotent: idem,
      }),
    );
    if (ok !== null) {
      onDone(t("admin.userDetail.grants.revoked", { name: nameOf(grant) }));
      grants.reload();
      setTarget(null);
      action.reset();
    }
  };

  const columns: ReadonlyArray<Column<AdminUserGrant>> = [
    {
      key: "client",
      label: t("admin.userDetail.grants.client"),
      primary: true,
      render: (g) => <span className={styles.cellName}>{nameOf(g)}</span>,
    },
    {
      key: "scopes",
      label: t("admin.userDetail.grants.scopes"),
      hideAt: 1,
      render: (g) => (
        <span className={styles.cellChips}>
          {g.scopes.map((s) => (
            <Pill key={s}>{s}</Pill>
          ))}
        </span>
      ),
    },
    {
      key: "at",
      label: t("admin.userDetail.grants.grantedAt"),
      render: (g) => <span className={styles.num}>{fmt(g.createdAt) || "—"}</span>,
    },
    {
      key: "act",
      label: "",
      align: "right",
      render: (g) =>
        canRevoke ? (
          <Button variant="ghost" size="sm" onClick={() => setTarget(g)}>
            {t("admin.userDetail.grants.revoke")}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className={styles.stack}>
      {grants.error && <Alert tone="error">{grants.error}</Alert>}
      {grants.loading && !grants.data ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : (
        <DataTable
          columns={columns}
          rows={grants.data ?? []}
          rowKey={(g) => g.clientId}
          ariaLabel={t("admin.userDetail.tabs.grants")}
          emptyTitle={t("admin.userDetail.grants.emptyTitle")}
          sortAscLabel={t("admin.table.sortedAsc")}
          sortDescLabel={t("admin.table.sortedDesc")}
        />
      )}
      <p className={styles.note}>{t("admin.userDetail.grants.note")}</p>

      {target && (
        <DangerDialog
          title={t("admin.userDetail.grants.revokeTitle")}
          subject={`${subject} · ${nameOf(target)}`}
          message={t("admin.userDetail.grants.revokeDesc")}
          impact={t("admin.userDetail.grants.revokeImpactScopes", { count: target.scopes.length })}
          confirmText={t("admin.userDetail.grants.revoke")}
          busy={action.pending === `revoke:${target.clientId}`}
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
