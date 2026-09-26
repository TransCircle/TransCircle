// @vitest-environment node
/**
 * Worker 路由单测。HTMLRewriter 只存在于 workerd，这里用记录选择器的桩替代：
 * 验证的是「哪些路由走改写、状态码与响应头是什么」；改写后的实际 HTML
 * 由 wrangler dev + curl 验收（见方案验证步骤）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import worker from "./index";

const INDEX_HTML = '<html><head><title>home</title></head><body><div id="root">prerendered</div></body></html>';

/** 模拟 wrangler assets：已知文件直接返回，其余走 SPA 回退（index.html，200）。 */
function makeEnv(files: Record<string, { body: string; type: string }> = {}): Env {
  const assets = {
    fetch: vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = new URL(input instanceof Request ? input.url : String(input));
      const file = files[pathname];
      if (file) return new Response(file.body, { headers: { "Content-Type": file.type } });
      return new Response(INDEX_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", ETag: '"abc"' } });
    }),
  };
  return { ASSETS: assets, PASS_API_URL: "https://pass.example.test" } as unknown as Env;
}

const selectors: string[] = [];

class HTMLRewriterStub {
  on(selector: string): this {
    selectors.push(selector);
    return this;
  }
  transform(response: Response): Response {
    return response;
  }
}

async function call(path: string, init?: RequestInit, env = makeEnv()): Promise<Response> {
  const handler = worker.fetch as (req: Request, env: Env) => Promise<Response>;
  return handler(new Request(`https://transcircle.org${path}`, init), env);
}

beforeEach(() => {
  selectors.length = 0;
  vi.stubGlobal("HTMLRewriter", HTMLRewriterStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HTML 路由", () => {
  it("首页：200、可收录、canonical Link 头，且不经过改写", async () => {
    const res = await call("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toMatch(/^index, follow/);
    expect(res.headers.get("Link")).toBe('<https://transcircle.org/>; rel="canonical"');
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
    expect(selectors).toEqual([]);
    expect(await res.text()).toContain("prerendered");
  });

  it("登录页：200 + noindex，改写 head 并清空 #root，去掉原始 ETag", async () => {
    const res = await call("/login");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(res.headers.get("Link")).toBeNull();
    expect(res.headers.get("ETag")).toBeNull();
    expect(selectors).toContain("#root");
    expect(selectors).toContain("title");
  });

  it("非首页请求去掉条件请求头（防止资源层回 304 跳过改写），首页保留", async () => {
    const env = makeEnv();
    const assets = env.ASSETS.fetch as unknown as ReturnType<typeof vi.fn>;
    const conditional = { headers: { "If-None-Match": '"abc"', "If-Modified-Since": "Sat, 26 Sep 2026 00:00:00 GMT" } };
    await call("/login", conditional, env);
    const forwarded = assets.mock.calls[0]?.[0] as Request;
    expect(forwarded.headers.get("If-None-Match")).toBeNull();
    expect(forwarded.headers.get("If-Modified-Since")).toBeNull();
    await call("/", conditional, env);
    expect((assets.mock.calls[1]?.[0] as Request).headers.get("If-None-Match")).toBe('"abc"');
  });

  it("未知路径：真正的 404 + noindex", async () => {
    const res = await call("/no-such-page");
    expect(res.status).toBe(404);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("缺失的文件（带扩展名）：纯文本 404，而不是 HTML 外壳", async () => {
    const res = await call("/missing.png");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/plain/);
    expect(await res.text()).toBe("Not Found");
  });

  it.each(["/assets/index-deleted.js", "/fonts/missing.woff2", "/brand/missing.svg"])(
    "构建目录下缺失的文件 %s：404 纯文本，且不带长缓存",
    async (path) => {
      const res = await call(path);
      expect(res.status).toBe(404);
      expect(res.headers.get("Content-Type")).toMatch(/^text\/plain/);
      expect(res.headers.get("Cache-Control")).not.toContain("immutable");
    },
  );

  it("编码的点号也按文件处理：/assets/missing%2Ejs → 纯文本 404", async () => {
    const res = await call("/assets/missing%2Ejs");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/plain/);
  });

  it("已登记页面路由的参数带点时仍按页面处理：/admin/users/foo.bar", async () => {
    const res = await call("/admin/users/foo.bar");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(selectors).toContain("#root");
  });

  it("静态文件请求保留条件请求头（可 304）", async () => {
    const env = makeEnv();
    const assets = env.ASSETS.fetch as unknown as ReturnType<typeof vi.fn>;
    await call("/assets/index-abc.js", { headers: { "If-None-Match": '"x"' } }, env);
    expect((assets.mock.calls[0]?.[0] as Request).headers.get("If-None-Match")).toBe('"x"');
  });

  it("HEAD 请求缺失文件：404 且无正文", async () => {
    const res = await call("/assets/missing.js", { method: "HEAD" });
    expect(res.status).toBe(404);
    expect(res.body).toBeNull();
  });

  it("编码过的路径按解码后匹配（/%6Cogin 即登录页）", async () => {
    const res = await call("/%6Cogin");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("静态文件原样返回", async () => {
    const env = makeEnv({ "/robots.txt": { body: "User-agent: *", type: "text/plain" } });
    const res = await call("/robots.txt", undefined, env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("User-agent: *");
  });
});

describe("规范化重定向", () => {
  it.each([
    ["/index.html", "https://transcircle.org/"],
    ["/index.html?utm_source=x", "https://transcircle.org/?utm_source=x"],
    ["/login/", "https://transcircle.org/login"],
    ["/admin/users//?page=2", "https://transcircle.org/admin/users?page=2"],
  ])("%s → 301 %s", async (path, location) => {
    const res = await call(path);
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe(location);
  });
});

describe("API 代理与 well-known", () => {
  it("security.txt 由静态资源提供，不代理到后端", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const env = makeEnv({ "/.well-known/security.txt": { body: "Contact: x", type: "text/plain" } });
    const res = await call("/.well-known/security.txt", undefined, env);
    expect(await res.text()).toBe("Contact: x");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("其余 well-known（OIDC discovery）与 /v1/ 代理到 Pass，原样透传响应", async () => {
    const upstream = new Response("{}", { status: 200, headers: { "Set-Cookie": "rt=1; HttpOnly" } });
    const fetchSpy = vi.fn(async () => upstream);
    vi.stubGlobal("fetch", fetchSpy);
    const res = await call("/.well-known/openid-configuration");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://pass.example.test/.well-known/openid-configuration",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(res).toBe(upstream);
    await call("/v1/session?x=1", { method: "POST", body: "{}" });
    expect(fetchSpy).toHaveBeenLastCalledWith("https://pass.example.test/v1/session?x=1", expect.objectContaining({ method: "POST" }));
  });

  it("后端不可达时返回 502 错误信封", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
    const res = await call("/v1/me");
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string }; requestId: string };
    expect(body.error.code).toBe("UPSTREAM_UNREACHABLE");
    expect(body.requestId).toMatch(/^req_/);
  });
});
