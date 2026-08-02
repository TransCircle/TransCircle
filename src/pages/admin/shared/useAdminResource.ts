import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type ApiErrorBody } from "../../../api/client";
import { adminErrorText } from "./errors";

interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** 原始错误：需要按 code 分支（如工作人员保护）时用。 */
  errorBody: ApiErrorBody | null;
  reload: () => void;
  /** 保存成功后把服务端返回的实体升为新基线，不用本地草稿顶替。 */
  set: (next: T) => void;
}

/**
 * 管理端只读资源的统一取数。
 *
 * `path` 为 null 表示条件未就绪（如还不知道用户 id），此时不发请求也不报错。
 * 所有请求走普通用户会话 —— 管理端没有第二条平面。
 */
export function useAdminResource<T>(path: string | null): Resource<T> {
  return useAdminResourceInner<T>(path, (raw) => raw as T);
}

/**
 * 子资源列表的取数。
 *
 * 后端的**所有**集合响应都是 `{ items: [...] }`（分页集合再多 page/pageSize/total），
 * 从来不是裸数组。之前这些标签页按裸数组消费，拿到的是一个对象，
 * `.map` 直接抛错、整页白屏 —— 而且类型上看不出来，因为取数是泛型转型。
 *
 * 所以解包收敛到这里一处，调用方写元素类型即可。
 */
export function useAdminList<T>(path: string | null): Resource<T[]> {
  return useAdminResourceInner<T[]>(path, (raw) => {
    const items = (raw as { items?: unknown } | null)?.items;
    return Array.isArray(items) ? (items as T[]) : [];
  });
}

function useAdminResourceInner<T>(path: string | null, select: (raw: unknown) => T): Resource<T> {
  const { t } = useTranslation();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [error, setError] = useState<string | null>(null);
  const [errorBody, setErrorBody] = useState<ApiErrorBody | null>(null);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (path === null) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    setErrorBody(null);
    void (async () => {
      const res = await api.get<unknown>(path, { plane: "user" });
      if (!alive) return;
      setLoading(false);
      if (res.ok) {
        setData(select(res.data));
        return;
      }
      setErrorBody(res.error);
      setError(adminErrorText(t, res.error));
    })();
    return () => {
      alive = false;
    };
    // t 只影响错误文案，不该触发重新取数；select 每次渲染都是新函数，
    // 放进依赖会导致无限重取。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, attempt]);

  return { data, loading, error, errorBody, reload, set: setData };
}
