import { useTranslation } from "react-i18next";
import type { AdminUserBinding } from "../../../api/types";
import { Alert, Spinner } from "../../../components/ui";
import { useFormatTs } from "../../../utils/datetime";
import { DataTable, type Column } from "../shared/DataTable";
import { useAdminList } from "../shared/useAdminResource";
import styles from "../Admin.module.css";

/**
 * 第三方绑定：**只读**。
 *
 * 绑定关系属于用户自己的账户所有权，管理员误解绑会直接把人锁在门外，
 * 而这个错误用户自己纠正不了 —— 所以这里根本不提供解绑入口。
 */
export function BindingsTab({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  const bindings = useAdminList<AdminUserBinding>(`/v1/admin/users/${userId}/bindings`);

  const columns: ReadonlyArray<Column<AdminUserBinding>> = [
    {
      key: "provider",
      label: t("admin.userDetail.bindings.provider"),
      primary: true,
      render: (b) => (
        <span className={styles.cellName}>
          {t(`admin.provider.${b.provider}`, { defaultValue: b.provider })}
        </span>
      ),
    },
    {
      key: "email",
      label: t("admin.userDetail.bindings.peerEmail"),
      hideAt: 2,
      render: (b) => <span className={styles.num}>{b.providerEmail || "—"}</span>,
    },
    {
      key: "boundAt",
      label: t("admin.userDetail.bindings.boundAt"),
      render: (b) => <span className={styles.num}>{fmt(b.boundAt) || "—"}</span>,
    },
  ];

  return (
    <div className={styles.stack}>
      {bindings.error && <Alert tone="error">{bindings.error}</Alert>}
      {bindings.loading && !bindings.data ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : (
        <DataTable
          columns={columns}
          rows={bindings.data ?? []}
          rowKey={(b) => b.provider}
          ariaLabel={t("admin.userDetail.tabs.bindings")}
          emptyTitle={t("admin.userDetail.bindings.emptyTitle")}
          sortAscLabel={t("admin.table.sortedAsc")}
          sortDescLabel={t("admin.table.sortedDesc")}
        />
      )}
      <p className={styles.note}>{t("admin.userDetail.bindings.note")}</p>
    </div>
  );
}
