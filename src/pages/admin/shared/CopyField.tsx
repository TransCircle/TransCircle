import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminButton as Button } from "../../../components/ui";
import styles from "../Admin.module.css";

/** 只读值 + 复制按钮。复制结果经 aria-live 播报，不靠颜色或短暂的图标变化。 */
export function CopyField({ value, ariaLabel }: { value: string; ariaLabel: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("ok");
    } catch {
      setState("fail");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1600);
  };

  return (
    <div className={styles.copyfield}>
      <code>{value}</code>
      <Button variant="ghost" size="sm" aria-label={ariaLabel} onClick={() => void copy()}>
        <span aria-live="polite">
          {state === "ok" ? t("common.copied") : state === "fail" ? t("common.copyFailed") : t("common.copy")}
        </span>
      </Button>
    </div>
  );
}
