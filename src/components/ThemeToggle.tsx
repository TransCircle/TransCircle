import { useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import { useTheme, type Theme } from "../context/ThemeContext";
import styles from "./ThemeToggle.module.css";

/**
 * Circle-reveal theme switch using the View Transitions API.
 * The browser captures screenshots of old & new page states, then
 * animates clip-path to reveal the new theme from the click origin.
 * Page content is preserved throughout (no solid overlay).
 */
const animateThemeSwitch = (
  nextTheme: Theme,
  button: HTMLButtonElement,
  setTheme: (t: Theme) => void,
): void => {
  const rect = button.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;

  // Calculate the exact pixel radius needed to cover the viewport
  // from the click origin (diagonal of the viewport + safety margin)
  const dx = Math.max(originX, innerWidth - originX);
  const dy = Math.max(originY, innerHeight - originY);
  const finalR = Math.ceil(Math.sqrt(dx * dx + dy * dy)) + 60;

  document.documentElement.style.setProperty("--vt-origin-x", `${originX}px`);
  document.documentElement.style.setProperty("--vt-origin-y", `${originY}px`);
  document.documentElement.style.setProperty("--vt-final-radius", `${finalR}px`);

  if (
    typeof document.startViewTransition === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    document.startViewTransition(() => {
      flushSync(() => {
        setTheme(nextTheme);
      });
    });
  } else {
    setTheme(nextTheme);
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
  const { theme, setTheme } = useTheme();
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleToggle = useCallback(() => {
    const nextTheme: Theme = theme === "light" ? "dark" : "light";
    const btn = btnRef.current;
    if (btn) {
      animateThemeSwitch(nextTheme, btn, setTheme);
    } else {
      setTheme(nextTheme);
    }
  }, [theme, setTheme]);

  const isDark = theme === "dark";

  return (
    <button
      ref={btnRef}
      type="button"
      className={`${styles.toggleBtn} ${className}`.trim()}
      onClick={handleToggle}
      aria-label={isDark ? "切換至亮色模式" : "切換至深色模式"}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
};

export default ThemeToggle;
