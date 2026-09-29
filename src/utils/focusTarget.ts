/**
 * 把焦点移到页内跳转的落点（分区或标题），同跳转链接的惯例：
 * 键盘与读屏用户随视口一起到达目标，后续 Tab 从这里继续。
 * 非交互元素需要 tabIndex=-1 才能接收程序焦点；preventScroll 避免打断正在进行的平滑滚动。
 * 焦点指示沿用全局 :focus-visible（仅键盘触发时可见）。
 */
export function focusTarget(el: HTMLElement): void {
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}
