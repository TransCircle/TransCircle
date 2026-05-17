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
      const darkRadio = screen.getByRole("radio", { name: "深色模式" });

      // Should not throw despite localStorage failure
      expect(() => fireEvent.click(darkRadio)).not.toThrow();
      expect(getCurrentTheme()).toBe("dark");

      Storage.prototype.setItem = originalSetItem;
    });
  });

  describe("ThemeToggle accessibility", () => {
    it("should render three radio buttons with correct labels", () => {
      renderWithTheme(<ThemeToggle />);

      expect(screen.getByRole("radio", { name: "亮色模式" })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "深色模式" })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "高对比度模式" })).toBeInTheDocument();
    });

    it("should wrap buttons in a radiogroup with correct aria-label", () => {
      renderWithTheme(<ThemeToggle />);

      const group = screen.getByRole("radiogroup", { name: "主题选择" });
      expect(group).toBeInTheDocument();
      expect(group.children).toHaveLength(3);
    });

    it("should set aria-checked='true' only on the active theme radio", () => {
      renderWithTheme(<ThemeToggle />);

      const lightRadio = screen.getByRole("radio", { name: "亮色模式" });
      const darkRadio = screen.getByRole("radio", { name: "深色模式" });
      const contrastRadio = screen.getByRole("radio", { name: "高对比度模式" });

      // Default: light is active
      expect(lightRadio).toHaveAttribute("aria-checked", "true");
      expect(darkRadio).toHaveAttribute("aria-checked", "false");
      expect(contrastRadio).toHaveAttribute("aria-checked", "false");
    });

    it("should update aria-checked when theme changes", () => {
      renderWithTheme(<ThemeToggle />);

      const lightRadio = screen.getByRole("radio", { name: "亮色模式" });
      const darkRadio = screen.getByRole("radio", { name: "深色模式" });
      const contrastRadio = screen.getByRole("radio", { name: "高对比度模式" });

      // Switch to dark
      fireEvent.click(darkRadio);
      expect(lightRadio).toHaveAttribute("aria-checked", "false");
      expect(darkRadio).toHaveAttribute("aria-checked", "true");
      expect(contrastRadio).toHaveAttribute("aria-checked", "false");

      // Switch to contrast
      fireEvent.click(contrastRadio);
      expect(lightRadio).toHaveAttribute("aria-checked", "false");
      expect(darkRadio).toHaveAttribute("aria-checked", "false");
      expect(contrastRadio).toHaveAttribute("aria-checked", "true");
    });

    it("should update data-theme attribute on the document element", () => {
      renderWithTheme(<ThemeToggle />);

      const darkRadio = screen.getByRole("radio", { name: "深色模式" });
      fireEvent.click(darkRadio);
      expect(getCurrentTheme()).toBe("dark");

      const contrastRadio = screen.getByRole("radio", { name: "高对比度模式" });
      fireEvent.click(contrastRadio);
      expect(getCurrentTheme()).toBe("contrast");
    });

    it("should persist theme selection to localStorage", () => {
      renderWithTheme(<ThemeToggle />);

      const darkRadio = screen.getByRole("radio", { name: "深色模式" });
      fireEvent.click(darkRadio);

      expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    });

    it("should manage tabIndex so only active radio is tabbable", () => {
      renderWithTheme(<ThemeToggle />);

      const lightRadio = screen.getByRole("radio", { name: "亮色模式" });
      const darkRadio = screen.getByRole("radio", { name: "深色模式" });
      const contrastRadio = screen.getByRole("radio", { name: "高对比度模式" });

      expect(lightRadio).toHaveAttribute("tabIndex", "0");
      expect(darkRadio).toHaveAttribute("tabIndex", "-1");
      expect(contrastRadio).toHaveAttribute("tabIndex", "-1");
    });

    it("should support arrow key navigation", async () => {
      const user = userEvent.setup();
      renderWithTheme(<ThemeToggle />);

      const lightRadio = screen.getByRole("radio", { name: "亮色模式" });
      const darkRadio = screen.getByRole("radio", { name: "深色模式" });

      // Focus the active radio
      await user.click(lightRadio);
      expect(lightRadio).toHaveFocus();

      // ArrowRight should move to next radio and select it
      await user.keyboard("{ArrowRight}");
      expect(darkRadio).toHaveFocus();
      expect(getCurrentTheme()).toBe("dark");
    });

    it("should cycle with arrow keys (wrap around)", async () => {
      const user = userEvent.setup();
      renderWithTheme(<ThemeToggle />);

      const lightRadio = screen.getByRole("radio", { name: "亮色模式" });
      const contrastRadio = screen.getByRole("radio", { name: "高对比度模式" });

      // Click contrast (last item) to focus it
      await user.click(contrastRadio);
      expect(contrastRadio).toHaveFocus();

      // ArrowRight from last should wrap to first
      await user.keyboard("{ArrowRight}");
      expect(lightRadio).toHaveFocus();
      expect(getCurrentTheme()).toBe("light");
    });

    it("should support Home/End keys", async () => {
      const user = userEvent.setup();
      renderWithTheme(<ThemeToggle />);

      const lightRadio = screen.getByRole("radio", { name: "亮色模式" });
      const contrastRadio = screen.getByRole("radio", { name: "高对比度模式" });

      // Focus contrast
      await user.click(contrastRadio);

      // Home should go to first
      await user.keyboard("{Home}");
      expect(lightRadio).toHaveFocus();
      expect(getCurrentTheme()).toBe("light");

      // End should go to last
      await user.keyboard("{End}");
      expect(contrastRadio).toHaveFocus();
      expect(getCurrentTheme()).toBe("contrast");
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
