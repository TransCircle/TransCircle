/**
 * 构建期预渲染入口（只在 Node 里由 scripts/prerender.ts 调用，不进浏览器包）。
 *
 * 为什么要预渲染首页：GPTBot / ClaudeBot / PerplexityBot / 百度等抓取器不执行 JS，
 * 纯 SPA 的 #root 对它们是空的。预渲染把首页正文与 JSON-LD 直接写进 index.html。
 *
 * 刻意不导入 src/router.tsx：它在模块顶层调用 createBrowserRouter（依赖 window），
 * 在 Node 里一导入就崩。这里只拼出首页真正需要的 RootLayout > App 两层。
 *
 * 输出固定是「浅色主题 + 未登录」：服务端读不到 localStorage / 会话。浏览器端
 * src/main.tsx 用 createRoot 整体替换这份标记（而非 hydrateRoot），因此暗色主题与
 * 已登录用户不会触发 hydration mismatch。
 */
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from "react-router-dom";

import i18n from "./i18n/config";
import App from "./App";
import RootLayout from "./layouts/RootLayout";
import { ThemeProvider } from "./context/ThemeContext";
import { SessionProvider } from "./context/SessionContext";
import { AdminProvider } from "./context/AdminContext";
import { buildHomeStructuredData, serializeJsonLd } from "./seo/structured-data";
import { SITE_URL } from "./seo/site";

export interface PrerenderOptions {
  /** 首页内容最后修改日期（YYYY-MM-DD）；未知时为 null，省略 WebPage.dateModified。 */
  readonly dateModified: string | null;
}

export interface PrerenderResult {
  /** 注入 <div id="root"> 的首页标记。 */
  readonly appHtml: string;
  /** 注入 <head> 的 JSON-LD 脚本块。 */
  readonly headHtml: string;
}

const routes = [{ element: <RootLayout />, children: [{ path: "/", element: <App /> }] }];

export async function render({ dateModified }: PrerenderOptions): Promise<PrerenderResult> {
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(SITE_URL));
  if (context instanceof Response) {
    throw new Error(`首页预渲染意外得到 Response（status ${context.status}）`);
  }
  const router = createStaticRouter(handler.dataRoutes, context);

  const appHtml = renderToString(
    <StrictMode>
      <ThemeProvider>
        <SessionProvider>
          <AdminProvider>
            {/* hydrate={false}：不注入 window.__staticRouterHydrationData，客户端本就不 hydrate。 */}
            <StaticRouterProvider router={router} context={context} hydrate={false} />
          </AdminProvider>
        </SessionProvider>
      </ThemeProvider>
    </StrictMode>,
  );

  const structuredData = buildHomeStructuredData({ translate: (key) => i18n.t(key), dateModified });
  const headHtml = `<script type="application/ld+json">\n${serializeJsonLd(structuredData)}\n</script>`;

  return { appHtml, headHtml };
}
