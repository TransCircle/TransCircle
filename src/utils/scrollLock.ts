/**
 * 全站共享的滚动锁（弹窗 / 抽屉共用同一份计数）。
 *
 * 曾经 Dialog、admin Modal、导航抽屉各写了一份「存原值 → overflow:hidden → 还原」，
 * 各记各的引用计数 —— 三者互相看不见。只要跨家族叠层就会出事：
 * Dialog 先开（存下空值），Modal 后开（存下 hidden），先关 Dialog 会把 body 还原成空
 * （Modal 还开着，背景却能滚了），随后关 Modal 又把 hidden 写回去 —— 页面永久锁死，
 * 只能刷新。统一成一份计数后，只有第一次上锁记录原值、最后一次解锁还原。
 *
 * 另外两件事也在这里一并做掉，免得每个调用方各想一遍：
 * - **滚动条补偿**：index.css 给 html 常驻了 scrollbar-gutter: stable，槽位一直在，
 *   锁滚动不会让内容横移；此时再补等宽 padding 反而把内容推歪。只有不支持该属性的
 *   浏览器才回到老办法（导航抽屉此前从来没补偿过，顺带对齐）。
 * - **真正在滚的容器**：视口锁定的页面（见 RootLayout.module.css）滚的是 <main> 而非
 *   document，只锁 body 的话弹窗背后照样能用滚轮滚。这里一并锁住它。
 */

/** html 是否已经常驻滚动条槽位（true 则锁滚动不会横移，无需 padding 补偿）。 */
const documentReservesGutter = (): boolean =>
  typeof getComputedStyle === "function" &&
  getComputedStyle(document.documentElement).scrollbarGutter?.startsWith("stable") === true;

/**
 * 元素自身垂直滚动条占掉的宽度。
 *
 * `offsetWidth - clientWidth` 量到的是「左边框 + 滚动条 + 右边框」，
 * 直接拿来补偿的话，只要元素有边框就会多补一截（没有滚动条时更是凭空补）。
 */
const scrollbarWidthOf = (el: HTMLElement): number => {
  const cs = getComputedStyle(el);
  const borders = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
  return Math.max(0, el.offsetWidth - el.clientWidth - borders);
};

/** 把滚动条让出的宽度补回元素右内边距（**叠加**在它原有的 padding 上，不是顶掉）。 */
const padForScrollbar = (el: HTMLElement, scrollbarWidth: number) => {
  if (scrollbarWidth <= 0) return;
  const current = parseFloat(getComputedStyle(el).paddingRight) || 0;
  el.style.paddingRight = `${current + scrollbarWidth}px`;
};

/** 当前真正承担页面滚动的内部容器（视口锁定时是 <main>），没有则返回 null。 */
const innerScroller = (): HTMLElement | null => {
  const main = document.querySelector<HTMLElement>("main");
  if (!main) return null;
  const overflowY = getComputedStyle(main).overflowY;
  return overflowY === "auto" || overflowY === "scroll" ? main : null;
};

let lockCount = 0;
/** 第一次上锁时的 body 内联样式（长属性分开存：只存 overflow 简写会丢掉原有的单轴设置）。 */
let savedBody: { overflowX: string; overflowY: string; paddingRight: string } | null = null;
/** 当前被一并锁住的内部滚动容器及其原内联值（没有则为 null）。 */
let lockedScroller: HTMLElement | null = null;
let lockedScrollerStyle: { x: string; y: string; paddingRight: string } = {
  x: "",
  y: "",
  paddingRight: "",
};

/**
 * 认领 / 交还内部滚动容器。
 *
 * 锁定期间视口是会变的：窄屏开着抽屉把窗口拉宽到 901px 以上，视口锁定规则当场生效，
 * 真正在滚的容器从 document 换成 main —— 若只在上锁那一刻判断过一次，
 * 抽屉背后就又能滚了。所以 resize 时重新认领一次。
 * 只认领**本来就是滚动容器**的 main：无条件给 main 加 overflow:hidden 会把它变成
 * 滚动上下文，后台那些 `top: var(--nav-h)` 的 sticky 会改以 main 为参照重新定位、当场跳位。
 */
const adoptScroller = (next: HTMLElement | null) => {
  if (next === lockedScroller) return;
  if (lockedScroller) {
    lockedScroller.style.overflowX = lockedScrollerStyle.x;
    lockedScroller.style.overflowY = lockedScrollerStyle.y;
    lockedScroller.style.paddingRight = lockedScrollerStyle.paddingRight;
  }
  lockedScroller = next;
  if (!next) {
    lockedScrollerStyle = { x: "", y: "", paddingRight: "" };
    return;
  }
  lockedScrollerStyle = {
    x: next.style.overflowX,
    y: next.style.overflowY,
    paddingRight: next.style.paddingRight,
  };
  // 锁定模式下的 .main 自带 scrollbar-gutter: stable,槽位一直在,隐藏滚动条不会横移。
  // 但那条声明在不支持该属性的浏览器里会被丢弃 —— 那里就得按老办法量一下自己的
  // 滚动条宽度补回去(offsetWidth - clientWidth 量的正是这条容器自己的滚动条)。
  const scrollbarWidth = documentReservesGutter() ? 0 : scrollbarWidthOf(next);
  next.style.overflowX = "hidden";
  next.style.overflowY = "hidden";
  padForScrollbar(next, scrollbarWidth);
};

const onResize = () => {
  // **先交还再重判**。innerScroller() 读的是 computed 值,而被接管的容器上写着的
  // 正是锁自己塞进去的 overflow:hidden —— 直接重判会把它当成「已经不是滚动容器」
  // 而交还,下一次 resize 又接管回来。拖动窗口会连发几十个 resize,
  // 最终是锁着还是开着全看事件次数的奇偶,弹窗背后随时可能又能滚了。
  // 两步在同一个事件回调里同步做完,中间不会有可见的一帧。
  adoptScroller(null);
  adoptScroller(innerScroller());
};

/**
 * 锁住页面滚动，返回解锁句柄。
 *
 * 句柄可重复调用（只有第一次生效），避免 React 的 cleanup 被重复执行时把计数扣穿 ——
 * 计数一旦扣成负数，真正还在开着的那层弹窗就会连同背景一起解锁。
 */
export function lockScroll(): () => void {
  if (lockCount === 0) {
    savedBody = {
      overflowX: document.body.style.overflowX,
      overflowY: document.body.style.overflowY,
      paddingRight: document.body.style.paddingRight,
    };
    const scrollbarWidth = documentReservesGutter()
      ? 0
      : window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflowX = "hidden";
    document.body.style.overflowY = "hidden";
    padForScrollbar(document.body, scrollbarWidth);
    // 内部滚动容器自带 scrollbar-gutter: stable（锁定模式下的 .main），
    // 所以这里同样不需要补偿宽度。
    adoptScroller(innerScroller());
    window.addEventListener("resize", onResize);
  }
  lockCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      window.removeEventListener("resize", onResize);
      adoptScroller(null);
      if (savedBody) {
        document.body.style.overflowX = savedBody.overflowX;
        document.body.style.overflowY = savedBody.overflowY;
        document.body.style.paddingRight = savedBody.paddingRight;
        savedBody = null;
      }
    }
  };
}
