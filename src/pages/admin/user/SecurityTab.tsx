import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import type { AdminUserMfa, AdminUserPasskey } from "../../../api/types";
import {
  AdminButton as Button,
  Alert,
  Card,
  Checkbox,
  DescriptionList,
  SectionLabel,
  Spinner,
  StatusBadge,
  TextField,
} from "../../../components/ui";
import { useFormatTs } from "../../../utils/datetime";
import { DangerDialog } from "../shared/DangerDialog";
import { DataTable, type Column } from "../shared/DataTable";
import { PASSWORD_MIN_LENGTH, generatePassword } from "../shared/constants";
import { useAdminAction } from "../shared/useAdminAction";
import { useAdminResource, useAdminList } from "../shared/useAdminResource";
import styles from "../Admin.module.css";

interface SecurityTabProps {
  userId: string;
  subject: string;
  totpEnabled: boolean;
  passkeyCount: number;
  /** 是否允许动二次验证因子：需要 pass.user:reset-2fa，且目标不是工作人员、不是自己。 */
  canReset: boolean;
  blockedHint: string;
  onDone: (message: string) => void;
}

type Dialog = "password" | "totp" | "recovery" | { passkey: AdminUserPasskey };

export function SecurityTab({
  userId,
  subject,
  totpEnabled,
  passkeyCount,
  canReset,
  blockedHint,
  onDone,
}: SecurityTabProps) {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  const mfa = useAdminResource<AdminUserMfa>(`/v1/admin/users/${userId}/mfa`);
  const passkeys = useAdminList<AdminUserPasskey>(`/v1/admin/users/${userId}/passkeys`);
  const action = useAdminAction();

  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [password, setPassword] = useState("");
  const [forceChange, setForceChange] = useState(true);

  const close = () => {
    setDialog(null);
    setPassword("");
    setForceChange(true);
    action.reset();
  };

  const remaining = mfa.data?.recoveryCodes.remaining ?? 0;
  // /mfa 是这一屏的权威来源，比详情页快照新：管理员刚停用 TOTP 后
  // 详情页的 security.totpEnabled 还是旧值，用它渲染会显示成「仍已启用」。
  const totpOn = mfa.data ? mfa.data.totp.status === "active" : totpEnabled;
  const iamDelegated = mfa.data?.iamMfaDelegated ?? false;

  const submitPassword = async () => {
    const ok = await action.run("password", (idem) =>
      api.post(
        `/v1/admin/users/${userId}/password`,
        // 字段名必须是 newPassword —— 后端与 api-delta 都按这个名字读，
        // 传 password 会被当成「没给密码」直接 422。
        { newPassword: password, forceChangeOnNextLogin: forceChange },
        { plane: "user", idempotent: idem },
      ),
    );
    if (ok !== null) {
      onDone(forceChange ? t("admin.userDetail.security.passwordSetForced") : t("admin.userDetail.security.passwordSet"));
      close();
    }
  };

  const submitDisableTotp = async (reason: string) => {
    const ok = await action.run("totp", (idem) =>
      api.post(`/v1/admin/users/${userId}/totp/disable`, { reason }, { plane: "user", idempotent: idem }),
    );
    if (ok !== null) {
      onDone(t("admin.userDetail.security.totpDisabled"));
      mfa.reload();
      close();
    }
  };

  const submitRevokeRecovery = async (reason: string) => {
    const ok = await action.run("recovery", (idem) =>
      api.post(
        `/v1/admin/users/${userId}/recovery-codes/revoke`,
        { reason },
        { plane: "user", idempotent: idem },
      ),
    );
    if (ok !== null) {
      onDone(t("admin.userDetail.security.recoveryRevoked"));
      mfa.reload();
      close();
    }
  };

  const submitRevokePasskey = async (passkey: AdminUserPasskey, reason: string) => {
    // 按具体那把通行密钥分作用域：同一页面吊销第二把时不能复用第一把的幂等键。
    const ok = await action.run(`passkey:${passkey.id}`, (idem) =>
      api.del(`/v1/admin/users/${userId}/passkeys/${passkey.id}`, { reason }, {
        plane: "user",
        idempotent: idem,
      }),
    );
    if (ok !== null) {
      onDone(t("admin.userDetail.security.passkeyRevoked", { name: passkeyName(passkey) }));
      passkeys.reload();
      close();
    }
  };

  const passkeyName = (k: AdminUserPasskey) => k.name || t("admin.userDetail.security.unnamedPasskey");

  const passkeyColumns: ReadonlyArray<Column<AdminUserPasskey>> = [
    {
      key: "name",
      label: t("admin.userDetail.security.passkeyName"),
      primary: true,
      render: (k) => <span className={styles.cellName}>{passkeyName(k)}</span>,
    },
    {
      key: "created",
      label: t("admin.userDetail.security.passkeyCreated"),
      render: (k) => <span className={styles.num}>{fmt(k.createdAt) || "—"}</span>,
    },
    {
      key: "last",
      label: t("admin.userDetail.security.passkeyLastUsed"),
      render: (k) => <span className={styles.num}>{fmt(k.lastUsedAt) || t("common.never")}</span>,
    },
    {
      key: "act",
      label: "",
      align: "right",
      render: (k) =>
        canReset ? (
          <Button variant="ghost" size="sm" onClick={() => setDialog({ passkey: k })}>
            {t("admin.userDetail.security.revokePasskey")}
          </Button>
        ) : null,
    },
  ];

  const list = passkeys.data ?? [];
  const currentPasskey = dialog && typeof dialog === "object" ? dialog.passkey : null;

  return (
    <div className={styles.stack}>
      {(mfa.error || passkeys.error) && <Alert tone="error">{mfa.error ?? passkeys.error}</Alert>}

      {iamDelegated && (
        // 这一屏下面显示的 TOTP / Passkey 在登录路径上**当前不生效**。
        // 不说明的话，管理员会以为「他有 TOTP，账户是安全的」，
        // 或者以为停用 TOTP 就能降低他的登录门槛 —— 两个判断都是错的。
        <Alert tone="info">
          <strong>{t("admin.userDetail.security.iamDelegatedTitle")}</strong>
          <div>{t("admin.userDetail.security.iamDelegatedDesc")}</div>
        </Alert>
      )}

      <Card>
        <SectionLabel as="h2">{t("admin.userDetail.security.passwordTitle")}</SectionLabel>
        <p className={styles.note}>{t("admin.userDetail.security.passwordDesc")}</p>
        {canReset ? (
          <div className={styles.row}>
            <Button variant="secondary" size="sm" onClick={() => setDialog("password")}>
              {t("admin.userDetail.security.setPassword")}
            </Button>
          </div>
        ) : (
          <p className={styles.note}>{blockedHint}</p>
        )}
      </Card>

      <div className={styles.grid2}>
        <Card>
          <SectionLabel as="h2">{t("admin.userDetail.security.totpTitle")}</SectionLabel>
          <div className={styles.row}>
            <StatusBadge
              tone={totpOn ? "green" : "muted"}
              size="sm"
              label={totpOn ? t("common.enabled") : t("common.disabled")}
            />
          </div>
          <p className={styles.note}>
            {totpOn
              ? t("admin.userDetail.security.totpOnDesc")
              : t("admin.userDetail.security.totpOffDesc")}
          </p>
          {totpOn && canReset && (
            <Button variant="danger" size="sm" onClick={() => setDialog("totp")}>
              {t("admin.userDetail.security.disableTotp")}
            </Button>
          )}
        </Card>

        <Card>
          <SectionLabel as="h2">{t("admin.userDetail.security.recoveryTitle")}</SectionLabel>
          {mfa.loading && !mfa.data ? (
            <Spinner label={t("common.loading")} />
          ) : (
            <>
              <DescriptionList
                columns={1}
                items={[
                  {
                    term: t("admin.userDetail.security.recoveryTotal"),
                    value: String(mfa.data?.recoveryCodes.total ?? 0),
                  },
                  {
                    term: t("admin.userDetail.security.recoveryUsed"),
                    value: String(mfa.data?.recoveryCodes.used ?? 0),
                  },
                  { term: t("admin.userDetail.security.recoveryLeft"), value: String(remaining) },
                ]}
              />
              {(mfa.data?.recoveryCodes.total ?? 0) > 0 && remaining <= 2 && (
                <Alert tone="error">{t("admin.userDetail.security.recoveryLow")}</Alert>
              )}
              {(mfa.data?.recoveryCodes.total ?? 0) > 0 && canReset && (
                <div className={styles.row}>
                  <Button variant="danger" size="sm" onClick={() => setDialog("recovery")}>
                    {t("admin.userDetail.security.revokeRecovery")}
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <Card>
        <div className={styles.spread}>
          <SectionLabel as="h2">{t("admin.userDetail.security.passkeysTitle")}</SectionLabel>
          <span className={styles.note}>
            {t("admin.userDetail.security.passkeyCount", { count: list.length })}
          </span>
        </div>
        {passkeys.loading && !passkeys.data ? (
          <Spinner label={t("common.loading")} />
        ) : (
          <DataTable
            columns={passkeyColumns}
            rows={list}
            rowKey={(k) => k.id}
            ariaLabel={t("admin.userDetail.security.passkeysTitle")}
            emptyTitle={t("admin.userDetail.security.passkeysEmpty")}
            sortAscLabel={t("admin.table.sortedAsc")}
            sortDescLabel={t("admin.table.sortedDesc")}
          />
        )}
        <p className={styles.note}>{t("admin.userDetail.security.passkeysNote")}</p>
      </Card>

      {dialog === "password" && (
        <DangerDialog
          title={t("admin.userDetail.security.setPassword")}
          subject={subject}
          message={t("admin.userDetail.security.passwordDialogDesc")}
          impact={t("admin.userDetail.security.passwordImpact")}
          confirmText={t("admin.userDetail.security.setPassword")}
          needStepUp
          busy={action.pending === "password"}
          error={action.error}
          forceStepUp={action.stepUpRequired}
          confirmDisabled={password.length < PASSWORD_MIN_LENGTH}
          onCancel={close}
          onConfirm={() => void submitPassword()}
        >
          <TextField
            label={t("admin.userDetail.security.newPassword")}
            type="password"
            required
            value={password}
            invalid={password.length > 0 && password.length < PASSWORD_MIN_LENGTH}
            hint={
              password.length > 0 && password.length < PASSWORD_MIN_LENGTH
                ? t("admin.userDetail.security.passwordTooShort", { min: PASSWORD_MIN_LENGTH })
                : t("admin.userDetail.security.passwordHint")
            }
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className={styles.row}>
            <Button variant="secondary" size="sm" onClick={() => setPassword(generatePassword())}>
              {t("admin.userDetail.security.generatePassword")}
            </Button>
          </div>
          <Checkbox
            label={t("admin.userDetail.security.forceChange")}
            checked={forceChange}
            hint={t("admin.userDetail.security.forceChangeHint")}
            onChange={(e) => setForceChange(e.target.checked)}
          />
        </DangerDialog>
      )}

      {dialog === "totp" && (
        <DangerDialog
          title={t("admin.userDetail.security.disableTotp")}
          subject={subject}
          message={t("admin.userDetail.security.disableTotpDesc")}
          impact={
            passkeyCount > 0
              ? t("admin.userDetail.security.disableTotpImpactHasPasskey", { count: passkeyCount })
              : t("admin.userDetail.security.disableTotpImpactBare")
          }
          confirmText={t("admin.userDetail.security.disableTotp")}
          needStepUp
          needReason
          busy={action.pending === "totp"}
          error={action.error}
          forceStepUp={action.stepUpRequired}
          onCancel={close}
          onConfirm={(reason) => void submitDisableTotp(reason)}
        />
      )}

      {dialog === "recovery" && (
        <DangerDialog
          title={t("admin.userDetail.security.revokeRecovery")}
          subject={subject}
          message={t("admin.userDetail.security.revokeRecoveryDesc")}
          impact={t("admin.userDetail.security.revokeRecoveryImpact", { count: remaining })}
          confirmText={t("admin.userDetail.security.revokeRecoveryConfirm")}
          needStepUp
          needReason
          busy={action.pending === "recovery"}
          error={action.error}
          forceStepUp={action.stepUpRequired}
          onCancel={close}
          onConfirm={(reason) => void submitRevokeRecovery(reason)}
        />
      )}

      {currentPasskey && (
        <DangerDialog
          title={t("admin.userDetail.security.revokePasskeyTitle")}
          subject={`${subject} · ${passkeyName(currentPasskey)}`}
          message={t("admin.userDetail.security.revokePasskeyDesc")}
          impact={
            list.length === 1 && !totpEnabled
              ? t("admin.userDetail.security.revokePasskeyImpactLast")
              : t("admin.userDetail.security.revokePasskeyImpactRest", {
                  count: Math.max(0, list.length - 1),
                  totp: totpEnabled ? t("admin.userDetail.security.andTotp") : "",
                })
          }
          confirmText={t("admin.userDetail.security.revokePasskey")}
          needStepUp
          needReason
          busy={action.pending === `passkey:${currentPasskey.id}`}
          error={action.error}
          forceStepUp={action.stepUpRequired}
          onCancel={close}
          onConfirm={(reason) => void submitRevokePasskey(currentPasskey, reason)}
        />
      )}
    </div>
  );
}
