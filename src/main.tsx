import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { SessionProvider } from "./context/SessionContext";
import { AdminProvider } from "./context/AdminContext";
import { router } from "./router";
import "./i18n/config";
import "./index.css";

// 首页的 #root 里有构建期预渲染的标记（见 src/entry-prerender.tsx），供不执行 JS 的爬虫
// 与 JS 加载前的首屏使用。这里刻意用 createRoot 整体替换而不是 hydrateRoot：预渲染只能产出
// 「浅色主题 + 未登录」，而浏览器会按 localStorage 读出暗色主题与会话提示；hydrate 遇到
// 属性不一致时 React 会保留服务端的值（如主题按钮的 aria-label），对读屏用户是错误信息。
// 页面配色由 <head> 内联脚本在绘制前设好 data-theme，替换时只有导航账户区与主题图标可能变化。
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <SessionProvider>
        <AdminProvider>
          <RouterProvider router={router} />
        </AdminProvider>
      </SessionProvider>
    </ThemeProvider>
  </StrictMode>,
);
