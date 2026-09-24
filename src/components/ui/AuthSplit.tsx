import type { ReactNode } from "react";
import { cx } from "../admin/cx";
import FlagStripe from "../FlagStripe";
import styles from "./AuthSplit.module.css";

export interface AuthSplitProps {
  children: ReactNode;
  /** className applied to the inner form card. */
  className?: string;
  /**
   * 横屏宽视口（≥1024px 且 landscape）下把卡片放宽成双栏容器，
   * 由调用页自己把内容排成两栏（见 LoginPage / RegisterPage）。其余视口不受影响。
   */
  wide?: boolean;
}

/**
 * 登录 / 注册页外壳（DESIGN.md §8）：整页舞台 + 居中表单卡，品牌 lockup 收在卡片顶部。
 *
 * 舞台底按主题取色（亮色粉彩 / 暗色深李紫），顶部一条旗帜条纹；
 * 卡片在两主题下各自与舞台拉开层次。默认单栏；传 `wide` 时横屏宽视口下卡片放宽供调用页排双栏。
 *
 * 只负责版式与视觉 —— 表单内容、校验与提交逻辑全部由调用页持有，
 * 本组件与 CenteredCard 可直接互换（同为纯容器）。
 */
export function AuthSplit({ children, className, wide = false }: AuthSplitProps) {
  return (
    // data-viewport-fit：告诉 RootLayout「这页只有一屏」，
    // 宽屏下由外壳锁成整屏、页脚常驻屏底（见 RootLayout.module.css）。
    <div className={styles.stage} data-viewport-fit="">
      {/* 旗帜条纹（§3.1）：标为 page 作用域，页脚条纹据此让位，
          保证同一视口只出现一处签名元素（§1.5）。 */}
      <FlagStripe scope="page" />
      <div className={styles.formSide}>
        <div className={cx(styles.holder, wide && styles.holderWide)}>
          <div className={cx(styles.card, className)}>
            {/* 正式 compact lockup 文件（public/brand），按主题二选一；
                文字标为 path，禁止拼装。两张图都是同一标识，只让一张进无障碍树。 */}
            <div className={styles.lockup} role="img" aria-label="TransCircle">
              <img
                className={styles.lockupLight}
                src="/brand/transcircle-lockup-compact-on-light.svg"
                width={362}
                height={105}
                alt=""
                aria-hidden="true"
              />
              <img
                className={styles.lockupDark}
                src="/brand/transcircle-lockup-compact-on-dark.svg"
                width={359}
                height={100}
                alt=""
                aria-hidden="true"
              />
            </div>
            <div className={styles.body}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthSplit;
