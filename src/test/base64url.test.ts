/**
 * base64url 解码。
 *
 * 压住的是一个「只在浏览器里才炸」的坑：JWT payload 段是去掉 padding 的
 * base64url，长度 `% 4` 在 {0,2,3} 之间。浏览器 `atob` 严格要求长度为 4 的
 * 倍数，不补 `=` 会抛 `InvalidCharacterError`；而 Node / jsdom 的 `atob` 会
 * 宽容地把缺失的 padding 补上 —— 所以**单靠「不抛错」断言抓不住这个缺陷**。
 *
 * 这里因此同时断言两件事：
 *   1. 解码结果正确（padding 补没补，解出来的字节都一样，用于防回归）；
 *   2. 喂给 `atob` 的字符串**长度是 4 的倍数**（这才是浏览器不抛错的真实前提）。
 * 第 2 条是关键：它不依赖运行时宽松与否，直接钉住实现必须补齐 padding。
 */
import { describe, expect, it, vi, afterEach } from "vitest";

import { base64urlDecode, base64urlToArrayBuffer } from "../utils/string";

/** 造一个真实形状的 JWT payload 段（去 padding 的 base64url）。 */
function payloadSegment(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("base64urlDecode", () => {
  it("覆盖三种长度余数，且解码结果正确", () => {
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

  it("喂给 atob 的字符串长度必须是 4 的倍数（浏览器不抛错的真实前提）", () => {
    // 监视 atob 的入参：Node/jsdom 会自己容错，所以不能靠「抛不抛错」判断，
    // 只能直接看我们交给它的字符串有没有补齐。
    const seen: string[] = [];
    const original = globalThis.atob;
    vi.spyOn(globalThis, "atob").mockImplementation((input: string) => {
      seen.push(input);
      return original(input);
    });

    for (const payload of [{ sub: "usr_12" }, { sub: "usr_1" }, { a: "x".repeat(40) }]) {
      base64urlDecode(payloadSegment(payload));
    }

    expect(seen.length).toBe(3);
    for (const input of seen) {
      expect(input.length % 4).toBe(0);
    }
  });

  it("长度模 4 为 2 的输入（浏览器不补 padding 必抛）也能正确解码", () => {
    const segment = payloadSegment({ sub: "usr_12" });
    expect(segment.length % 4).toBe(2);
    expect(JSON.parse(base64urlDecode(segment))).toEqual({ sub: "usr_12" });
  });

  it("拒绝长度模 4 为 1 的非法输入", () => {
    expect(() => base64urlDecode("abcde")).toThrow();
  });
});

describe("base64urlToArrayBuffer", () => {
  it("与原始字节往返一致", () => {
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
