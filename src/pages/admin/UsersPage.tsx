import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { adminApi } from "../../api/client";
import type { AdminUserListItem, AccountStatus } from "../../api/types";
import { useFormatTs } from "../../utils/datetime";
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

const ChevronRight = () => (
  <svg className={styles.chevron} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const UsersPage = () => {
  const { t } = useTranslation();
  const fmt = useFormatTs();

  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<string>("");
  const [items, setItems] = useState<AdminUserListItem[]>([]);
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
      if (keyword) qs.set("keyword", keyword);
      if (status) qs.set("status", status);
      if (!reset && nextCursor) qs.set("cursor", nextCursor);
      const res = await adminApi.get<AdminUserListItem[]>(`/v1/admin/users?${qs.toString()}`);
      if (reset) setLoading(false);
      else setLoadingMore(false);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setItems((prev) => (reset ? res.data : [...prev, ...res.data]));
      setCursor(res.pagination?.nextCursor ?? null);
      setHasMore(res.pagination?.hasMore ?? false);
    },
    [keyword, status],
  );

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const statusOptions = [
    { value: "", label: t("admin.audit.filterActionAll") },
    { value: "active", label: t("status.active") },
    { value: "pending_verification", label: t("status.pending_verification") },
    { value: "suspended", label: t("status.suspended") },
    { value: "banned", label: t("status.banned") },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.stickyHead}>
        <PageHeader title={t("admin.users.title")} />
        <Toolbar>
          <SearchField
            value={keyword}
            onValueChange={setKeyword}
            onSearch={() => void load(true)}
            onClear={() => void load(true)}
            searchAriaLabel={t("admin.users.search")}
            clearAriaLabel={t("common.close")}
            placeholder={t("admin.users.search")}
            fieldClassName={styles.grow}
          />
          <Select ariaLabel={t("admin.users.status")} value={status} onChange={setStatus} options={statusOptions} />
        </Toolbar>
        {!loading && <span className={styles.count}>{items.length}</span>}
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
              <Button variant="secondary" loading={loadingMore} onClick={() => void load(false, cursor)}>
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
