import { useTranslation } from "react-i18next";
import type { AdminStaffMember } from "../../api/types";
import { Avatar } from "../../components/Avatar";
import { Alert, Card, Pill, SectionLabel, Spinner } from "../../components/ui";
import { useFormatTs } from "../../utils/datetime";
import { DataTable, type Column } from "./shared/DataTable";
import { useAdminPageHeader } from "./shared/header";
import { useAdminList } from "./shared/useAdminResource";
import styles from "./Admin.module.css";

/**
 * 员工与权限：IAM tc_main 的**只读投影**。
 *
 * 这一页刻意不提供任何「授予/撤销权限」的入口 —— 唯一权威是 IAM，
 * 后台开这个口子等于绕过 IAM 的审计与 2FA。这里回答的是另一个问题：
 * 现在谁有权限、权限从哪儿来。
 */
const StaffPage = () => {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  useAdminPageHeader({ title: t("admin.head.staff.title"), subtitle: t("admin.head.staff.sub") });

  const staff = useAdminList<AdminStaffMember>("/v1/admin/staff");

  const nameOf = (s: AdminStaffMember) => s.displayName || s.username || s.userId;

  const columns: ReadonlyArray<Column<AdminStaffMember>> = [
    {
      key: "name",
      label: t("admin.staffPage.col.member"),
      primary: true,
      render: (s) => (
        <span className={styles.cellPrimary}>
          <Avatar name={nameOf(s)} size={30} />
          <span className={styles.cellName}>{nameOf(s)}</span>
        </span>
      ),
    },
    {
      key: "role",
      label: t("admin.staffPage.col.role"),
      render: (s) => <Pill tone="accent">{s.roles[0] ?? t("admin.access.directGrant")}</Pill>,
    },
    {
      key: "source",
      label: t("admin.staffPage.col.source"),
      hideAt: 1,
      // 权限来源可能是多个身份组，也可能是直接授予（无身份组）。
      render: (s) => <span className={styles.num}>{s.groups.join(" / ") || "—"}</span>,
    },
    {
      key: "sessions",
      label: t("admin.staffPage.col.sessions"),
      align: "right",
      hideAt: 2,
      render: (s) => <span className={styles.num}>{s.activeSessions}</span>,
    },
    {
      key: "last",
      label: t("admin.staffPage.col.last"),
      render: (s) => <span className={styles.num}>{fmt(s.lastActiveAt) || "—"}</span>,
    },
  ];

  return (
    <div className={styles.stack}>
      <Alert tone="info">
        <strong>{t("admin.staffPage.readOnlyTitle")}</strong>
        <div>{t("admin.staffPage.readOnlyDesc")}</div>
      </Alert>

      {staff.error && <Alert tone="error">{staff.error}</Alert>}

      {staff.loading && !staff.data ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : (
        <DataTable
          columns={columns}
          rows={staff.data ?? []}
          rowKey={(s) => s.userId}
          ariaLabel={t("admin.head.staff.title")}
          emptyTitle={t("admin.staffPage.emptyTitle")}
          emptyDesc={t("admin.staffPage.emptyDesc")}
          sortAscLabel={t("admin.table.sortedAsc")}
          sortDescLabel={t("admin.table.sortedDesc")}
        />
      )}

      <Card>
        <SectionLabel as="h2">{t("admin.staffPage.protectedTitle")}</SectionLabel>
        <p className={styles.bodyText}>{t("admin.staffPage.protectedDesc")}</p>
        <p className={styles.note}>{t("admin.staffPage.protectedNote")}</p>
      </Card>

      <Card>
        <SectionLabel as="h2">{t("admin.staffPage.effectTitle")}</SectionLabel>
        <p className={styles.bodyText}>{t("admin.staffPage.effectDesc")}</p>
        <p className={styles.note}>{t("admin.staffPage.effectNote")}</p>
      </Card>
    </div>
  );
};

export default StaffPage;
