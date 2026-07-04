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
  SegmentedControl,
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

  const [viewMode, setViewMode] = useState<"table" | "list">("table");
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
          <span className={styles.btnGroup}>
            <SegmentedControl
              options={[
                { value: "table", label: t("admin.audit.viewTable") },
                { value: "list", label: t("admin.audit.viewList") },
              ]}
              value={viewMode}
              onChange={setViewMode}
              ariaLabel={t("admin.audit.filterAction")}
            />
          </span>
        </Toolbar>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : logs.length === 0 ? (
        <EmptyState title={t("admin.audit.empty")} />
      ) : (
        <>
        {viewMode === "list" ? (
          <div className={styles.listWrap}>
            {logs.map((l) => (
              <div key={l.id} className={styles.listRow}>
                <Pill tone="accent">{l.action}</Pill>
                <span className={styles.listRowMeta}>
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
                  {(l.resourceType || l.resourceId) ? (
                    <code className={styles.code}>{[l.resourceType, l.resourceId].filter(Boolean).join(":")}</code>
                  ) : (
                    <span className={styles.cellEmpty}>—</span>
                  )}
                  {l.requestId ? (
                    <code className={styles.code}>{l.requestId}</code>
                  ) : (
                    <span className={styles.cellEmpty}>—</span>
                  )}
                </span>
                <span className={styles.listRowTime}>{fmt(l.createdAt)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col" className={styles.cellAction}>{t("admin.audit.action")}</th>
                  <th scope="col">{t("admin.audit.actor")}</th>
                  <th scope="col">{t("admin.audit.resource")}</th>
                  <th scope="col">{t("admin.audit.requestId")}</th>
                  <th scope="col" className={styles.colTime}>{t("admin.audit.time")}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className={styles.cellAction}><Pill tone="accent">{l.action}</Pill></td>
                    <td className={styles.cellCode}>
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
                    </td>
                    <td className={styles.cellCode}>
                      {(l.resourceType || l.resourceId) ? (
                        <code className={styles.code}>{[l.resourceType, l.resourceId].filter(Boolean).join(":")}</code>
                      ) : (
                        <span className={styles.cellEmpty}>—</span>
                      )}
                    </td>
                    <td className={styles.cellCode}>
                      {l.requestId ? (
                        <code className={styles.code}>{l.requestId}</code>
                      ) : (
                        <span className={styles.cellEmpty}>—</span>
                      )}
                    </td>
                    <td className={styles.cellTime}>{fmt(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMore && (
            <div className={styles.loadMoreWrap}>
              {moreError && <Alert tone="error">{moreError}</Alert>}
              <button
                className={`${styles.loadMoreTab}${loadingMore ? ` ${styles.loadMoreTabActive}` : ""}`}
                disabled={loadingMore}
                onClick={() => void load({ action, cursor })}
              >
                {t("admin.audit.loadMore")}
                {loadingMore && <Spinner size="sm" inline />}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AuditLogsPage;
