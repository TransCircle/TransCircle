// ============================================================================
// TransCircle Pass 门户统一 API 客户端
//
// 设计要点（对齐故事站 client）：
// - access token 仅存内存；401 自动 refresh（POST /v1/auth/refresh，refresh_token
//   走 HttpOnly Cookie 一次性轮换）后重试一次。
// - **只有一条身份平面**。管理控制台复用用户自己的 Pass 会话：管理员就是普通用户，
//   「进入控制台」只是访问了一个需要 IAM 权限的页面，不再有独立的管理员令牌、
//   不再有 sessionStorage、也不再有管理端登出。
// - 统一解析后端响应封装：成功 { data, requestId }（游标列表附 pagination；
//   管理端列表改为 offset，分页字段落在 data 里，见 OffsetPage），
//   失败 { error: { code, message, details?, data? }, requestId }。
// - 自动注入 Authorization / Content-Type / X-CSRF-Token / If-Match /
//   Idempotency-Key / X-Request-Id。
// ============================================================================

// 非 React 环境的兜底文案:直接用 i18n 单例(config 不反向依赖本模块,无循环);
// 统一在错误发生时调用 i18n.t 惰性取值,跟随用户当前语言。
import i18n from "../i18n/config";

/** Pass 后端基址：默认相对路径（同源，经 Vite 代理到 :1146），可用 VITE_PASS_API_BASE 覆盖。 */
export const API_BASE: string = import.meta.env.VITE_PASS_API_BASE ?? "";

// ─── Token 存储 ──────────────────────────────────────────────────

let _userToken: string | null = null;

export function setUserToken(token: string | null): void {
  _userToken = token;
}
export function getUserToken(): string | null {
  return _userToken;
}

/** 清除登录态（全站唯一一条会话）。 */
export function clearUserAuth(): void {
  _userToken = null;
  _refreshPromise = null;
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
        console.warn("[auth] refresh failed: 401 — session expired or revoked");
        _userToken = null;
        return null;
      }
      if (!res.ok) {
        // 非 401 错误（500/502/503/429 等瞬态错误）：
        // - 不清除 _userToken（记忆中的 token 可能仍有效）
        // - 记录诊断信息，便于排查生产问题
        console.warn(`[auth] refresh failed: HTTP ${res.status} — transient error, token preserved`);
        try {
          const body = await res.json().catch(() => ({}));
          console.warn(`[auth] refresh error body:`, body);
        } catch { /* empty */ }
        return null;
      }
      const body = (await res.json()) as { data?: { accessToken?: string } };
      if (body.data?.accessToken) {
        _userToken = body.data.accessToken;
        return _userToken;
      }
      console.warn("[auth] refresh response missing accessToken, body:", body);
      return null;
    } catch (err) {
      console.warn("[auth] refresh network error:", err);
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

/**
 * 管理平面列表的 offset 分页响应体（api-delta §二）。
 *
 * C 端仍是游标分页（上面的 `Pagination`，随响应顶层下发）；管理端为了「点页码直达第 N 页」
 * 改成 offset —— 游标只知道下一段从哪开始，跳不到任意页。分页字段落在 `data` 里而非顶层，
 * 因此用本接口作为 `apiRequest<OffsetPage<T>>` 的泛型参数。
 *
 * `total` 必须返回，否则前端算不出页数；越界统一返回空 `items` + 真实 `total`，
 * 不报错也不自动夹到末页（夹页会让「粘贴一个页码链接」的结果和粘贴者看到的不一样）。
 */
export interface OffsetPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** 管理端列表允许的每页条数（后端白名单，其余值返回 400 INVALID_PAGE_SIZE）。 */
export const PAGE_SIZES = [10, 20, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

/** 收窄任意输入到合法每页条数；非法值回落默认 10（与后端默认一致）。 */
export function toPageSize(raw: string | number | null | undefined): PageSize {
  const n = typeof raw === "string" ? Number(raw) : raw;
  return PAGE_SIZES.find((s) => s === n) ?? 10;
}

type ApiResultBase = { requestId: string; status: number };

export type ApiResult<T = unknown> = ApiResultBase &
  (
    | { ok: true; data: T; pagination?: Pagination }
    | { ok: false; error: ApiErrorBody }
  );

/**
 * 身份平面只剩 `user` 一条。
 *
 * 保留这个字面量类型（而非直接删掉 `plane` 选项）是为了让调用点显式写出
 * `plane: "user"`，读代码时一眼看到「管理端也走用户会话」，而不是靠默认值默会。
 */
export type ApiPlane = "user";

export interface ApiRequestOptions {
  /** 身份平面：仅 user（管理端同样复用用户会话，没有第二条平面）。 */
  plane?: ApiPlane;
  /** 跳过自动注入 Authorization。 */
  noAuth?: boolean;
  /** 合并自定义请求头。 */
  headers?: Record<string, string>;
  /** 注入 Idempotency-Key。 */
  /**
   * 幂等键。
   *
   * `true` = 本次调用自动生成一个新键，只保护「同一次调用内部的自动重试」
   *（如 401 后刷新令牌再发一次）。
   *
   * 传**字符串**则用调用方给的键。**用户可能手动重试的危险操作应当传字符串**：
   * 键在一次「用户意图」内保持不变，服务端才认得出「这是同一个请求」。
   * 否则「请求已提交、响应在网关丢了 → 用户点第二次」会被当成全新请求再执行一遍 ——
   * 轮换签名密钥连做两次会把仍在签发令牌的那把推进 retired，是线上事故。
   * 用 `newIdempotencyKey()` 生成，随对话框/表单的生命周期保存。
   */
  idempotent?: boolean | string;
  /** 注入 X-CSRF-Token（OAuth 注册/绑定流）。 */
  csrf?: boolean;
  /**
   * 乐观并发控制：注入 `If-Match: <updatedAt>`。
   * 不一致时后端返回 409 STALE_WRITE 并附当前值 —— 没有这条，
   * 两个管理员同时编辑会静默互相覆盖。
   */
  ifMatch?: string | number;
  /** 不在 401 时尝试 refresh。 */
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

/** 401 自动处理：尝试 refresh + 重试；续期失败才清登录态并广播。 */
async function handle401(
  res: Response,
  url: string,
  init: RequestInit,
  headers: Headers,
  skipRefresh: boolean,
): Promise<Response> {
  if (res.status !== 401) return res;
  if (!skipRefresh) {
    const newToken = await doRefresh();
    if (newToken) {
      // ReadableStream 请求体只能消费一次,已被首次请求耗尽,无法透明重放;
      // 会话已续期,把 401 交回调用方自行决定是否重发(不误清登录态)。
      if (init.body instanceof ReadableStream) return res;
      headers.set("Authorization", `Bearer ${newToken}`);
      return fetch(url, { ...init, headers });
    }
  }
  _userToken = null;
  dispatchAuthEvent("pass:session-expired");
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

  if (!options.noAuth && _userToken) {
    headers.set("Authorization", `Bearer ${_userToken}`);
  }

  if (options.csrf) {
    const csrf = getCsrfToken();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }

  if (options.ifMatch !== undefined) {
    headers.set("If-Match", String(options.ifMatch));
  }

  // 调用方给了键就用它（跨用户重试保持同一个）；给 true 则本次生成一个。
  // 401 自动重试复用同一 headers 对象，因此键在自动重试之间也保持一致。
  if (options.idempotent) {
    headers.set(
      "Idempotency-Key",
      typeof options.idempotent === "string" ? options.idempotent : newIdempotencyKey(),
    );
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
        message: e instanceof Error ? e.message : i18n.t("errors.networkFailed"),
      },
      requestId: "",
      status: 0,
    };
  }

  res = await handle401(res, url, init, headers, options.skipRefresh ?? false);

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
    // 声称 JSON 但响应体为空 / 被网关截断 / 非法 JSON 时,res.json() 会抛错。
    // 收敛为统一的错误结果,避免异常穿透到调用方(否则调用方的 setPending 等收尾不执行)。
    let json: Record<string, unknown>;
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        error: { code: "invalid_response", message: i18n.t("errors.unknown") },
        requestId: res.headers.get("X-Request-Id") ?? "",
        status,
      };
    }
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
      error: error ?? { code: "unknown", message: i18n.t("errors.unknown") },
      requestId,
      status,
    };
  }

  if (status >= 200 && status < 300) {
    return { ok: true, data: undefined as T, requestId: "", status };
  }
  return {
    ok: false,
    error: { code: "http_error", message: i18n.t("errors.requestFailed", { status }) },
    requestId: "",
    status,
  };
}

// ─── 便捷方法（全站唯一一条平面）─────────────────────────────────

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

/** 便捷命名空间（与故事站 api.* 风格一致）。 */
export const api = { get, post, patch, del };
