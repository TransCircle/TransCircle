import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme, type Theme } from "../context/ThemeContext";
import { cx } from "./admin/cx";
import styles from "./ThemeToggle.module.css";

/** 涟漪节点清理延时,须 ≥ --dur-reveal(640ms);留 80ms 余量避免动画被提前截断。 */
const RIPPLE_MS = 720;

interface RippleEffect {
  id: number;
  x: number;
  y: number;
  radius: number;
  /** 创建时刻快照的目标主题背景色(来自 --bg-color),快速连点时各涟漪保持各自颜色。 */
  color: string;
}

/**
 * Circle-reveal theme switch using custom CSS animations.
 * Allows multiple simultaneous ripple effects when clicked rapidly.
 */
const animateThemeSwitch = (
  nextTheme: Theme,
  button: HTMLButtonElement,
  setTheme: (t: Theme) => void,
  addRipple: (x: number, y: number, radius: number, color: string) => void,
): void => {
  const rect = button.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;

  // Calculate the exact pixel radius needed to cover the viewport
  const dx = Math.max(originX, innerWidth - originX);
  const dy = Math.max(originY, innerHeight - originY);
  const finalR = Math.ceil(Math.sqrt(dx * dx + dy * dy)) + 60;

  // 先切主题(data-theme 同步落到 <html>),再读取生效后的 --bg-color:
  // 涟漪颜色始终跟随主题 token,避免在 CSS 里硬编码两份背景色。
  setTheme(nextTheme);

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const bg = getComputedStyle(document.documentElement)
      .getPropertyValue("--bg-color")
      .trim();
    addRipple(originX, originY, finalR, bg);
  }
};

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
  const [ripples, setRipples] = useState<RippleEffect[]>([]);
  const rippleIdRef = useRef(0);

  const addRipple = useCallback((x: number, y: number, radius: number, color: string) => {
    const id = rippleIdRef.current++;

    // Limit to max 3 concurrent ripples to prevent queue buildup
    setRipples((prev) => {
      const limited = prev.slice(-2); // Keep only the last 2
      return [...limited, { id, x, y, radius, color }];
    });

    // Remove ripple after animation completes（须与 --dur-reveal 同步,见 RIPPLE_MS）
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, RIPPLE_MS);

    // Return true to indicate ripple was added
    return true;
  }, []);

  const handleToggle = useCallback(() => {
    // 每次点击都必须切换主题。并发涟漪的上限由 addRipple 内部 slice(-2) 自行收敛,
    // 不能在此处因涟漪已满而 return——那会连同 setTheme 一起吞掉本次点击,
    // 造成按钮失灵、最终主题与点击次数不符(可复现的输入丢失回退)。
    const nextTheme: Theme = theme === "light" ? "dark" : "light";
    const btn = btnRef.current;
    if (btn) {
      animateThemeSwitch(nextTheme, btn, setTheme, addRipple);
    } else {
      setTheme(nextTheme);
    }
  }, [theme, setTheme, addRipple]);

  const isDark = theme === "dark";

  return (
    <>
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

      {/* Ripple effects container */}
      {ripples.map((ripple) => (
        <div
          key={ripple.id}
          className={styles.ripple}
          style={{
            left: `${ripple.x}px`,
            top: `${ripple.y}px`,
            width: `${ripple.radius * 2}px`,
            height: `${ripple.radius * 2}px`,
            backgroundColor: ripple.color,
          }}
        />
      ))}
    </>
  );
};

export default ThemeToggle;
