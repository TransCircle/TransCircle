import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { RecoveryCodesStatus } from "../../api/types";
import { StepUpDialog } from "../../components/StepUpDialog";
import {
  Card,
  AdminButton as Button,
  Alert,
  Spinner,
  StatusBadge,
  Checkbox,
} from "../../components/ui";
import { Dialog } from "../../components/ui/Dialog";
import { useIamMfa, type IamMfaState } from "./IamMfaContext";
import { RECOVERY_CODES_SECTION_ID } from "./RecoveryCodesSection";
import s from "./Account.module.css";

type ToggleAction = "enable" | "disable";

/** 恢复码前置检查的结果：数量 + 账户是否已有任一本地 2FA（决定引导词怎么写）。 */
interface RecoveryPrecheck {
  remaining: number;
  mfaEnabled: boolean;
}

/**
 * 两步验证交给统一身份接管（design/api-delta.md §5b.3）。
 *
 * 三件事必须做在前面，否则用户会撞上后端的 409：
 * 1. 未绑定统一身份（available=false）→ 开关不可用，直说要先绑定；
 * 2. 无可用恢复码 → 后端返 409 RECOVERY_CODES_REQUIRED，前端提前查 `/v1/me/mfa/recovery-codes` 并引导；
 * 3. 开启前把后果讲清：本地通行密钥与动态口令在登录时不再生效，恢复码是统一身份不可达时唯一的登录方式。
 */
export function IamMfaSection() {
  const { t } = useTranslation();
  const { state, loading, failed, reload, apply } = useIamMfa();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [enableOpen, setEnableOpen] = useState(false);
  const [ack, setAck] = useState(false);
  /** null = 没读到恢复码数量（接口失败）；此时不能拿 0 冒充，那是两回事。 */
  const [remaining, setRemaining] = useState<number | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [needCodes, setNeedCodes] = useState<RecoveryPrecheck | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<ToggleAction | null>(null);

  const available = state?.available === true;
  const delegated = state?.delegated === true;

  /** 查一次恢复码状态；读不到返回 null（此时不阻断，交给后端做最终判定）。 */
  const checkRecovery = async (): Promise<RecoveryPrecheck | null> => {
    const res = await api.get<RecoveryCodesStatus>("/v1/me/mfa/recovery-codes");
    if (!res.ok) return null;
    return { remaining: res.data.remaining, mfaEnabled: res.data.mfaEnabled };
  };

  const openEnable = async () => {
    if (busy) return;
    setError(null);
    setNotice(null);
    setDialogError(null);
    setBusy(true);
    try {
      const pre = await checkRecovery();
      if (pre && pre.remaining === 0) {
        // 提前拦下：让用户先去生成恢复码，而不是点完确认再撞一个 409。
        setNeedCodes(pre);
        return;
      }
      // 读不到数量不阻断：后端还会独立判一次 RECOVERY_CODES_REQUIRED，前端只需如实说明。
      setRemaining(pre ? pre.remaining : null);
      setAck(false);
      setEnableOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const openDisable = () => {
    setError(null);
    setNotice(null);
    setDialogError(null);
    setDisableOpen(true);
  };

  const toggle = async (action: ToggleAction) => {
    if (busy) return;
    setDialogError(null);
    setBusy(true);
    try {
      const res = await api.post<IamMfaState>(`/v1/me/mfa/iam/${action}`);
      if (res.ok) {
        // 后端回传权威的 { available, delegated }，直接升为新基线，不再多跑一次 GET。
        apply(res.data);
        setEnableOpen(false);
        setDisableOpen(false);
        setNotice(t(action === "enable" ? "mfa.iam.enabledOk" : "mfa.iam.disabledOk"));
        return;
      }
      if (res.error.code === "STEP_UP_REQUIRED") {
        // 开关都是安全降级/升级，后端要求本会话已完成二次认证；验证通过后原样重试。
        setPendingAction(action);
        setStepUpOpen(true);
        return;
      }
      if (res.error.code === "RECOVERY_CODES_REQUIRED") {
        // 前置检查与提交之间恢复码被用光/作废：关掉确认框，改走引导。
        setEnableOpen(false);
        setNeedCodes((await checkRecovery()) ?? { remaining: 0, mfaEnabled: true });
        return;
      }
      if (res.error.code === "IAM_NOT_BOUND") {
        setEnableOpen(false);
        setError(t("mfa.iam.notBound"));
        await reload();
        return;
      }
      // 失败不关弹窗：错误就近显示，用户可直接重试。
      setDialogError(res.error.message);
    } finally {
      setBusy(false);
    }
  };

  /** 引导用户去「恢复码」分区；尊重减少动效偏好。 */
  const gotoRecoveryCodes = () => {
    setNeedCodes(null);
    const el = document.getElementById(RECOVERY_CODES_SECTION_ID);
    if (!el) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  };

  return (
    <section className={s.group}>
      <h2 className={s.groupTitle}>{t("mfa.iam.title")}</h2>

      {(error || notice || (!loading && !failed && !available) || (!loading && delegated)) && (
        <div className={s.groupFeedback}>
          {error && <Alert tone="error">{error}</Alert>}
          {notice && <Alert tone="success">{notice}</Alert>}
          {!loading && !failed && !available && <Alert tone="info">{t("mfa.iam.unavailable")}</Alert>}
          {/* 恢复码依附于本地因素签发：接管期间把本地因素全删光，就再也生成不出新恢复码。 */}
          {!loading && delegated && <Alert tone="info">{t("mfa.iam.keepLocalFactors")}</Alert>}
        </div>
      )}

      {loading ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : failed ? (
        <div className={s.stackSm}>
          <Alert tone="error">{t("mfa.iam.loadFailed")}</Alert>
          <div className={s.actions}>
            <Button variant="secondary" onClick={() => void reload()}>
              {t("common.retry")}
            </Button>
          </div>
        </div>
      ) : (
        <Card padding="none" tone={available ? "surface" : "subtle"}>
          <ul className={s.list}>
            <li className={s.listRow}>
              <div className={s.rowMain}>
                <div className={s.rowText}>
                  <span className={s.rowTitle}>
                    {t("mfa.iam.status")}
                    <StatusBadge
                      size="sm"
                      tone={delegated ? "green" : "neutral"}
                      label={delegated ? t("mfa.iam.on") : t("mfa.iam.off")}
                    />
                  </span>
                  <span className={s.rowMeta}>
                    <span>{t("mfa.iam.subtitle")}</span>
                  </span>
                </div>
              </div>
              <div className={s.rowActions}>
                {delegated ? (
                  <Button variant="danger" size="sm" disabled={busy} onClick={openDisable}>
                    {t("mfa.iam.disable")}
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    loading={busy && !enableOpen}
                    disabled={!available || busy}
                    onClick={() => void openEnable()}
                  >
                    {t("mfa.iam.enable")}
                  </Button>
                )}
              </div>
            </li>
          </ul>
        </Card>
      )}

      {/* 开启前的后果说明：三条变化 + 必须勾选的恢复码确认。 */}
      <Dialog
        open={enableOpen}
        onClose={() => setEnableOpen(false)}
        busy={busy}
        title={t("mfa.iam.enableTitle")}
        description={t("mfa.iam.enableIntro")}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setEnableOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!ack}
              onClick={() => void toggle("enable")}
            >
              {t("mfa.iam.enableConfirm")}
            </Button>
          </>
        }
      >
        <div className={s.stackSm}>
          {dialogError && <Alert tone="error">{dialogError}</Alert>}
          <ul className={s.bulletList}>
            <li>{t("mfa.iam.enablePointLocal")}</li>
            <li>{t("mfa.iam.enablePointIam")}</li>
            <li className={s.bulletStrong}>{t("mfa.iam.enablePointRecovery")}</li>
          </ul>
          <Alert tone={remaining === null ? "error" : "info"}>
            {remaining === null
              ? t("mfa.iam.remainingUnknown")
              : t("mfa.iam.remaining", { count: remaining })}
          </Alert>
          <Checkbox
            label={t("mfa.iam.enableAck")}
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />
        </div>
      </Dialog>

      {/* 关闭接管：本地因素恢复生效，同样需要 step-up。 */}
      <Dialog
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        busy={busy}
        tone="danger"
        title={t("mfa.iam.disableTitle")}
        description={t("mfa.iam.disableBody")}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setDisableOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void toggle("disable")}>
              {t("mfa.iam.disableConfirm")}
            </Button>
          </>
        }
      >
        {dialogError ? <Alert tone="error">{dialogError}</Alert> : null}
      </Dialog>

      {/* 恢复码不足：讲清为什么必须先有恢复码，并按账户是否已有本地因素给不同的下一步。 */}
      <Dialog
        open={!!needCodes}
        onClose={() => setNeedCodes(null)}
        title={t("mfa.iam.needCodesTitle")}
        description={t("mfa.iam.needCodesBody")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setNeedCodes(null)}>
              {t("common.close")}
            </Button>
            {needCodes?.mfaEnabled && (
              <Button variant="primary" onClick={gotoRecoveryCodes}>
                {t("mfa.iam.needCodesGoto")}
              </Button>
            )}
          </>
        }
      >
        <p className={s.muted}>
          {needCodes?.mfaEnabled
            ? t("mfa.iam.needCodesWithMfa")
            : t("mfa.iam.needCodesWithoutMfa")}
        </p>
      </Dialog>

      <StepUpDialog
        open={stepUpOpen}
        onClose={() => {
          setStepUpOpen(false);
          setPendingAction(null);
        }}
        onVerified={() => {
          const action = pendingAction;
          setStepUpOpen(false);
          setPendingAction(null);
          if (action) void toggle(action);
        }}
      />
    </section>
  );
}
