/**
 * 身份提示的读写与作废。
 *
 * 这块逻辑失效的方式都很安静：解析没做防御 → 一条损坏的记录让整个门户白屏；
 * 过期没判 → 早已失效的会话在冷启动时被画成「已登录」，用户点进账户中心才被踢出去。
 * 两者都不会在开发时暴露，只能靠测试压住。
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  clearSessionHint,
  readSessionHint,
  writeSessionHint,
} from "../context/sessionHint";
import type { MeProfile } from "../api/types";

const KEY = "pass_session_hint";

// 不加 `as MeProfile`：写全字段，类型检查才真的在盯着「前后端契约是否还对得上」。
const profile = (over: Partial<MeProfile> = {}): MeProfile => ({
  id: "usr_1",
  username: "alice",
  email: "alice@example.com",
  displayName: "Alice",
  avatarUrl: "/v1/images/img_1",
  emailVerified: true,
  status: "active",
  passwordSet: true,
  iamMfaDelegated: false,
  security: { hasPassword: true, totpEnabled: false, passkeyCount: 0, oauthProviders: [] },
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  lastLoginAt: null,
  mustChangePassword: false,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
});

describe("writeSessionHint", () => {
  it("只落最小展示字段，绝不带出安全信息", () => {
    // 提示由 JS 可读。一旦让 status / emailVerified / security 混进去，
    // 就迟早会有人拿它做「能不能做某事」的判断 —— 而它是可以被篡改的。
    writeSessionHint(profile());
    const stored = JSON.parse(localStorage.getItem(KEY) as string) as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(["avatarUrl", "displayName", "id", "savedAt"]);
  });

  it("displayName 为空时回落用户名，与全站展示口径一致", () => {
    const hint = writeSessionHint(profile({ displayName: "" }));
    expect(hint.displayName).toBe("alice");
  });
});

describe("readSessionHint", () => {
  it("读回刚写入的提示", () => {
    writeSessionHint(profile());
    expect(readSessionHint()).toMatchObject({ id: "usr_1", displayName: "Alice" });
  });

  it("没有记录时返回 null", () => {
    expect(readSessionHint()).toBeNull();
  });

  it("超过最长寿命的提示作废并清除", () => {
    // 超过 7 天的提示一律作废 —— 这是隐私侧的选择（快照带着昵称和头像地址，
    // 不该在可能是公用的机器上无限期留着），不是「会话必然已过期」：
    // 后端是滑动续期的，活跃用户的会话可以远超 7 天。见 sessionHint.ts 的说明。
    localStorage.setItem(
      KEY,
      JSON.stringify({
        id: "usr_1",
        displayName: "Alice",
        avatarUrl: null,
        savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
      }),
    );
    expect(readSessionHint()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("未来时间戳的提示作废（时钟被改过 / 记录被篡改）", () => {
    // 不拦的话 `Date.now() - savedAt` 恒为负，这条提示永远不会过期。
    localStorage.setItem(
      KEY,
      JSON.stringify({
        id: "usr_1",
        displayName: "Alice",
        avatarUrl: null,
        savedAt: Date.now() + 24 * 60 * 60 * 1000,
      }),
    );
    expect(readSessionHint()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("轻微的时钟漂移仍然接受", () => {
    // 多机/多标签页之间几十秒的偏差是常态，为此把人退回未登录态不划算。
    localStorage.setItem(
      KEY,
      JSON.stringify({
        id: "usr_1",
        displayName: "Alice",
        avatarUrl: null,
        savedAt: Date.now() + 30_000,
      }),
    );
    expect(readSessionHint()).not.toBeNull();
  });

  it("损坏的 JSON 不抛错，直接作废", () => {
    // 抛错的话整个 SessionProvider 在初始化时就炸了 —— 白屏，且没有自愈路径。
    localStorage.setItem(KEY, "{not json");
    expect(readSessionHint()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("字段缺失的记录不抛错，直接作废", () => {
    localStorage.setItem(KEY, JSON.stringify({ displayName: "Alice" }));
    expect(readSessionHint()).toBeNull();
  });

  it("avatarUrl 非字符串时归一为 null，而不是原样带出去", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ id: "usr_1", displayName: "Alice", avatarUrl: 42, savedAt: Date.now() }),
    );
    expect(readSessionHint()).toEqual({
      id: "usr_1",
      displayName: "Alice",
      avatarUrl: null,
      savedAt: expect.any(Number),
    });
  });
});

describe("clearSessionHint", () => {
  it("登出后不能留下任何身份痕迹", () => {
    writeSessionHint(profile());
    clearSessionHint();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
