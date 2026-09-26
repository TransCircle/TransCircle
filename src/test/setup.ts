/// <reference types="vitest/globals" />
import "@testing-library/jest-dom/vitest";

// Mock matchMedia for theme-related tests
// （`// @vitest-environment node` 的测试没有 window，跳过。）
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
