import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { TotpStatus, TotpSetup } from "../../api/types";
import { useSession } from "../../context/SessionContext";
import { usePageTitle } from "../../utils/usePageTitle";
import {
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
  const [loadFailed, setLoadFailed] = useState(false);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  // 停用 / 重新生成对话框（错误就近渲染在各自模态内，不写页面顶部）
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableError, setDisableError] = useState<string | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenCode, setRegenCode] = useState("");
  const [regenError, setRegenError] = useState<string | null>(null);

  usePageTitle(t("account.nav.twoFactor"));

  const load = async () => {
    setLoading(true);
    setLoadFailed(false);
    const res = await api.get<TotpStatus>("/v1/me/mfa/totp");
    // 状态接口失败时显式呈现错误 + 重试，不再伪装成「未启用」。
    if (res.ok) setStatus(res.data);
    else {
      setStatus(null);
      setLoadFailed(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(
    () => () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const startSetup = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    const res = await api.post<TotpSetup>("/v1/me/mfa/totp/setup");
    if (res.ok) setSetup(res.data);
    else setError(res.error.message);
    setBusy(false);
  };

  const cancelSetup = () => {
    setSetup(null);
    setCode("");
    setError(null);
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
    setDisableError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = { code: disableCode };
      if (user?.passwordSet) body.password = disablePassword;
      const res = await api.del("/v1/me/mfa/totp", body);
      if (!res.ok) {
        // 失败不关模态：错误显示在模态内，用户可直接改验证码重试。
        setDisableError(res.error.message);
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
    setRegenError(null);
    setBusy(true);
    try {
      const res = await api.post<{ recoveryCodes?: string[] }>("/v1/me/mfa/recovery-codes/regenerate", { code: regenCode });
      if (!res.ok) {
        setRegenError(res.error.message);
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

  const copyCodes = async () => {
    if (!recoveryCodes) return;
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setCopied(true);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard 不可用（非安全上下文/权限拒绝）：给出可见提示而非静默失败。
      setCopyFailed(true);
    }
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

  const dismissRecovery = () => {
    setRecoveryCodes(null);
    setCopied(false);
    setCopyFailed(false);
  };

  if (loading) {
    return (
      <div className={`${page.page} ${page.pageNarrow}`}>
        <PageHeader title={t("account.twoFactor.title")} description={t("account.twoFactor.subtitle")} />
        <Spinner size="lg" label={t("common.loading")} />
      </div>
    );
  }

  // 仅在无待展示恢复码时才让状态拉取失败屏抢占渲染:enable()/regenerate() 已拿到
  // 一次性恢复码后紧跟的 load() 若瞬时失败(500/限流/网络抖动),不能吞掉恢复码 Modal——
  // 那些码服务端已生效且不可再取,必须先让用户保存,dismiss 后再回落到失败重试屏。
  if (loadFailed && !recoveryCodes) {
    return (
      <div className={`${page.page} ${page.pageNarrow}`}>
        <PageHeader title={t("account.twoFactor.title")} description={t("account.twoFactor.subtitle")} />
        <section className={s.sectionFirst}>
          <div className={s.stackSm}>
            <Alert tone="error">{t("account.twoFactor.loadFailed")}</Alert>
            <div className={s.actions}>
              <Button variant="secondary" onClick={() => void load()}>
                {t("common.retry")}
              </Button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const enabled = !!status?.totpEnabled;

  return (
    <div className={`${page.page} ${page.pageNarrow}`}>
      <PageHeader title={t("account.twoFactor.title")} description={t("account.twoFactor.subtitle")} />
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <section className={s.sectionFirst}>
        <div className={s.sectionHead}>
          <SectionLabel className={s.sectionHeadLabel}>{t("account.twoFactor.status")}</SectionLabel>
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

        {enabled && (
          <div className={s.stackSm}>
            <p className={s.muted}>{t("account.twoFactor.remainingCodes", { count: status?.remainingRecoveryCodes ?? 0 })}</p>
            <div className={s.actions}>
              <Button variant="secondary" onClick={() => { setRegenError(null); setRegenCode(""); setRegenOpen(true); }}>
                {t("account.twoFactor.regenerate")}
              </Button>
              <Button variant="danger" onClick={() => { setDisableError(null); setDisableCode(""); setDisablePassword(""); setDisableOpen(true); }}>
                {t("account.twoFactor.disable")}
              </Button>
            </div>
          </div>
        )}
      </section>

      {!enabled && setup && (
        <section className={s.section}>
          <SectionLabel>{t("account.twoFactor.setupTitle")}</SectionLabel>
          <form className={`${s.form} ${s.formNarrow}`} onSubmit={enable}>
            <p className={s.muted}>{t("account.twoFactor.scanQr")}</p>
            {setup.qrCodeImage && (
              <img
                src={setup.qrCodeImage}
                alt={t("account.twoFactor.qrAlt")}
                className={sec.qr}
                width={200}
                height={200}
              />
            )}
            <p className={sec.secretLine}>
              <span>{t("account.twoFactor.secretLabel")}</span>{" "}
              <code className={page.code}>{setup.secret}</code>
            </p>
            <TextField
              label={t("account.twoFactor.enterCode")}
              fieldClassName={sec.codeField}
              className={sec.codeInput}
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <div className={s.actions}>
              <Button type="submit" variant="primary" loading={busy}>
                {t("account.twoFactor.enable")}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={cancelSetup}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* 恢复码展示：不可点遮罩误关，需显式确认已保存 */}
      <Modal
        open={!!recoveryCodes}
        onClose={dismissRecovery}
        title={t("account.twoFactor.recoveryTitle")}
        description={t("account.twoFactor.recoveryHint")}
        closeOnOverlayClick={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => void copyCodes()}>
              {copied ? t("common.copied") : t("common.copy")}
            </Button>
            <Button variant="secondary" onClick={downloadCodes}>{t("common.download")}</Button>
            <Button variant="primary" onClick={dismissRecovery}>{t("account.twoFactor.savedCodes")}</Button>
          </>
        }
      >
        {copyFailed && <Alert tone="error">{t("account.twoFactor.copyFailed")}</Alert>}
        <ul className={`${sec.recoveryCodes} ${s.codeList}`}>
          {(recoveryCodes ?? []).map((c) => (
            <li key={c} className={s.codeItem}>{c}</li>
          ))}
        </ul>
      </Modal>

      {/* 重新生成恢复码（仅接受 6 位验证码） */}
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
        {regenError && <Alert tone="error">{regenError}</Alert>}
        <TextField
          label={t("account.twoFactor.codeLabel")}
          inputMode="numeric"
          maxLength={6}
          autoComplete="one-time-code"
          value={regenCode}
          onChange={(e) => setRegenCode(e.target.value)}
        />
      </Modal>

      {/* 停用 2FA（验证码或恢复码均可，故不限定数字键盘/长度） */}
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
          {disableError && <Alert tone="error">{disableError}</Alert>}
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
