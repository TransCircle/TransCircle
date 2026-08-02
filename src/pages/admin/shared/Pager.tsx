import { useTranslation } from "react-i18next";
import { cx } from "../../../components/admin/cx";
import { Select } from "../../../components/ui";
import { PAGE_SIZES, type PageSize } from "../../../api/client";
import styles from "../Admin.module.css";

/**
 * 页码带省略号：首页、末页、当前页 ±1 恒显示，中间折叠。
 * 返回值里字符串项是折叠占位（不可点），数字项是可直达的页码。
 */
export function pageList(current: number, total: number): Array<number | string> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: Array<number | string> = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(total - 1, current + 1);
  if (from > 2) out.push("gap-l");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < total - 1) out.push("gap-r");
  out.push(total);
  return out;
}

interface PagerProps {
  total: number;
  page: number;
  pageSize: PageSize;
  onPage: (page: number) => void;
  onPageSize: (size: PageSize) => void;
  ariaLabel: string;
}

/**
 * 页码直达 + 上/下一页 + 每页 10/20/50 + 「共 N 条 · 第 x–y 条」。
 *
 * 这要求后端是 offset/limit 且返回总数 —— 游标分页只知道「下一段从哪开始」，
 * 跳不到第 5 页。契约变更记在 api-delta.md §二。
 */
export function Pager({ total, page, pageSize, onPage, onPageSize, ariaLabel }: PagerProps) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav className={styles.pager} aria-label={ariaLabel}>
      <span className={styles.pagerRange}>
        {total === 0 ? t("admin.pager.empty") : t("admin.pager.range", { total, first, last })}
      </span>
      <span className={styles.pagerSize}>
        <Select
          inline
          ariaLabel={t("admin.pager.perPage")}
          value={String(pageSize)}
          onChange={(v) => onPageSize(Number(v) as PageSize)}
          options={PAGE_SIZES.map((n) => ({ value: String(n), label: t("admin.pager.perPageN", { count: n }) }))}
        />
      </span>
      <div className={styles.pagerNav}>
        <button
          type="button"
          className={styles.pageBtn}
          disabled={page <= 1}
          aria-label={t("common.prevPage")}
          onClick={() => onPage(page - 1)}
        >
          ‹
        </button>
        {pageList(page, pages).map((n) =>
          typeof n === "string" ? (
            <span key={n} className={styles.pageGap} aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              className={cx(styles.pageBtn, n === page && styles.pageBtnCurrent)}
              aria-current={n === page ? "page" : undefined}
              aria-label={t("common.pageN", { page: n })}
              onClick={() => onPage(n)}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          className={styles.pageBtn}
          disabled={page >= pages}
          aria-label={t("common.nextPage")}
          onClick={() => onPage(page + 1)}
        >
          ›
        </button>
      </div>
    </nav>
  );
}
