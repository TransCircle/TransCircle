/**
 * 路由的索引策略：边缘 Worker（决定状态码、X-Robots-Tag、改写 <head>）与
 * 客户端 useRouteSeo（SPA 内部跳转时同步 <head>）共用同一张表。
 *
 * 必须与 src/router.tsx 同步 —— src/test/seo-route-policy.test.ts 会遍历真实路由树，
 * 任何未登记的新路由都会让测试失败。
 *
 * 纯数据模块：不得引入 React / DOM / i18n 运行时（Worker 也会打包它）。
 */

export type RouteKind = "home" | "private" | "not-found";

export interface RoutePolicy {
  readonly kind: RouteKind;
  /** 是否允许搜索引擎收录。只有首页可收录。 */
  readonly indexable: boolean;
  /** 页面标题的 i18n key；首页用站点默认标题，故为 null。 */
  readonly titleKey: string | null;
}

/** 可被收录的公开页面（同时也是 sitemap 的来源）。 */
export const INDEXABLE_PATHS = ["/"] as const;

/**
 * 认证 / 账户 / 管理 / 协议回调类页面：对搜索无价值且可能带一次性参数，
 * 一律 noindex。它们仍允许抓取 —— robots.txt 里 Disallow 反而会让爬虫看不到 noindex。
 */
const PRIVATE_ROUTES: ReadonlyArray<readonly [pattern: string, titleKey: string]> = [
  ["/login", "login.title"],
  ["/register", "register.title"],
  ["/verify-email", "verify.verifying"],
  ["/password/forgot", "forgot.title"],
  ["/password/reset", "reset.title"],
  ["/account/cancel-deletion", "cancelDeletion.title"],
  ["/auth/callback", "callback.title"],
  ["/auth/oauth/continue", "continue.title"],
  ["/auth/mfa/done", "mfa.done.title"],
  ["/auth/error", "authError.title"],
  ["/oauth/consent", "consent.pageTitle"],
  ["/settings/security/oauth-bind/confirm", "account.oauth.bindConfirmTitle"],
  ["/account", "account.title"],
  ["/account/profile", "account.title"],
  ["/account/password", "account.title"],
  ["/account/two-factor", "account.title"],
  ["/account/passkeys", "account.title"],
  ["/account/oauth", "account.title"],
  ["/account/sessions", "account.title"],
  ["/account/danger", "account.title"],
  ["/admin/login", "login.title"],
  ["/admin/step-up/done", "admin.stepup.donePageTitle"],
  ["/admin", "admin.title"],
  ["/admin/overview", "admin.title"],
  ["/admin/users", "admin.title"],
  ["/admin/users/:id", "admin.title"],
  ["/admin/clients", "admin.title"],
  ["/admin/clients/new", "admin.title"],
  ["/admin/clients/:id", "admin.title"],
  ["/admin/audit", "admin.title"],
  ["/admin/staff", "admin.title"],
  ["/admin/security", "admin.title"],
];

/** 登记在案的全部路由模式（供测试与 router.tsx 对账）。 */
export const KNOWN_ROUTE_PATTERNS: readonly string[] = [...INDEXABLE_PATHS, ...PRIVATE_ROUTES.map(([p]) => p)];

const PRIVATE_MATCHERS = PRIVATE_ROUTES.map(([pattern, titleKey]) => ({
  // 与 react-router 的 `:param` 语义一致：匹配单个非空路径段（在解码后的路径上匹配）。
  regex: new RegExp(`^${pattern.replace(/:[A-Za-z]+/g, "[^/]+")}$`),
  titleKey,
}));

const HOME: RoutePolicy = { kind: "home", indexable: true, titleKey: null };
const NOT_FOUND: RoutePolicy = { kind: "not-found", indexable: false, titleKey: "error.notFound" };

/**
 * 按路径段解码，与 react-router 匹配前的解码保持一致（否则 /%6Cogin 在客户端是登录页，
 * 在边缘却被判成 404）。非法百分号编码、或解码后段内出现 "/"（来自 %2F）时返回 null：
 * 这类路径在路由层含义不明确，一律按 404 处理。
 */
export function decodePathname(pathname: string): string | null {
  const segments: string[] = [];
  for (const segment of pathname.split("/")) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (decoded.includes("/")) return null;
    segments.push(decoded);
  }
  return segments.join("/");
}

/**
 * 按路径判定策略。调用方应传入已规范化的 pathname（无尾斜杠，根路径除外）；
 * 这里仍容忍尾斜杠，以免客户端在规范化重定向前的瞬间误判为 404。
 */
export function resolveRoutePolicy(pathname: string): RoutePolicy {
  const decoded = decodePathname(pathname);
  if (decoded === null) return NOT_FOUND;
  const path = decoded.length > 1 ? decoded.replace(/\/+$/, "") : decoded;
  if (path === "/") return HOME;
  const hit = PRIVATE_MATCHERS.find(({ regex }) => regex.test(path));
  return hit ? { kind: "private", indexable: false, titleKey: hit.titleKey } : NOT_FOUND;
}
