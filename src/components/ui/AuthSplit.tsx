import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cx } from "../admin/cx";
import FlagStripe from "../FlagStripe";
import styles from "./AuthSplit.module.css";

export interface AuthSplitProps {
  children: ReactNode;
  /** className applied to the inner form card. */
  className?: string;
}

/**
 * 登录 / 注册页的左右分栏外壳（DESIGN.md §8）。
 *
 * 左：深色品牌面板（旗帜条纹 + Logo/文字标 + 一句品牌语）；右：玻璃表单卡。
 * ≤900px 堆叠为「顶部品牌带 + 下方表单」。
 *
 * 只负责版式与视觉 —— 表单内容、校验与提交逻辑全部由调用页持有，
 * 本组件与 CenteredCard 可直接互换（同为纯容器）。
 */
export function AuthSplit({ children, className }: AuthSplitProps) {
  const { t } = useTranslation();

  return (
    // data-viewport-fit：告诉 RootLayout「这页只有一屏」，
    // 宽屏下由外壳锁成整屏、页脚常驻屏底（见 RootLayout.module.css）。
    <div className={styles.split} data-viewport-fit="">
      <aside className={styles.brand}>
        {/* 旗帜条纹（§3.1）：标为 page 作用域，页脚条纹据此让位，
            保证同一视口只出现一处签名元素（§1.5）。 */}
        <FlagStripe scope="page" />
        <div className={styles.brandInner}>
          {/* 左侧面板恒为深底：只使用正式 on-dark 横版 SVG，字标为 path，禁止拼装。 */}
          <div className={styles.logo} aria-label="TransCircle">
            <img
              className={styles.logoImage}
              src="/brand/transcircle-horizontal-on-dark.svg"
              width={400}
              height={120}
              alt=""
              aria-hidden="true"
            />
          </div>
          <p className={styles.brandEyebrow}>{t("landing.heroEyebrow")}</p>
          <p className={styles.brandLine}>{t("landing.subtitle")}</p>
        </div>
      </aside>

      <div className={styles.formSide}>
        <div className={styles.holder}>
          <div className={cx(styles.card, className)}>
            <div className={styles.body}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthSplit;
