/**
 * TransCircle 主站 — Cloudflare Workers 入口
 *
 * 1. API / OAuth / OIDC discovery（/v1/*、/oauth2/*、/.well-known/*）代理到 Pass 后端。
 * 2. HTML 路由按 src/seo/route-policy.ts 决定索引策略（wrangler.jsonc 的
 *    assets.run_worker_first 让页面请求先到这里，静态目录直接走资源服务）：
 *    - 首页：原样返回构建期预渲染的 index.html，附 X-Robots-Tag / canonical Link 头；
 *    - 认证 / 账户 / 管理页：200 + noindex，改写 <title>，去掉 canonical、og:url 与 JSON-LD，
 *      清空 #root 里的首页预渲染标记（否则 JS 执行前会闪现首页内容）；
 *    - 其余路径：真正的 404 状态码 + noindex（不再是 SPA 的「软 404」）。
 * 3. /index.html 与带尾斜杠的路径 301 到规范 URL，避免重复收录。
 *
 * PASS_API_URL 通过 wrangler.jsonc 的 vars 或 Cloudflare Dashboard 配置。
 * 未配置时返回错误信封，防止生产环境 API 请求打到静态资源上。
 */
import zhCN from "../src/i18n/locales/zh-CN/common.json";
import { decodePathname, resolveRoutePolicy, type RoutePolicy } from "../src/seo/route-policy";
import { absoluteUrl } from "../src/seo/site";

const API_PREFIXES = ["/v1/", "/oauth2/", "/.well-known/"] as const;

/** /.well-known/ 下由静态资源提供的文件；其余 well-known 路径（如 OIDC discovery）属于 Pass。 */
const STATIC_WELL_KNOWN = new Set(["/.well-known/security.txt"]);

/** SPA 路由没有扩展名；有扩展名的就是文件请求。 */
const FILE_EXTENSION = /\.[A-Za-z0-9]+$/;

const INDEX_ROBOTS = "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1";
const NOINDEX_ROBOTS = "noindex, nofollow";

/**
 * _headers 不作用于 Worker 生成的响应（Cloudflare 文档明确说明），
 * 因此 HTML 响应的安全头在这里补齐，取值与 public/_headers 的 /* 规则一致。
 */
const HTML_SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "browsing-topics=()"],
  ["Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload"],
];

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (STATIC_WELL_KNOWN.has(pathname)) {
      return env.ASSETS.fetch(request);
    }
    if (API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      return proxyToPass(request, url, env);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return env.ASSETS.fetch(request);
    }

    // 规范化：/index.html 与尾斜杠变体永久重定向到唯一 URL（保留查询串）。
    if (pathname === "/index.html") {
      return permanentRedirect(url, "/");
    }
    if (pathname.length > 1 && pathname.endsWith("/")) {
      return permanentRedirect(url, pathname.replace(/\/+$/, "") || "/");
    }

    const policy = resolveRoutePolicy(pathname);
    // 未登记的路由上、带扩展名的路径（按解码后判断，/a%2Ejs 也算）视为文件请求：
    // 真实文件由资源层直接返回；缺失时 SPA 回退会给出 index.html，下面改成纯文本 404。
    // 已登记的页面路由（如 /admin/users/foo.bar）即使带点也按页面处理。
    const isFileRequest = policy.kind === "not-found" && FILE_EXTENSION.test(decodePathname(pathname) ?? pathname);
    // 会被改写的 HTML（私有页、未知页面）去掉条件请求头：否则资源层可能对共享的
    // index.html 回 304，304 没有正文，改写（标题、noindex、清空 #root）就无从发生。
    // 首页与真实静态文件保留条件请求，照常享受 304。
    const isRewrittenPage = policy.kind !== "home" && !isFileRequest;
    const response = await env.ASSETS.fetch(isRewrittenPage ? withoutConditionals(request) : request);
    // 静态文件（图标、txt、manifest……）与 304 原样返回；只有 SPA 的 HTML 外壳需要处理。
    if (!isHtml(response)) {
      return response;
    }
    if (isFileRequest) {
      return missingFile(request.method);
    }
    return renderPage(response, policy, pathname);
  },
} satisfies ExportedHandler<Env>;

function isHtml(response: Response): boolean {
  return (response.headers.get("Content-Type") ?? "").startsWith("text/html");
}

function withoutConditionals(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.delete("If-None-Match");
  headers.delete("If-Modified-Since");
  return new Request(request, { headers });
}

function missingFile(method: string): Response {
  return new Response(method === "HEAD" ? null : "Not Found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "X-Robots-Tag": NOINDEX_ROBOTS,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function permanentRedirect(url: URL, pathname: string): Response {
  return Response.redirect(`${url.origin}${pathname}${url.search}`, 301);
}

/** 按点分 key 取 zh-CN 文案；取不到时回落到站点名，保证 <title> 不为空。 */
function translate(key: string): string {
  const value = key.split(".").reduce<unknown>((node, part) => {
    return node !== null && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined;
  }, zhCN);
  return typeof value === "string" ? value : zhCN.common.siteName;
}

function renderPage(asset: Response, policy: RoutePolicy, pathname: string): Response {
  const headers = new Headers(asset.headers);
  headers.set("Cache-Control", "public, max-age=0, must-revalidate, no-transform");
  headers.set("X-Robots-Tag", policy.indexable ? INDEX_ROBOTS : NOINDEX_ROBOTS);
  for (const [name, value] of HTML_SECURITY_HEADERS) {
    headers.set(name, value);
  }

  if (policy.kind === "home") {
    headers.set("Link", `<${absoluteUrl(pathname)}>; rel="canonical"`);
    return new Response(asset.body, { status: asset.status, headers });
  }

  // 非首页：同一份 index.html 按路由改写。ETag 属于原始首页文件，改写后不再适用。
  headers.delete("ETag");
  headers.delete("Link");
  // setInnerContent / setAttribute 默认按文本处理并自行转义，无需手动 escape。
  const title = `${translate(policy.titleKey ?? "error.notFound")} · ${zhCN.common.siteName}`;
  const status = policy.kind === "not-found" ? 404 : asset.status;

  const rewritten = new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(title);
      },
    })
    .on('meta[property="og:title"], meta[name="twitter:title"]', {
      element(el) {
        el.setAttribute("content", title);
      },
    })
    .on('meta[name="robots"]', {
      element(el) {
        el.setAttribute("content", NOINDEX_ROBOTS);
      },
    })
    .on('link[rel="canonical"], meta[property="og:url"], script[type="application/ld+json"]', {
      element(el) {
        el.remove();
      },
    })
    .on("#root", {
      element(el) {
        el.setInnerContent("");
      },
    })
    .transform(new Response(asset.body, { status, headers }));

  return rewritten;
}

async function proxyToPass(request: Request, url: URL, env: Env): Promise<Response> {
  const backend = env.PASS_API_URL?.replace(/\/+$/, "");
  if (!backend) {
    // 用 Pass 的 {error:{code,message},requestId} 信封：门户 apiFetch 按信封解析，
    // 裸 {error:string} 会让错误提示渲染成 undefined。
    return jsonError("UPSTREAM_UNCONFIGURED", "PASS_API_URL not configured");
  }

  try {
    // 直接透传后端响应。之前用 new Headers(backendResponse.headers) 重建响应头，
    // 但 Fetch 规范禁止迭代 Set-Cookie，导致 refresh token 轮换后的新 cookie 丢失，
    // 浏览器继续提交已被轮换的旧 token → 触发 reuse detection → 全部会话吊销。
    // Cloudflare Workers 直接返回 backendResponse 即可保留所有头（含 Set-Cookie）。
    return await fetch(`${backend}${url.pathname}${url.search}`, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual",
    });
  } catch {
    // Pass 不可达时 fetch 抛异常 → Workers 返回 1101 HTML 错误页，门户解析 JSON 即崩。
    // 统一成 502 信封，登录/注册流程能看到可行动的「服务不可用」提示。
    return jsonError("UPSTREAM_UNREACHABLE", "Pass backend is unreachable");
  }
}

/** 502 信封；requestId 用 Workers 原生 crypto，不手写弱随机。 */
function jsonError(code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message }, requestId: `req_${crypto.randomUUID()}` }), {
    status: 502,
    headers: { "Content-Type": "application/json" },
  });
}
