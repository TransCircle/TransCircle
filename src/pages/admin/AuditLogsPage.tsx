import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "../../api/client";
import type { AuditLog } from "../../api/types";
import { useFormatTs } from "../../utils/datetime";
import {
  PageHeader,
  Toolbar,
  Select,
  Pill,
  Alert,
  Spinner,
  EmptyState,
  AdminButton as Button,
} from "../../components/ui";
import styles from "../Page.module.css";

const AuditLogsPage = () => {
  const { t } = useTranslation();
  const fmt = useFormatTs();

  const [action, setAction] = useState<string>("");
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (reset: boolean, nextCursor?: string | null) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      const qs = new URLSearchParams({ limit: "20" });
      if (action) qs.set("action", action);
      if (!reset && nextCursor) qs.set("cursor", nextCursor);
      const res = await adminApi.get<AuditLog[]>(`/v1/admin/audit-logs?${qs.toString()}`);
      if (reset) setLoading(false);
      else setLoadingMore(false);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setLogs((prev) => (reset ? res.data : [...prev, ...res.data]));
      setCursor(res.pagination?.nextCursor ?? null);
      setHasMore(res.pagination?.hasMore ?? false);
    },
    [action],
  );

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  // 从已加载日志中归纳出现过的 action 作为筛选项。
  const actionValues = Array.from(new Set(logs.map((l) => l.action))).sort();
  const actionOptions = [
    { value: "", label: t("admin.audit.filterActionAll") },
    ...actionValues.map((a) => ({ value: a, label: a })),
  ];

  return (
    <div className={styles.page}>
      <div className={styles.stickyHead}>
        <PageHeader title={t("admin.audit.title")} description={t("admin.audit.subtitle")} />
        <Toolbar>
          <Select ariaLabel={t("admin.audit.filterAction")} value={action} onChange={setAction} options={actionOptions} />
          {!loading && <span className={styles.count}>{logs.length}</span>}
        </Toolbar>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : logs.length === 0 ? (
        <EmptyState title={t("admin.audit.empty")} />
      ) : (
        <>
          <ul className={styles.list}>
            {logs.map((l) => (
              <li key={l.id} className={styles.rowStatic}>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>
                    <Pill tone="accent">{l.action}</Pill>
                  </span>
                  <span className={styles.rowMeta}>
                    <span>{t("admin.audit.actor")}: <code className={styles.code}>{l.actorUserId ?? "—"}</code></span>
                    {(l.resourceType || l.resourceId) && (
                      <>
                        <span className={styles.rowMetaSep}>·</span>
                        <span>{t("admin.audit.resource")}: <code className={styles.code}>{[l.resourceType, l.resourceId].filter(Boolean).join(":")}</code></span>
                      </>
                    )}
                  </span>
                  {l.requestId && <span className={styles.rowMeta}><code className={styles.code}>{l.requestId}</code></span>}
                </span>
                <span className={styles.rowRight}>{fmt(l.createdAt)}</span>
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className={styles.loadMoreWrap}>
              <Button variant="secondary" loading={loadingMore} onClick={() => void load(false, cursor)}>
                {t("admin.audit.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AuditLogsPage;
