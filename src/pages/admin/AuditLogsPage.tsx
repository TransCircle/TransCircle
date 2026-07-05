import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { adminApi } from "../../api/client";
import type { AuditLog } from "../../api/types";
import { useFormatTs } from "../../utils/datetime";
import { usePageTitle } from "../../utils/usePageTitle";
import {
  Card,
  Select,
  Pill,
  Alert,
  Spinner,
  EmptyState,
  SegmentedControl,
  Pagination,
} from "../../components/ui";
import admin from "./Admin.module.css";
import page from "../Page.module.css";

type NavMode = "reset" | "next" | "prev";

const AuditLogsPage = () => {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  usePageTitle(t("admin.audit.title"));

  const [viewMode, setViewMode] = useState<"table" | "list">("table");
  const [action, setAction] = useState<string>("");
  const [logs, setLogs] = useState<AuditLog[]>([]);
  // 会话内见过的 action 全集（跨翻页/筛选累计）：选中某项后其余选项不再消失。
  const [seenActions, setSeenActions] = useState<string[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 游标历史:prevCursors = 到达"当前页之前各页"的游标栈;currentCursor = 当前页所用游标;
  // nextCursor = 响应给出的下一页游标。翻页状态仅在请求成功后提交(失败不改页码/游标)。
  const prevCursorsRef = useRef<(string | null)[]>([]);
  const currentCursorRef = useRef<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);

  // 统一翻页:reset(回第 1 页 / 换筛选)/ next / prev。仅成功后提交页码与游标。
  const navigate = useCallback(async (mode: NavMode, actionFilter: string) => {
    const target =
      mode === "reset"
        ? null
        : mode === "next"
          ? nextCursorRef.current
          : prevCursorsRef.current[prevCursorsRef.current.length - 1] ?? null;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ limit: "20" });
    if (actionFilter) qs.set("action", actionFilter);
    if (target) qs.set("cursor", target);
    const res = await adminApi.get<AuditLog[]>(`/v1/admin/audit-logs?${qs.toString()}`);
    setLoading(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    // 提交游标 / 页码
    if (mode === "reset") {
      prevCursorsRef.current = [];
      currentCursorRef.current = null;
      setPageNum(1);
    } else if (mode === "next") {
      prevCursorsRef.current.push(currentCursorRef.current);
      currentCursorRef.current = target;
      setPageNum((p) => p + 1);
    } else {
      prevCursorsRef.current.pop();
      currentCursorRef.current = target;
      setPageNum((p) => Math.max(1, p - 1));
    }
    setLogs(res.data);
    setSeenActions((prev) => {
      const merged = new Set(prev);
      for (const l of res.data) merged.add(l.action);
      return Array.from(merged).sort();
    });
    nextCursorRef.current = res.pagination?.nextCursor ?? null;
    setHasNext(res.pagination?.hasMore ?? false);
  }, []);

  useEffect(() => {
    void navigate("reset", "");
  }, [navigate]);

  const changeAction = (v: string) => {
    setAction(v);
    void navigate("reset", v);
  };

  // 操作类型本地化:actionLabels.<action(点→下划线)>,缺失回退原始枚举串。
  const actionLabel = useCallback(
    (a: string) => t(`admin.audit.actionLabels.${a.replace(/\./g, "_")}`, { defaultValue: a }),
    [t],
  );

  // 选项 = 已见 action 全集 ∪ 当前选中值;label 汉化,value 保留原枚举。
  const actionValues =
    action && !seenActions.includes(action) ? [...seenActions, action].sort() : seenActions;
  const actionOptions = [
    { value: "", label: t("admin.audit.filterActionAll") },
    ...actionValues.map((a) => ({ value: a, label: actionLabel(a) })),
  ];

  // stf 开头 = 管理员(IAM 员工)账户:不在用户列表、无详情可查,渲染纯 code、不加链接。
  const renderActor = (actorUserId: string | null) => {
    if (!actorUserId) return <code className={page.code}>—</code>;
    if (actorUserId.startsWith("stf")) {
      return <code className={page.code} title={t("admin.audit.actorStaff")}>{actorUserId}</code>;
    }
    return (
      <Link to={`/admin/users/${actorUserId}`} className={page.codeLink} title={t("admin.audit.viewActor")}>
        <code className={page.code}>{actorUserId}</code>
      </Link>
    );
  };

  const resourceText = (l: AuditLog) => [l.resourceType, l.resourceId].filter(Boolean).join(":");

  const pager =
    (hasNext || pageNum > 1) ? (
      <Pagination
        hasPrev={pageNum > 1}
        hasNext={hasNext}
        onPrev={() => void navigate("prev", action)}
        onNext={() => void navigate("next", action)}
        loading={loading}
        prevLabel={t("common.prevPage")}
        nextLabel={t("common.nextPage")}
        label={t("common.pageN", { page: pageNum })}
        ariaLabel={t("admin.audit.title")}
      />
    ) : null;

  return (
    <div className={admin.page}>
      <p className={admin.pageIntroText}>{t("admin.audit.subtitle")}</p>
      <div className={admin.toolbar}>
        <Select ariaLabel={t("admin.audit.filterAction")} value={action} onChange={changeAction} options={actionOptions} inline />
        {/* 表格 / 列表视图切换(远端功能保留)。 */}
        <span className={page.btnGroup}>
          <SegmentedControl
            options={[
              { value: "table", label: t("admin.audit.viewTable") },
              { value: "list", label: t("admin.audit.viewList") },
            ]}
            value={viewMode}
            onChange={setViewMode}
            ariaLabel={t("admin.audit.viewMode")}
          />
        </span>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading && logs.length === 0 ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : logs.length === 0 ? (
        <EmptyState title={t("admin.audit.empty")} />
      ) : (
        <>
          {viewMode === "list" ? (
            // 列表视图:账户中心风安静卡(卡内分隔行)。
            <Card padding="none">
              <ul className={admin.list}>
                {logs.map((l) => (
                  <li key={l.id} className={admin.listRow}>
                    <span className={admin.rowMain}>
                      <span className={admin.rowText}>
                        <span className={admin.rowTitle}>
                          <Pill tone="accent">{actionLabel(l.action)}</Pill>
                        </span>
                        <span className={admin.rowMeta}>
                          <span>{t("admin.audit.actor")}: {renderActor(l.actorUserId)}</span>
                          {resourceText(l) && (
                            <>
                              <span className={admin.rowMetaSep}>·</span>
                              <span>{t("admin.audit.resource")}: <code className={page.code}>{resourceText(l)}</code></span>
                            </>
                          )}
                          {l.requestId && (
                            <>
                              <span className={admin.rowMetaSep}>·</span>
                              <code className={page.code}>{l.requestId}</code>
                            </>
                          )}
                        </span>
                      </span>
                    </span>
                    <span className={admin.rowRight}>{fmt(l.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            // 表格视图(远端功能保留):横向可滚动表格。
            <div className={page.tableWrap}>
              <table className={page.table}>
                <thead>
                  <tr>
                    <th scope="col" className={page.cellAction}>{t("admin.audit.action")}</th>
                    <th scope="col">{t("admin.audit.actor")}</th>
                    <th scope="col">{t("admin.audit.resource")}</th>
                    <th scope="col">{t("admin.audit.requestId")}</th>
                    <th scope="col" className={page.colTime}>{t("admin.audit.time")}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className={page.cellAction}><Pill tone="accent">{actionLabel(l.action)}</Pill></td>
                      <td className={page.cellCode}>{renderActor(l.actorUserId)}</td>
                      <td className={page.cellCode}>
                        {resourceText(l) ? <code className={page.code}>{resourceText(l)}</code> : <span className={page.cellEmpty}>—</span>}
                      </td>
                      <td className={page.cellCode}>
                        {l.requestId ? <code className={page.code}>{l.requestId}</code> : <span className={page.cellEmpty}>—</span>}
                      </td>
                      <td className={page.cellTime}>{fmt(l.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pager}
        </>
      )}
    </div>
  );
};

export default AuditLogsPage;
