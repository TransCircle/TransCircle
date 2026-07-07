import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // 同源代理到后端：账户入口/管理后台走 Bearer + 会话 cookie，
    // 经此代理可避免本地 http 跨域 cookie 问题；OIDC 协议端点亦一并代理。
    proxy: {
      "/v1": {
        target: "http://localhost:1146",
        changeOrigin: true,
      },
      "/oauth2": {
        target: "http://localhost:1146",
        changeOrigin: true,
      },
      "/.well-known": {
        target: "http://localhost:1146",
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
