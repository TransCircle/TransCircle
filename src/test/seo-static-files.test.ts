// @vitest-environment node
/**
 * 静态 SEO / GEO 文件与 src/seo/site.ts、zh-CN 语言包之间的一致性守卫。
 * 这些文件无法从代码生成（需要被搜索引擎直接抓取），靠测试防止漂移。
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import zhCN from "../i18n/locales/zh-CN/common.json";
import { FAQ_KEYS } from "../seo/faq";
import { INDEXNOW_KEY, LICENSE_URL, SITE_NAME, SITE_URL, SOCIAL_PROFILES } from "../seo/site";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string): string => readFileSync(`${ROOT}${path}`, "utf8");
const indexHtml = read("index.html");

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
}

function tags(pattern: RegExp): string[] {
  return indexHtml.match(pattern) ?? [];
}

/** 读取 PNG 的 IHDR 宽高。 */
function pngSize(path: string): [number, number] {
  const buf = readFileSync(`${ROOT}public${path}`);
  expect(buf.subarray(1, 4).toString("ascii"), path).toBe("PNG");
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe("index.html <head>", () => {
  it("标题与描述和语言包一致", () => {
    expect(/<title>([^<]*)<\/title>/.exec(indexHtml)?.[1]).toBe(zhCN.common.defaultTitle);
    const description = tags(/<meta name="description"[^>]*>/g)[0] ?? "";
    expect(attr(description, "content")).toBe(zhCN.seo.homeDescription);
  });

  it("包含预渲染占位符", () => {
    expect(indexHtml.split("<!--app-head-->")).toHaveLength(2);
    expect(indexHtml).toContain('<div id="root"><!--app-html--></div>');
  });

  it("canonical、站点名、许可证与身份互证链接取自 site.ts", () => {
    expect(indexHtml).toContain(`<link rel="canonical" href="${SITE_URL}" />`);
    expect(indexHtml).toContain(`<meta property="og:site_name" content="${SITE_NAME}" />`);
    expect(indexHtml).toContain(`<meta name="application-name" content="${SITE_NAME}" />`);
    expect(indexHtml).toContain(`<link rel="license" href="${LICENSE_URL}" />`);
    const me = tags(/<link rel="me"[^>]*>/g).map((tag) => attr(tag, "href"));
    expect(me).toEqual([...SOCIAL_PROFILES]);
  });

  it("不再包含已废弃或冗余的标签", () => {
    expect(indexHtml).not.toMatch(/name="(generator|googlebot|bingbot|rating)"/);
    expect(indexHtml).not.toContain("<noscript>");
  });

  it("声明的每个图标都存在，且 PNG 实际尺寸与 sizes 一致", () => {
    const iconTags = tags(/<link rel="(?:icon|apple-touch-icon)"[^>]*>/g);
    expect(iconTags.length).toBeGreaterThanOrEqual(5);
    for (const tag of iconTags) {
      const href = attr(tag, "href") ?? "";
      expect(existsSync(`${ROOT}public${href}`), href).toBe(true);
      const sizes = attr(tag, "sizes");
      if (href.endsWith(".png") && sizes) {
        expect(pngSize(href).join("x"), href).toBe(sizes);
      }
    }
  });

  it("提供 Google 搜索结果要求的 ≥48px 方形图标", () => {
    const pngSizes = tags(/<link rel="icon" type="image\/png"[^>]*>/g).map((tag) => attr(tag, "sizes"));
    expect(pngSizes).toContain("48x48");
    expect(pngSizes).toContain("96x96");
  });
});

describe("favicon.ico", () => {
  it("包含 16 / 32 / 48 三个 32bpp 尺寸", () => {
    const buf = readFileSync(`${ROOT}public/favicon.ico`);
    expect(buf.readUInt16LE(2)).toBe(1); // type = icon
    const count = buf.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => buf.readUInt8(6 + 16 * i));
    expect(sizes).toEqual([16, 32, 48]);
    for (let i = 0; i < count; i++) {
      expect(buf.readUInt16LE(6 + 16 * i + 6)).toBe(32);
    }
  });
});

describe("site.webmanifest", () => {
  const manifest = JSON.parse(read("public/site.webmanifest")) as {
    id: string;
    theme_color: string;
    orientation?: string;
    icons: Array<{ src: string; sizes: string; purpose: string }>;
  };

  it("图标文件存在且尺寸匹配，包含 maskable", () => {
    for (const icon of manifest.icons) {
      expect(existsSync(`${ROOT}public${icon.src}`), icon.src).toBe(true);
      if (icon.src.endsWith(".png")) {
        expect(pngSize(icon.src).join("x"), icon.src).toBe(icon.sizes);
      }
    }
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  it("使用当前主题色、声明 id、不锁定方向", () => {
    expect(manifest.id).toBe("/");
    expect(manifest.theme_color.toLowerCase()).toBe("#fdf9fb");
    expect(manifest.orientation).toBeUndefined();
  });
});

describe("爬虫与 AI 索引文件", () => {
  const robots = read("public/robots.txt");

  it("robots.txt 声明 sitemap 与 Content-Signal，且不屏蔽需要读到 noindex 的页面", () => {
    expect(robots).toContain(`Sitemap: ${SITE_URL}sitemap.xml`);
    expect(robots).toMatch(/Content-Signal: search=yes, ai-input=yes, ai-train=yes/);
    expect(robots).not.toMatch(/Disallow: \/(login|account|admin)/);
  });

  it("所有对外声明统一为 CC BY-SA 4.0", () => {
    const sources = {
      footer: zhCN.footer.text1,
      robots,
      llms: read("public/llms.txt"),
      llmsFull: read("public/llms-full.txt"),
      ai: read("public/ai.txt"),
      humans: read("public/humans.txt"),
    };
    for (const [name, text] of Object.entries(sources)) {
      expect(text, name).toContain("CC BY-SA 4.0");
      expect(text, name).not.toMatch(/CC BY 4\.0/);
    }
  });

  it("llms-full.txt 收录与首页逐字一致的 FAQ", () => {
    const llmsFull = read("public/llms-full.txt");
    const faq = zhCN.landing.faq as Record<string, { q: string; a: string }>;
    for (const key of FAQ_KEYS) {
      expect(llmsFull, key).toContain(faq[key]?.q);
      expect(llmsFull, key).toContain(faq[key]?.a);
    }
  });

  it("security.txt 符合 RFC 9116 且未过期", () => {
    const security = read("public/.well-known/security.txt");
    expect(security).toMatch(/^Contact: https:\/\//m);
    const expires = /^Expires: (.+)$/m.exec(security)?.[1] ?? "";
    expect(Date.parse(expires)).toBeGreaterThan(Date.now());
  });

  it("IndexNow key 文件与 site.ts 一致", () => {
    expect(read(`public/${INDEXNOW_KEY}.txt`).trim()).toBe(INDEXNOW_KEY);
  });

  it("_redirects 不再包含吞掉 404 的 SPA 通配规则", () => {
    expect(read("public/_redirects")).not.toMatch(/^\/\*\s+\/index\.html\s+200/m);
  });
});
