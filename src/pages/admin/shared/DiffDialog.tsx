import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AdminButton as Button, Alert, Modal } from "../../../components/ui";
import { StepUpPanel } from "./StepUpPanel";
import type { FieldChange } from "./useCardEdit";
import styles from "../Admin.module.css";

interface DiffDialogProps {
  subject: string;
  changes: readonly FieldChange[];
  busy?: boolean;
  error?: ReactNode;
  /** 服务端判定必须二次验证（403 STEP_UP_REQUIRED）时置真，就地升级而不是报错。 */
  forceStepUp?: boolean;
  onCancel: () => void;
  onCommit: () => void;
}

/**
 * 保存确认框：先看清改了什么，再按风险决定要不要二次验证。
 *
 * 二次验证是**同一个对话框内的一层覆盖**，不是新弹窗 —— 见 StepUpPanel 的说明。
 */
export function DiffDialog({
  subject,
  changes,
  busy,
  error,
  forceStepUp,
  onCancel,
  onCommit,
}: DiffDialogProps) {
  const { t } = useTranslation();
  const [stepUp, setStepUp] = useState(false);
  const risky = changes.some((c) => c.risky);

  useEffect(() => {
    if (forceStepUp) setStepUp(true);
  }, [forceStepUp]);

  const riskyLabels = changes
    .filter((c) => c.risky)
    .map((c) => c.label)
    .join("、");

  const text = (v: string) => v || t("admin.save.emptyValue");

  return (
    <Modal
      open
      size="md"
      // 二次验证进行中不许点遮罩关掉：正在等外部验证，误关等于白验一次。
      closeOnOverlayClick={!stepUp && !busy}
      onClose={onCancel}
      title={t("admin.save.confirmTitle")}
      description={subject}
      footer={
        stepUp ? null : (
          <>
            <Button variant="secondary" disabled={busy} onClick={onCancel}>
              {t("admin.save.backToEdit")}
            </Button>
            <Button
              variant={risky ? "danger" : "primary"}
              loading={busy}
              onClick={() => (risky ? setStepUp(true) : onCommit())}
            >
              {risky ? t("admin.save.verifyAndSave") : t("admin.save.saveN", { count: changes.length })}
            </Button>
          </>
        )
      }
    >
      <div className={styles.stackSm}>
        <div className={styles.diff}>
          {changes.map((c) => (
            <Fragment key={c.key}>
              <span className={styles.diffKey}>{c.label}</span>
              <span className={styles.diffVal}>
                <span className={styles.diffOld}>{text(c.fromText)}</span>
                {" → "}
                <span className={styles.diffNew}>{text(c.toText)}</span>
              </span>
            </Fragment>
          ))}
        </div>
        <p className={styles.note}>{t("admin.save.atomicNote")}</p>
        {risky && !stepUp && (
          <div className={styles.impact}>{t("admin.save.riskyNote", { fields: riskyLabels })}</div>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        {stepUp && (
          <StepUpPanel
            what={t("admin.save.stepUpWhat", { subject, count: changes.length })}
            onVerified={onCommit}
            onCancel={() => setStepUp(false)}
          />
        )}
      </div>
    </Modal>
  );
}
