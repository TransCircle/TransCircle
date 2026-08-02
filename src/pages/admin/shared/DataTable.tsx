import type { ReactNode } from "react";
import { cx } from "../../../components/admin/cx";
import { Card, EmptyState } from "../../../components/ui";
import type { SortState } from "./useListQuery";
import styles from "../Admin.module.css";

export interface Column<Row> {
  key: string;
  /** 表头文案；窄容器变卡片后成为每行的 data-label。空串表示纯操作列。 */
  label: string;
  /** 主列：卡片形态下置顶并加分隔线。 */
  primary?: boolean;
  align?: "left" | "right";
  width?: number;
  /** 1 = 最先隐藏（860px 起），2 = 次先隐藏（1040px 起）。 */
  hideAt?: 1 | 2;
  /** 可排序列对应的后端排序字段（须在白名单内）。 */
  sortKey?: string;
  render: (row: Row) => ReactNode;
}

interface DataTableProps<Row> {
  columns: ReadonlyArray<Column<Row>>;
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  sort?: SortState;
  onSort?: (key: string) => void;
  onRowClick?: (row: Row) => void;
  /** 行级无障碍名：整行可点时必须给，否则读屏器只念到一串单元格。 */
  rowLabel?: (row: Row) => string;
  emptyTitle: string;
  emptyDesc?: string;
  ariaLabel: string;
  sortAscLabel: string;
  sortDescLabel: string;
}

/**
 * 配置驱动的表格。窄容器下由 CSS 把每行变成卡片（保留 table 语义，只改显示），
 * 字段名从 `data-label` 取，因此列的 `label` 必须是能独立成立的短语。
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  sort,
  onSort,
  onRowClick,
  rowLabel,
  emptyTitle,
  emptyDesc,
  ariaLabel,
  sortAscLabel,
  sortDescLabel,
}: DataTableProps<Row>) {
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState title={emptyTitle} description={emptyDesc} />
      </Card>
    );
  }

  const colClass = (c: Column<Row>) => (c.hideAt === 1 ? styles.col1 : c.hideAt === 2 ? styles.col2 : undefined);

  return (
    <div className={styles.tableWrap}>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>{ariaLabel}</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const sortKey = c.sortKey;
                const active = sort && sortKey === sort.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={colClass(c)}
                    style={{ width: c.width, textAlign: c.align }}
                    aria-sort={
                      sortKey
                        ? active
                          ? sort.dir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                        : undefined
                    }
                  >
                    {sortKey && onSort ? (
                      <button type="button" className={styles.thSort} onClick={() => onSort(sortKey)}>
                        {c.label}
                        {active && <span aria-hidden="true">{sort.dir === "asc" ? "↑" : "↓"}</span>}
                        <span className={styles.srOnly}>
                          {active && sort.dir === "asc" ? sortAscLabel : sortDescLabel}
                        </span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={onRowClick ? styles.clickable : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "button" : undefined}
                aria-label={onRowClick ? rowLabel?.(row) : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cx(c.primary && styles.tdTight, colClass(c))}
                    data-label={c.label}
                    data-primary={c.primary ? "1" : undefined}
                    style={{ textAlign: c.align }}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
