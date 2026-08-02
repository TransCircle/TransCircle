import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AdminButton as Button, Alert, Modal, TextField } from "../../../components/ui";
import { StepUpPanel } from "./StepUpPanel";
import { REASON_MIN_LENGTH } from "./constants";
import styles from "../Admin.module.css";

interface DangerDialogProps {
  title: string;
  subject: string;
  message: string;
  /** 影响面预告：不是「确定吗」，而是明写会切断几个站的 SSO、影响几个会话。 */
  impact?: ReactNode;
  confirmText?: string;
  /** 是否要二次验证；「必须填原因」逐端点定，不一刀切（api-delta §三）。 */
  needStepUp?: boolean;
  needReason?: boolean;
  busy?: boolean;
  error?: ReactNode;
  /** 后端返回 403 STEP_UP_REQUIRED 时由父级置真，就地升级。 */
  forceStepUp?: boolean;
  /** 额外表单（如设新密码），渲染在说明与原因之间。 */
  children?: ReactNode;
  /** 禁用确认（额外表单未填妥时）。 */
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/** 危险操作：影响面预告 + 按契约决定是否要原因 + 就地二次验证。 */
export function DangerDialog({
  title,
  subject,
  message,
  impact,
  confirmText,
  needStepUp,
  needReason,
  busy,
  error,
  forceStepUp,
  children,
  confirmDisabled,
  onCancel,
  onConfirm,
}: DangerDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [stepUp, setStepUp] = useState(false);

  useEffect(() => {
    if (forceStepUp) setStepUp(true);
  }, [forceStepUp]);

  const reasonOk = !needReason || reason.trim().length >= REASON_MIN_LENGTH;
  const ready = reasonOk && !confirmDisabled;

  return (
    <Modal
      open
      size="sm"
      closeOnOverlayClick={!stepUp && !busy}
      onClose={onCancel}
      title={title}
      description={subject}
      footer={
        stepUp ? null : (
          <>
            <Button variant="secondary" disabled={busy} onClick={onCancel}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              disabled={!ready}
              loading={busy}
              onClick={() => (needStepUp ? setStepUp(true) : onConfirm(reason))}
            >
              {confirmText ?? title}
            </Button>
          </>
        )
      }
    >
      <div className={styles.stackSm}>
        <p className={styles.bodyText}>{message}</p>
        {impact && <div className={styles.impact}>{impact}</div>}
        {children}
        {needReason && (
          <TextField
            label={t("admin.danger.reasonLabel", { min: REASON_MIN_LENGTH })}
            required
            value={reason}
            hint={t("admin.danger.reasonHint")}
            invalid={reason.length > 0 && !reasonOk}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
        {error && <Alert tone="error">{error}</Alert>}
        {stepUp && (
          <StepUpPanel
            what={t("admin.danger.stepUpWhat", { title, subject })}
            onVerified={() => onConfirm(reason)}
            onCancel={() => setStepUp(false)}
          />
        )}
      </div>
    </Modal>
  );
}
