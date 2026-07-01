import { useCallback, useRef, useState } from "react";
import { useTheme, type Theme } from "../context/ThemeContext";
import styles from "./ThemeToggle.module.css";

interface RippleEffect {
  id: number;
  x: number;
  y: number;
  radius: number;
  theme: Theme;
}

/**
 * Circle-reveal theme switch using custom CSS animations.
 * Allows multiple simultaneous ripple effects when clicked rapidly.
 */
const animateThemeSwitch = (
  nextTheme: Theme,
  button: HTMLButtonElement,
  setTheme: (t: Theme) => void,
  addRipple: (x: number, y: number, radius: number, theme: Theme) => void,
): void => {
  const rect = button.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;

  // Calculate the exact pixel radius needed to cover the viewport
  const dx = Math.max(originX, innerWidth - originX);
  const dy = Math.max(originY, innerHeight - originY);
  const finalR = Math.ceil(Math.sqrt(dx * dx + dy * dy)) + 60;

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    addRipple(originX, originY, finalR, nextTheme);
  }

  setTheme(nextTheme);
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
  const [ripples, setRipples] = useState<RippleEffect[]>([]);
  const rippleIdRef = useRef(0);

  const addRipple = useCallback((x: number, y: number, radius: number, theme: Theme) => {
    const id = rippleIdRef.current++;

    // Limit to max 3 concurrent ripples to prevent queue buildup
    setRipples((prev) => {
      const limited = prev.slice(-2); // Keep only the last 2
      return [...limited, { id, x, y, radius, theme }];
    });

    // Remove ripple after animation completes
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 500);

    // Return true to indicate ripple was added
    return true;
  }, []);

  const handleToggle = useCallback(() => {
    // Check if we can add more ripples (limit to 3 concurrent)
    if (ripples.length >= 3) {
      // Don't toggle if queue is full - maintains parity
      return;
    }

    const nextTheme: Theme = theme === "light" ? "dark" : "light";
    const btn = btnRef.current;
    if (btn) {
      animateThemeSwitch(nextTheme, btn, setTheme, addRipple);
    } else {
      setTheme(nextTheme);
    }
  }, [theme, setTheme, addRipple, ripples.length]);

  const isDark = theme === "dark";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`${styles.toggleBtn} ${className}`.trim()}
        onClick={handleToggle}
        aria-label={isDark ? "切換至亮色模式" : "切換至深色模式"}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </button>

      {/* Ripple effects container */}
      {ripples.map((ripple) => (
        <div
          key={ripple.id}
          className={styles.ripple}
          data-theme={ripple.theme}
          style={{
            left: `${ripple.x}px`,
            top: `${ripple.y}px`,
            width: `${ripple.radius * 2}px`,
            height: `${ripple.radius * 2}px`,
          }}
        />
      ))}
    </>
  );
};

export default ThemeToggle;
