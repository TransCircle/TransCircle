/// <reference types="vitest/globals" />
import "@testing-library/jest-dom/vitest";

// Mock matchMedia for theme-related tests
// （`// @vitest-environment node` 的测试没有 window，跳过。）
if (typeof window !== "undefined") {
  // Node 22+ 自带 `globalThis.localStorage`（未指定 --localstorage-file 时求值为 undefined）。
  // vitest 的 jsdom 环境只会把「不在 global 上」的 window 键搬过来（getWindowKeys），
  // 于是这个已存在的键被跳过，jsdom 那份可用实现反而没装上 —— 测试里一碰 localStorage
  // 就是 `Cannot read properties of undefined`。这里补回 jsdom 的实现。
  if (globalThis.localStorage === undefined) {
    const jsdom = (globalThis as { jsdom?: { window?: { localStorage?: Storage } } }).jsdom;
    const storage = jsdom?.window?.localStorage;
    if (storage) {
      Object.defineProperty(globalThis, "localStorage", {
        value: storage,
        configurable: true,
        writable: true,
      });
    }
  }

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
