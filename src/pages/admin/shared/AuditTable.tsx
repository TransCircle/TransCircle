import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, EmptyState, Pill, SectionLabel } from "../../../components/ui";
import type { AuditLog } from "../../../api/types";
import { useFormatTs } from "../../../utils/datetime";
import styles from "../Admin.module.css";

interface AuditTableProps {
  rows: readonly AuditLog[];
  /** 用户详情内的审计只看这一个人，不必再重复「目标」列。 */
  showTarget?: boolean;
  emptyTitle: string;
  emptyDesc?: string;
  ariaLabel: string;
}

/**
 * 审计表：整行可点展开，展开区并排显示变更前后的原始 JSON。
 *
 * 展开用真 `<button>` 语义（行带 role/tabIndex + aria-expanded/aria-controls），
 * 键盘能开能关；折叠内容挂在紧随其后的一行上，读屏器顺序与视觉一致。
 */
export function AuditTable({ rows, showTarget = true, emptyTitle, emptyDesc, ariaLabel }: AuditTableProps) {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  const [openId, setOpenId] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState title={emptyTitle} description={emptyDesc} />
      </Card>
    );
  }

  const actorLabel = (log: AuditLog) => {
    if (log.actorType === "staff") return t("admin.audit.actorStaff");
    if (log.actorType === "system") return t("admin.audit.actorSystem");
    return t("admin.audit.actorSelf");
  };

  const columnCount = showTarget ? 5 : 4;

  return (
    <div className={styles.tableWrap}>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">{t("admin.audit.col.time")}</th>
              <th scope="col">{t("admin.audit.col.actor")}</th>
              <th scope="col">{t("admin.audit.col.action")}</th>
              {showTarget && (
                <th scope="col" className={styles.col1}>
                  {t("admin.audit.col.target")}
                </th>
              )}
              <th scope="col" style={{ width: 80 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((log) => {
              const open = openId === log.id;
              const toggle = () => setOpenId(open ? null : log.id);
              return (
                <Fragment key={log.id}>
                  <tr
                    className={styles.clickable}
                    tabIndex={0}
                    role="button"
                    aria-expanded={open}
                    aria-controls={`audit-detail-${log.id}`}
                    aria-label={t("admin.audit.toggleRow", {
                      action: t(`admin.audit.actionLabels.${log.action}`, { defaultValue: log.action }),
                      at: fmt(log.createdAt),
                    })}
                    onClick={toggle}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle();
                      }
                    }}
                  >
                    <td data-label={t("admin.audit.col.time")} data-primary="1">
                      <span className={`${styles.num} ${styles.mono}`}>{fmt(log.createdAt)}</span>
                    </td>
                    <td data-label={t("admin.audit.col.actor")}>
                      <span className={styles.cellName}>
                        {log.actorName || t("admin.audit.unknownActor")}
                        <Pill tone={log.actorType === "staff" ? "accent" : "neutral"}>
                          {actorLabel(log)}
                        </Pill>
                      </span>
                    </td>
                    <td data-label={t("admin.audit.col.action")}>
                      <span className={styles.cellText}>
                        <span>
                          {t(`admin.audit.actionLabels.${log.action}`, { defaultValue: log.action })}
                        </span>
                        <span className={`${styles.cellSub} ${styles.mono}`}>{log.action}</span>
                      </span>
                    </td>
                    {showTarget && (
                      <td data-label={t("admin.audit.col.target")} className={styles.col1}>
                        <span className={styles.num}>{log.resourceName || log.resourceType || "—"}</span>
                      </td>
                    )}
                    <td data-label="">
                      <span className={styles.num}>
                        {open ? t("admin.audit.collapse") : t("admin.audit.expand")}
                      </span>
                    </td>
                  </tr>
                  {open && (
                    <tr id={`audit-detail-${log.id}`}>
                      <td colSpan={columnCount} data-label="">
                        <div className={styles.grid2}>
                          <div>
                            <SectionLabel as="h3">{t("admin.audit.before")}</SectionLabel>
                            <pre className={styles.code}>
                              {log.before ? JSON.stringify(log.before, null, 2) : "—"}
                            </pre>
                          </div>
                          <div>
                            <SectionLabel as="h3">{t("admin.audit.after")}</SectionLabel>
                            <pre className={styles.code}>
                              {log.after ? JSON.stringify(log.after, null, 2) : "—"}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
