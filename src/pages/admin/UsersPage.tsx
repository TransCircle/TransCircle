import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { adminApi } from "../../api/client";
import type { AdminUserListItem, AccountStatus } from "../../api/types";
import { useFormatTs } from "../../utils/datetime";
import { usePageTitle } from "../../utils/usePageTitle";
import {
  PageHeader,
  Toolbar,
  SearchField,
  Select,
  StatusBadge,
  Alert,
  Spinner,
  EmptyState,
  AdminButton as Button,
  type BadgeTone,
} from "../../components/ui";
import styles from "../Page.module.css";

const statusTone = (s: AccountStatus): BadgeTone => {
  switch (s) {
    case "active":
      return "green";
    case "banned":
      return "red";
    case "suspended":
    case "pending_verification":
    case "pending_deletion":
      return "amber";
    default:
      return "muted";
  }
};

/** 状态筛选项：与 i18n `status.*` 已收录的账户状态全集保持一致。 */
const STATUS_FILTERS: readonly string[] = [
  "active",
  "pending_verification",
  "suspended",
  "banned",
  "pending_deletion",
  "deleted",
  "merged",
];

const ChevronRight = () => (
  <svg className={styles.chevron} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

interface LoadParams {
  keyword: string;
  status: string;
  cursor?: string | null;
}

const UsersPage = () => {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  usePageTitle(t("admin.users.title"));

  // 筛选条件从地址栏恢复：从详情页返回时不丢搜索/筛选上下文。
  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState(() => searchParams.get("keyword") ?? "");
  const [status, setStatus] = useState<string>(() => searchParams.get("status") ?? "");
  const [items, setItems] = useState<AdminUserListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 「加载更多」的失败就近显示在按钮旁（用户停在列表底部，顶部 Alert 看不见）。
  const [moreError, setMoreError] = useState<string | null>(null);
  // 最近一次已提交的查询条件：翻页必须延续它，而非输入框里改了但尚未回车的草稿。
  const committedRef = useRef<{ keyword: string; status: string }>({ keyword: "", status: "" });

  // 条件写回地址栏；replace 避免每敲一次筛选就多一条历史记录。
  const syncParams = useCallback(
    (kw: string, st: string) => {
      const next = new URLSearchParams();
      if (kw) next.set("keyword", kw);
      if (st) next.set("status", st);
      setSearchParams(next, { replace: true });
    },
    [setSearchParams],
  );

  // 列表加载：筛选条件全部经显式参数传入、不读闭包状态——否则「清除搜索」
  // 这类在 setState 同一轮内触发的加载会拿到旧 keyword，列表不复位。
  const load = useCallback(async (params: LoadParams) => {
    const isMore = Boolean(params.cursor);
    if (isMore) setLoadingMore(true);
    else setLoading(true);
    if (!isMore) committedRef.current = { keyword: params.keyword, status: params.status };
    setError(null);
    setMoreError(null);
    const qs = new URLSearchParams({ limit: "20" });
    if (params.keyword) qs.set("keyword", params.keyword);
    if (params.status) qs.set("status", params.status);
    if (params.cursor) qs.set("cursor", params.cursor);
    const res = await adminApi.get<AdminUserListItem[]>(`/v1/admin/users?${qs.toString()}`);
    if (isMore) setLoadingMore(false);
    else setLoading(false);
    if (!res.ok) {
      if (isMore) setMoreError(res.error.message);
      else setError(res.error.message);
      return;
    }
    setItems((prev) => (isMore ? [...prev, ...res.data] : res.data));
    setCursor(res.pagination?.nextCursor ?? null);
    setHasMore(res.pagination?.hasMore ?? false);
  }, []);

  // 仅挂载时加载：初始条件来自地址栏，后续加载均由交互显式触发。
  useEffect(() => {
    void load({ keyword, status });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = () => {
    syncParams(keyword, status);
    void load({ keyword, status });
  };
  const clearSearch = () => {
    // SearchField 已把输入清为空串，这里显式传空、不依赖尚未提交的 state。
    syncParams("", status);
    void load({ keyword: "", status });
  };
  const changeStatus = (v: string) => {
    setStatus(v);
    syncParams(keyword, v);
    void load({ keyword, status: v });
  };

  const statusOptions = [
    { value: "", label: t("admin.users.filterStatusAll") },
    ...STATUS_FILTERS.map((s) => ({ value: s, label: t(`status.${s}`) })),
  ];

  return (
    <div className={styles.page}>
      <div className={styles.stickyHead}>
        <PageHeader title={t("admin.users.title")} />
        <Toolbar>
          <SearchField
            value={keyword}
            onValueChange={setKeyword}
            onSearch={search}
            onClear={clearSearch}
            searchAriaLabel={t("admin.users.search")}
            clearAriaLabel={t("common.close")}
            placeholder={t("admin.users.search")}
            fieldClassName={styles.grow}
          />
          <Select ariaLabel={t("admin.users.status")} value={status} onChange={changeStatus} options={statusOptions} inline />
        </Toolbar>
        {/* 语义如实：这是已加载条数，不冒充结果总数（接口为游标分页，无总数）。 */}
        {!loading && <span className={styles.count}>{t("common.loadedCount", { count: items.length })}</span>}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : items.length === 0 ? (
        <EmptyState title={t("admin.users.empty")} />
      ) : (
        <>
          <ul className={styles.list}>
            {items.map((u) => (
              <li key={u.id}>
                <Link to={`/admin/users/${u.id}`} className={styles.rowBtn}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>{u.displayName || u.username || u.email}</span>
                    <span className={styles.rowMeta}>
                      <code className={styles.code}>{u.email}</code>
                      <span className={styles.rowMetaSep}>·</span>
                      {fmt(u.createdAt)}
                    </span>
                  </span>
                  <span className={styles.rowRight}>
                    <StatusBadge tone={statusTone(u.status)} label={t(`status.${u.status}`)} size="sm" />
                    <ChevronRight />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className={styles.loadMoreWrap}>
              {moreError && <Alert tone="error">{moreError}</Alert>}
              <Button variant="secondary" loading={loadingMore} onClick={() => void load({ ...committedRef.current, cursor })}>
                {t("admin.users.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default UsersPage;
