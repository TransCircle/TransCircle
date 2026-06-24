// ============================================================================
// TransCircle Pass 门户统一 API 客户端
//
// 设计要点（对齐故事站 client，并按 Pass 双身份平面扩展）：
// - C 端 access token 仅存内存；401 自动 refresh（POST /v1/auth/refresh，refresh_token
//   走 HttpOnly Cookie 一次性轮换）后重试一次。
// - 管理台 access token 独立存储（sessionStorage，跨刷新存活，关闭标签即失效）；
//   无 refresh 机制，401 即清除并要求经 IAM 重新登录。
// - 统一解析后端响应封装：成功 { data, requestId }（列表附 pagination），
//   失败 { error: { code, message, details?, data? }, requestId }。
// - 自动注入 Authorization / Content-Type / X-CSRF-Token / Idempotency-Key / X-Request-Id。
// ============================================================================

/** Pass 后端基址：默认相对路径（同源，经 Vite 代理到 :1146），可用 VITE_PASS_API_BASE 覆盖。 */
export const API_BASE: string = import.meta.env.VITE_PASS_API_BASE ?? "";

// ─── Token 存储 ──────────────────────────────────────────────────

let _userToken: string | null = null;
const ADMIN_TOKEN_KEY = "pass_admin_token";

export function setUserToken(token: string | null): void {
  _userToken = token;
}
export function getUserToken(): string | null {
  return _userToken;
}

export function setAdminToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* sessionStorage 不可用时忽略 */
  }
}
export function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** 清除 C 端登录态 */
export function clearUserAuth(): void {
  _userToken = null;
  _refreshPromise = null;
}
/** 清除管理台登录态 */
export function clearAdminAuth(): void {
  setAdminToken(null);
}

// ─── refresh token 轮换（C 端平面）──────────────────────────────

let _refreshPromise: Promise<string | null> | null = null;

/** 经 POST /v1/auth/refresh 刷新 C 端 access token；同标签页并发共享同一请求。 */
async function doRefresh(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise;

  const run = async (): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (res.status === 401) {
        _userToken = null;
        return null;
      }
      if (!res.ok) return null;
      const body = (await res.json()) as { data?: { accessToken?: string } };
      if (body.data?.accessToken) {
        _userToken = body.data.accessToken;
        return _userToken;
      }
      return null;
    } catch {
      return null;
    }
  };

  _refreshPromise = (async () => {
    try {
      // 跨标签页串行化：多个标签共用同一 HttpOnly refresh cookie，并发刷新会用到已轮换的
      // 旧 cookie 触发轮换竞态/误判重用。用 Web Locks 串行，确保每次刷新都基于最新 cookie。
      if (typeof navigator !== "undefined" && navigator.locks?.request) {
        return await navigator.locks.request("pass-refresh", run);
      }
      return await run();
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

/** 应用启动时尝试静默续期，恢复 C 端会话。返回新的 access token 或 null。 */
export async function tryRefreshToken(): Promise<string | null> {
  return doRefresh();
}

// ─── CSRF（OAuth 注册/绑定双提交防护）──────────────────────────

/** 读取 oauth_pending_csrf：优先 Cookie，回退 sessionStorage（跨页导航存活）。 */
export function getCsrfToken(): string {
  const match = document.cookie.match(/oauth_pending_csrf=([^;]+)/);
  if (match?.[1]) return match[1];
  try {
    return sessionStorage.getItem("oauth_pending_csrf") || "";
  } catch {
    return "";
  }
}
export function saveCsrfToken(token: string): void {
  try {
    sessionStorage.setItem("oauth_pending_csrf", token);
  } catch {
    /* noop */
  }
}
export function clearCsrfToken(): void {
  try {
    sessionStorage.removeItem("oauth_pending_csrf");
  } catch {
    /* noop */
  }
  document.cookie = "oauth_pending_csrf=; Max-Age=0; path=/; SameSite=Lax";
}

// ─── Idempotency-Key ────────────────────────────────────────────

export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── 响应类型 ────────────────────────────────────────────────────

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Array<{ field: string; reason: string }>;
  data?: Record<string, unknown>;
}

export interface Pagination {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

type ApiResultBase = { requestId: string; status: number };

export type ApiResult<T = unknown> = ApiResultBase &
  (
    | { ok: true; data: T; pagination?: Pagination }
    | { ok: false; error: ApiErrorBody }
  );

export type ApiPlane = "user" | "admin";

export interface ApiRequestOptions {
  /** 身份平面：user（默认，C 端）/ admin（管理台，独立 token）。 */
  plane?: ApiPlane;
  /** 跳过自动注入 Authorization。 */
  noAuth?: boolean;
  /** 合并自定义请求头。 */
  headers?: Record<string, string>;
  /** 注入 Idempotency-Key。 */
  idempotent?: boolean;
  /** 注入 X-CSRF-Token（OAuth 注册/绑定流）。 */
  csrf?: boolean;
  /** 不在 401 时尝试 refresh（C 端平面）。 */
  skipRefresh?: boolean;
  signal?: AbortSignal;
}

// ─── 工具 ────────────────────────────────────────────────────────

function newRequestId(): string {
  const rand =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 20)
      : Math.random().toString(16).slice(2, 22);
  return `req_fe_${rand}`;
}

function planeToken(plane: ApiPlane): string | null {
  return plane === "admin" ? getAdminToken() : _userToken;
}

/** 401 自动处理：C 端尝试 refresh+重试；管理台清除 token 并广播失效事件。 */
async function handle401(
  res: Response,
  plane: ApiPlane,
  url: string,
  init: RequestInit,
  headers: Headers,
  skipRefresh: boolean,
): Promise<Response> {
  if (res.status !== 401) return res;
  if (plane === "user") {
    if (!skipRefresh && _userToken) {
      const newToken = await doRefresh();
      if (newToken) {
        headers.set("Authorization", `Bearer ${newToken}`);
        return fetch(url, { ...init, headers });
      }
    }
    _userToken = null;
    dispatchAuthEvent("pass:session-expired");
  } else {
    clearAdminAuth();
    dispatchAuthEvent("pass:admin-expired");
  }
  return res;
}

function dispatchAuthEvent(name: string): void {
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
    /* noop */
  }
}

// ─── 核心请求 ────────────────────────────────────────────────────

export async function apiRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  options: ApiRequestOptions = {},
): Promise<ApiResult<T>> {
  const plane: ApiPlane = options.plane ?? "user";
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const headers = new Headers(options.headers ?? {});

  const isForm =
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof URLSearchParams ||
    body instanceof ReadableStream;

  if (body !== undefined && !isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  if (!options.noAuth) {
    const tk = planeToken(plane);
    if (tk) headers.set("Authorization", `Bearer ${tk}`);
  }

  if (options.csrf) {
    const csrf = getCsrfToken();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }

  // 每次请求生成独立幂等键，写入本次 headers；401 自动重试复用同一 headers 对象，
  // 因此键在重试间保持一致，且并发的不同幂等操作不会相互串用同一键。
  if (options.idempotent) {
    headers.set("Idempotency-Key", newIdempotencyKey());
  }

  if (!headers.has("X-Request-Id")) headers.set("X-Request-Id", newRequestId());

  const init: RequestInit = {
    method,
    headers,
    credentials: "include",
    signal: options.signal,
  };
  if (body !== undefined) {
    init.body = isForm ? (body as BodyInit) : JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    return {
      ok: false,
      error: {
        code: "network_error",
        message: e instanceof Error ? e.message : "网络请求失败",
      },
      requestId: "",
      status: 0,
    };
  }

  res = await handle401(res, plane, url, init, headers, options.skipRefresh ?? false);

  const status = res.status;
  const contentType = res.headers.get("content-type") ?? "";

  if (status === 204) {
    return {
      ok: true,
      data: undefined as T,
      requestId: res.headers.get("X-Request-Id") ?? "",
      status,
    };
  }

  if (contentType.includes("application/json")) {
    const json = (await res.json()) as Record<string, unknown>;
    const requestId =
      (json.requestId as string) ?? res.headers.get("X-Request-Id") ?? "";

    if (status >= 200 && status < 300) {
      const csrf = json.csrfToken as string | undefined;
      if (csrf) saveCsrfToken(csrf);
      const pagination = json.pagination as Pagination | undefined;
      return pagination
        ? { ok: true, data: json.data as T, pagination, requestId, status }
        : { ok: true, data: json.data as T, requestId, status };
    }

    const csrf = json.csrfToken as string | undefined;
    if (csrf) saveCsrfToken(csrf);
    const error = json.error as ApiErrorBody | undefined;
    return {
      ok: false,
      error: error ?? { code: "unknown", message: "未知错误" },
      requestId,
      status,
    };
  }

  if (status >= 200 && status < 300) {
    return { ok: true, data: undefined as T, requestId: "", status };
  }
  return {
    ok: false,
    error: { code: "http_error", message: `请求失败 (${status})` },
    requestId: "",
    status,
  };
}

// ─── C 端（user 平面）便捷方法 ───────────────────────────────────

export function get<T = unknown>(path: string, options?: ApiRequestOptions) {
  return apiRequest<T>("GET", path, undefined, options);
}
export function post<T = unknown>(path: string, body?: unknown, options?: ApiRequestOptions) {
  return apiRequest<T>("POST", path, body, options);
}
export function patch<T = unknown>(path: string, body?: unknown, options?: ApiRequestOptions) {
  return apiRequest<T>("PATCH", path, body, options);
}
export function del<T = unknown>(path: string, body?: unknown, options?: ApiRequestOptions) {
  return apiRequest<T>("DELETE", path, body, options);
}

// ─── 管理台（admin 平面）便捷方法 ────────────────────────────────

export function adminGet<T = unknown>(path: string, options?: ApiRequestOptions) {
  return apiRequest<T>("GET", path, undefined, { ...options, plane: "admin" });
}
export function adminPost<T = unknown>(path: string, body?: unknown, options?: ApiRequestOptions) {
  return apiRequest<T>("POST", path, body, { ...options, plane: "admin" });
}
export function adminPatch<T = unknown>(path: string, body?: unknown, options?: ApiRequestOptions) {
  return apiRequest<T>("PATCH", path, body, { ...options, plane: "admin" });
}
export function adminDel<T = unknown>(path: string, body?: unknown, options?: ApiRequestOptions) {
  return apiRequest<T>("DELETE", path, body, { ...options, plane: "admin" });
}

/** 便捷命名空间（与故事站 api.* 风格一致）。 */
export const api = { get, post, patch, del };
export const adminApi = { get: adminGet, post: adminPost, patch: adminPatch, del: adminDel };
