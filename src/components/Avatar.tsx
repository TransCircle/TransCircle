import { useState, type CSSProperties } from "react";
import { cx } from "./admin/cx";
import styles from "./Avatar.module.css";

export interface AvatarProps {
  name?: string | null;
  src?: string | null;
  /** 直径（px），默认 40。 */
  size?: number;
  /**
   * 可访问名称：提供时头像以 role="img" + aria-label 暴露给读屏；
   * 缺省保持纯装饰（aria-hidden），因为旁边通常已有可见的昵称文本。
   */
  label?: string;
  className?: string;
}

/** 圆形头像：有 src 显示图片（加载失败回退首字母），否则显示昵称首字母。尺寸由 CSS 变量驱动。 */
export function Avatar({ name, src, size = 40, label, className }: AvatarProps) {
  // 记录加载失败的具体 src：src 变化时自动重试新图,无需 effect 重置。
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  const style = { "--avatar-size": `${size}px` } as CSSProperties;
  const showImage = !!src && src !== failedSrc;
  return (
    <span
      className={cx(styles.avatar, className)}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {showImage ? (
        /* alt 留空：可访问名称统一由外层 aria-label 承担,避免重复播报。 */
        <img src={src} alt="" className={styles.img} onError={() => setFailedSrc(src)} />
      ) : (
        <span className={styles.initial}>{initial}</span>
      )}
    </span>
  );
}
