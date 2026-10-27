import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearOidcInteraction,
  oidcFromPath,
  readOidcInteraction,
  rememberOidcInteraction,
} from "../utils/oidcInteraction";

describe("OIDC interaction continuity", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it("stores and restores a valid interaction", () => {
    expect(rememberOidcInteraction("abc.DEF_123~xyz-0")).toBe("abc.DEF_123~xyz-0");
    expect(readOidcInteraction(null, true)).toBe("abc.DEF_123~xyz-0");
  });

  it("rejects invalid interactions without overwriting the stored value", () => {
    rememberOidcInteraction("valid-uid");
    expect(readOidcInteraction("contains/slash")).toBeNull();
    expect(readOidcInteraction(null, true)).toBe("valid-uid");
  });

  it("does not restore stored state unless explicitly requested", () => {
    rememberOidcInteraction("valid-uid");
    expect(readOidcInteraction(null)).toBeNull();
  });

  it("clears a completed interaction", () => {
    rememberOidcInteraction("valid-uid");
    clearOidcInteraction();
    expect(readOidcInteraction(null, true)).toBeNull();
  });
});

/**
 * 二次验证交接时必须把 `?oidc=` 一起带回登录页。
 *
 * 丢了它的后果不是「少跳一次」：`finish()` 里第一句就是 `if (oidcUid)`，
 * 为 null 就走普通跳转分支，那笔 OIDC 交互永远没人续跑 ——
 * 用户以为登好了，业务站却一直等着。而屏幕上二次验证表单还在，
 * 再点一次只会拿到「挑战令牌无效」（挑战在第一次点击时已被消费）。
 */
describe("oidcFromPath", () => {
  it("从重定向目标里取出交互句柄", () => {
    expect(oidcFromPath("/login?oidc=2fkQz_OYvAaovuYB8HiGvZBEv6FmKK6qXkiPnM_wkrm")).toBe(
      "2fkQz_OYvAaovuYB8HiGvZBEv6FmKK6qXkiPnM_wkrm",
    );
  });

  it("没有查询串、或查询串里没有 oidc 时返回 null", () => {
    expect(oidcFromPath("/login")).toBeNull();
    expect(oidcFromPath("/account")).toBeNull();
    expect(oidcFromPath("/login?redirect=%2Faccount")).toBeNull();
  });

  it("取第一个 oidc，不让后续参数顶掉它", () => {
    // 传入的参数串是外部可构造的；`?oidc=a&oidc=b` 里被采用的必须是先出现的那个，
    // 否则注入者只要在后面追加一个就能改写续跑的交互。
    expect(oidcFromPath("/login?oidc=first&oidc=second")).toBe("first");
  });

  it("拒绝不像交互句柄的值", () => {
    // 这个结果会被拼进下一次 navigate 的查询串，放任意字符过去就是参数注入。
    expect(oidcFromPath("/login?oidc=a/b")).toBeNull();
    expect(oidcFromPath("/login?oidc=a%26b%3D1")).toBeNull();
    expect(oidcFromPath("/login?oidc=")).toBeNull();
    expect(oidcFromPath(`/login?oidc=${"a".repeat(257)}`)).toBeNull();
  });
});
