import {
  forwardRef,
  useId,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
  type MutableRefObject,
} from "react";
import { cx } from "../admin/cx";
import styles from "./CodeInput.module.css";

export interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** 位数,默认 6。 */
  length?: number;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  /** 填满时回调(与内部 onChange 同帧)。 */
  onComplete?: (value: string) => void;
}

/**
 * 分格验证码输入:每位一个独立占位框,纯数字。
 * 自动前进 / 退格回退 / 方向键移动 / 支持整段粘贴自动分发。ref 指向第 1 格,便于弹窗初始聚焦。
 */
export const CodeInput = forwardRef<HTMLInputElement, CodeInputProps>(function CodeInput(
  { value, onChange, length = 6, label, ariaLabel, disabled, invalid, autoFocus, onComplete },
  extRef,
) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const id = useId();
  const groupLabel = ariaLabel ?? label ?? "";
  // 只保留数字并截断到位数,作为唯一事实来源(连续、无空洞)。
  const code = value.replace(/\D/g, "").slice(0, length);
  // 已填位数的"最新"值。自动前进时 focusBox() 会同步触发被聚焦框的 onFocus——
  // 若 onFocus 读渲染闭包里的 code.length(此刻仍是旧值),会把焦点弹回原框,导致
  // 数字被覆盖 / 不前进 / 退格删错框。commit 里即时更新此 ref 即可规避该竞态。
  const filledRef = useRef(code.length);
  filledRef.current = code.length;

  // 只聚焦、不选中:选中改由点击触发(见 onClick)。这样自动前进落焦到"已填满的末格"时
  // 光标停在末尾且不选中,多余按键被 maxLength 挡下,不会覆盖最后一位。
  const focusBox = (i: number) => {
    refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();
  };

  const commit = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, length);
    filledRef.current = clean.length; // 供紧随其后的 focusBox→onFocus 读到最新长度
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  };

  const handleInput = (i: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    // 单字符:替换本格;多字符(单框内粘贴):自本格起覆盖填入。
    const next =
      digits.length === 1
        ? code.slice(0, i) + digits + code.slice(i + 1)
        : code.slice(0, i) + digits;
    commit(next.slice(0, length));
    focusBox(i + digits.length);
  };

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // 多个输入框会屏蔽浏览器原生的隐式提交(回车无响应),这里显式请求所在表单提交,
      // 让"输完验证码按回车即验证"生效(表单 onSubmit 自行按完整性判断)。
      const form = e.currentTarget.form;
      if (form && typeof form.requestSubmit === "function") {
        e.preventDefault();
        form.requestSubmit();
      }
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      if (code[i]) {
        // 删本格(移除并左移),焦点留在本格。
        commit(code.slice(0, i) + code.slice(i + 1));
        focusBox(i);
      } else if (i > 0) {
        // 本格空:退到前一格并删其字符。
        commit(code.slice(0, i - 1) + code.slice(i));
        focusBox(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBox(i + 1);
    }
  };

  const handleFocus = (i: number) => {
    // 不允许在空洞之后落焦:跳回下一个待填格(用 filledRef 读最新长度,避免自动前进时被弹回)。
    if (i > filledRef.current) focusBox(filledRef.current);
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!digits) return;
    e.preventDefault();
    commit(digits);
    focusBox(Math.min(digits.length, length - 1));
  };

  return (
    <div className={styles.field}>
      {label && (
        <span className={styles.label} id={`${id}-label`}>
          {label}
        </span>
      )}
      <div
        className={styles.boxes}
        role="group"
        aria-label={groupLabel || undefined}
        aria-labelledby={label ? `${id}-label` : undefined}
        onPaste={handlePaste}
      >
        {Array.from({ length }).map((_, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
              if (i === 0) {
                if (typeof extRef === "function") extRef(el);
                else if (extRef) (extRef as MutableRefObject<HTMLInputElement | null>).current = el;
              }
            }}
            className={cx(styles.box, invalid && styles.invalid)}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            value={code[i] ?? ""}
            disabled={disabled}
            aria-label={`${groupLabel} ${i + 1}`.trim()}
            aria-invalid={invalid || undefined}
            // 首格 autoFocus 仅作兜底;弹窗内建议用 initialFocusRef 指向本组件 ref。
            autoFocus={autoFocus && i === 0}
            onChange={(e) => handleInput(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onFocus={() => handleFocus(i)}
            // 点击已填格时选中,便于直接改写(自动前进不触发,故不会覆盖末位)。
            onClick={(e) => e.currentTarget.select()}
          />
        ))}
      </div>
    </div>
  );
});
