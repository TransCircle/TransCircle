import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { StepUpStart } from "../api/types";
import { performAssertion } from "../utils/webauthn";
import { Modal, RadioGroup, TextField, AdminButton as Button, Alert, Spinner } from "./ui";
import styles from "./StepUpDialog.module.css";

type Method = "password" | "totp" | "recovery_code" | "passkey";

interface StepUpDialogProps {
  open: boolean;
  onClose: () => void;
  onVerified: () => void;
}

/**
 * C 端二次验证对话框（password / totp / recovery_code / passkey）。
 * POST /v1/auth/step-up/start → 选择方式验证 → POST /v1/auth/step-up/verify。
 * 验证通过后调用 onVerified（调用方据此重试需 step-up 的敏感操作）。
 */
export function StepUpDialog({ open, onClose, onVerified }: StepUpDialogProps) {
  const { t } = useTranslation();
  const [challenge, setChallenge] = useState<StepUpStart | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setChallenge(null);
      setMethod(null);
      setSecret("");
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    void (async () => {
      const res = await api.post<StepUpStart>("/v1/auth/step-up/start");
      if (!alive) return;
      if (!res.ok) {
        setError(res.error.message);
        setLoading(false);
        return;
      }
      setChallenge(res.data);
      setMethod(res.data.availableMethods[0] ?? null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  const verify = async () => {
    if (!challenge || !method) return;
    setError(null);
    setBusy(true);
    try {
      let body: Record<string, unknown> = { challengeId: challenge.challengeId, method };
      if (method === "password") {
        body = { ...body, password: secret };
      } else if (method === "totp" || method === "recovery_code") {
        body = { ...body, code: secret };
      } else if (method === "passkey") {
        if (!challenge.passkey) {
          setError(t("stepUp.failed"));
          return;
        }
        const credential = await performAssertion(
          challenge.passkey.publicKey as Parameters<typeof performAssertion>[0],
        );
        body = { ...body, credential };
      }
      const res = await api.post("/v1/auth/step-up/verify", body);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      onVerified();
      onClose();
    } catch (err) {
      if ((err as DOMException)?.name !== "NotAllowedError") setError(t("stepUp.failed"));
    } finally {
      setBusy(false);
    }
  };

  const methodOptions = (challenge?.availableMethods ?? []).map((m) => ({
    value: m,
    label: t(`stepUp.method.${m}`),
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("stepUp.title")}
      description={t("stepUp.subtitle")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {method === "passkey" ? (
            <Button variant="primary" loading={busy} onClick={() => void verify()}>
              {t("stepUp.passkeyVerify")}
            </Button>
          ) : (
            <Button variant="primary" loading={busy} disabled={!secret} onClick={() => void verify()}>
              {t("stepUp.verify")}
            </Button>
          )}
        </>
      }
    >
      {loading ? (
        <Spinner size="md" label={t("common.loading")} />
      ) : (
        <div className={styles.body}>
          {error && <Alert tone="error">{error}</Alert>}
          {methodOptions.length > 1 && (
            <RadioGroup
              label={t("stepUp.chooseMethod")}
              options={methodOptions}
              value={method}
              onChange={(v) => {
                setMethod(v as Method);
                setSecret("");
              }}
            />
          )}
          {method === "password" && (
            <TextField
              label={t("stepUp.passwordLabel")}
              type="password"
              autoComplete="current-password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          )}
          {(method === "totp" || method === "recovery_code") && (
            <TextField
              label={t("stepUp.codeLabel")}
              autoComplete="one-time-code"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          )}
          {method === "passkey" && <p className={styles.hint}>{t("stepUp.passkeyPrompt")}</p>}
        </div>
      )}
    </Modal>
  );
}
