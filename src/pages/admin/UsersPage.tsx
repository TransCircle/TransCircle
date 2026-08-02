import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, type OffsetPage } from "../../api/client";
import type { AdminUserListItem } from "../../api/types";
import { Avatar } from "../../components/Avatar";
import { Alert, Pill, SearchField, Spinner, StatusBadge } from "../../components/ui";
import { useFormatTs } from "../../utils/datetime";
import { useAdmin } from "../../context/AdminContext";
import { accountStatusTone } from "./shared/constants";
import { ChipSet } from "./shared/ChipSet";
import { DataTable, type Column } from "./shared/DataTable";
import { Pager } from "./shared/Pager";
import { adminErrorText } from "./shared/errors";
import { useAdminPageHeader } from "./shared/header";
import { useListQuery } from "./shared/useListQuery";
import { IconChevron } from "./shared/icons";
import styles from "./Admin.module.css";

const SORT_KEYS = ["last", "name", "status", "sessions"] as const;
const STATUS_FILTERS = ["active", "suspended", "banned", "pending_deletion"] as const;

const UsersPage = () => {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  const navigate = useNavigate();
  const { me } = useAdmin();
  useAdminPageHeader({ title: t("admin.head.users.title"), subtitle: t("admin.head.users.sub") });

  const { query, setPage, setPageSize, setFilter, toggleSort, requestSearch } = useListQuery({
    defaultSort: "last:desc",
    filterKeys: ["q", "status"],
    sortKeys: SORT_KEYS,
  });

  const [page, setPageData] = useState<OffsetPage<AdminUserListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 搜索框保留本地草稿，防抖后再写地址栏 —— 每敲一个字都推一条 URL + 一次请求，
  // 既刷屏历史记录也打后端。
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
      const res = await api.get<OffsetPage<AdminUserListItem>>(
        `/v1/admin/users?${requestSearch}`,
        { plane: "user" },
      );
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

  // 三者都可能为空（纯 Passkey 账户可以没有邮箱），兜一个可读占位。
  const nameOf = (u: AdminUserListItem) =>
    u.displayName || u.username || u.email || t("admin.users.unnamed");

  const mfaText = (u: AdminUserListItem) => {
    if (u.passkeyCount > 0) return t("admin.users.mfaPasskeys", { count: u.passkeyCount });
    if (u.totpEnabled) return t("admin.users.mfaTotp");
    return t("admin.users.mfaNone");
  };

  const columns = useMemo<ReadonlyArray<Column<AdminUserListItem>>>(
    () => [
      {
        key: "name",
        label: t("admin.users.col.account"),
        primary: true,
        sortKey: "name",
        render: (u) => (
          <span className={styles.cellPrimary}>
            <Avatar name={nameOf(u)} src={u.avatarUrl} size={30} />
            <span className={styles.cellText}>
              <span className={styles.cellName}>
                {nameOf(u)}
                {u.id === me?.userId && <span className={styles.tagSelf}>{t("admin.users.tagSelf")}</span>}
                {u.id !== me?.userId && u.hasIamBinding && (
                  <span className={styles.tagStaff}>{t("admin.users.tagStaff")}</span>
                )}
              </span>
              <span className={styles.cellSub}>
                {u.email ?? t("admin.users.noEmail")}
                {u.email && !u.emailVerified && ` · ${t("admin.users.emailUnverified")}`}
              </span>
            </span>
          </span>
        ),
      },
      {
        key: "status",
        label: t("admin.users.col.status"),
        sortKey: "status",
        render: (u) => (
          <StatusBadge tone={accountStatusTone(u.status)} label={t(`status.${u.status}`)} size="sm" />
        ),
      },
      {
        key: "mfa",
        label: t("admin.users.col.mfa"),
        render: (u) => <span className={styles.num}>{mfaText(u)}</span>,
      },
      {
        key: "bindings",
        label: t("admin.users.col.bindings"),
        hideAt: 2,
        render: (u) =>
          u.oauthProviders.length > 0 ? (
            <span className={styles.cellChips}>
              {u.oauthProviders.map((p) => (
                <Pill key={p} tone={p === "iam" ? "accent" : "neutral"}>
                  {t(`admin.provider.${p}`, { defaultValue: p })}
                </Pill>
              ))}
            </span>
          ) : (
            <span className={styles.num}>—</span>
          ),
      },
      {
        key: "sessions",
        label: t("admin.users.col.sessions"),
        align: "right",
        hideAt: 1,
        sortKey: "sessions",
        render: (u) => <span className={styles.num}>{u.activeSessions}</span>,
      },
      {
        key: "last",
        label: t("admin.users.col.last"),
        sortKey: "last",
        render: (u) => <span className={styles.num}>{fmt(u.lastActiveAt ?? u.lastLoginAt) || "—"}</span>,
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
    [t, fmt, me],
  );

  return (
    <div className={styles.stack}>
      <div className={styles.filters}>
        <div className={styles.filtersSearch}>
          <SearchField
            value={keyword}
            onValueChange={setKeyword}
            onSearch={() => setFilter("q", keyword)}
            onClear={() => setFilter("q", "")}
            placeholder={t("admin.users.searchPlaceholder")}
            searchAriaLabel={t("admin.users.searchLabel")}
            clearAriaLabel={t("common.close")}
          />
        </div>
        <ChipSet
          label={t("admin.users.filterStatus")}
          value={query.filters.status ?? ""}
          onChange={(v) => setFilter("status", v)}
          options={[
            { value: "", label: t("admin.filterAll") },
            ...STATUS_FILTERS.map((s) => ({ value: s, label: t(`status.${s}`) })),
          ]}
        />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading && !page ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={page?.items ?? []}
            rowKey={(u) => u.id}
            sort={query.sort}
            onSort={toggleSort}
            onRowClick={(u) => navigate(`/admin/users/${u.id}`)}
            rowLabel={(u) => t("admin.users.openRow", { name: nameOf(u) })}
            ariaLabel={t("admin.head.users.title")}
            emptyTitle={t("admin.users.emptyTitle")}
            emptyDesc={t("admin.users.emptyDesc")}
            sortAscLabel={t("admin.table.sortedAsc")}
            sortDescLabel={t("admin.table.sortedDesc")}
          />
          <Pager
            total={page?.total ?? 0}
            page={query.page}
            pageSize={query.pageSize}
            onPage={setPage}
            onPageSize={setPageSize}
            ariaLabel={t("admin.users.pagerLabel")}
          />
        </>
      )}
    </div>
  );
};

export default UsersPage;
