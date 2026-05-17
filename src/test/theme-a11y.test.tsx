import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme, type Theme } from "../context/ThemeContext";
import ThemeToggle from "../components/ThemeToggle";

const STORAGE_KEY = "transcircle-theme";

/**
 * Helper: render a component within ThemeProvider.
 */
const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
};

/**
 * Helper: read current theme from document and localStorage.
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

    it("should respect valid stored theme 'dark'", () => {
      localStorage.setItem(STORAGE_KEY, "dark");
      renderWithTheme(<div data-testid="child"></div>);
      expect(getCurrentTheme()).toBe("dark");
    });

    it("should respect valid stored theme 'contrast'", () => {
      localStorage.setItem(STORAGE_KEY, "contrast");
      renderWithTheme(<div data-testid="child"></div>);
      expect(getCurrentTheme()).toBe("contrast");
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
      const darkBtn = screen.getByRole("button", { name: /深色模式/i });

      // Should not throw despite localStorage failure
      expect(() => fireEvent.click(darkBtn)).not.toThrow();
      expect(getCurrentTheme()).toBe("dark");

      Storage.prototype.setItem = originalSetItem;
    });
  });

  describe("ThemeToggle accessibility", () => {
    it("should render three buttons with correct aria-labels", () => {
      renderWithTheme(<ThemeToggle />);

      expect(screen.getByRole("button", { name: "切换到亮色模式" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "切换到深色模式" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "切换到高对比度模式" })).toBeInTheDocument();
    });

    it("should set aria-pressed='true' only on the active theme button", () => {
      renderWithTheme(<ThemeToggle />);

      const lightBtn = screen.getByRole("button", { name: "切换到亮色模式" });
      const darkBtn = screen.getByRole("button", { name: "切换到深色模式" });
      const contrastBtn = screen.getByRole("button", { name: "切换到高对比度模式" });

      // Default: light is active
      expect(lightBtn).toHaveAttribute("aria-pressed", "true");
      expect(darkBtn).toHaveAttribute("aria-pressed", "false");
      expect(contrastBtn).toHaveAttribute("aria-pressed", "false");
    });

    it("should update aria-pressed when theme changes", () => {
      renderWithTheme(<ThemeToggle />);

      const lightBtn = screen.getByRole("button", { name: "切换到亮色模式" });
      const darkBtn = screen.getByRole("button", { name: "切换到深色模式" });
      const contrastBtn = screen.getByRole("button", { name: "切换到高对比度模式" });

      // Switch to dark
      fireEvent.click(darkBtn);
      expect(lightBtn).toHaveAttribute("aria-pressed", "false");
      expect(darkBtn).toHaveAttribute("aria-pressed", "true");
      expect(contrastBtn).toHaveAttribute("aria-pressed", "false");

      // Switch to contrast
      fireEvent.click(contrastBtn);
      expect(lightBtn).toHaveAttribute("aria-pressed", "false");
      expect(darkBtn).toHaveAttribute("aria-pressed", "false");
      expect(contrastBtn).toHaveAttribute("aria-pressed", "true");
    });

    it("should update data-theme attribute on the document element", () => {
      renderWithTheme(<ThemeToggle />);

      const darkBtn = screen.getByRole("button", { name: "切换到深色模式" });
      fireEvent.click(darkBtn);
      expect(getCurrentTheme()).toBe("dark");

      const contrastBtn = screen.getByRole("button", { name: "切换到高对比度模式" });
      fireEvent.click(contrastBtn);
      expect(getCurrentTheme()).toBe("contrast");
    });

    it("should persist theme selection to localStorage", () => {
      renderWithTheme(<ThemeToggle />);

      const darkBtn = screen.getByRole("button", { name: "切换到深色模式" });
      fireEvent.click(darkBtn);

      expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    });

    it("should be keyboard navigable", async () => {
      const user = userEvent.setup();
      renderWithTheme(<ThemeToggle />);

      const buttons = screen.getAllByRole("button");
      const darkBtn = buttons[1];

      // Tab to focus the dark mode button
      await user.tab();
      await user.tab();
      expect(darkBtn).toHaveFocus();

      // Activate with Enter
      await user.keyboard("{Enter}");
      expect(getCurrentTheme()).toBe("dark");
    });

    it("should wrap buttons in a group with role='group' and aria-label", () => {
      renderWithTheme(<ThemeToggle />);

      const group = screen.getByRole("group", { name: "主题切换" });
      expect(group).toBeInTheDocument();
      expect(group.children).toHaveLength(3);
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
