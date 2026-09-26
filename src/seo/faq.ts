/**
 * 首页 FAQ 的条目顺序。可见的 FaqSection 与 FAQPage JSON-LD 都遍历这张表，
 * 两者文案同出 `landing.faq.<key>.{q,a}`，保证结构化数据描述的正是页面上可见的内容
 * （Google 结构化数据政策要求如此）。
 */
export const FAQ_KEYS = ["what", "circle", "why", "difference", "resources", "sites", "join", "names", "license"] as const;

export type FaqKey = (typeof FAQ_KEYS)[number];

export interface FaqEntry {
  readonly key: FaqKey;
  readonly question: string;
  readonly answer: string;
}

/** 按固定顺序取出 FAQ 文案。`translate` 传 i18next 的 `t` 即可。 */
export function getFaqEntries(translate: (key: string) => string): FaqEntry[] {
  return FAQ_KEYS.map((key) => ({
    key,
    question: translate(`landing.faq.${key}.q`),
    answer: translate(`landing.faq.${key}.a`),
  }));
}
