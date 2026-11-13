/**
 * 重定向目标净化。
 *
 * 这是登录/回调后跳转的唯一闸门，开放重定向就是从这里漏出去的。
 * 重点压住「百分号编码绕过」这一类：控制字符与协议相对地址的判定必须
 * 在**解码后**再跑一遍，否则 /%2F%2Fevil.com、/%09//evil.com 会原样放行。
 */
import { describe, expect, it } from "vitest";

import { sanitizeRedirect } from "../utils/url";

describe("sanitizeRedirect", () => {
  it("放行站内相对路径", () => {
    expect(sanitizeRedirect("/account")).toBe("/account");
    expect(sanitizeRedirect("/settings/security")).toBe("/settings/security");
    // 本站需要把 /login?oidc=<uid> 当作回跳目标，不能拦鉴权路由。
    expect(sanitizeRedirect("/login?oidc=abc")).toBe("/login?oidc=abc");
  });

  it("拦截绝对 URL 与协议相对地址", () => {
    expect(sanitizeRedirect("https://evil.com")).toBe("/");
    expect(sanitizeRedirect("//evil.com")).toBe("/");
    expect(sanitizeRedirect("/\\evil.com")).toBe("/");
    expect(sanitizeRedirect("/..//evil.com")).toBe("/");
    expect(sanitizeRedirect("/%2e%2e//evil.com")).toBe("/");
  });

  it("拦截百分号编码的协议相对地址（解码后才暴露）", () => {
    expect(sanitizeRedirect("/%2F%2Fevil.com")).toBe("/");
    expect(sanitizeRedirect("/%2f%2fevil.com")).toBe("/");
  });

  it("拦截百分号编码的控制字符", () => {
    expect(sanitizeRedirect("/%09//evil.com")).toBe("/");
    expect(sanitizeRedirect("/evil.com/%00")).toBe("/");
    expect(sanitizeRedirect("/a%0d%0aSet-Cookie:x=1")).toBe("/");
  });

  it("拦截字面控制字符", () => {
    expect(sanitizeRedirect("/a\u0000b")).toBe("/");
    expect(sanitizeRedirect("/a\nb")).toBe("/");
  });

  it("拦截非法百分号序列（decodeURIComponent 会抛）", () => {
    expect(sanitizeRedirect("/%zz")).toBe("/");
    expect(sanitizeRedirect("/%")).toBe("/");
  });

  it("拦截超长与空值", () => {
    expect(sanitizeRedirect("/" + "a".repeat(250))).toBe("/");
    expect(sanitizeRedirect("")).toBe("/");
    expect(sanitizeRedirect(null)).toBe("/");
  });

  it("可自定义回退目标", () => {
    expect(sanitizeRedirect("//evil.com", "/home")).toBe("/home");
  });
});
