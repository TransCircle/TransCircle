import { useCallback, useRef } from "react";
import styles from "./SegmentedControl.module.css";

export interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

export const SegmentedControl = <T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) => {
  const refs = useRef<HTMLButtonElement[]>([]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      let next: number;
      switch (e.key) {
        case "ArrowLeft":
        case "ArrowUp":
          next = index > 0 ? index - 1 : options.length - 1;
          break;
        case "ArrowRight":
        case "ArrowDown":
          next = index < options.length - 1 ? index + 1 : 0;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = options.length - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      const target = options[next];
      if (!target) return;
      onChange(target.value);
      refs.current[next]?.focus();
    },
    [options, onChange],
  );

  return (
    <div className={styles.root} role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt, index) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              if (el) refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            className={`${styles.option} ${isActive ? styles.active : ""}`}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
