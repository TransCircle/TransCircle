import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type OffsetPage } from "../../api/client";
import type { AuditLog } from "../../api/types";
import { Alert, SearchField, Spinner } from "../../components/ui";
import { AuditTable } from "./shared/AuditTable";
import { ChipSet } from "./shared/ChipSet";
import { Pager } from "./shared/Pager";
import { adminErrorText } from "./shared/errors";
import { useAdminPageHeader } from "./shared/header";
import { useListQuery } from "./shared/useListQuery";
import styles from "./Admin.module.css";

const SORT_KEYS = ["at"] as const;

const AuditLogsPage = () => {
  const { t } = useTranslation();
  useAdminPageHeader({ title: t("admin.head.audit.title"), subtitle: t("admin.head.audit.sub") });

  const { query, setPage, setPageSize, setFilter, requestSearch } = useListQuery({
    defaultSort: "at:desc",
    filterKeys: ["q", "actorType"],
    sortKeys: SORT_KEYS,
  });

  const [page, setPageData] = useState<OffsetPage<AuditLog> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const urlKeyword = query.filters.q ?? "";
  const [keyword, setKeyword] = useState(urlKeyword);
  useEffect(() => setKeyword(urlKeyword), [urlKeyword]);
  useEffect(() => {
    if (keyword === urlKeyword) return;
    const id = window.setTimeout(() => setFilter("q", keyword), 350);
    return () => window.clearTimeout(id);
  }, [keyword, urlKeyword, setFilter]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    void (async () => {
      const res = await api.get<OffsetPage<AuditLog>>(`/v1/admin/audit-logs?${requestSearch}`, {
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

  return (
    <div className={styles.stack}>
      <div className={styles.filters}>
        <div className={styles.filtersSearch}>
          <SearchField
            value={keyword}
            onValueChange={setKeyword}
            onSearch={() => setFilter("q", keyword)}
            onClear={() => setFilter("q", "")}
            placeholder={t("admin.audit.searchPlaceholder")}
            searchAriaLabel={t("admin.audit.searchLabel")}
            clearAriaLabel={t("common.close")}
          />
        </div>
        <ChipSet
          label={t("admin.audit.filterActor")}
          value={query.filters.actorType ?? ""}
          onChange={(v) => setFilter("actorType", v)}
          options={[
            { value: "", label: t("admin.filterAll") },
            { value: "staff", label: t("admin.audit.actorStaff") },
            { value: "user", label: t("admin.audit.actorSelf") },
            { value: "system", label: t("admin.audit.actorSystem") },
          ]}
        />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading && !page ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : (
        <>
          <AuditTable
            rows={page?.items ?? []}
            ariaLabel={t("admin.head.audit.title")}
            emptyTitle={t("admin.audit.emptyTitle")}
            emptyDesc={t("admin.audit.emptyDesc")}
          />
          <Pager
            total={page?.total ?? 0}
            page={query.page}
            pageSize={query.pageSize}
            onPage={setPage}
            onPageSize={setPageSize}
            ariaLabel={t("admin.audit.pagerLabel")}
          />
        </>
      )}

      <p className={styles.note}>{t("admin.audit.appendOnlyNote")}</p>
    </div>
  );
};

export default AuditLogsPage;
