import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, type OffsetPage } from "../../api/client";
import type { AdminClientListItem } from "../../api/types";
import { AdminButton as Button, Alert, Pill, Spinner, StatusBadge } from "../../components/ui";
import { useAdmin } from "../../context/AdminContext";
import { PERM, SECRET_STALE_DAYS } from "./shared/constants";
import { ChipSet } from "./shared/ChipSet";
import { DataTable, type Column } from "./shared/DataTable";
import { Pager } from "./shared/Pager";
import { adminErrorText } from "./shared/errors";
import { useAdminPageHeader } from "./shared/header";
import { useListQuery } from "./shared/useListQuery";
import { IconChevron, IconWarn } from "./shared/icons";
import styles from "./Admin.module.css";

const SORT_KEYS = ["createdAt", "name", "secretAge"] as const;

const ClientsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = useAdmin();
  useAdminPageHeader({ title: t("admin.head.clients.title"), subtitle: t("admin.head.clients.sub") });

  const { query, setPage, setPageSize, setFilter, toggleSort, requestSearch } = useListQuery({
    defaultSort: "createdAt:desc",
    filterKeys: ["environment"],
    sortKeys: SORT_KEYS,
  });

  const [page, setPageData] = useState<OffsetPage<AdminClientListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    void (async () => {
      const res = await api.get<OffsetPage<AdminClientListItem>>(`/v1/admin/clients?${requestSearch}`, {
        plane: "user",
      });
      if (!alive) return;
      setLoading(false);
      if (res.ok) setPageData(res.data);
      else setError(adminErrorText(t, res.error));
    })();
    return () => {
      alive = false;
    };
    // t 只影响错误文案，不该触发重新取数。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestSearch]);

  const columns = useMemo<ReadonlyArray<Column<AdminClientListItem>>>(
    () => [
      {
        key: "name",
        label: t("admin.clients.col.client"),
        primary: true,
        sortKey: "name",
        render: (c) => (
          <span className={styles.cellText}>
            <span className={styles.cellName}>{c.name}</span>
            <span className={styles.cellSub}>
              {c.description || t(`admin.appType.${c.applicationType}.label`)}
            </span>
          </span>
        ),
      },
      {
        key: "type",
        label: t("admin.clients.col.type"),
        render: (c) => (
          <span className={styles.num}>{t(`admin.appType.${c.applicationType}.label`)}</span>
        ),
      },
      {
        key: "env",
        label: t("admin.clients.col.env"),
        render: (c) => (
          <Pill tone={c.environment === "prod" ? "accent" : "neutral"}>
            {t(`admin.env.${c.environment}`)}
          </Pill>
        ),
      },
      {
        key: "status",
        label: t("admin.clients.col.status"),
        render: (c) => (
          <StatusBadge
            tone={c.status === "active" ? "green" : "muted"}
            size="sm"
            label={c.status === "active" ? t("admin.clients.statusActive") : t("admin.clients.statusDisabled")}
          />
        ),
      },
      {
        key: "secret",
        label: t("admin.clients.col.secret"),
        hideAt: 1,
        sortKey: "secretAge",
        render: (c) => {
          if (c.secretAgeDays === null) {
            return <span className={styles.num}>{t("admin.clients.noSecret")}</span>;
          }
          if (c.secretAgeDays > SECRET_STALE_DAYS) {
            return (
              <span className={`${styles.num} ${styles.cellWarn}`}>
                <span aria-hidden="true">
                  <IconWarn />
                </span>
                {t("admin.clients.secretStale", { count: c.secretAgeDays })}
              </span>
            );
          }
          return (
            <span className={styles.num}>{t("admin.clients.secretAge", { count: c.secretAgeDays })}</span>
          );
        },
      },
      {
        key: "users",
        label: t("admin.clients.col.users"),
        align: "right",
        hideAt: 2,
        render: (c) => <span className={styles.num}>{c.grantedUsers}</span>,
      },
      {
        key: "consent",
        label: t("admin.clients.col.consent"),
        hideAt: 2,
        render: (c) => (
          <span className={styles.num}>
            {c.isFirstPartyTrusted ? t("admin.clients.consentSkip") : t("admin.clients.consentAsk")}
          </span>
        ),
      },
      {
        key: "go",
        label: "",
        width: 40,
        render: () => (
          <span className={styles.chevron} aria-hidden="true">
            <IconChevron />
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    <div className={styles.stack}>
      <div className={styles.filters}>
        <ChipSet
          label={t("admin.clients.filterEnv")}
          value={query.filters.environment ?? ""}
          onChange={(v) => setFilter("environment", v)}
          options={[
            { value: "", label: t("admin.filterAll") },
            { value: "prod", label: t("admin.env.prod") },
            { value: "dev", label: t("admin.env.dev") },
          ]}
        />
        {hasPermission(PERM.clientManage) && (
          <div className={styles.filtersEnd}>
            <Button variant="primary" size="sm" to="/admin/clients/new">
              {t("admin.clients.newClient")}
            </Button>
          </div>
        )}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading && !page ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={page?.items ?? []}
            rowKey={(c) => c.clientId}
            sort={query.sort}
            onSort={toggleSort}
            onRowClick={(c) => navigate(`/admin/clients/${c.clientId}`)}
            rowLabel={(c) => t("admin.clients.openRow", { name: c.name })}
            ariaLabel={t("admin.head.clients.title")}
            emptyTitle={t("admin.clients.emptyTitle")}
            emptyDesc={t("admin.clients.emptyDesc")}
            sortAscLabel={t("admin.table.sortedAsc")}
            sortDescLabel={t("admin.table.sortedDesc")}
          />
          <Pager
            total={page?.total ?? 0}
            page={query.page}
            pageSize={query.pageSize}
            onPage={setPage}
            onPageSize={setPageSize}
            ariaLabel={t("admin.clients.pagerLabel")}
          />
        </>
      )}

      <p className={styles.note}>{t("admin.clients.secretColumnNote", { days: SECRET_STALE_DAYS })}</p>
    </div>
  );
};

export default ClientsPage;
