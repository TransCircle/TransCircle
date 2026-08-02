import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { RecoveryCodesStatus } from "../../api/types";
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
import { RecoveryCodesDialog } from "./RecoveryCodesDialog";
import s from "./Account.module.css";

/**
 * 锚点 id：统一身份接管分区在「无可用恢复码」时要把用户送到这里，
 * 常量化避免两处各写一份字符串后失联。
 */
export const RECOVERY_CODES_SECTION_ID = "account-recovery-codes";

/**
 * 恢复码分区（TOTP / Passkey 共享的账户级备份因素，独立成框）。
 * 仅在已启用任一 2FA 方式时展示：
 *   · GET  /v1/me/mfa/recovery-codes            查剩余数量与是否已启用 2FA。
 *   · POST /v1/me/mfa/recovery-codes/regenerate 重新生成（一次性展示）。
 * 复核方式随账户可用因素而定：有 TOTP → 验证码/恢复码；否则有密码 → 密码；否则用恢复码。
 */
export function RecoveryCodesSection() {
  const { t } = useTranslation();
  const { user } = useSession();
  // 依会话资料判断是否已有 2FA——决定是否渲染本区、并在启用/移除 2FA（会话 refresh）后重取。
  const sessionHas2fa = !!user && (user.security.totpEnabled || user.security.passkeyCount > 0);

  const [status, setStatus] = useState<RecoveryCodesStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  const [regenOpen, setRegenOpen] = useState(false);
  const [verifyValue, setVerifyValue] = useState("");
  const [regenError, setRegenError] = useState<string | null>(null);
  const verifyRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    setLoadFailed(false);
    const res = await api.get<RecoveryCodesStatus>("/v1/me/mfa/recovery-codes");
    if (res.ok) setStatus(res.data);
    else {
      setStatus(null);
      setLoadFailed(true);
    }
    setLoading(false);
  };

  // 初次加载，并在任一 2FA 因素变化时重取——不能只依赖 sessionHas2fa 布尔量：
  // TOTP↔Passkey 之间切换（如禁用 TOTP 仍留 Passkey）时布尔量不翻转，会遗漏对 verifyMode / 剩余数的重取。
  useEffect(() => {
    void load();
  }, [user?.security.totpEnabled, user?.security.passkeyCount]);

  // 复核方式：有 TOTP 用验证码/恢复码；无 TOTP 但有密码用密码；否则回落到恢复码。
  const verifyMode: "code" | "password" = status?.totpEnabled
    ? "code"
    : user?.passwordSet
      ? "password"
      : "code";

  const regenerate = async () => {
    if (busy) return; // 防 Enter 连击重复提交
    setRegenError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> =
        verifyMode === "password" ? { password: verifyValue } : { code: verifyValue };
      const res = await api.post<{ recoveryCodes?: string[] }>(
        "/v1/me/mfa/recovery-codes/regenerate",
        body,
      );
      if (!res.ok) {
        setRegenError(res.error.message);
        return;
      }
      setCodes(res.data?.recoveryCodes?.length ? res.data.recoveryCodes : null);
      setNotice(t("account.recoveryCodes.regenerated"));
      setRegenOpen(false);
      setVerifyValue("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  // 会话资料显示无 2FA 时不渲染（首次启用后会话 refresh 会触发本区重取显现）；
  // 加载态下也仅对已知有 2FA 的用户显示占位，避免为无 2FA 用户短暂闪现空框。
  if (loading) {
    if (!sessionHas2fa) return null;
  } else if (!status?.mfaEnabled) {
    // 加载失败且会话确无 2FA：不打扰；会话有 2FA 才提示重试。
    if (!(loadFailed && sessionHas2fa)) return null;
  }

  const remaining = status?.remaining ?? 0;
  const low = remaining > 0 && remaining <= 3;
  // 重生成需可复核:有 TOTP(出验证码)、或有登录密码、或尚有恢复码可用。
  // 仅凭 Passkey 且恢复码耗尽者无从复核(后端此接口不收 Passkey),按钮禁用并解释,不弹无法填写的框。
  const canVerify = !!status?.totpEnabled || !!user?.passwordSet || remaining > 0;

  return (
    <section className={s.group} id={RECOVERY_CODES_SECTION_ID}>
      <h2 className={s.groupTitle}>{t("account.nav.recoveryCodes")}</h2>
      {notice && (
        <div className={s.groupFeedback}>
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      {loading ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : loadFailed && !codes ? (
        <div className={s.stackSm}>
          <Alert tone="error">{t("account.recoveryCodes.loadFailed")}</Alert>
          <div className={s.actions}>
            <Button variant="secondary" onClick={() => void load()}>
              {t("common.retry")}
            </Button>
          </div>
        </div>
      ) : status?.mfaEnabled ? (
        <Card padding="none">
          <ul className={s.list}>
            <li className={s.listRow}>
              <div className={s.rowMain}>
                <div className={s.rowText}>
                  <span className={s.rowTitle}>
                    {t("account.recoveryCodes.label")}
                    <StatusBadge
                      size="sm"
                      tone={remaining === 0 ? "red" : low ? "amber" : "green"}
                      label={t("account.recoveryCodes.remaining", { count: remaining })}
                    />
                  </span>
                  <span className={s.rowMeta}>
                    <span>{t("account.recoveryCodes.subtitle")}</span>
                  </span>
                </div>
              </div>
              <div className={s.rowActions}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!canVerify}
                  onClick={() => {
                    setRegenError(null);
                    setVerifyValue("");
                    setRegenOpen(true);
                  }}
                >
                  {remaining === 0
                    ? t("account.recoveryCodes.generate")
                    : t("account.recoveryCodes.regenerate")}
                </Button>
              </div>
            </li>
          </ul>
          {!canVerify && (
            <div className={s.groupFeedback}>
              <Alert tone="info">{t("account.recoveryCodes.needFactor")}</Alert>
            </div>
          )}
        </Card>
      ) : null}

      {/* 重新生成：按账户可用因素复核（验证码/恢复码 或 密码） */}
      <Dialog
        open={regenOpen}
        onClose={() => setRegenOpen(false)}
        busy={busy}
        title={t("account.recoveryCodes.regenerateTitle")}
        description={t("account.recoveryCodes.regenerateMessage")}
        initialFocusRef={verifyRef}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setRegenOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!verifyValue}
              onClick={() => void regenerate()}
            >
              {t("common.confirm")}
            </Button>
          </>
        }
      >
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (verifyValue) void regenerate();
          }}
        >
          {regenError && <Alert tone="error">{regenError}</Alert>}
          <TextField
            ref={verifyRef}
            label={
              verifyMode === "password"
                ? t("account.recoveryCodes.passwordLabel")
                : t("account.recoveryCodes.codeLabel")
            }
            type={verifyMode === "password" ? "password" : "text"}
            autoComplete={verifyMode === "password" ? "current-password" : "one-time-code"}
            value={verifyValue}
            onChange={(e) => setVerifyValue(e.target.value)}
          />
        </form>
      </Dialog>

      <RecoveryCodesDialog
        codes={codes}
        onDismiss={() => {
          setCodes(null);
          void load();
        }}
      />
    </section>
  );
}
