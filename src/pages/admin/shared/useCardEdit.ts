import { useCallback, useEffect, useMemo, useState } from "react";

export interface EditField<T> {
  key: keyof T & string;
  /** 已经过 i18n 的字段名，出现在 diff 左列。 */
  label: string;
  /**
   * 属风险项：只有它们才把保存升级到二次验证。
   * 低风险改动（昵称、备注、描述、联系人）确认一次就够，不然太烦。
   * **判定权在后端**，这里只是提前告知。
   */
  risky?: boolean;
  /** 值 → 展示串（枚举、时长、数组等）。缺省用通用格式化。 */
  format?: (value: unknown) => string;
}

export interface FieldChange {
  key: string;
  label: string;
  from: unknown;
  to: unknown;
  fromText: string;
  toText: string;
  risky: boolean;
}

export interface CardEdit<T extends object> {
  /** 取当前值：有草稿取草稿，否则取服务端基线。 */
  value: <K extends keyof T>(key: K) => T[K] | undefined;
  setField: <K extends keyof T>(key: K, next: T[K]) => void;
  changes: FieldChange[];
  changesFor: (keys: readonly string[]) => FieldChange[];
  resetKeys: (keys: readonly string[]) => void;
  patchFor: (keys: readonly string[]) => Partial<T>;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * 一张卡片一个保存按钮的编辑模型。
 *
 * 草稿以「覆盖层」而非整份拷贝存在：只记录被改过的字段。这样服务端返回新实体时，
 * 已保存的字段自然回落到权威值，**其他卡片上尚未保存的编辑不会被连带清空** ——
 * 整份拷贝做不到这一点，它只能一起丢。
 *
 * 新基线永远来自服务端返回的完整实体，不用本地草稿顶替：后端会做规范化
 * （去空格、排序、补默认值），拿草稿当基线会让两边悄悄漂移。
 */
export function useCardEdit<T extends object>(
  baseline: T | null,
  fields: ReadonlyArray<EditField<T>>,
): CardEdit<T> {
  const [overlay, setOverlay] = useState<Partial<T>>({});

  // 基线更新（首次加载 / 保存成功 / 重新拉取）：丢弃已与服务端一致的草稿，
  // 保留仍然不同的那些。返回原对象以避免无谓重渲染。
  useEffect(() => {
    if (!baseline) return;
    setOverlay((prev) => {
      let dropped = false;
      const next: Partial<T> = {};
      for (const key of Object.keys(prev) as Array<keyof T>) {
        if (sameValue(prev[key], baseline[key])) dropped = true;
        else next[key] = prev[key];
      }
      return dropped ? next : prev;
    });
  }, [baseline]);

  const value = useCallback(
    <K extends keyof T>(key: K): T[K] | undefined => {
      if (key in overlay) return overlay[key];
      return baseline ? baseline[key] : undefined;
    },
    [overlay, baseline],
  );

  const setField = useCallback(<K extends keyof T>(key: K, next: T[K]) => {
    setOverlay((prev) => ({ ...prev, [key]: next }));
  }, []);

  const changes = useMemo<FieldChange[]>(() => {
    if (!baseline) return [];
    const out: FieldChange[] = [];
    for (const f of fields) {
      const key = f.key as keyof T;
      if (!(key in overlay)) continue;
      const from = baseline[key];
      const to = overlay[key];
      if (sameValue(from, to)) continue;
      out.push({
        key: f.key,
        label: f.label,
        from,
        to,
        fromText: f.format ? f.format(from) : defaultFormat(from),
        toText: f.format ? f.format(to) : defaultFormat(to),
        risky: !!f.risky,
      });
    }
    return out;
  }, [baseline, overlay, fields]);

  /** 每张卡片只关心自己的字段子集，互不牵连。 */
  const changesFor = useCallback(
    (keys: readonly string[]) => changes.filter((c) => keys.includes(c.key)),
    [changes],
  );

  const resetKeys = useCallback((keys: readonly string[]) => {
    setOverlay((prev) => {
      const next = { ...prev };
      for (const k of keys) delete next[k as keyof T];
      return next;
    });
  }, []);

  /** 提交给后端的补丁：只发本卡改过的字段，不整份回传。 */
  const patchFor = useCallback(
    (keys: readonly string[]): Partial<T> => {
      const out: Partial<T> = {};
      for (const k of keys) {
        const key = k as keyof T;
        if (key in overlay) out[key] = overlay[key];
      }
      return out;
    },
    [overlay],
  );

  return { value, setField, changes, changesFor, resetKeys, patchFor };
}

/** 通用值格式化：空值、数组、布尔都要能在 diff 里读出来，而不是显示 undefined。 */
export function defaultFormat(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.length ? value.join("、") : "";
  return String(value);
}
