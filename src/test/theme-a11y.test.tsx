import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import ThemeToggle from "../components/ThemeToggle";

const STORAGE_KEY = "transcircle-theme";

/**
 * Helper: render a component within ThemeProvider.
 */
const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
};

/**
 * Helper: read current theme from document.
 */
const getCurrentTheme = (): string | null => {
  return document.documentElement.getAttribute("data-theme");
};

describe("Theme system accessibility regression", () => {
  beforeEach(() => {
    // Clean up DOM and localStorage between tests
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("ThemeContext validation", () => {
    it("should default to 'light' when localStorage is empty", () => {
      renderWithTheme(<div data-testid="child"></div>);
      expect(getCurrentTheme()).toBe("light");
    });

    it("should fallback to 'light' for invalid stored theme values", () => {
      localStorage.setItem(STORAGE_KEY, "hacker-theme");
      renderWithTheme(<div data-testid="child"></div>);
      expect(getCurrentTheme()).toBe("light");
    });

    it("should clean up invalid stored theme values", () => {
      localStorage.setItem(STORAGE_KEY, "invalid");
      renderWithTheme(<div data-testid="child"></div>);
      // Invalid value should be removed from localStorage
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("should respect valid stored theme 'dark'", () => {
      localStorage.setItem(STORAGE_KEY, "dark");
      renderWithTheme(<div data-testid="child"></div>);
      expect(getCurrentTheme()).toBe("dark");
    });

    it("should gracefully handle localStorage read errors", () => {
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = vi.fn(() => {
        throw new Error("Storage disabled");
      });

      renderWithTheme(<div data-testid="child"></div>);
      expect(getCurrentTheme()).toBe("light");

      Storage.prototype.getItem = originalGetItem;
    });

    it("should gracefully handle localStorage write errors", () => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = vi.fn(() => {
        throw new Error("Quota exceeded");
      });

      renderWithTheme(<ThemeToggle />);
      const toggleBtn = screen.getByRole("button", { name: "切換至深色模式" });

      // Should not throw despite localStorage failure
      expect(() => fireEvent.click(toggleBtn)).not.toThrow();
      expect(getCurrentTheme()).toBe("dark");

      Storage.prototype.setItem = originalSetItem;
    });
  });

  describe("ThemeToggle accessibility", () => {
    it("should render a single toggle button", () => {
      renderWithTheme(<ThemeToggle />);

      const btn = screen.getByRole("button", { name: "切換至深色模式" });
      expect(btn).toBeInTheDocument();
    });

    it("should toggle theme on click (light → dark)", () => {
      renderWithTheme(<ThemeToggle />);

      const btn = screen.getByRole("button", { name: "切換至深色模式" });
      fireEvent.click(btn);
      expect(getCurrentTheme()).toBe("dark");
    });

    it("should toggle theme on click (dark → light)", () => {
      localStorage.setItem(STORAGE_KEY, "dark");
      renderWithTheme(<ThemeToggle />);

      const btn = screen.getByRole("button", { name: "切換至亮色模式" });
      fireEvent.click(btn);
      expect(getCurrentTheme()).toBe("light");
    });

    it("should update data-theme attribute on the document element", () => {
      renderWithTheme(<ThemeToggle />);

      const btn = screen.getByRole("button", { name: "切換至深色模式" });
      fireEvent.click(btn);
      expect(getCurrentTheme()).toBe("dark");
    });

    it("should persist theme selection to localStorage", () => {
      renderWithTheme(<ThemeToggle />);

      const btn = screen.getByRole("button", { name: "切換至深色模式" });
      fireEvent.click(btn);
      expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    });

    it("should toggle aria-label to reflect the target theme", () => {
      renderWithTheme(<ThemeToggle />);

      // Default light → shows "切換至深色模式"
      let btn = screen.getByRole("button", { name: "切換至深色模式" });
      fireEvent.click(btn);

      // Now dark → shows "切換至亮色模式"
      btn = screen.getByRole("button", { name: "切換至亮色模式" });
      expect(btn).toBeInTheDocument();
    });
  });

  describe("ThemeContext hook", () => {
    it("should throw when useTheme is called outside ThemeProvider", () => {
      const BadComponent = () => {
        useTheme();
        return <div></div>;
      };

      // Suppress console.error for this expected error
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() => render(<BadComponent />)).toThrow("useTheme must be used within a ThemeProvider");
      consoleSpy.mockRestore();
    });
  });
});
