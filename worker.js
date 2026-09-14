/**
 * TransCircle Pass Portal — Cloudflare Workers entry point
 *
 * - API 请求（/v1/*）代理到 Pass 后端服务器
 * - 静态资源由 wrangler assets 托管
 * - SPA fallback 由 wrangler.jsonc 的 single_page_application 处理
 *
 * PASS_API_URL 通过 wrangler.jsonc 的 vars 或 Cloudflare Dashboard 配置。
 * 未配置时抛错，防止生产环境 API 请求打到 Pages 静态资源上。
 */

/** @param {Request} request */
/** @param {{ ASSETS: { fetch: (req: Request) => Promise<Response> }; PASS_API_URL?: string }} env */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Proxy API / OAuth / OIDC discovery requests to Pass backend
    if (
      url.pathname.startsWith('/v1/') ||
      url.pathname.startsWith('/oauth2/') ||
      url.pathname.startsWith('/.well-known/')
    ) {
      const backend = env.PASS_API_URL?.replace(/\/+$/, '');
      if (!backend) {
        // 用 Pass 的 {error:{code,message},requestId} 信封：门户 apiFetch 按信封解析，
        // 裸 {error:string} 会让错误提示渲染成 undefined。
        return jsonError('UPSTREAM_UNCONFIGURED', 'PASS_API_URL not configured');
      }

      // Forward request to Pass backend, preserving all headers and cookies
      let backendResponse;
      try {
        backendResponse = await fetch(
          `${backend}${url.pathname}${url.search}`,
          {
            method: request.method,
            headers: request.headers,
            body: request.body,
            redirect: 'manual',
          },
        );
      } catch {
        // Pass 不可达时 fetch 抛异常 → Workers 返回 1101 HTML 错误页，门户解析 JSON 即崩。
        // 统一成 502 信封，登录/注册流程能看到可行动的「服务不可用」提示。
        return jsonError('UPSTREAM_UNREACHABLE', 'Pass backend is unreachable');
      }

      // 直接透传后端响应。之前用 new Headers(backendResponse.headers) 重建响应头，
      // 但 Fetch 规范禁止迭代 Set-Cookie，导致 refresh token 轮换后的新 cookie 丢失，
      // 浏览器继续提交已被轮换的旧 token → 触发 reuse detection → 全部会话吊销。
      // Cloudflare Workers 直接返回 backendResponse 即可保留所有头（含 Set-Cookie）。
      return backendResponse;
    }

    // SPA fallback is handled by wrangler.jsonc asset config
    // (not_found_handling: single_page_application)
    return env.ASSETS.fetch(request);
  },
};

/** 502 信封；requestId 用 Workers 原生 crypto，不手写弱随机。 */
function jsonError(code, message) {
  return new Response(
    JSON.stringify({ error: { code, message }, requestId: 'req_' + crypto.randomUUID() }),
    { status: 502, headers: { 'Content-Type': 'application/json' } },
  );
}
