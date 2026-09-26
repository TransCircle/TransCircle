/**
 * 部署后把可收录 URL 推送给 IndexNow（Bing、Yandex、Seznam、Naver 等共享同一协议），
 * 让搜索引擎尽快重新抓取首页（标题、图标、结构化数据的变更才能尽快生效）。
 *
 * 用法：pnpm seo:indexnow（`pnpm deploy` 在 wrangler deploy 成功后自动调用）。
 * 推送失败只打印警告、不让部署失败 —— IndexNow 只是加速，不是上线的前提。
 * 百度不支持 IndexNow，需在「百度搜索资源平台」使用其自有的普通收录推送。
 */
import { INDEXABLE_PATHS } from "../src/seo/route-policy.ts";
import { absoluteUrl, INDEXNOW_KEY, SITE_ORIGIN } from "../src/seo/site.ts";

const ENDPOINT = "https://api.indexnow.org/indexnow";

async function main(): Promise<void> {
  const urlList = INDEXABLE_PATHS.map((path) => absoluteUrl(path));
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(SITE_ORIGIN).host,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`,
        urlList,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    // 200 = 已受理，202 = 已接收待验证 key；其余视为失败但不中断部署。
    if (response.ok) {
      console.log(`✓ IndexNow 已提交 ${urlList.length} 个 URL（HTTP ${response.status}）`);
    } else {
      console.warn(`⚠ IndexNow 返回 HTTP ${response.status}：${await response.text()}`);
    }
  } catch (error) {
    console.warn(`⚠ IndexNow 推送失败（不影响部署）：${error instanceof Error ? error.message : String(error)}`);
  }
}

await main();
