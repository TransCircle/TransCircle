import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import "../i18n/config";
import { FaqSection } from "../components/FaqSection";
import { FAQ_KEYS } from "../seo/faq";

describe("FaqSection", () => {
  it("以 h2 标注分区，并为每个问题渲染一个原生 details", () => {
    const { container } = render(<FaqSection />);
    const heading = screen.getByRole("heading", { level: 2, name: "常见问题" });
    expect(screen.getByRole("region", { name: "常见问题" })).toContainElement(heading);
    expect(container.querySelectorAll("details")).toHaveLength(FAQ_KEYS.length);
    expect(container.querySelectorAll("details > summary")).toHaveLength(FAQ_KEYS.length);
  });

  it("答案始终在 DOM 中（折叠而非不渲染），供爬虫读取", () => {
    render(<FaqSection />);
    expect(screen.getByText(/CC BY-SA 4\.0/)).toBeInTheDocument();
  });

  // 键盘（Enter / Space）触发 summary 是浏览器原生行为，jsdom 未实现；
  // 这里验证 summary 可聚焦（在 Tab 序列中）且激活后展开。
  it("summary 可聚焦，激活后展开对应答案", async () => {
    const user = userEvent.setup();
    const { container } = render(<FaqSection />);
    const first = container.querySelector("details");
    const summary = first?.querySelector("summary");
    expect(first?.open).toBe(false);
    summary?.focus();
    expect(summary).toHaveFocus();
    await user.click(summary as HTMLElement);
    expect(first?.open).toBe(true);
  });

  it("装饰性 chevron 对读屏隐藏", () => {
    const { container } = render(<FaqSection />);
    container.querySelectorAll("summary svg").forEach((svg) => {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("focusable")).toBe("false");
    });
  });
});
