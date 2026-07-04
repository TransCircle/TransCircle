import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // 同源代理到後端：帳戶入口/管理後台走 Bearer + 會話 cookie，
    // 經此代理可避免本地 http 跨域 cookie 問題；OIDC 協議端點亦一併代理。
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
