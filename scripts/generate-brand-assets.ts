/**
 * 生成站点图标、PWA 图标与社交分享图（产物提交进 public/，构建时不重新生成）。
 *
 * 用法：pnpm brand:generate
 * 依赖：系统需装有中文字体（fc-list :lang=zh 非空，如 Noto Sans CJK SC），用于分享图副标题；
 * 缺失时脚本直接报错退出。产物已提交，常规 pnpm build 不需要运行本脚本。
 *
 * 为什么单独维护一套「扁平」几何而不是直接栅格化 public/logo-mark.svg：
 * logo-mark.svg 带 feDropShadow / feTurbulence / 多层渐变，18KB，在 16–48px 下
 * 糊成一团；而它最终可见的其实只是三块等分的纯色丝带（粉 / 白 / 蓝，各旋转 120°）
 * 裁切在一个环里。这里把这层最终构造原样抽出来，放到深色圆角底上 ——
 * 白色那一段在白底搜索结果页上才不会消失。
 *
 * favicon.ico 用 BMP-DIB 编码（而非 PNG-in-ICO）：百度 / Yandex / 旧解析器
 * 对 PNG 负载的 ICO 支持不稳定，BMP 是所有抓取器都认的最低公约数。
 */
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));

/** 与 index.css 暗色主题 --bg 一致；也是 manifest / msapplication 的底色来源。 */
const TILE_BG = "#0c0a13";
const FLAG_BLUE = "#5BCEFA";
const FLAG_PINK = "#F5A9B8";
const FLAG_WHITE = "#FFFFFF";

/** logo-mark.svg 的坐标系：环心 (619, 632)，外半径 ≈ 512。 */
const MARK_CX = 619;
const MARK_CY = 632;
const MARK_R = 512;
const RING_PATH =
  "M619 120C900 120 1128 349 1128 632S900 1144 619 1144 110 915 110 632 338 120 619 120Z" +
  "M619 322C449 322 313 460 313 632S449 939 619 939 925 802 925 632 788 322 619 322Z";
const SECTOR_PATH =
  "M1078 367A530 530 0 0 1 619 1162C823 1063 956 793 904 632A285 285 0 0 0 476 385C590 260 890 240 1078 367Z";

type Backdrop = "tile" | "square" | "none";

interface MarkOptions {
  /** 输出像素尺寸（写进 width/height，让 librsvg 直接按目标尺寸栅格化）。 */
  size?: number;
  backdrop: Backdrop;
  /** 环外半径占画布（512 单位）的比例。 */
  ringRadius: number;
}

/** 环形标志的 SVG 片段，放在 512×512 画布里，中心 (256, 256)。 */
function markGroup(radius: number): string {
  const s = +(radius / MARK_R).toFixed(5);
  return (
    `<g transform="translate(256 256) scale(${s}) translate(-${MARK_CX} -${MARK_CY})" clip-path="url(#r)">` +
    // 底层先铺一层粉：三块丝带在接缝处有亚像素缝隙，低分辨率下会透出底色。
    `<path fill="${FLAG_PINK}" fill-rule="evenodd" d="${RING_PATH}"/>` +
    `<g transform="rotate(-30 ${MARK_CX} ${MARK_CY})">` +
    // 丝带路径在 <defs> 里不带 fill：被 <use> 引用的元素自身的 fill 优先于 <use> 上的，
    // 写死颜色会让三块全变成同一种色。
    `<use href="#s" fill="${FLAG_PINK}"/>` +
    `<use href="#s" fill="${FLAG_WHITE}" transform="rotate(120 ${MARK_CX} ${MARK_CY})"/>` +
    `<use href="#s" fill="${FLAG_BLUE}" transform="rotate(240 ${MARK_CX} ${MARK_CY})"/>` +
    `</g></g>`
  );
}

function markSvg({ size, backdrop, ringRadius }: MarkOptions): string {
  const dims = size ? ` width="${size}" height="${size}"` : "";
  const bg =
    backdrop === "tile"
      ? `<rect width="512" height="512" rx="112" fill="${TILE_BG}"/>`
      : backdrop === "square"
        ? `<rect width="512" height="512" fill="${TILE_BG}"/>`
        : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"${dims}>` +
    `<title>TransCircle</title>` +
    `<defs><clipPath id="r"><path clip-rule="evenodd" d="${RING_PATH}"/></clipPath>` +
    `<path id="s" d="${SECTOR_PATH}"/></defs>` +
    bg +
    markGroup(ringRadius) +
    `</svg>`
  );
}

async function renderPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9, effort: 10 }).toBuffer();
}

/** 32bpp BMP-DIB 条目的 ICO 编码器（含 1bpp AND 掩码，兼容只认掩码的旧解析器）。 */
async function encodeIco(sizes: readonly number[], svgFor: (size: number) => string): Promise<Buffer> {
  const images: Buffer[] = [];
  for (const size of sizes) {
    const { data } = await sharp(Buffer.from(svgFor(size)))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const xorRowBytes = size * 4;
    const andRowBytes = Math.ceil(size / 32) * 4;
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0);
    header.writeInt32LE(size, 4);
    header.writeInt32LE(size * 2, 8); // XOR + AND 两张图的总高度
    header.writeUInt16LE(1, 12);
    header.writeUInt16LE(32, 14);
    header.writeUInt32LE((xorRowBytes + andRowBytes) * size, 20);
    const xor = Buffer.alloc(xorRowBytes * size);
    const and = Buffer.alloc(andRowBytes * size);
    for (let y = 0; y < size; y++) {
      const dstRow = size - 1 - y; // DIB 自下而上
      for (let x = 0; x < size; x++) {
        const src = (y * size + x) * 4;
        const dst = dstRow * xorRowBytes + x * 4;
        const alpha = data[src + 3] ?? 0;
        xor[dst] = data[src + 2] ?? 0;
        xor[dst + 1] = data[src + 1] ?? 0;
        xor[dst + 2] = data[src] ?? 0;
        xor[dst + 3] = alpha;
        if (alpha === 0) {
          const byteIndex = dstRow * andRowBytes + (x >> 3);
          and[byteIndex] = (and[byteIndex] ?? 0) | (0x80 >> (x & 7));
        }
      }
    }
    images.push(Buffer.concat([header, xor, and]));
  }

  const dir = Buffer.alloc(6 + 16 * sizes.length);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(sizes.length, 4);
  let offset = dir.length;
  sizes.forEach((size, i) => {
    const entry = 6 + 16 * i;
    const bytes = images[i]?.length ?? 0;
    dir.writeUInt8(size >= 256 ? 0 : size, entry);
    dir.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    dir.writeUInt16LE(1, entry + 4);
    dir.writeUInt16LE(32, entry + 6);
    dir.writeUInt32LE(bytes, entry + 8);
    dir.writeUInt32LE(offset, entry + 12);
    offset += bytes;
  });
  return Buffer.concat([dir, ...images]);
}

function assertCjkFont(): void {
  const families = execFileSync("fc-list", [":lang=zh", "family"], { encoding: "utf8" }).trim();
  if (!families) {
    throw new Error("分享图需要系统中文字体（如 Noto Sans CJK SC / WenQuanYi Zen Hei），fc-list :lang=zh 为空。");
  }
}

/** 1200×630 分享图：深色底 + 横版字标 + 中文副标题 + 底部跨旗条纹（DESIGN §3.1 签名元素）。 */
async function renderOgCover(): Promise<Buffer> {
  assertCjkFont();
  const W = 1200;
  const H = 630;
  const stripe = [FLAG_BLUE, FLAG_PINK, FLAG_WHITE, FLAG_PINK, FLAG_BLUE]
    .map((color, i) => `<rect y="${H - 40 + i * 8}" width="${W}" height="8" fill="${color}"/>`)
    .join("");
  const cjk = "'Noto Sans CJK SC','Source Han Sans SC','PingFang SC','Microsoft YaHei','WenQuanYi Zen Hei',sans-serif";
  const base =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="${TILE_BG}"/>` +
    `<text x="600" y="432" text-anchor="middle" font-family="${cjk}" font-size="46" font-weight="700" fill="#f5f2f8">跨环 · 中文 MtF 跨性别社群史官工程</text>` +
    `<text x="600" y="500" text-anchor="middle" font-family="${cjk}" font-size="30" fill="#cfc9da">我们的存在，就是对恶意最大的反抗。</text>` +
    stripe +
    `</svg>`;

  const LOGO_W = 720;
  const logoSvg = await readFile(new URL("brand/transcircle-horizontal-on-dark.svg", `file://${PUBLIC_DIR}`));
  const logo = await sharp(logoSvg, { density: 400 }).resize({ width: LOGO_W }).png().toBuffer();
  const { height: logoH = 216 } = await sharp(logo).metadata();

  return sharp(Buffer.from(base))
    .composite([{ input: logo, left: (W - LOGO_W) / 2, top: Math.round(250 - logoH / 2) }])
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();
}

async function main(): Promise<void> {
  const tile = (size?: number): string => markSvg({ size, backdrop: "tile", ringRadius: 200 });
  const outputs: Array<[string, Buffer | string]> = [
    ["favicon.svg", tile() + "\n"],
    ["favicon.ico", await encodeIco([16, 32, 48], tile)],
    ["favicon-48x48.png", await renderPng(tile(48))],
    ["favicon-96x96.png", await renderPng(tile(96))],
    ["favicon-144x144.png", await renderPng(tile(144))],
    // 兼容旧链接：保留 URL，内容同步为新图标（已不在 <head> 声明）。
    ["favicon.png", await renderPng(tile(32))],
    ["icon-192.png", await renderPng(tile(192))],
    ["icon-512.png", await renderPng(tile(512))],
    // iOS 会给透明区域垫黑并自行加圆角：满版不透明方块。
    ["apple-touch-icon.png", await renderPng(markSvg({ size: 180, backdrop: "square", ringRadius: 188 }))],
    // maskable 安全区是半径 40% 的圆（512 × 0.4 = 204.8）：环外半径 160 留足余量。
    ["icon-maskable.png", await renderPng(markSvg({ size: 512, backdrop: "square", ringRadius: 160 }))],
    // Windows 磁贴由 TileColor 铺底，图标本身透明。
    ["mstile-150x150.png", await renderPng(markSvg({ size: 150, backdrop: "none", ringRadius: 170 }))],
    ["og-cover.png", await renderOgCover()],
  ];

  for (const [name, content] of outputs) {
    await writeFile(`${PUBLIC_DIR}${name}`, content);
    const bytes = typeof content === "string" ? Buffer.byteLength(content) : content.length;
    console.log(`✓ public/${name} (${bytes} B)`);
  }
}

await main();
