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

/**
 * 安全地读取 localStorage 中的主题设置。
 * 读取失败时返回 null，调用方负责回退逻辑。
 */
const getStoredTheme = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

/**
 * 安全地将主题写入 localStorage。
 * 写入失败时静默忽略（如隐私模式、存储配额超限）。
 */
const setStoredTheme = (theme: Theme): void => {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 静默忽略写入失败
  }
};

/**
 * 清理 localStorage 中的无效主题值。
 * 在发现脏数据时调用，避免脏数据持续影响后续逻辑。
 */
const clearStoredTheme = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 静默忽略
  }
};

/**
 * 将主题应用到 DOM：设置 data-theme 属性。
 * 所有 DOM 副作用统一收口于此，避免分散管理导致的漏改风险。
 */
const applyTheme = (theme: Theme): void => {
  document.documentElement.setAttribute("data-theme", theme);
};

/**
 * 获取初始主题。
 * 优先级：本地存储(校验后) > 系统偏好 > 默认值
 */
const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return DEFAULT_THEME;

  const stored = getStoredTheme();
  if (stored) {
    const valid = validateTheme(stored);
    if (valid === stored) {
      return valid;
    }
    // 存储值无效，清理脏数据
    clearStoredTheme();
    return DEFAULT_THEME;
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
    setStoredTheme(validTheme);
    applyTheme(validTheme);
  };

  // 主题变更时同步 DOM
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // 监听系统主题偏好变化
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      const stored = getStoredTheme();
      // 只有当存储值为空或无效时，才跟随系统主题
      if (!stored || !VALID_THEMES.includes(stored as Theme)) {
        const newTheme = e.matches ? "dark" : DEFAULT_THEME;
        setThemeState(newTheme);
        applyTheme(newTheme);
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
