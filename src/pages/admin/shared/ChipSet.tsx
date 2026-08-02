import { cx } from "../../../components/admin/cx";
import styles from "../Admin.module.css";

export interface ChipOption {
  value: string;
  label: string;
}

interface ChipSetProps {
  label: string;
  value: string;
  options: readonly ChipOption[];
  onChange: (value: string) => void;
}

/** 单选筛选条：一组互斥的 aria-pressed 按钮，比下拉少一次点击。 */
export function ChipSet({ label, value, options, onChange }: ChipSetProps) {
  return (
    <div className={styles.chipset} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cx(styles.chip, value === o.value && styles.chipOn)}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
