import { useTranslation } from "react-i18next";
import { AdminButton as Button } from "../../../components/ui";
import styles from "../Admin.module.css";

interface SaveBarProps {
  count: number;
  /** 无改动时显示的静态说明（如「用户名、邮箱、验证态属风险项」）。 */
  hint?: string;
  /**
   * 卡片级硬门控。单靠给每个输入加 disabled 不可靠 ——
   * 组件是否真支持这个属性得逐个确认（RadioGroup 只认逐选项 disabled），
   * 所以保存这一层必须自己再挡一道。
   */
  disabled?: boolean;
  onReset: () => void;
  onSave: () => void;
}

/** 分区级保存条：每块自己保存，不用全局浮条。 */
export function SaveBar({ count, hint, disabled, onReset, onSave }: SaveBarProps) {
  const { t } = useTranslation();
  const active = !disabled && count > 0;
  return (
    <div className={styles.savebar}>
      <span className={styles.savebarHint}>
        {active ? t("admin.save.pending", { count }) : (hint ?? "")}
      </span>
      <Button variant="ghost" size="sm" disabled={!active} onClick={onReset}>
        {t("admin.save.discard")}
      </Button>
      <Button variant="primary" size="sm" disabled={!active} onClick={onSave}>
        {t("common.save")}
      </Button>
    </div>
  );
}
