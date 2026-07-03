import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminButton as Button, Alert } from "../../components/ui";
import { Dialog } from "../../components/ui/Dialog";
import s from "./Account.module.css";
import sec from "./Security.module.css";

interface RecoveryCodesDialogProps {
  /** 非空即展示；为 null 时隐藏。 */
  codes: string[] | null;
  onDismiss: () => void;
}

/**
 * 恢复码一次性展示对话框（TOTP 启用 / Passkey 首次注册 / 重新生成共用）。
 * 服务端已生效且不可再取：禁止背景/Esc 关闭、无关闭按钮，唯一出口是「我已保存」。
 */
export function RecoveryCodesDialog({ codes, onDismiss }: RecoveryCodesDialogProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const copyCodes = async () => {
    if (!codes) return;
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard 不可用（非安全上下文/权限拒绝）：给出可见提示而非静默失败。
      setCopyFailed(true);
    }
  };

  const downloadCodes = () => {
    if (!codes) return;
    const blob = new Blob([codes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcircle-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const dismiss = () => {
    setCopied(false);
    setCopyFailed(false);
    onDismiss();
  };

  return (
    <Dialog
      open={!!codes}
      onClose={() => {}}
      title={t("account.recoveryCodes.title")}
      description={t("account.recoveryCodes.hint")}
      dismissOnBackdrop={false}
      dismissOnEsc={false}
      showClose={false}
      footer={
        <>
          <Button variant="secondary" onClick={() => void copyCodes()}>
            {copied ? t("common.copied") : t("common.copy")}
          </Button>
          <Button variant="secondary" onClick={downloadCodes}>
            {t("common.download")}
          </Button>
          <Button variant="primary" onClick={dismiss}>
            {t("account.recoveryCodes.saved")}
          </Button>
        </>
      }
    >
      {copyFailed && <Alert tone="error">{t("account.recoveryCodes.copyFailed")}</Alert>}
      <ul className={`${sec.recoveryCodes} ${s.codeList}`}>
        {(codes ?? []).map((c) => (
          <li key={c} className={s.codeItem}>
            {c}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
