import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { toPageSize, type PageSize } from "../../../api/client";

export type SortDir = "asc" | "desc";
export interface SortState {
  key: string;
  dir: SortDir;
}

export interface ListQuery {
  page: number;
  pageSize: PageSize;
  sort: SortState;
  /** 关键词与各筛选维度（q / status / actorType / environment…）。 */
  filters: Record<string, string>;
}

interface UseListQueryConfig {
  /** 形如 `last:desc`，与后端各列表的默认排序保持一致。 */
  defaultSort: string;
  /** 本列表认哪些筛选参数；不在表内的地址栏参数原样保留，不被清掉。 */
  filterKeys: readonly string[];
  /** 排序字段白名单；越界的地址栏值回落默认，避免直接把 400 甩给用户。 */
  sortKeys: readonly string[];
}

function parseSort(raw: string | null, allowed: readonly string[], fallback: string): SortState {
  const value = raw ?? fallback;
  const [key = "", dir = "desc"] = value.split(":");
  if (!allowed.includes(key) || (dir !== "asc" && dir !== "desc")) {
    const [fk = "", fd = "desc"] = fallback.split(":");
    return { key: fk, dir: fd === "asc" ? "asc" : "desc" };
  }
  return { key, dir };
}

/**
 * 列表状态以**地址栏为唯一真相**：分页、排序、筛选全部写进 URL。
 *
 * 这样「把当前视图粘进工单」才是真的可复现；也是 offset 分页存在的意义 ——
 * 游标分页跳不到第 N 页，链接也就分享不出去。
 *
 * 两条规则内建在这里，避免每个页面各写一遍：
 * - 筛选 / 排序 / 每页条数变更一律回第 1 页（否则会停在一个已不存在的页码上，显示空列表）；
 * - 所有更新用 replace，不给每次点击都攒一条历史记录。
 */
export function useListQuery(config: UseListQueryConfig) {
  const [searchParams, setSearchParams] = useSearchParams();

  const query: ListQuery = useMemo(() => {
    const rawPage = Number(searchParams.get("page"));
    const filters: Record<string, string> = {};
    for (const key of config.filterKeys) filters[key] = searchParams.get(key) ?? "";
    return {
      page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
      pageSize: toPageSize(searchParams.get("pageSize")),
      sort: parseSort(searchParams.get("sort"), config.sortKeys, config.defaultSort),
      filters,
    };
    // config 是页面内的字面量常量，逐字段依赖会因每次渲染新建对象而失效。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const write = useCallback(
    (patch: Record<string, string>, resetPage: boolean) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          if (resetPage) next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPage = useCallback(
    (page: number) => write({ page: page > 1 ? String(page) : "" }, false),
    [write],
  );
  const setPageSize = useCallback(
    (size: PageSize) => write({ pageSize: size === 10 ? "" : String(size) }, true),
    [write],
  );
  const setFilter = useCallback(
    (key: string, value: string) => write({ [key]: value }, true),
    [write],
  );
  /** 点同一列切换升降序，点新列从升序开始（与表头箭头的直觉一致）。 */
  const toggleSort = useCallback(
    (key: string) => {
      const dir: SortDir = query.sort.key === key && query.sort.dir === "asc" ? "desc" : "asc";
      write({ sort: `${key}:${dir}` }, true);
    },
    [query.sort, write],
  );

  /** 拼给后端的查询串（page=1 与默认 pageSize 也显式带上，请求可直接复制排查）。 */
  const requestSearch = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("page", String(query.page));
    qs.set("pageSize", String(query.pageSize));
    qs.set("sort", `${query.sort.key}:${query.sort.dir}`);
    for (const [k, v] of Object.entries(query.filters)) if (v) qs.set(k, v);
    return qs.toString();
  }, [query]);

  return { query, setPage, setPageSize, setFilter, toggleSort, requestSearch };
}
