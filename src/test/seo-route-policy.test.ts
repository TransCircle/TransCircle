import type { RouteObject } from "react-router-dom";

import { router } from "../router";
import { INDEXABLE_PATHS, KNOWN_ROUTE_PATTERNS, resolveRoutePolicy } from "../seo/route-policy";

/** 把嵌套路由树展开成完整路径模式（与 react-router 的拼接规则一致）。 */
function collectPaths(routes: readonly RouteObject[], parent = ""): string[] {
  return routes.flatMap((route) => {
    const full = route.path
      ? route.path.startsWith("/")
        ? route.path
        : `${parent.replace(/\/$/, "")}/${route.path}`
      : parent;
    const own = route.path ? [full] : [];
    return [...own, ...collectPaths(route.children ?? [], full)];
  });
}

describe("route policy ↔ router.tsx", () => {
  // 兜底的 "*"（NotFoundPage）不是具体页面，对应策略里的 not-found。
  const routerPaths = collectPaths(router.routes).filter((path) => !path.endsWith("*"));

  it("为 router.tsx 中的每条路由登记了策略（新增路由必须同步 route-policy.ts）", () => {
    const unregistered = routerPaths.filter((path) => !KNOWN_ROUTE_PATTERNS.includes(path));
    expect(unregistered).toEqual([]);
  });

  it("策略表里没有 router.tsx 已不存在的陈旧路由", () => {
    const stale = KNOWN_ROUTE_PATTERNS.filter((pattern) => !routerPaths.includes(pattern));
    expect(stale).toEqual([]);
  });

  it("带参数的路由按单个路径段匹配", () => {
    expect(resolveRoutePolicy("/admin/users/u_123").kind).toBe("private");
    expect(resolveRoutePolicy("/admin/clients/abc").titleKey).toBe("admin.title");
    expect(resolveRoutePolicy("/admin/users/u_123/extra").kind).toBe("not-found");
    expect(resolveRoutePolicy("/admin/users/a%2Fb").kind).toBe("not-found");
    expect(resolveRoutePolicy("/admin/users/a%2fb").kind).toBe("not-found");
    expect(resolveRoutePolicy("/admin/users/%E4%B8%AD").kind).toBe("private");
    expect(resolveRoutePolicy("/admin/users/%E4%B8").kind).toBe("not-found"); // 非法编码
  });
});

describe("resolveRoutePolicy", () => {
  it("只有首页可被收录", () => {
    expect(INDEXABLE_PATHS).toEqual(["/"]);
    expect(resolveRoutePolicy("/")).toMatchObject({ kind: "home", indexable: true, titleKey: null });
  });

  it("认证 / 账户 / 管理页 noindex 并带标题 key", () => {
    for (const path of ["/login", "/register", "/account", "/admin", "/oauth/consent", "/auth/callback"]) {
      const policy = resolveRoutePolicy(path);
      expect(policy.kind, path).toBe("private");
      expect(policy.indexable, path).toBe(false);
      expect(policy.titleKey, path).toBeTruthy();
    }
  });

  it("未登记路径判定为 404", () => {
    for (const path of ["/does-not-exist", "/admin/unknown", "/login/extra", "/wp-login.php"]) {
      expect(resolveRoutePolicy(path), path).toMatchObject({ kind: "not-found", indexable: false });
    }
  });

  it("按路径段解码后匹配，与客户端路由一致", () => {
    expect(resolveRoutePolicy("/%6Cogin").kind).toBe("private");
    expect(resolveRoutePolicy("/%61dmin/%75sers").titleKey).toBe("admin.title");
    expect(resolveRoutePolicy("/%2F").kind).toBe("not-found");
  });

  it("容忍尾斜杠（Worker 会先 301 规范化，客户端不应在此瞬间误判）", () => {
    expect(resolveRoutePolicy("/login/").kind).toBe("private");
  });
});
