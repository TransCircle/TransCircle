import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { adminApi } from "../../api/client";
import type { AuditLog } from "../../api/types";
import { useFormatTs } from "../../utils/datetime";
import { usePageTitle } from "../../utils/usePageTitle";
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

interface LoadParams {
  action: string;
  cursor?: string | null;
}

const AuditLogsPage = () => {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  usePageTitle(t("admin.audit.title"));

  const [action, setAction] = useState<string>("");
  const [logs, setLogs] = useState<AuditLog[]>([]);
  // 会话内见过的 action 全集（跨筛选累计）：选中某项后其余选项不再消失。
  const [seenActions, setSeenActions] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 「加载更多」的失败就近显示在按钮旁（用户停在列表底部，顶部 Alert 看不见）。
  const [moreError, setMoreError] = useState<string | null>(null);

  // 筛选条件经显式参数传入，不读闭包状态（与 UsersPage 同一防线）。
  const load = useCallback(async (params: LoadParams) => {
    const isMore = Boolean(params.cursor);
    if (isMore) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    setMoreError(null);
    const qs = new URLSearchParams({ limit: "20" });
    if (params.action) qs.set("action", params.action);
    if (params.cursor) qs.set("cursor", params.cursor);
    const res = await adminApi.get<AuditLog[]>(`/v1/admin/audit-logs?${qs.toString()}`);
    if (isMore) setLoadingMore(false);
    else setLoading(false);
    if (!res.ok) {
      if (isMore) setMoreError(res.error.message);
      else setError(res.error.message);
      return;
    }
    setLogs((prev) => (isMore ? [...prev, ...res.data] : res.data));
    setSeenActions((prev) => {
      const merged = new Set(prev);
      for (const l of res.data) merged.add(l.action);
      return Array.from(merged).sort();
    });
    setCursor(res.pagination?.nextCursor ?? null);
    setHasMore(res.pagination?.hasMore ?? false);
  }, []);

  useEffect(() => {
    void load({ action: "" });
  }, [load]);

  const changeAction = (v: string) => {
    setAction(v);
    void load({ action: v });
  };

  // 选项 = 已见 action 全集 ∪ 当前选中值（选中值可能来自尚未累计到的会话状态）。
  const actionValues =
    action && !seenActions.includes(action) ? [...seenActions, action].sort() : seenActions;
  const actionOptions = [
    { value: "", label: t("admin.audit.filterActionAll") },
    ...actionValues.map((a) => ({ value: a, label: a })),
  ];

  return (
    <div className={styles.page}>
      <div className={styles.stickyHead}>
        <PageHeader title={t("admin.audit.title")} description={t("admin.audit.subtitle")} />
        <Toolbar>
          <Select ariaLabel={t("admin.audit.filterAction")} value={action} onChange={changeAction} options={actionOptions} inline />
          {/* 语义如实：已加载条数（游标分页，无总数可言）。 */}
          {!loading && <span className={styles.count}>{t("common.loadedCount", { count: logs.length })}</span>}
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
                    <span>
                      {t("admin.audit.actor")}:{" "}
                      {l.actorUserId ? (
                        <Link
                          to={`/admin/users/${l.actorUserId}`}
                          className={styles.codeLink}
                          title={t("admin.audit.viewActor")}
                        >
                          <code className={styles.code}>{l.actorUserId}</code>
                        </Link>
                      ) : (
                        <code className={styles.code}>—</code>
                      )}
                    </span>
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
              {moreError && <Alert tone="error">{moreError}</Alert>}
              <Button variant="secondary" loading={loadingMore} onClick={() => void load({ action, cursor })}>
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
