import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "../api/client";
import { Modal, AdminButton as Button, Alert, Spinner } from "./ui";
import type { AdminStepUpStart } from "../api/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onVerified: () => void;
}

/**
 * 管理台 step-up（IAM 代理 2FA）对话框。
 * 打开时 POST /v1/admin/step-up/iam/start → 在新标签打开 verifyUrl，
 * 之后每 3s 轮询 /v1/admin/step-up/iam/poll，验证通过即回调 onVerified。
 */
const AdminStepUpDialog = ({ open, onClose, onVerified }: Props) => {
  const { t } = useTranslation();
  const [info, setInfo] = useState<AdminStepUpStart | null>(null);
  const [starting, setStarting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  // 打开时发起验证请求并跳转 IAM。
  useEffect(() => {
    if (!open) {
      startedRef.current = false;
      setInfo(null);
      setError(null);
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      setStarting(true);
      setError(null);
      const res = await adminApi.post<AdminStepUpStart>("/v1/admin/step-up/iam/start");
      setStarting(false);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setInfo(res.data);
    })();
  }, [open]);

  const poll = async (silent = false): Promise<void> => {
    if (!info) return;
    if (!silent) setPolling(true);
    const res = await adminApi.post<{ verified: boolean }>("/v1/admin/step-up/iam/poll", {
      verificationId: info.verificationId,
    });
    if (!silent) setPolling(false);
    if (res.ok && res.data.verified) {
      onVerified();
      onClose();
      return;
    }
    if (!silent && (!res.ok || !res.data.verified)) {
      setError(res.ok ? t("stepUp.failed") : res.error.message);
    }
  };

  // 自动轮询（每 3s）。
  useEffect(() => {
    if (!open || !info) return;
    const id = window.setInterval(() => void poll(true), 3000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, info]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("stepUp.adminTitle")}
      description={t("stepUp.adminPrompt")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" loading={polling} disabled={!info} onClick={() => void poll()}>
            {t("stepUp.adminPoll")}
          </Button>
        </>
      }
    >
      {starting && <Spinner label={t("common.loading")} />}
      {info && !error && (
        <>
          {/* 用户手势点击打开，避免浏览器拦截弹窗 */}
          <Button
            variant="primary"
            onClick={() => window.open(info.verifyUrl, "_blank", "noopener,noreferrer")}
          >
            {t("stepUp.adminStart")}
          </Button>
          <p>{t("stepUp.adminWaiting")}</p>
        </>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </Modal>
  );
};

export default AdminStepUpDialog;
