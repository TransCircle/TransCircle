import { useEffect, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { isNonEmptyString } from "../api/shape";
import type { StepUpStart } from "../api/types";
import { performAssertion } from "../utils/webauthn";
import { RadioGroup, TextField, AdminButton as Button, Alert, Spinner } from "./ui";
import { Dialog } from "./ui/Dialog";
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
  // start 失败后的重试计数：递增即重跑下方 effect 重新发起 challenge。
  const [startAttempt, setStartAttempt] = useState(0);

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
    setError(null);
    void (async () => {
      const res = await api.post<StepUpStart>("/v1/auth/step-up/start");
      if (!alive) return;
      if (!res.ok) {
        setError(res.error.message);
        setLoading(false);
        return;
      }
      // 2xx ≠ 响应成形。`res.data` 是 `{}` 时，下一行读 `availableMethods[0]` 直接抛 ——
      // 而抛点在 `setLoading(false)` 之前，弹窗就此**永久转圈**，用户既没有错误提示、
      // 也没有重试入口，只能整页刷新。
      if (!isNonEmptyString(res.data?.challengeId) || !Array.isArray(res.data?.availableMethods)) {
        setError(t("stepUp.failed"));
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
  }, [open, startAttempt]);

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

  // 输入框 Enter 直接提交，与点击「验证」等价（禁用条件也一致）。
  const submitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && secret && !busy) {
      e.preventDefault();
      void verify();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      title={t("stepUp.title")}
      description={t("stepUp.subtitle")}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
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
          {/* start 失败时没有 challenge，页脚「验证」钮永久禁用——给出重试出口。 */}
          {error && !challenge && (
            <Button variant="secondary" onClick={() => setStartAttempt((n) => n + 1)}>
              {t("common.retry")}
            </Button>
          )}
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
              onKeyDown={submitOnEnter}
            />
          )}
          {(method === "totp" || method === "recovery_code") && (
            <TextField
              label={t("stepUp.codeLabel")}
              autoComplete="one-time-code"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={submitOnEnter}
            />
          )}
          {method === "passkey" && <p className={styles.hint}>{t("stepUp.passkeyPrompt")}</p>}
        </div>
      )}
    </Dialog>
  );
}
