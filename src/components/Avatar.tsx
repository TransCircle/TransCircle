import type { CSSProperties } from "react";
import { cx } from "./admin/cx";
import styles from "./Avatar.module.css";

export interface AvatarProps {
  name?: string | null;
  src?: string | null;
  /** 直径（px），默认 40。 */
  size?: number;
  className?: string;
}

/** 圆形头像：有 src 显示图片，否则显示昵称首字母。尺寸由 CSS 变量驱动。 */
export function Avatar({ name, src, size = 40, className }: AvatarProps) {
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  const style = { "--avatar-size": `${size}px` } as CSSProperties;
  return (
    <span className={cx(styles.avatar, className)} style={style} aria-hidden="true">
      {src ? <img src={src} alt="" className={styles.img} /> : <span className={styles.initial}>{initial}</span>}
    </span>
  );
}
