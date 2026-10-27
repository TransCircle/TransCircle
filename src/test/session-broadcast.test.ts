/**
 * 跨标签页广播的**自身过滤**。
 *
 * 这块坏掉的方式极其隐蔽，值得单独压住：
 *
 * `BroadcastChannel` 的规范只说发送时 `Remove source from destinations`，而 source 是
 * **调用 `postMessage` 的那个对象**。`publishSessionBroadcast()` 为了「发完就扔」
 * 每次都新建一个 channel，被移除的正是这个临时对象；订阅者手里那个 channel 完全在
 * `destinations` 里，照样收到自己刚发出的通知。
 *
 * 而收到通知的处理是 `bumpIdentityBoundary()`：身份代次 +1、掐掉在途的写会话请求。
 * 于是**单标签页**里的一次登录会立刻作废自己刚起的登录流程 —— 用户点「确认」，
 * 请求在本地闸门处被拦下，一个字节都没发出去，而屏幕上写的是「请重试」。
 *
 * 这一条不靠注释保证：下面直接验证「自己发的不处理、别人发的照常处理」。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  publishSessionBroadcast,
  subscribeSessionBroadcast,
} from "../context/sessionBroadcast";

/** 等广播投递。jsdom 的 BroadcastChannel 是异步派发的，需要让出一轮宏任务。 */
const flush = () => new Promise((r) => setTimeout(r, 30));

let teardown: (() => void) | null = null;
afterEach(() => {
  teardown?.();
  teardown = null;
  localStorage.clear();
});

describe("subscribeSessionBroadcast 的自身过滤", () => {
  it("不把本标签页自己发出的通知投递给订阅者", async () => {
    const seen: string[] = [];
    teardown = subscribeSessionBroadcast((e) => seen.push(e.type));

    publishSessionBroadcast({ type: "signed-in" });
    await flush();

    expect(seen).toEqual([]);
  });

  it("别的标签页发出的通知照常投递", async () => {
    const seen: string[] = [];
    teardown = subscribeSessionBroadcast((e) => seen.push(e.type));

    // 模拟另一个标签页：它有自己的 TAB_ID，所以 `from` 与本页不同。
    // 直接经 localStorage 送进去 —— `storage` 事件的语义正是「只有别的标签页收得到」，
    // 也是最贴近真实跨标签页投递的一条通路。
    const foreign = { type: "signed-out", id: "evt-from-other-tab", at: Date.now(), from: "other-tab-id" };
    localStorage.setItem("pass:session:signal", JSON.stringify(foreign));
    // jsdom 不会真的派发 StorageEvent，这里手动派发一次，模拟浏览器的行为。
    window.dispatchEvent(
      Object.assign(new Event("storage"), {
        key: "pass:session:signal",
        newValue: JSON.stringify(foreign),
      }),
    );
    await flush();

    expect(seen).toEqual(["signed-out"]);
  });

  it("旧版本通知（没有 from 字段）不能被误丢", async () => {
    // 滚动发布期间，用户开着的旧标签页发出的通知就没有 `from`。
    // 丢掉它们等于「别的标签页登出了，本页毫无察觉」—— 比多处理一次严重得多。
    const seen: string[] = [];
    teardown = subscribeSessionBroadcast((e) => seen.push(e.type));

    const legacy = { type: "signed-in", id: "evt-legacy", at: Date.now() };
    localStorage.setItem("pass:session:signal", JSON.stringify(legacy));
    window.dispatchEvent(
      Object.assign(new Event("storage"), {
        key: "pass:session:signal",
        newValue: JSON.stringify(legacy),
      }),
    );
    await flush();

    expect(seen).toEqual(["signed-in"]);
  });

  it("同一个事件经两条通道到达时只投递一次", async () => {
    // BroadcastChannel 与 localStorage 并联发送、共用同一个 id。
    // 处理不是幂等的（它掐掉在途续期再发一次新的），做两遍就是一次多余的令牌轮换。
    const listener = vi.fn();
    teardown = subscribeSessionBroadcast(listener);

    const dup = { type: "signed-in", id: "evt-dup", at: Date.now(), from: "other-tab-id" };
    const json = JSON.stringify(dup);
    localStorage.setItem("pass:session:signal", json);
    for (let i = 0; i < 2; i += 1) {
      window.dispatchEvent(
        Object.assign(new Event("storage"), { key: "pass:session:signal", newValue: json }),
      );
    }
    await flush();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
