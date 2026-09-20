import { cx } from "./admin/cx";
import styles from "./FlagStripe.module.css";

export interface FlagStripeProps {
  /** mini = 导航当前项指示条（24×3px，§5.3）；full = 通栏/卡顶整条（§3.1）。 */
  variant?: "full" | "mini";
  /** 顶部圆角跟随父卡片（featured 卡顶条）。 */
  rounded?: boolean;
  /**
   * 条纹归属，用于 §1.5「同一视口只出现一处」的让位判定。
   * `page` = 页面自带的签名条纹（如登录页品牌面板）；`footer` = 全站页脚默认条纹。
   * 页面自带时页脚条纹自动隐藏，见 RootLayout.module.css。
   */
  scope?: "page" | "footer";
  className?: string;
}

/**
 * 旗帜条纹（DESIGN.md §3.1）：粉/白/蓝三段等宽实色，用三个 span 实现，禁止渐变。
 *
 * 纯装饰，故整体 aria-hidden —— 条纹承载的「当前项」「页脚分界」等语义，
 * 由调用方以 aria-current / landmark 等真实语义属性表达，不依赖颜色传达（§7）。
 */
export function FlagStripe({ variant = "full", rounded = false, scope, className }: FlagStripeProps) {
  return (
    <span
      className={cx(styles.stripe, variant === "mini" && styles.mini, rounded && styles.rounded, className)}
      data-flag-stripe={scope}
      aria-hidden="true"
    >
      <span className={cx(styles.seg, styles.pink)} />
      <span className={cx(styles.seg, styles.white)} />
      <span className={cx(styles.seg, styles.blue)} />
    </span>
  );
}

export default FlagStripe;
