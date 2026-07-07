import { AdminButton as Button } from "../admin";
import styles from "./Pagination.module.css";

export interface PaginationProps {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** 翻页请求进行中:两个按钮均禁用。 */
  loading?: boolean;
  prevLabel: string;
  nextLabel: string;
  /** 已格式化的当前页文案,如「第 3 页」。 */
  label: string;
  /** 无障碍名称。 */
  ariaLabel?: string;
}

const ChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m15 18-6-6 6-6" />
  </svg>
);
const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

/**
 * 游标式数据的离散翻页控件:上一页 / 第 N 页 / 下一页。
 * 后端为游标分页、无总数,故不做页码直达;由调用方维护游标历史决定 hasPrev/hasNext。
 */
export function Pagination({
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  loading,
  prevLabel,
  nextLabel,
  label,
  ariaLabel,
}: PaginationProps) {
  return (
    <nav className={styles.root} aria-label={ariaLabel}>
      <Button
        variant="secondary"
        size="sm"
        iconLeft={<ChevronLeft />}
        disabled={!hasPrev || loading}
        onClick={onPrev}
      >
        {prevLabel}
      </Button>
      <span className={styles.indicator} aria-current="page">{label}</span>
      <Button
        variant="secondary"
        size="sm"
        disabled={!hasNext || loading}
        onClick={onNext}
      >
        {nextLabel}
        <span className={styles.trailingIcon} aria-hidden="true"><ChevronRight /></span>
      </Button>
    </nav>
  );
}
