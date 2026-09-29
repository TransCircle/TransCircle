/**
 * 构建期从 GitHub 拉取团队成员的昵称与头像，以虚拟模块 `virtual:github-profiles` 提供给前端。
 *
 * 头像**同源托管**：构建时把头像下载下来，作为 /team-avatars/<用户名>-<内容哈希>.<扩展名>
 * 发布进 dist（dev 下由中间件从缓存目录直出）。访客浏览器从不直连 GitHub —— 否则每次打开首页，
 * GitHub 都能拿到访客 IP 与「正在访问 TransCircle」这一来源信息（Privacy by Design，AGENTS.md §10）。
 *
 * - build：客户端构建向 GitHub 取最新资料，并把最终用到的资料写成**构建快照**（build-snapshot.json）；
 *   随后的 SSR（预渲染）构建只读这份快照、从不联网 —— 两轮是独立进程，各自拉取可能得到不同结果，
 *   预渲染 HTML / JSON-LD 就会引用客户端构建没有发布的头像。快照与 dev 共用的缓存（profiles.json）
 *   分开存放，开着 dev 服务器同时构建也不会互相覆盖；两个文件都原子写入（临时文件 + rename），
 *   不会读到写了一半的 JSON。同一工作区并行跑两次 `pnpm build` 不在支持范围内。
 * - dev：优先用 24 小时内的缓存，不拖慢冷启动。
 * - vitest：不联网，返回空表（组件回退为 GitHub 用户名 + 首字头像）。
 * - 请求失败（离线、限流）时逐个成员回退到上次缓存；连缓存都没有就回退为用户名、
 *   不显示头像图片（绝不回退到 GitHub 外链），只告警不中断构建。
 *
 * 未认证 API 每小时限 60 次；CI 里可设置 GITHUB_TOKEN 提高额度。
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/** 虚拟模块导出给前端的单个成员资料。 */
export interface GithubProfile {
  readonly name: string;
  /** 同源头像路径（/team-avatars/…）；拿不到头像时为 null。 */
  readonly avatar: string | null;
}

type ProfileMap = Record<string, GithubProfile>;

/** 缓存里的成员记录：头像以文件名记录，字节存在 AVATAR_DIR。 */
interface CachedProfile {
  readonly name: string;
  readonly avatarFile: string | null;
}

interface CacheFile {
  readonly version: 2;
  readonly fetchedAt: number;
  readonly profiles: Record<string, CachedProfile>;
}

const VIRTUAL_ID = "virtual:github-profiles";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const TEAM_JSON = fileURLToPath(new URL("../src/data/team.json", import.meta.url));
const CACHE_DIR = fileURLToPath(new URL("../node_modules/.cache/github-team/", import.meta.url));
const CACHE_FILE = `${CACHE_DIR}profiles.json`;
/** 客户端构建 → SSR 构建的交接快照（只在 `vite build` 中读写）。 */
const SNAPSHOT_FILE = `${CACHE_DIR}build-snapshot.json`;
const AVATAR_DIR = `${CACHE_DIR}avatars/`;
/** 发布路径前缀（dist 里的目录名；dev 中间件也挂在这里）。 */
const AVATAR_ROUTE = "/team-avatars/";

const BUILD_CACHE_TTL_MS = 5 * 60 * 1000;
const DEV_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
/** 头像下载边长：页面显示 64px，按 2× 取，同时用作 JSON-LD 的 Person.image。 */
const AVATAR_PX = 128;

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
const CONTENT_TYPES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(IMAGE_TYPES).map(([type, ext]) => [ext, type]),
);
/** 头像文件名白名单（也用于 dev 中间件，防止路径穿越）。 */
const AVATAR_FILE = /^[A-Za-z0-9-]+-[0-9a-f]{12}\.(png|jpg|gif|webp)$/;

async function readLogins(): Promise<string[]> {
  const team = JSON.parse(await readFile(TEAM_JSON, "utf8")) as { members: Array<{ github: string }> };
  return team.members.map((m) => m.github);
}

/** 原子写 JSON：先写同目录临时文件再 rename，读方要么看到旧文件、要么看到完整的新文件。 */
async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, file);
}

async function readCache(file: string = CACHE_FILE): Promise<CacheFile | null> {
  try {
    const data = JSON.parse(await readFile(file, "utf8")) as Partial<CacheFile>;
    return data.version === 2 && data.profiles ? (data as CacheFile) : null;
  } catch {
    return null;
  }
}

function githubHeaders(accept: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: accept, "User-Agent": "transcircle-build" };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** 下载头像并落盘，返回文件名；文件名带内容哈希，头像更换后 URL 随之变化，可长期强缓存。 */
async function downloadAvatar(login: string, avatarUrl: string): Promise<string> {
  const url = new URL(avatarUrl);
  url.searchParams.set("s", String(AVATAR_PX));
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`头像 ${res.status}`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
  const ext = IMAGE_TYPES[type];
  if (!ext) throw new Error(`头像类型不受支持：${type || "未知"}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const file = `${login.toLowerCase()}-${hash}.${ext}`;
  // 文件名即内容哈希：已存在就是同一份字节，直接复用。否则原子写入（临时文件 + rename），
  // 与之并发的 dev / 构建读方不会读到截断的文件并把它当长期缓存的资源发布出去。
  if (await avatarExists(file)) return file;
  await mkdir(AVATAR_DIR, { recursive: true });
  const tmp = `${AVATAR_DIR}.${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, `${AVATAR_DIR}${file}`);
  return file;
}

async function fetchProfile(login: string): Promise<CachedProfile> {
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
    headers: githubHeaders("application/vnd.github+json"),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const data = (await res.json()) as { login: string; name: string | null; avatar_url: string };
  // 没设昵称的账号显示用户名。
  return { name: data.name?.trim() || data.login, avatarFile: await downloadAvatar(login, data.avatar_url) };
}

async function avatarExists(file: string | null): Promise<boolean> {
  if (!file) return false;
  try {
    await readFile(`${AVATAR_DIR}${file}`);
    return true;
  } catch {
    return false;
  }
}

async function loadCachedProfiles(ttlMs: number, warn: (msg: string) => void): Promise<Record<string, CachedProfile>> {
  const logins = await readLogins();
  const cache = await readCache();
  const covered = cache !== null && logins.every((login) => Object.hasOwn(cache.profiles, login));
  if (cache && covered && Date.now() - cache.fetchedAt < ttlMs) {
    const files = await Promise.all(logins.map((login) => avatarExists(cache.profiles[login]?.avatarFile ?? null)));
    if (files.every(Boolean)) return cache.profiles;
  }

  // 逐个成员处理失败：一个账号限流 / 改名 / 注销，不该让其余成员也退回用户名。
  const results = await Promise.allSettled(logins.map((login) => fetchProfile(login)));
  const profiles: Record<string, CachedProfile> = {};
  const failed: string[] = [];
  for (const [i, result] of results.entries()) {
    const login = logins[i];
    if (login === undefined) continue;
    if (result.status === "fulfilled") {
      profiles[login] = result.value;
      continue;
    }
    failed.push(`${login}（${String(result.reason)}）`);
    const cached = cache?.profiles[login];
    if (cached) profiles[login] = { ...cached, avatarFile: (await avatarExists(cached.avatarFile)) ? cached.avatarFile : null };
  }
  if (failed.length > 0) warn(`拉取 GitHub 成员资料失败，已改用缓存或用户名：${failed.join("；")}`);

  // 全部成功才刷新时间戳；有失败时沿用旧时间戳，下次构建 / 启动会重试失败的成员。
  const fetchedAt = failed.length === 0 ? Date.now() : (cache?.fetchedAt ?? 0);
  try {
    await writeJsonAtomic(CACHE_FILE, { version: 2, fetchedAt, profiles } satisfies CacheFile);
  } catch (error) {
    // 这只是下次启动 / 构建的缓存命中；交给 SSR 的快照在插件 load 里另写，写不进去才中止构建。
    warn(`写入 GitHub 成员资料缓存失败：${String(error)}`);
  }
  return profiles;
}

function toPublic(profiles: Record<string, CachedProfile>): ProfileMap {
  return Object.fromEntries(
    Object.entries(profiles).map(([login, p]) => [
      login,
      { name: p.name, avatar: p.avatarFile ? `${AVATAR_ROUTE}${p.avatarFile}` : null },
    ]),
  );
}

export function githubTeamPlugin(): Plugin {
  let profiles: Promise<Record<string, CachedProfile>> | null = null;
  let ttlMs = BUILD_CACHE_TTL_MS;
  let isSsrBuild = false;
  let isBuild = true;

  const load = (warn: (msg: string) => void) => {
    // team.json 写到一半（编辑器保存中）会解析失败：失败不缓存，下次请求重新读取。
    profiles ??= loadCachedProfiles(ttlMs, warn).catch((error: unknown) => {
      profiles = null;
      throw error;
    });
    return profiles;
  };

  return {
    name: "transcircle:github-team",
    configResolved(config) {
      ttlMs = config.command === "serve" ? DEV_CACHE_TTL_MS : BUILD_CACHE_TTL_MS;
      isSsrBuild = Boolean(config.build.ssr);
      isBuild = config.command === "build";
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return null;
      if (process.env.VITEST) return "export default {};";
      if (isSsrBuild) {
        // 只读客户端构建交接的快照（见文件头），从不联网。
        const snapshot = await readCache(SNAPSHOT_FILE);
        if (!snapshot) this.error("SSR 构建未找到客户端构建写入的成员资料快照：请用 pnpm build 按顺序构建");
        return `export default ${JSON.stringify(toPublic(snapshot.profiles))};`;
      }
      this.addWatchFile(TEAM_JSON);
      const resolved = await load((msg) => this.warn(msg));
      if (isBuild) {
        // 无论资料来自新拉取还是缓存命中，都把本次构建实际使用的那份交给 SSR；
        // 写不进去就会让预渲染读到旧快照、引用未发布的头像，宁可中止构建。
        try {
          await writeJsonAtomic(SNAPSHOT_FILE, { version: 2, fetchedAt: Date.now(), profiles: resolved } satisfies CacheFile);
        } catch (error) {
          this.error(`写入 GitHub 成员资料构建快照失败：${String(error)}`);
        }
      }
      return `export default ${JSON.stringify(toPublic(resolved))};`;
    },
    async generateBundle() {
      // 只有客户端产物进 dist；SSR 包（.prerender/）只用来生成 HTML，不需要头像文件。
      if (isSsrBuild || process.env.VITEST || profiles === null) return;
      for (const { avatarFile } of Object.values(await profiles)) {
        if (!avatarFile) continue;
        this.emitFile({
          type: "asset",
          fileName: `${AVATAR_ROUTE.slice(1)}${avatarFile}`,
          source: await readFile(`${AVATAR_DIR}${avatarFile}`),
        });
      }
    },
    configureServer(server) {
      server.middlewares.use(AVATAR_ROUTE, (req, res, next) => {
        const file = decodeURIComponent((req.url ?? "").split("?")[0]?.replace(/^\//, "") ?? "");
        const ext = file.split(".").pop() ?? "";
        if (!AVATAR_FILE.test(file)) return next();
        readFile(`${AVATAR_DIR}${file}`).then(
          (bytes) => {
            res.setHeader("Content-Type", CONTENT_TYPES[ext] ?? "application/octet-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.end(bytes);
          },
          () => next(),
        );
      });
    },
    handleHotUpdate({ file, server }) {
      // team.json 增删成员时重新拉取，并让虚拟模块失效。
      if (file.replace(/\\/g, "/") !== TEAM_JSON.replace(/\\/g, "/")) return;
      profiles = null;
      const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
      if (mod) server.moduleGraph.invalidateModule(mod);
    },
  };
}
