import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { adminApi } from "../../api/client";
import type { AdminUserListItem, AccountStatus } from "../../api/types";
import { Avatar } from "../../components/Avatar";
import { cx } from "../../components/admin/cx";
import { useFormatTs } from "../../utils/datetime";
import { usePageTitle } from "../../utils/usePageTitle";
import {
  Card,
  SearchField,
  Select,
  StatusBadge,
  Alert,
  Spinner,
  EmptyState,
  Pagination,
  type BadgeTone,
} from "../../components/ui";
import admin from "./Admin.module.css";
import page from "../Page.module.css";

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
  <svg className={admin.chevron} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

type NavMode = "reset" | "next" | "prev";

const UsersPage = () => {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  usePageTitle(t("admin.users.title"));

  // 筛选条件从地址栏恢复：从详情页返回时不丢搜索/筛选上下文。
  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState(() => searchParams.get("keyword") ?? "");
  const [status, setStatus] = useState<string>(() => searchParams.get("status") ?? "");
  const [items, setItems] = useState<AdminUserListItem[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 游标历史(离散翻页,同审计页):prevCursors 栈 + currentCursor + nextCursor;
  // committed = 当前查询已提交的筛选,翻页延续它,而非输入框里改了但尚未回车的草稿。
  const prevCursorsRef = useRef<(string | null)[]>([]);
  const currentCursorRef = useRef<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);
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

  // 统一翻页:reset(回第 1 页 / 换筛选)/ next / prev。筛选经显式参数传入、不读闭包状态。
  // 仅成功后提交页码与游标(失败不改页码,顶部 Alert 报错,可原地重试)。
  const navigate = useCallback(async (mode: NavMode, kw: string, st: string) => {
    const target =
      mode === "reset"
        ? null
        : mode === "next"
          ? nextCursorRef.current
          : prevCursorsRef.current[prevCursorsRef.current.length - 1] ?? null;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ limit: "20" });
    if (kw) qs.set("keyword", kw);
    if (st) qs.set("status", st);
    if (target) qs.set("cursor", target);
    const res = await adminApi.get<AdminUserListItem[]>(`/v1/admin/users?${qs.toString()}`);
    setLoading(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    if (mode === "reset") {
      prevCursorsRef.current = [];
      currentCursorRef.current = null;
      committedRef.current = { keyword: kw, status: st };
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
    setItems(res.data);
    nextCursorRef.current = res.pagination?.nextCursor ?? null;
    setHasNext(res.pagination?.hasMore ?? false);
  }, []);

  // 仅挂载时加载：初始条件来自地址栏,后续加载均由交互显式触发。
  useEffect(() => {
    void navigate("reset", keyword, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = () => {
    syncParams(keyword, status);
    void navigate("reset", keyword, status);
  };
  const clearSearch = () => {
    // SearchField 已把输入清为空串,这里显式传空、不依赖尚未提交的 state。
    syncParams("", status);
    void navigate("reset", "", status);
  };
  const changeStatus = (v: string) => {
    setStatus(v);
    syncParams(keyword, v);
    void navigate("reset", keyword, v);
  };

  const statusOptions = [
    { value: "", label: t("admin.users.filterStatusAll") },
    ...STATUS_FILTERS.map((s) => ({ value: s, label: t(`status.${s}`) })),
  ];

  return (
    <div className={admin.page}>
      <div className={admin.toolbar}>
        <SearchField
          value={keyword}
          onValueChange={setKeyword}
          onSearch={search}
          onClear={clearSearch}
          searchAriaLabel={t("admin.users.search")}
          clearAriaLabel={t("common.close")}
          placeholder={t("admin.users.search")}
          fieldClassName={admin.grow}
        />
        <Select ariaLabel={t("admin.users.status")} value={status} onChange={changeStatus} options={statusOptions} inline />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading && items.length === 0 ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : items.length === 0 ? (
        <EmptyState title={t("admin.users.empty")} />
      ) : (
        <>
          <Card padding="none">
            <ul className={admin.list}>
              {items.map((u) => (
                <li key={u.id}>
                  <Link to={`/admin/users/${u.id}`} className={cx(admin.listRow, admin.rowLink)}>
                    <span className={admin.rowMain}>
                      <Avatar name={u.displayName || u.username || u.email} src={u.avatarUrl} size={38} />
                      <span className={admin.rowText}>
                        <span className={admin.rowTitle}>{u.displayName || u.username || u.email}</span>
                        <span className={admin.rowMeta}>
                          <code className={page.code}>{u.email}</code>
                          <span className={admin.rowMetaSep}>·</span>
                          {fmt(u.createdAt)}
                        </span>
                      </span>
                    </span>
                    <span className={admin.rowRight}>
                      <StatusBadge tone={statusTone(u.status)} label={t(`status.${u.status}`)} size="sm" />
                      <ChevronRight />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          {(hasNext || pageNum > 1) && (
            <Pagination
              hasPrev={pageNum > 1}
              hasNext={hasNext}
              onPrev={() => void navigate("prev", committedRef.current.keyword, committedRef.current.status)}
              onNext={() => void navigate("next", committedRef.current.keyword, committedRef.current.status)}
              loading={loading}
              prevLabel={t("common.prevPage")}
              nextLabel={t("common.nextPage")}
              label={t("common.pageN", { page: pageNum })}
              ariaLabel={t("admin.users.title")}
            />
          )}
        </>
      )}
    </div>
  );
};

export default UsersPage;
