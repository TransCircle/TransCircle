/**
 * `vite build` 之后运行：把首页预渲染结果注入 dist/index.html，并生成 dist/sitemap.xml。
 *
 * 前置：`vite build --ssr src/entry-prerender.tsx --outDir .prerender` 已产出 SSR 包。
 * 由 package.json 的 build 脚本串联，单独运行前请先执行这两步构建。
 */
import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { INDEXABLE_PATHS } from "../src/seo/route-policy.ts";
import { absoluteUrl, OG_IMAGE } from "../src/seo/site.ts";

interface PrerenderModule {
  render(options: { dateModified: string | null }): Promise<{ appHtml: string; headHtml: string }>;
}

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = `${ROOT}dist/`;
const SSR_OUT = `${ROOT}.prerender/`;

/** 影响首页内容的源文件：取其最后一次提交日期作为 dateModified / lastmod。 */
const HOME_SOURCES = [
  "index.html",
  "src/App.tsx",
  "src/components/FaqSection.tsx",
  "src/i18n/locales/zh-CN/common.json",
  "src/seo",
  "public/llms.txt",
  "public/llms-full.txt",
  "public/humans.txt",
];

/** 构建产物里需要写入真实更新日期的文本文件与对应的行格式。 */
const DATED_TEXT_FILES: ReadonlyArray<readonly [file: string, line: RegExp, label: string]> = [
  ["llms-full.txt", /^最后更新：.*$/m, "最后更新："],
  ["humans.txt", /^Last update: .*$/m, "Last update: "],
];

/**
 * 取不到可信的内容修改日期时返回 null（由调用方省略 dateModified / lastmod），
 * 而不是用构建日期冒充「内容刚更新」—— 那会让每次构建都向搜索引擎谎报新鲜度。
 */
function lastModifiedDate(): string | null {
  try {
    const date = execFileSync("git", ["log", "-1", "--format=%cs", "--", ...HOME_SOURCES], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  } catch {
    // 非 git 环境（如源码包构建）。
  }
  return null;
}

function injectOnce(html: string, placeholder: string, content: string): string {
  const parts = html.split(placeholder);
  if (parts.length !== 2) {
    throw new Error(`dist/index.html 中应恰好有一个 ${placeholder} 占位符，实际 ${parts.length - 1} 个`);
  }
  return parts.join(content);
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildSitemap(lastmod: string | null): string {
  const urls = INDEXABLE_PATHS.map((path) => {
    const loc = escapeXml(absoluteUrl(path));
    return [
      "  <url>",
      `    <loc>${loc}</loc>`,
      ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
      "    <image:image>",
      `      <image:loc>${escapeXml(OG_IMAGE.url)}</image:loc>`,
      "    </image:image>",
      "  </url>",
    ].join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const dateModified = lastModifiedDate();
  const { render } = (await import(pathToFileURL(`${SSR_OUT}entry-prerender.js`).href)) as PrerenderModule;
  const { appHtml, headHtml } = await render({ dateModified });

  const indexPath = `${DIST}index.html`;
  let html = await readFile(indexPath, "utf8");
  html = injectOnce(html, "<!--app-head-->", headHtml);
  html = injectOnce(html, "<!--app-html-->", appHtml);
  await writeFile(indexPath, html);
  console.log(`✓ dist/index.html 预渲染完成（正文 ${appHtml.length} 字符，dateModified ${dateModified ?? "未知，已省略"}）`);

  // 源文件里的日期只是占位：以内容源的 git 日期为准，未知时删掉整行，不留过期日期。
  for (const [file, line, label] of DATED_TEXT_FILES) {
    const path = `${DIST}${file}`;
    const text = await readFile(path, "utf8");
    if (!line.test(text)) throw new Error(`dist/${file} 缺少「${label}」日期行`);
    await writeFile(path, text.replace(line, dateModified ? `${label}${dateModified}` : "").replace(/\n{3,}/g, "\n\n"));
  }

  await writeFile(`${DIST}sitemap.xml`, buildSitemap(dateModified));
  console.log(`✓ dist/sitemap.xml（${INDEXABLE_PATHS.length} 个 URL）`);

  await rm(SSR_OUT, { recursive: true, force: true });
}

await main();
