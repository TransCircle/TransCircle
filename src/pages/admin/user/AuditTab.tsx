import { useTranslation } from "react-i18next";
import type { OffsetPage } from "../../../api/client";
import type { AuditLog } from "../../../api/types";
import { Alert, Spinner } from "../../../components/ui";
import { AuditTable } from "../shared/AuditTable";
import { Pager } from "../shared/Pager";
import { useAdminResource } from "../shared/useAdminResource";
import type { PageSize } from "../../../api/client";
import styles from "../Admin.module.css";

interface AuditTabProps {
  userId: string;
  page: number;
  pageSize: PageSize;
  onPage: (page: number) => void;
  onPageSize: (size: PageSize) => void;
}

/** 该用户的完整操作链。分页与主列表同一套 offset 契约，页码同样进地址栏。 */
export function AuditTab({ userId, page, pageSize, onPage, onPageSize }: AuditTabProps) {
  const { t } = useTranslation();
  const logs = useAdminResource<OffsetPage<AuditLog>>(
    `/v1/admin/users/${userId}/audit-logs?page=${page}&pageSize=${pageSize}&sort=at:desc`,
  );

  return (
    <div className={styles.stack}>
      {logs.error && <Alert tone="error">{logs.error}</Alert>}
      {logs.loading && !logs.data ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : (
        <>
          <AuditTable
            rows={logs.data?.items ?? []}
            showTarget={false}
            ariaLabel={t("admin.userDetail.tabs.audit")}
            emptyTitle={t("admin.userDetail.audit.emptyTitle")}
          />
          <Pager
            total={logs.data?.total ?? 0}
            page={page}
            pageSize={pageSize}
            onPage={onPage}
            onPageSize={onPageSize}
            ariaLabel={t("admin.userDetail.audit.pagerLabel")}
          />
        </>
      )}
    </div>
  );
}
