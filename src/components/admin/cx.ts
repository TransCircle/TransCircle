/**
 * 合并 class 名，过滤掉 falsy 值。
 * CSS Modules 在 `noUncheckedIndexedAccess` 下可能返回 `string | undefined`，
 * 此处统一收敛为干净的字符串，避免输出字面量 "undefined"。
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
