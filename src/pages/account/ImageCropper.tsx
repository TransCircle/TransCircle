import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminButton as Button, Alert } from "../../components/ui";
import cs from "./ImageCropper.module.css";

/** 输出方形头像边长(px)。用 PNG 保留透明通道(JPEG 无 alpha,会把透明区涂黑)。 */
const OUTPUT = 256;
const MIN_SCALE = 1;
const MAX_SCALE = 3;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** 90° 步进旋转下,图片旋转后包围盒的宽高(奇数步交换宽高)。 */
function rotatedSize(img: HTMLImageElement, rotDeg: number) {
  const odd = (rotDeg / 90) % 2 !== 0;
  return {
    rw: odd ? img.naturalHeight : img.naturalWidth,
    rh: odd ? img.naturalWidth : img.naturalHeight,
  };
}

/**
 * 平移可达范围:cover-fit 下裁剪方块(边长 D)始终被图片覆盖时,
 * 中心相对 stage 中心的最大偏移(screen px)。s≥1 保证非负。
 */
function panLimits(img: HTMLImageElement, D: number, scaleV: number, rotDeg: number) {
  if (!D) return { maxOx: 0, maxOy: 0 };
  const { rw, rh } = rotatedSize(img, rotDeg);
  const baseScale = D / Math.min(rw, rh);
  const W = rw * baseScale * scaleV;
  const H = rh * baseScale * scaleV;
  return { maxOx: Math.max(0, (W - D) / 2), maxOy: Math.max(0, (H - D) / 2) };
}

/**
 * 把「旋转 + 缩放 + 平移」后的裁剪区域绘制到边长 target(px)的方形画布。
 * 预览与最终输出共用此函数、共用同一 D,保证所见即所得。
 */
function drawInto(
  ctx: CanvasRenderingContext2D,
  target: number,
  D: number,
  img: HTMLImageElement,
  rotDeg: number,
  scaleV: number,
  ox: number,
  oy: number,
) {
  const { rw, rh } = rotatedSize(img, rotDeg);
  const baseScale = D / Math.min(rw, rh);
  const ratio = target / D; // stage px → target px
  const drawScale = baseScale * scaleV * ratio; // 图片自然 px → target px
  ctx.clearRect(0, 0, target, target);
  ctx.save();
  ctx.translate(target / 2, target / 2); // 原点移到裁剪区中心
  ctx.translate(ox * ratio, oy * ratio); // 用户平移(屏幕空间,先于旋转)
  ctx.rotate((rotDeg * Math.PI) / 180); // 绕图片中心旋转
  ctx.scale(drawScale, drawScale);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  ctx.restore();
}

const RotateIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M21 12a9 9 0 1 1-3.4-7.05" />
    <path d="M21 3v5h-5" />
  </svg>
);

interface ImageCropperProps {
  file: File;
  onApply: (dataUrl: string) => void;
  onCancel: () => void;
}

/**
 * 头像编辑器:方形裁剪视口 + 图片可拖动/缩放/90° 旋转,圆形遮罩提示最终圆形呈现。
 * 应用时把裁剪结果渲染为 ≤256px JPEG dataURL,契约与旧 resizeToDataUrl 一致。
 */
export function ImageCropper({ file, onApply, onCancel }: ImageCropperProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef({ active: false, id: -1, startX: 0, startY: 0, ox: 0, oy: 0 });

  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [D, setD] = useState(0); // 裁剪视口的 CSS 边长
  const [rot, setRot] = useState(0);
  const [scale, setScale] = useState(1);
  const [ox, setOx] = useState(0);
  const [oy, setOy] = useState(0);

  // 载入所选文件为 <img>,加载后复位所有变换参数。
  // cancelled 守卫:React StrictMode(开发)会双调用本 effect —— 第一次的 cleanup 会 revoke 掉 URL,
  // 令第一个 image 加载失败并误触发 onerror,与第二次成功的 onload 竞态,间歇性地把界面卡在
  // 「加载失败」错误屏(表现为编辑界面不显示图片、缩放/上传都用不了)。忽略作废那次的回调即可。
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    let cancelled = false;
    image.onload = () => {
      if (cancelled) return;
      setImg(image);
      setLoadError(false);
      setRot(0);
      setScale(1);
      setOx(0);
      setOy(0);
    };
    image.onerror = () => {
      if (cancelled) return;
      setLoadError(true);
    };
    image.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // 测量裁剪视口的实际像素边长(随断点/移动端底部抽屉变化重测)。
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => setD(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 裁剪视口尺寸 D(或图片/缩放/旋转)变化时重新钳制平移:防止 D 收缩后旧的近极限平移
  // 越界,露出未被图片覆盖的黑边(函数式更新在已在范围内时返回原值,React 自动 bail,不会死循环)。
  useEffect(() => {
    if (!img || !D) return;
    const { maxOx, maxOy } = panLimits(img, D, scale, rot);
    setOx((x) => clamp(x, -maxOx, maxOx));
    setOy((y) => clamp(y, -maxOy, maxOy));
  }, [img, D, scale, rot]);

  // 参数变化时重绘预览(按 devicePixelRatio 提升清晰度)。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img || !D) return;
    const dpr = window.devicePixelRatio || 1;
    const target = Math.max(1, Math.round(D * dpr));
    if (canvas.width !== target) canvas.width = target;
    if (canvas.height !== target) canvas.height = target;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawInto(ctx, target, D, img, rot, scale, ox, oy);
  }, [img, D, rot, scale, ox, oy]);

  const reclamp = (nextScale: number, nextRot: number, x = ox, y = oy) => {
    if (!img) return;
    const { maxOx, maxOy } = panLimits(img, D, nextScale, nextRot);
    setOx(clamp(x, -maxOx, maxOx));
    setOy(clamp(y, -maxOy, maxOy));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!img) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { active: true, id: e.pointerId, startX: e.clientX, startY: e.clientY, ox, oy };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d.active || d.id !== e.pointerId || !img) return;
    const { maxOx, maxOy } = panLimits(img, D, scale, rot);
    setOx(clamp(d.ox + (e.clientX - d.startX), -maxOx, maxOx));
    setOy(clamp(d.oy + (e.clientY - d.startY), -maxOy, maxOy));
  };
  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drag.current.id === e.pointerId) drag.current.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* 指针已释放,忽略 */
    }
  };

  // 键盘平移(无障碍):方向键按 step 微调,与指针拖动方向一致;Shift 加大步长。
  const nudge = (dx: number, dy: number) => {
    if (!img) return;
    const { maxOx, maxOy } = panLimits(img, D, scale, rot);
    setOx((x) => clamp(x + dx, -maxOx, maxOx));
    setOy((y) => clamp(y + dy, -maxOy, maxOy));
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!img) return;
    const step = e.shiftKey ? 24 : 8;
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        nudge(-step, 0);
        break;
      case "ArrowRight":
        e.preventDefault();
        nudge(step, 0);
        break;
      case "ArrowUp":
        e.preventDefault();
        nudge(0, -step);
        break;
      case "ArrowDown":
        e.preventDefault();
        nudge(0, step);
        break;
    }
  };

  const rotate = () => {
    const nr = (rot + 90) % 360;
    setRot(nr);
    reclamp(scale, nr);
  };
  const onZoom = (e: React.ChangeEvent<HTMLInputElement>) => {
    const ns = clamp(parseFloat(e.target.value), MIN_SCALE, MAX_SCALE);
    setScale(ns);
    reclamp(ns, rot);
  };

  const apply = () => {
    if (!img || !D) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawInto(ctx, OUTPUT, D, img, rot, scale, ox, oy);
    // PNG:保留透明背景(避免透明区被 JPEG 涂成黑色)。256px 头像体积很小,在后端限额内。
    onApply(canvas.toDataURL("image/png"));
  };

  if (loadError) {
    return (
      <div className={cs.cropper}>
        <Alert tone="error">{t("account.profile.avatarFailed")}</Alert>
        <div className={cs.actions}>
          <Button variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cs.cropper}>
      <div className={cs.stageWrap}>
        <canvas
          ref={canvasRef}
          className={cs.stage}
          tabIndex={0}
          role="application"
          aria-label={t("account.profile.dragHint")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
        />
        <div className={cs.circleGuide} aria-hidden="true" />
      </div>
      <p className={cs.hint}>{t("account.profile.dragHint")}</p>
      <div className={cs.controls}>
        <button type="button" className={cs.iconBtn} onClick={rotate} aria-label={t("account.profile.rotate")}>
          <RotateIcon />
        </button>
        <input
          className={cs.slider}
          type="range"
          min={MIN_SCALE}
          max={MAX_SCALE}
          step={0.01}
          value={scale}
          onChange={onZoom}
          aria-label={t("account.profile.zoom")}
        />
      </div>
      <div className={cs.actions}>
        <Button variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" disabled={!img || !D} onClick={apply}>
          {t("account.profile.apply")}
        </Button>
      </div>
    </div>
  );
}
