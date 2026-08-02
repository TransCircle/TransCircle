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
import { RecoveryCodesDialog } from "./RecoveryCodesDialog";
import s from "./Account.module.css";

type ToggleAction = "enable" | "disable";

/** 开关接口在成功时额外回传的一次性恢复码（仅 enable 可能非空，见下方说明）。 */
type ToggleResponse = IamMfaState & { recoveryCodes?: string[] | null };

/**
 * 两步验证交给统一身份接管（design/api-delta.md §5b.3）。
 *
 * 本区只对已绑定统一身份的账户有意义——普通用户绑不了、也用不上，
 * 因此未绑定时整块隐藏，而不是显示一个点不动的灰按钮。
 *
 * 开启前把后果讲清：本地通行密钥与动态口令在登录时不再生效，恢复码是统一身份
 * 不可达时唯一的登录方式。恢复码不能单独生成——和 TOTP / Passkey 一样，只在
 * 账户「首次建立 2FA 且尚无未用码」时才会自动发放；后端把"开启接管"本身也算作
 * 一次首建事件，因此这里不再需要前端先拦一次「请先去生成恢复码」，直接展示、
 * 成功后按后端是否随带 recoveryCodes 决定要不要弹一次性展示框即可。
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
  const [dialogError, setDialogError] = useState<string | null>(null);
  /** 开启成功且后端随带发了新恢复码时的一次性展示；非空即弹框。 */
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<ToggleAction | null>(null);

  const available = state?.available === true;
  const delegated = state?.delegated === true;

  const openEnable = async () => {
    if (busy) return;
    setError(null);
    setNotice(null);
    setDialogError(null);
    setBusy(true);
    try {
      // 仅用于弹框里的提示文案（"当前有 N 个" / "还没有，开启后自动生成"）；
      // 读不到不阻断——后端在真正开启时会按同一条规则处理，前端只是提前说明。
      const res = await api.get<RecoveryCodesStatus>("/v1/me/mfa/recovery-codes");
      setRemaining(res.ok ? res.data.remaining : null);
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
      const res = await api.post<ToggleResponse>(`/v1/me/mfa/iam/${action}`);
      if (res.ok) {
        // 后端回传权威的 { available, delegated }，直接升为新基线，不再多跑一次 GET。
        apply({ available: res.data.available, delegated: res.data.delegated });
        setDisableOpen(false);
        if (action === "enable") {
          setEnableOpen(false);
          const newCodes = res.data.recoveryCodes?.length ? res.data.recoveryCodes : null;
          // 有新发的恢复码时，把成功提示推迟到用户在恢复码框里点「我已保存」之后，
          // 避免提示和一次性码框同时出现分散注意力（与 TOTP 启用同一约定）。
          if (newCodes) {
            setRecoveryCodes(newCodes);
          } else {
            setNotice(t("mfa.iam.enabledOk"));
          }
        } else {
          setNotice(t("mfa.iam.disabledOk"));
        }
        return;
      }
      if (res.error.code === "STEP_UP_REQUIRED") {
        // 开关都是安全降级/升级，后端要求本会话已完成二次认证；验证通过后原样重试。
        setPendingAction(action);
        setStepUpOpen(true);
        return;
      }
      if (res.error.code === "IAM_NOT_BOUND") {
        // 弹框打开期间统一身份被解绑（如另一标签页操作）：后端会拒绝，这里如实说明。
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

  // 未绑定统一身份：这个功能对当前账户完全用不上，整块隐藏而不是显示一个禁用按钮。
  // 但 delegated 时不能一并隐藏——统一身份绑定理论上可能在接管开启后于后端侧丢失
  // （如 IAM 管理员直接撤销绑定，见 auth.ts 登录路径里的"iamMfaDelegated=true 但缺少
  // iam 绑定"防御分支），这种数据不一致下用户必须还能看到「关闭接管」按钮把本地
  // 通行密钥/动态口令找回来，否则就被这次隐藏顺手焊死了唯一的自助恢复入口。
  if (!loading && !failed && !available && !delegated) return null;

  return (
    <section className={s.group}>
      <h2 className={s.groupTitle}>{t("mfa.iam.title")}</h2>

      {(error || notice || (!loading && delegated)) && (
        <div className={s.groupFeedback}>
          {error && <Alert tone="error">{error}</Alert>}
          {notice && <Alert tone="success">{notice}</Alert>}
          {/* 恢复码依附于首个 2FA 因素签发：接管期间把本地因素全删光，就再也生成不出新恢复码。 */}
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
        <Card padding="none">
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
                    disabled={busy}
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
              : remaining === 0
                ? t("mfa.iam.willIssueCodes")
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

      {/* 开启接管时若账户此前没有任何未用恢复码，后端会随开关一并发一组：与
          「恢复码」分区共用同一展示组件，不可再取，须显式保存后才关闭。 */}
      <RecoveryCodesDialog
        codes={recoveryCodes}
        onDismiss={() => {
          setRecoveryCodes(null);
          setNotice(t("mfa.iam.enabledOk"));
        }}
      />

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
