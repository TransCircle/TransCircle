/**
 * base64url 解码。
 *
 * 这里压住的是一个「只在浏览器里才炸」的坑：JWT payload 段是去掉 padding 的
 * base64url，长度 `% 4` 在 {0,2,3} 之间分布。浏览器 `atob` 严格要求长度为 4 的
 * 倍数，不补 `=` 会抛 `InvalidCharacterError`；而 Node 的 `atob` 宽松，测试里
 * 不补 padding 也能过 —— 于是这个缺陷会一路活到线上。
 *
 * 失效后果不是「解析慢一点」：`subjectOf()` 恒返回 null → 「换了个人」这条认证
 * 边界整体失效（另一个标签页换了账号，本页还在用旧档案）。
 */
import { describe, expect, it } from "vitest";

import { base64urlDecode, base64urlToArrayBuffer } from "../utils/string";

/** 造一个真实形状的 JWT payload 段（去 padding 的 base64url）。 */
function payloadSegment(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

describe("base64urlDecode", () => {
  it("补齐 padding 后能解出各种长度模 4 的输入", () => {
    // 这三个 payload 刻意凑出 %4 === 2 / 3 / 0 三种余数。
    const cases: Array<Record<string, unknown>> = [
      { sub: "usr_01KZ6JJAFYK3JN9E376XQA1JH8", sid: "ses_x", jti: "a".repeat(28) },
      { sub: "usr_01ABC", sid: "ses_01ABC", jti: "b".repeat(28) },
      { sub: "usr_1" },
    ];
    const remainders = new Set<number>();
    for (const payload of cases) {
      const segment = payloadSegment(payload);
      remainders.add(segment.length % 4);
      expect(JSON.parse(base64urlDecode(segment))).toEqual(payload);
    }
    // 确认真的覆盖到了需要补 padding 的余数，否则这条测试形同虚设。
    expect([...remainders].some((r) => r !== 0)).toBe(true);
  });

  it("长度模 4 为 2 时（不补 padding 浏览器会抛）仍能解码", () => {
    // {"sub":"usr_12"} → 22 字符，%4 === 2
    const segment = payloadSegment({ sub: "usr_12" });
    expect(segment.length % 4).toBe(2);
    expect(JSON.parse(base64urlDecode(segment))).toEqual({ sub: "usr_12" });
  });

  it("拒绝长度模 4 为 1 的非法输入", () => {
    expect(() => base64urlDecode("abcde")).toThrow();
  });

  it("对非 base64 字符抛错（由调用方决定降级方式）", () => {
    expect(() => base64urlDecode("!!!!")).toThrow();
  });
});

describe("base64urlToArrayBuffer", () => {
  it("与 arrayBuffer 往返一致", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    const encoded = btoa(String.fromCharCode(...bytes))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(new Uint8Array(base64urlToArrayBuffer(encoded))).toEqual(bytes);
  });

  it("非法输入抛带长度的错误（供 WebAuthn 侧定位）", () => {
    expect(() => base64urlToArrayBuffer("abcde")).toThrow(/length=5/);
  });
});
