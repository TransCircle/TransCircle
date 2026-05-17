import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "contrast";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = "transcircle-theme";
const VALID_THEMES: readonly Theme[] = ["light", "dark", "contrast"];
const DEFAULT_THEME: Theme = "light";

/**
 * 验证主题值是否合法。
 * 非法值回退到 DEFAULT_THEME，避免非法状态污染 DOM。
 */
const validateTheme = (value: string | null): Theme => {
  if (value && VALID_THEMES.includes(value as Theme)) {
    return value as Theme;
  }
  return DEFAULT_THEME;
};

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return DEFAULT_THEME;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return validateTheme(stored);
    }
  } catch {
    // localStorage 可能在隐私模式或禁用状态下抛出异常
    // 静默回退到系统偏好或默认值
  }

  try {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  const setTheme = (newTheme: Theme) => {
    const validTheme = validateTheme(newTheme);
    setThemeState(validTheme);
    try {
      localStorage.setItem(STORAGE_KEY, validTheme);
    } catch {
      // 静默忽略 localStorage 写入失败
    }
    document.documentElement.setAttribute("data-theme", validTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
          const newTheme = e.matches ? "dark" : DEFAULT_THEME;
          setThemeState(newTheme);
          document.documentElement.setAttribute("data-theme", newTheme);
        }
      } catch {
        // localStorage 读取失败时静默回退
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
