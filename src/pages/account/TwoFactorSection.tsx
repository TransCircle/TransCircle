import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { TotpStatus, TotpSetup } from "../../api/types";
import { useSession } from "../../context/SessionContext";
import {
  Card,
  TextField,
  AdminButton as Button,
  Alert,
  Spinner,
  StatusBadge,
} from "../../components/ui";
import { Dialog } from "../../components/ui/Dialog";
import { CodeInput } from "../../components/ui/CodeInput";
import { cx } from "../../components/admin/cx";
import { RecoveryCodesDialog } from "./RecoveryCodesDialog";
import s from "./Account.module.css";
import sec from "./Security.module.css";

const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/** 两步验证（TOTP）+ 恢复码分区。契约:setup 返回 setupId/qrCodeImage,enable 需 {setupId,code}。 */
export function TwoFactorSection() {
  const { t } = useTranslation();
  const { user, refresh } = useSession();
  const [status, setStatus] = useState<TotpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 启用时一次性下发的恢复码（共享备份；后续管理在「恢复码」分区）。
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  // 密钥默认隐藏,由「无法扫描」主动展开;复制反馈短暂显示。
  const [showSecret, setShowSecret] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  const secretCopiedTimer = useRef<number | null>(null);
  const secretBoxRef = useRef<HTMLElement>(null);

  // 停用对话框（错误就近渲染在弹窗内,不写分区顶部）
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableError, setDisableError] = useState<string | null>(null);
  const disableRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    setLoadFailed(false);
    const res = await api.get<TotpStatus>("/v1/me/mfa/totp");
    // 状态接口失败时显式呈现错误 + 重试,不再伪装成「未启用」。
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
      if (secretCopiedTimer.current !== null) window.clearTimeout(secretCopiedTimer.current);
    },
    [],
  );

  // 展开的密钥尽量在一行内完整显示(不省略任何字符):测量后按比例收敛字号,窗口尺寸变化时重算。
  // 用 useLayoutEffect 在 paint 前完成收敛,避免长密钥先以基础字号溢出被裁一帧再回缩的闪烁。
  useLayoutEffect(() => {
    const el = secretBoxRef.current;
    if (!showSecret || !el) return;
    const fit = () => {
      el.style.fontSize = "";
      const base = parseFloat(getComputedStyle(el).fontSize) || 14;
      if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth) {
        const size = Math.max(9, Math.floor(base * (el.clientWidth / el.scrollWidth) - 0.5));
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [showSecret, setup?.secret]);

  const startSetup = async () => {
    setError(null);
    setNotice(null);
    setShowSecret(false);
    setSecretCopied(false);
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
    setShowSecret(false);
    setSecretCopied(false);
  };

  const copySecret = async () => {
    if (!setup?.secret) return;
    try {
      await navigator.clipboard.writeText(setup.secret);
      setSecretCopied(true);
      if (secretCopiedTimer.current !== null) window.clearTimeout(secretCopiedTimer.current);
      secretCopiedTimer.current = window.setTimeout(() => setSecretCopied(false), 2000);
    } catch {
      // 静默:密钥已可见,用户可手动选中复制。
    }
  };

  const enable = async () => {
    if (!setup || busy) return; // 防 Enter 连击对同一 setupId 重复 enable
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ recoveryCodes?: string[] }>("/v1/me/mfa/totp/enable", { setupId: setup.setupId, code });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      const newCodes = res.data?.recoveryCodes?.length ? res.data.recoveryCodes : null;
      setRecoveryCodes(newCodes);
      setNotice(t("account.twoFactor.enabledOk"));
      setSetup(null);
      setCode("");
      await load();
      // 有一次性恢复码时,把会话刷新推迟到用户「我已保存」关闭弹窗之后(见 RecoveryCodesDialog onDismiss)：
      // refresh() 若瞬时失败会清空会话→跳登录→弹窗卸载,恢复码永久丢失。无码时(已有其它 2FA)才立即同步。
      if (!newCodes) await refresh();
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (busy) return; // 防 Enter 连击重复提交
    setDisableError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = { code: disableCode };
      if (user?.passwordSet) body.password = disablePassword;
      const res = await api.del("/v1/me/mfa/totp", body);
      if (!res.ok) {
        // 失败不关弹窗:错误显示在弹窗内,用户可直接改验证码重试。
        setDisableError(res.error.message);
        return;
      }
      setNotice(t("account.twoFactor.disabledOk"));
      setRecoveryCodes(null);
      setDisableOpen(false);
      setDisableCode("");
      setDisablePassword("");
      await load();
      // 同步会话资料（security.totpEnabled）→ 「恢复码」分区随之更新/隐藏。
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const enabled = !!status?.totpEnabled;

  return (
    <section className={s.group}>
      <h2 className={s.groupTitle}>{t("account.nav.twoFactor")}</h2>
      {(error || notice) && (
        <div className={s.groupFeedback}>
          {error && <Alert tone="error">{error}</Alert>}
          {notice && <Alert tone="success">{notice}</Alert>}
        </div>
      )}

      {loading ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : loadFailed && !recoveryCodes ? (
        // 仅在无待展示恢复码时才让状态拉取失败屏抢占渲染:enable()/regenerate() 已拿到
        // 一次性恢复码后紧跟的 load() 若瞬时失败(500/限流/网络抖动),不能吞掉恢复码弹窗——
        // 那些码服务端已生效且不可再取,必须先让用户保存,dismiss 后再回落到失败重试屏。
        <div className={s.stackSm}>
          <Alert tone="error">{t("account.twoFactor.loadFailed")}</Alert>
          <div className={s.actions}>
            <Button variant="secondary" onClick={() => void load()}>
              {t("common.retry")}
            </Button>
          </div>
        </div>
      ) : (
        <Card padding="none">
          <ul className={s.list}>
            <li className={s.listRow}>
              <div className={s.rowMain}>
                <div className={s.rowText}>
                  <span className={s.rowTitle}>
                    {t("account.twoFactor.status")}
                    <StatusBadge
                      size="sm"
                      tone={enabled ? "green" : "neutral"}
                      label={enabled ? t("account.twoFactor.enabled") : t("account.twoFactor.disabled")}
                    />
                  </span>
                  <span className={s.rowMeta}>
                    <span>{t("account.twoFactor.subtitle")}</span>
                  </span>
                </div>
              </div>
              <div className={s.rowActions}>
                {enabled ? (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setDisableError(null);
                      setDisableCode("");
                      setDisablePassword("");
                      setDisableOpen(true);
                    }}
                  >
                    {t("account.twoFactor.disable")}
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" loading={busy} onClick={() => void startSetup()}>
                    {t("account.twoFactor.setup")}
                  </Button>
                )}
              </div>
            </li>
          </ul>
        </Card>
      )}

      {/* TOTP 配置:扫码 + 输入 6 位验证码启用。取消 = cancelSetup,提交 = enable。 */}
      <Dialog
        open={!!setup}
        onClose={cancelSetup}
        busy={busy}
        title={t("account.twoFactor.setupTitle")}
        initialFocusRef={codeRef}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={cancelSetup}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" loading={busy} disabled={code.length !== 6} onClick={() => void enable()}>
              {t("account.twoFactor.enable")}
            </Button>
          </>
        }
      >
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) void enable();
          }}
        >
          {error && <Alert tone="error">{error}</Alert>}
          <p className={s.muted}>{t("account.twoFactor.scanQr")}</p>
          {setup?.qrCodeImage && (
            <div className={sec.qrWrap}>
              <img src={setup.qrCodeImage} alt={t("account.twoFactor.qrAlt")} className={sec.qr} width={200} height={200} />
            </div>
          )}
          {/* 密钥默认隐藏,点「无法扫描」再展开,并提供复制按钮。 */}
          {showSecret ? (
            <div className={sec.secretReveal}>
              <span className={sec.secretRevealLabel}>{t("account.twoFactor.secretLabel")}</span>
              <code ref={secretBoxRef} className={sec.secretBox}>{setup?.secret}</code>
              <button
                type="button"
                className={cx(sec.copyBtn, secretCopied && sec.copyBtnDone)}
                aria-label={secretCopied ? t("common.copied") : t("common.copy")}
                onClick={() => void copySecret()}
              >
                {secretCopied ? <CheckIcon /> : <CopyIcon />}
              </button>
            </div>
          ) : (
            <button type="button" className={sec.cantScan} onClick={() => setShowSecret(true)}>
              {t("account.twoFactor.cantScan")}
            </button>
          )}
          <CodeInput
            ref={codeRef}
            value={code}
            onChange={setCode}
            label={t("account.twoFactor.enterCode")}
            ariaLabel={t("account.twoFactor.codeLabel")}
          />
        </form>
      </Dialog>

      {/* 启用时一次性下发的恢复码：与「恢复码」分区共用同一展示组件（不可再取，须显式保存）。
          关闭(用户已保存)后再刷新会话,同步 totpEnabled 让「恢复码」分区显现。 */}
      <RecoveryCodesDialog
        codes={recoveryCodes}
        onDismiss={() => {
          setRecoveryCodes(null);
          void refresh();
        }}
      />

      {/* 停用 2FA（验证码或恢复码均可,故不限定数字键盘/长度） */}
      <Dialog
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        busy={busy}
        tone="danger"
        title={t("account.twoFactor.disableTitle")}
        description={t("account.twoFactor.disableMessage")}
        initialFocusRef={disableRef}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setDisableOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" loading={busy} disabled={!disableCode} onClick={() => void disable()}>
              {t("account.twoFactor.disable")}
            </Button>
          </>
        }
      >
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (disableCode) void disable();
          }}
        >
          {disableError && <Alert tone="error">{disableError}</Alert>}
          <TextField
            ref={disableRef}
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
        </form>
      </Dialog>
    </section>
  );
}
