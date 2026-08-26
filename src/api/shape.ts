/**
 * 2xx 响应体的运行时校验。
 *
 * TypeScript 的类型参数（`api.post<StepUpStart>(...)`）只是**断言**，运行时一个字节
 * 都不会检查。后端返回 `200 {}`、字段拼错、代理吐回一段别的 JSON —— 编译期全都看不见，
 * 到解引用那一刻才炸。而这些认证流程里的「炸」有个共同的坏形状：异常在 `await` 之后
 * 抛出，`setLoading(false)` 那一行永远不会执行，于是弹窗/页面**永久停在加载态**，
 * 用户既看不到错误、也没有重试的入口。
 *
 * 所以凡是「拿到字段就立刻拿去跳转、轮询、渲染授权页」的地方，都要先过一遍这里。
 */

/** 非空字符串。空串在这些场景里和缺字段一样有害（跳去 `""`、拿空 id 轮询）。 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** 普通对象（排除 null 与数组 —— 两者 `typeof` 都会骗人）。 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 逐个字段都是非空字符串的对象。 */
export function hasStringFields(value: unknown, keys: readonly string[]): boolean {
  if (!isPlainObject(value)) return false;
  return keys.every((k) => isNonEmptyString(value[k]));
}
