/**
 * 全站共享滚动锁。
 *
 * 这块出问题的方式很难在开发时撞见，但撞见就是死局：弹窗与抽屉曾各自维护
 * 「存原值 → overflow:hidden → 还原」，跨家族叠层按非 LIFO 顺序关闭时，
 * 先关的那层会把 body 还原成「它打开之前」的值（另一层还开着，背景却能滚了），
 * 后关的那层再把 hidden 写回去 —— 页面永久锁死，只能刷新。用测试把不变量钉住。
 */
import { beforeEach, describe, expect, it } from "vitest";

import { lockScroll } from "../utils/scrollLock";

describe("lockScroll", () => {
  beforeEach(() => {
    // 清长属性而不是 overflow 简写：jsdom 里写简写 "" 不会把已设置的长属性抹掉，
    // 上一个用例留下的 overflowY 会漏到下一个用例里。
    document.body.style.overflowX = "";
    document.body.style.overflowY = "";
    document.body.style.paddingRight = "";
    document.body.innerHTML = "";
  });

  // 断言用长属性而不是 overflow 简写：锁本身写的就是长属性（只存简写会丢掉
  // 元素原有的单轴设置），而 jsdom 不会把两条长属性再序列化回简写。
  const bodyOverflowY = () => document.body.style.overflowY;

  it("锁定期间 body 不可滚动，解锁后还原成原值", () => {
    document.body.style.overflowY = "visible";
    const release = lockScroll();
    expect(bodyOverflowY()).toBe("hidden");
    release();
    expect(bodyOverflowY()).toBe("visible");
  });

  it("叠层：只有最后一个句柄释放才还原（且还原成最外层打开之前的值）", () => {
    const releaseOuter = lockScroll();
    const releaseInner = lockScroll();
    expect(bodyOverflowY()).toBe("hidden");

    // 非 LIFO：先释放外层。这正是过去会把背景提前解锁的顺序。
    releaseOuter();
    expect(bodyOverflowY()).toBe("hidden");

    releaseInner();
    expect(bodyOverflowY()).toBe("");
  });

  it("同一句柄重复释放不会把计数扣穿", () => {
    const releaseFirst = lockScroll();
    const releaseSecond = lockScroll();
    releaseFirst();
    releaseFirst(); // React cleanup 被重复执行也不能影响仍然开着的那层
    expect(bodyOverflowY()).toBe("hidden");
    releaseSecond();
    expect(bodyOverflowY()).toBe("");
  });

  it("视口锁定的页面：内部滚动容器 <main> 一并锁住并还原", () => {
    const main = document.createElement("main");
    main.style.overflowY = "auto";
    document.body.appendChild(main);

    const release = lockScroll();
    expect(main.style.overflowY).toBe("hidden");
    release();
    expect(main.style.overflowY).toBe("auto");
  });

  it("锁定期间视口变化：main 中途变成滚动容器也会被接管", () => {
    const main = document.createElement("main");
    document.body.appendChild(main);

    const release = lockScroll();
    expect(main.style.overflowY).toBe(""); // 上锁那一刻它还不是滚动容器

    // 窄屏开着抽屉、随后把窗口拉宽：视口锁定规则生效，main 成了真正在滚的容器。
    main.style.overflowY = "auto";
    window.dispatchEvent(new Event("resize"));
    expect(main.style.overflowY).toBe("hidden");

    release();
    // 还原的是「接管那一刻」的值,而不是抹成空。
    expect(main.style.overflowY).toBe("auto");
  });

  it("锁定期间连续 resize：不会在锁定/解锁之间横跳", () => {
    const main = document.createElement("main");
    main.style.overflowY = "auto";
    document.body.appendChild(main);

    const release = lockScroll();
    expect(main.style.overflowY).toBe("hidden");

    // 拖动窗口会连发一串 resize。每一次重判读到的都是锁自己写进去的 hidden,
    // 若不先交还就重判,这里会变成「一次锁、一次开」的横跳。
    for (let i = 0; i < 5; i++) window.dispatchEvent(new Event("resize"));
    expect(main.style.overflowY).toBe("hidden");

    release();
    expect(main.style.overflowY).toBe("auto");
  });

  it("叠层 + resize：释放其中一把锁后，背景仍然锁着", () => {
    const main = document.createElement("main");
    main.style.overflowY = "auto";
    document.body.appendChild(main);

    const releaseFirst = lockScroll();
    const releaseSecond = lockScroll();
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));

    releaseFirst();
    expect(bodyOverflowY()).toBe("hidden");
    expect(main.style.overflowY).toBe("hidden");

    releaseSecond();
    expect(bodyOverflowY()).toBe("");
    expect(main.style.overflowY).toBe("auto");
  });

  it("非锁定页面：main 不是滚动容器时不去碰它", () => {
    const main = document.createElement("main");
    document.body.appendChild(main);

    const release = lockScroll();
    expect(main.style.overflowY).toBe("");
    release();
    expect(main.style.overflowY).toBe("");
  });
});
