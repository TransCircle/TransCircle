/**
 * 首页 JSON-LD（schema.org @graph）。构建期由 scripts/prerender.ts 调用并注入 <head>，
 * 因此不执行 JS 的爬虫与 AI 也能读到；不在客户端运行时生成。
 */
import { getFaqEntries } from "./faq";
import {
  FOUNDING_DATE,
  LICENSE_URL,
  LOGO,
  OG_IMAGE,
  ORG_ALTERNATE_NAMES,
  ORG_NAME,
  SISTER_SITES,
  SITE_LANGUAGE,
  SITE_NAME,
  SITE_URL,
  SOCIAL_PROFILES,
} from "./site";

export type JsonLdNode = Record<string, unknown>;

export interface StructuredDataInput {
  /** i18next 的 `t`（或任何按 key 取文案的函数）。 */
  readonly translate: (key: string) => string;
  /** 首页内容最后修改日期（YYYY-MM-DD）；未知时为 null，不输出 dateModified。 */
  readonly dateModified: string | null;
}

const ORG_ID = `${SITE_URL}#organization`;
const WEBSITE_ID = `${SITE_URL}#website`;
const WEBPAGE_ID = `${SITE_URL}#webpage`;
const LOGO_ID = `${SITE_URL}#logo`;
const OG_IMAGE_ID = `${SITE_URL}#primaryimage`;
const FAQ_ID = `${SITE_URL}#faq`;

export function buildHomeStructuredData({ translate, dateModified }: StructuredDataInput): JsonLdNode {
  const description = translate("seo.homeDescription");

  const organization: JsonLdNode = {
    "@type": "Organization",
    "@id": ORG_ID,
    name: ORG_NAME,
    alternateName: [...ORG_ALTERNATE_NAMES],
    url: SITE_URL,
    logo: { "@type": "ImageObject", "@id": LOGO_ID, url: LOGO.url, width: LOGO.width, height: LOGO.height, caption: SITE_NAME },
    image: { "@id": OG_IMAGE_ID },
    description,
    slogan: translate("landing.subtitle"),
    foundingDate: FOUNDING_DATE,
    sameAs: [...SOCIAL_PROFILES],
    // 主题关联（不是名称）：本项目所服务、所记录的社群与领域。
    knowsAbout: [
      "跨性别中文圈",
      "中文跨性别圈",
      "中文跨性别社群",
      "中文 MtF 社群",
      "跨性别",
      "MtF",
      "跨性别社群史",
      "跨性别社群档案",
      "跨性别故事",
      "口述历史",
      "transgender history",
      "Chinese transgender community",
      "community archive",
    ],
    audience: {
      "@type": "Audience",
      audienceType: "中文跨性别社群（跨性别中文圈）及关注跨性别议题的公众",
    },
  };

  const website: JsonLdNode = {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE_URL,
    name: SITE_NAME,
    alternateName: ["跨环", ORG_NAME, "TransCircle"],
    description,
    inLanguage: SITE_LANGUAGE,
    publisher: { "@id": ORG_ID },
    copyrightHolder: { "@id": ORG_ID },
    copyrightYear: Number(FOUNDING_DATE.slice(0, 4)),
    license: LICENSE_URL,
  };

  const primaryImage: JsonLdNode = {
    "@type": "ImageObject",
    "@id": OG_IMAGE_ID,
    url: OG_IMAGE.url,
    contentUrl: OG_IMAGE.url,
    width: OG_IMAGE.width,
    height: OG_IMAGE.height,
    caption: OG_IMAGE.alt,
    inLanguage: SITE_LANGUAGE,
  };

  const webpage: JsonLdNode = {
    "@type": ["WebPage", "AboutPage"],
    "@id": WEBPAGE_ID,
    url: SITE_URL,
    name: translate("common.defaultTitle"),
    description,
    inLanguage: SITE_LANGUAGE,
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": ORG_ID },
    mainEntity: { "@id": ORG_ID },
    primaryImageOfPage: { "@id": OG_IMAGE_ID },
    datePublished: FOUNDING_DATE,
    ...(dateModified ? { dateModified } : {}),
    license: LICENSE_URL,
    hasPart: { "@id": FAQ_ID },
  };

  const faq: JsonLdNode = {
    "@type": "FAQPage",
    "@id": FAQ_ID,
    url: `${SITE_URL}#faq`,
    name: translate("landing.faqHeading"),
    inLanguage: SITE_LANGUAGE,
    isPartOf: { "@id": WEBPAGE_ID },
    mainEntity: getFaqEntries(translate).map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };

  const sisterSites: JsonLdNode[] = SISTER_SITES.map((site) => ({
    "@type": "WebSite",
    "@id": `${site.url}#website`,
    url: site.url,
    name: site.name,
    description: site.description,
    inLanguage: SITE_LANGUAGE,
    publisher: { "@id": ORG_ID },
  }));

  return {
    "@context": "https://schema.org",
    "@graph": [organization, website, primaryImage, webpage, faq, ...sisterSites],
  };
}

/**
 * 序列化成可安全嵌入 <script type="application/ld+json"> 的文本：
 * 转义 `<` 防止文案里出现 `</script>` 提前闭合脚本块。
 */
export function serializeJsonLd(data: JsonLdNode): string {
  return JSON.stringify(data, null, 2).replace(/</g, "\\u003c");
}
