import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useTheme, type Theme } from "../context/ThemeContext";
import { cx } from "./admin/cx";
import styles from "./ThemeToggle.module.css";

const SunIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </svg>
);

const MoonIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
  </svg>
);

interface ThemeToggleProps {
  className?: string;
}

const ThemeToggle = ({ className = "" }: ThemeToggleProps) => {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleToggle = useCallback(() => {
    const nextTheme: Theme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
  }, [theme, setTheme]);

  const isDark = theme === "dark";

  return (
    <button
      ref={btnRef}
      type="button"
      className={`${styles.toggleBtn} ${className}`.trim()}
      onClick={handleToggle}
      aria-label={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
    >
      {/* 两个图标常驻 DOM,靠 data-dark 切换透明度+旋转缩放交叉淡入(不重排、可动画)。 */}
      <span className={styles.iconWrap} data-dark={isDark || undefined} aria-hidden="true">
        <span className={cx(styles.icon, styles.moon)}>
          <MoonIcon />
        </span>
        <span className={cx(styles.icon, styles.sun)}>
          <SunIcon />
        </span>
      </span>
    </button>
  );
};

export default ThemeToggle;
