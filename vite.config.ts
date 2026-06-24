import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // 同源代理到 Pass 后端（:1146）：账户门户/管理后台用 Bearer + 会话 cookie，
    // 经此代理可避免本地 http 跨域 cookie 问题；OIDC 协议端点亦一并代理。
    proxy: {
      "/v1": "http://localhost:1146",
      "/oauth2": "http://localhost:1146",
      "/.well-known": "http://localhost:1146",
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
