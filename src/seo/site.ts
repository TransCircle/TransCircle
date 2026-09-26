/**
 * 站点身份的唯一信息源：预渲染的 JSON-LD、边缘 Worker、客户端 head 同步与
 * 一致性测试都从这里取值。index.html / public/*.txt 里的同名字面量由
 * src/test/seo-static-files.test.ts 校验与本文件一致，改这里时测试会指出漏改处。
 *
 * 纯数据模块：不得引入 React / DOM / i18n 运行时（Worker 也会打包它）。
 */

export const SITE_ORIGIN = "https://transcircle.org";
export const SITE_URL = `${SITE_ORIGIN}/`;

/** 站点名（Google「站点名称」、og:site_name、common.siteName 三处保持一致）。 */
export const SITE_NAME = "跨环 TransCircle";
/** 组织的英文官方名。 */
export const ORG_NAME = "TransCircle Project";
/** 真实使用过的名称写法；只收录本项目自己的名字，不认领通用词。 */
export const ORG_ALTERNATE_NAMES = ["跨环", "TransCircle", "TransCircleProject", "跨性别圈工程"] as const;

export const SITE_LANGUAGE = "zh-CN";
/** 首个提交日期，作为项目创立与首页首次发布日期。 */
export const FOUNDING_DATE = "2026-05-09";

export const LICENSE_NAME = "CC BY-SA 4.0";
export const LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/";

/** 官方社交主页：用于 JSON-LD sameAs 与 <link rel="me">。 */
export const SOCIAL_PROFILES = [
  "https://github.com/TransCircle",
  "https://x.com/TransCircleOrg",
  "https://bsky.app/profile/TransCircle.org",
] as const;
export const SOURCE_REPOSITORY = "https://github.com/TransCircle/TransCircle";
export const TWITTER_HANDLE = "@TransCircleOrg";

export interface SisterSite {
  readonly name: string;
  readonly url: string;
  readonly description: string;
}

/** 同一组织运营的官方子站（search.transcircle.org 为第三方站点，不在此列）。 */
export const SISTER_SITES: readonly SisterSite[] = [
  { name: "跨环故事分享", url: "https://story.transcircle.org/", description: "阅读与投稿中文 MtF 跨性别社群故事档案。" },
  { name: "TransCircle 社区论坛", url: "https://community.transcircle.org/", description: "跨性别社群互助讨论区。" },
  { name: "跨环博客", url: "https://blog.transcircle.org/", description: "项目公告、进展与社群知识。" },
];

export interface ImageAsset {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

export const LOGO: ImageAsset = { url: `${SITE_ORIGIN}/icon-512.png`, width: 512, height: 512 };
export const OG_IMAGE: ImageAsset & { readonly alt: string } = {
  url: `${SITE_ORIGIN}/og-cover.png`,
  width: 1200,
  height: 630,
  alt: "跨环 TransCircle — 中文 MtF 跨性别社群史官工程",
};

/** IndexNow 站点验证 key：public/<key>.txt 的文件名与内容都必须等于它。 */
export const INDEXNOW_KEY = "c3f7a89e4b1d2547f6a8b9c0d1e2f3a4";

/** 拼出站内绝对 URL（canonical、sitemap、og:url 统一走这里，避免尾斜杠不一致）。 */
export function absoluteUrl(pathname: string): string {
  return pathname === "/" ? SITE_URL : `${SITE_ORIGIN}${pathname}`;
}
