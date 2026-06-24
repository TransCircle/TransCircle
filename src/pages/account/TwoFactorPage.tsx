import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { TotpStatus, TotpSetup } from "../../api/types";
import { useSession } from "../../context/SessionContext";
import {
  Card,
  PageHeader,
  SectionLabel,
  TextField,
  AdminButton as Button,
  Alert,
  Spinner,
  StatusBadge,
  Modal,
} from "../../components/ui";
import page from "../Page.module.css";
import s from "./Account.module.css";
import sec from "./Security.module.css";

/** 两步验证（TOTP）+ 恢复码。契约修正：setup 返回 setupId/qrCodeImage，enable 需 {setupId,code}。 */
const TwoFactorPage = () => {
  const { t } = useTranslation();
  const { user } = useSession();
  const [status, setStatus] = useState<TotpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  // 停用 / 重新生成对话框
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenCode, setRegenCode] = useState("");

  const load = async () => {
    setLoading(true);
    const res = await api.get<TotpStatus>("/v1/me/mfa/totp");
    setStatus(res.ok ? res.data : { totpEnabled: false, enabledAt: null, lastUsedAt: null, remainingRecoveryCodes: 0 });
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const startSetup = async () => {
    setError(null);
    setBusy(true);
    const res = await api.post<TotpSetup>("/v1/me/mfa/totp/setup");
    if (res.ok) setSetup(res.data);
    else setError(res.error.message);
    setBusy(false);
  };

  const enable = async (e: FormEvent) => {
    e.preventDefault();
    if (!setup) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ recoveryCodes?: string[] }>("/v1/me/mfa/totp/enable", { setupId: setup.setupId, code });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setRecoveryCodes(res.data?.recoveryCodes ?? null);
      setNotice(t("account.twoFactor.enabledOk"));
      setSetup(null);
      setCode("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = { code: disableCode };
      if (user?.passwordSet) body.password = disablePassword;
      const res = await api.del("/v1/me/mfa/totp", body);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setNotice(t("account.twoFactor.disabledOk"));
      setRecoveryCodes(null);
      setDisableOpen(false);
      setDisableCode("");
      setDisablePassword("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ recoveryCodes?: string[] }>("/v1/me/mfa/recovery-codes/regenerate", { code: regenCode });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setRecoveryCodes(res.data?.recoveryCodes ?? null);
      setNotice(t("account.twoFactor.regenerated"));
      setRegenOpen(false);
      setRegenCode("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const copyCodes = () => {
    if (recoveryCodes) void navigator.clipboard?.writeText(recoveryCodes.join("\n"));
  };
  const downloadCodes = () => {
    if (!recoveryCodes) return;
    const blob = new Blob([recoveryCodes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcircle-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className={`${page.page} ${page.pageNarrow}`}>
        <PageHeader title={t("account.twoFactor.title")} description={t("account.twoFactor.subtitle")} />
        <Spinner size="lg" label={t("common.loading")} />
      </div>
    );
  }

  const enabled = !!status?.totpEnabled;

  return (
    <div className={`${page.page} ${page.pageNarrow}`}>
      <PageHeader title={t("account.twoFactor.title")} description={t("account.twoFactor.subtitle")} />
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Card>
        <div className={s.cardHead}>
          <SectionLabel className={s.cardHeadLabel}>{t("account.twoFactor.status")}</SectionLabel>
          <StatusBadge
            tone={enabled ? "green" : "neutral"}
            label={enabled ? t("account.twoFactor.enabled") : t("account.twoFactor.disabled")}
          />
        </div>

        {!enabled && !setup && (
          <div className={s.actions}>
            <Button variant="primary" loading={busy} onClick={() => void startSetup()}>
              {t("account.twoFactor.setup")}
            </Button>
          </div>
        )}

        {!enabled && setup && (
          <form className={sec.section} onSubmit={enable}>
            <p className={s.muted}>{t("account.twoFactor.scanQr")}</p>
            {setup.qrCodeImage && <img src={setup.qrCodeImage} alt="TOTP QR" className={sec.qr} width={200} height={200} />}
            <div className={sec.secretLine}>
              <span className={s.muted}>{t("account.twoFactor.secretLabel")}</span>
              <code className={page.code}>{setup.secret}</code>
            </div>
            <TextField
              label={t("account.twoFactor.enterCode")}
              className={sec.codeInput}
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <div className={sec.centerActions}>
              <Button type="submit" variant="primary" loading={busy}>
                {t("account.twoFactor.enable")}
              </Button>
            </div>
          </form>
        )}

        {enabled && (
          <>
            <p className={s.muted}>{t("account.twoFactor.remainingCodes", { count: status?.remainingRecoveryCodes ?? 0 })}</p>
            <div className={s.actions}>
              <Button variant="secondary" onClick={() => setRegenOpen(true)}>
                {t("account.twoFactor.regenerate")}
              </Button>
              <Button variant="danger" onClick={() => setDisableOpen(true)}>
                {t("account.twoFactor.disable")}
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* 恢复码展示 */}
      <Modal
        open={!!recoveryCodes}
        onClose={() => setRecoveryCodes(null)}
        title={t("account.twoFactor.recoveryTitle")}
        description={t("account.twoFactor.recoveryHint")}
        footer={
          <>
            <Button variant="secondary" onClick={copyCodes}>{t("common.copy")}</Button>
            <Button variant="secondary" onClick={downloadCodes}>{t("common.download")}</Button>
            <Button variant="primary" onClick={() => setRecoveryCodes(null)}>{t("common.close")}</Button>
          </>
        }
      >
        <ul className={`${sec.recoveryCodes} ${s.codeList}`}>
          {(recoveryCodes ?? []).map((c) => (
            <li key={c} className={s.codeItem}>{c}</li>
          ))}
        </ul>
      </Modal>

      {/* 重新生成恢复码 */}
      <Modal
        open={regenOpen}
        onClose={() => setRegenOpen(false)}
        title={t("account.twoFactor.regenerateTitle")}
        description={t("account.twoFactor.regenerateMessage")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRegenOpen(false)}>{t("common.cancel")}</Button>
            <Button variant="primary" loading={busy} disabled={!regenCode} onClick={() => void regenerate()}>{t("common.confirm")}</Button>
          </>
        }
      >
        <TextField
          label={t("account.twoFactor.disableCodeLabel")}
          autoComplete="one-time-code"
          value={regenCode}
          onChange={(e) => setRegenCode(e.target.value)}
        />
      </Modal>

      {/* 停用 2FA */}
      <Modal
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        title={t("account.twoFactor.disableTitle")}
        description={t("account.twoFactor.disableMessage")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDisableOpen(false)}>{t("common.cancel")}</Button>
            <Button variant="danger" loading={busy} disabled={!disableCode} onClick={() => void disable()}>{t("account.twoFactor.disable")}</Button>
          </>
        }
      >
        <div className={s.form}>
          <TextField
            label={t("account.twoFactor.disableCodeLabel")}
            autoComplete="one-time-code"
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
          />
          {user?.passwordSet && (
            <TextField
              label={t("account.twoFactor.passwordLabel")}
              type="password"
              autoComplete="current-password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
            />
          )}
        </div>
      </Modal>
    </div>
  );
};

export default TwoFactorPage;
