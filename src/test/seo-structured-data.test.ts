import i18n from "../i18n/config";
import { FAQ_KEYS, getFaqEntries } from "../seo/faq";
import { LICENSE_URL, SITE_NAME, SITE_URL, SOCIAL_PROFILES } from "../seo/site";
import { buildHomeStructuredData, serializeJsonLd, type JsonLdNode } from "../seo/structured-data";

const translate = (key: string): string => i18n.t(key);

function graphOf(): JsonLdNode[] {
  const data = buildHomeStructuredData({ translate, dateModified: "2026-09-26" });
  return data["@graph"] as JsonLdNode[];
}

function byType(type: string): JsonLdNode {
  const node = graphOf().find((n) => n["@type"] === type || (Array.isArray(n["@type"]) && n["@type"].includes(type)));
  if (!node) throw new Error(`graph 中缺少 ${type}`);
  return node;
}

/** 递归收集所有 {"@id": …} 引用。 */
function collectRefs(value: unknown, refs: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => collectRefs(v, refs));
  else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Object.keys(obj).length === 1 && typeof obj["@id"] === "string") refs.push(obj["@id"]);
    Object.values(obj).forEach((v) => collectRefs(v, refs));
  }
  return refs;
}

describe("首页结构化数据", () => {
  it("所有 @id 引用都能在 graph 内解析", () => {
    const graph = graphOf();
    const defined = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        if (typeof obj["@id"] === "string" && Object.keys(obj).length > 1) defined.add(obj["@id"]);
        Object.values(obj).forEach(walk);
      }
    };
    walk(graph);
    const dangling = collectRefs(graph).filter((ref) => !defined.has(ref));
    expect(dangling).toEqual([]);
  });

  it("FAQPage 与页面可见 FAQ 逐条一致", () => {
    const faq = byType("FAQPage");
    const questions = faq.mainEntity as Array<{ name: string; acceptedAnswer: { text: string } }>;
    const visible = getFaqEntries(translate);
    expect(questions).toHaveLength(FAQ_KEYS.length);
    questions.forEach((q, i) => {
      expect(q.name).toBe(visible[i]?.question);
      expect(q.acceptedAnswer.text).toBe(visible[i]?.answer);
      expect(q.name).not.toMatch(/^landing\./); // 未翻译的 key 会原样返回
    });
  });

  it("站点名、许可证与社交主页取自 site.ts", () => {
    const website = graphOf().find((n) => n["@id"] === `${SITE_URL}#website`);
    expect(website?.name).toBe(SITE_NAME);
    expect(website?.license).toBe(LICENSE_URL);
    expect(byType("Organization").sameAs).toEqual([...SOCIAL_PROFILES]);
    expect(i18n.t("common.siteName")).toBe(SITE_NAME);
  });

  it("WebPage 带发布与修改日期", () => {
    expect(byType("WebPage")).toMatchObject({ datePublished: "2026-05-09", dateModified: "2026-09-26" });
  });

  it("序列化时转义 <，防止文案提前闭合 <script>", () => {
    const out = serializeJsonLd({ text: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out)).toEqual({ text: "</script><script>alert(1)</script>" });
  });
});
