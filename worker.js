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
      const backend = env.PASS_API_URL;
      if (!backend) {
        return new Response('PASS_API_URL not configured', { status: 502 });
      }

      // Forward request to Pass backend, preserving all headers and cookies
      return fetch(`${backend}${url.pathname}${url.search}`, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
    }

    // SPA fallback is handled by wrangler.jsonc asset config
    // (not_found_handling: single_page_application)
    return env.ASSETS.fetch(request);
  },
};
