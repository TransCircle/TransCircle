import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import type { AdminClientDetail, AdminSecretRotated } from "../../../api/types";
import {
  AdminButton as Button,
  Alert,
  Card,
  DescriptionList,
  EmptyState,
  SectionLabel,
} from "../../../components/ui";
import { useFormatTs } from "../../../utils/datetime";
import { CopyField } from "../shared/CopyField";
import { DangerDialog } from "../shared/DangerDialog";
import { SECRET_STALE_DAYS } from "../shared/constants";
import { useAdminAction } from "../shared/useAdminAction";
import styles from "../Admin.module.css";

interface CredentialsTabProps {
  client: AdminClientDetail;
  canManage: boolean;
  disabledHint: string;
  onDone: (message: string) => void;
  onChanged: () => void;
}

/**
 * 客户端密钥。
 *
 * 轮换带 24 小时重叠期：新旧并存，接入方在期内换过去即可，不会掉线。
 * 新密钥**只在此刻可见一次**，所以这一屏上的任何后续操作（含「立即吊销旧密钥」）
 * 都必须就地完成 —— 二次验证也叠在同一个对话框里，不跳页、不换弹窗。
 */
export function CredentialsTab({
  client,
  canManage,
  disabledHint,
  onDone,
  onChanged,
}: CredentialsTabProps) {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  const action = useAdminAction();
  const [dialog, setDialog] = useState<"rotate" | "revokeOld" | null>(null);
  const [rotated, setRotated] = useState<AdminSecretRotated | null>(null);

  if (!client.hasSecret && client.secretAgeDays === null && !rotated) {
    return (
      <Card>
        <EmptyState
          title={t("admin.clientDetail.publicNoSecretTitle")}
          description={t("admin.clientDetail.publicNoSecretDesc")}
        />
      </Card>
    );
  }

  const previousSecretId = rotated?.previousSecretId ?? client.previousSecretId;
  const previousExpiresAt = rotated?.previousSecretExpiresAt ?? client.previousSecretExpiresAt;

  const rotate = async () => {
    const data = await action.run<AdminSecretRotated>("rotate", (idem) =>
      api.post<AdminSecretRotated>(`/v1/admin/clients/${client.clientId}/rotate-secret`, undefined, {
        plane: "user",
        // 网络抖动重试会连轮两次，把接入方刚拿到的新密钥又换掉 —— 幂等键是必需的。
        idempotent: idem,
      }),
    );
    if (data) {
      setRotated(data);
      setDialog(null);
      action.reset();
      onChanged();
    }
  };

  const revokeOld = async (reason: string) => {
    if (!previousSecretId) return;
    const ok = await action.run("revokeOld", (idem) =>
      api.post(
        `/v1/admin/clients/${client.clientId}/secrets/${previousSecretId}/revoke`,
        { reason },
        { plane: "user", idempotent: idem },
      ),
    );
    if (ok !== null) {
      onDone(t("admin.clientDetail.oldSecretRevoked"));
      setDialog(null);
      action.reset();
      onChanged();
    }
  };

  return (
    <div className={styles.stack}>
      <Card accent>
        <SectionLabel as="h2">{t("admin.clientDetail.secretTitle")}</SectionLabel>
        <DescriptionList
          columns={2}
          items={[
            {
              term: t("admin.clientDetail.secretRotatedAt"),
              value: client.secretRotatedAt ? fmt(client.secretRotatedAt) : t("common.never"),
            },
            {
              term: t("admin.clientDetail.secretAge"),
              value:
                client.secretAgeDays === null
                  ? "—"
                  : client.secretAgeDays > SECRET_STALE_DAYS
                    ? t("admin.clientDetail.secretAgeStale", { count: client.secretAgeDays })
                    : t("admin.clients.secretAge", { count: client.secretAgeDays }),
            },
            { term: t("admin.clientDetail.secretStorage"), value: t("admin.clientDetail.secretStorageValue") },
            { term: t("admin.clientDetail.secretOverlap"), value: t("admin.clientDetail.secretOverlapValue") },
          ]}
        />

        {rotated ? (
          <div className={styles.stackSm}>
            <Alert tone="success">
              <strong>{t("admin.clientDetail.rotatedTitle")}</strong>
              <div>
                {previousExpiresAt
                  ? t("admin.clientDetail.rotatedOverlapUntil", { at: fmt(previousExpiresAt) })
                  : t("admin.clientDetail.rotatedOverlap")}
              </div>
            </Alert>
            <CopyField value={rotated.clientSecret} ariaLabel={t("admin.clientDetail.copySecret")} />
            <div className={styles.row}>
              <Button variant="primary" size="sm" onClick={() => setRotated(null)}>
                {t("admin.clientDetail.secretSaved")}
              </Button>
              {previousSecretId && (
                <Button variant="danger" size="sm" onClick={() => setDialog("revokeOld")}>
                  {t("admin.clientDetail.revokeOldNow")}
                </Button>
              )}
            </div>
          </div>
        ) : canManage ? (
          <div className={styles.row}>
            <Button variant="secondary" size="sm" onClick={() => setDialog("rotate")}>
              {t("admin.clientDetail.rotateSecret")}
            </Button>
            {previousSecretId && (
              <Button variant="danger" size="sm" onClick={() => setDialog("revokeOld")}>
                {t("admin.clientDetail.revokeOldNow")}
              </Button>
            )}
          </div>
        ) : (
          <p className={styles.note}>{disabledHint}</p>
        )}
      </Card>

      {dialog === "rotate" && (
        <DangerDialog
          title={t("admin.clientDetail.rotateSecret")}
          subject={client.name}
          message={t("admin.clientDetail.rotateDesc")}
          impact={t("admin.clientDetail.rotateImpact")}
          confirmText={t("admin.clientDetail.rotateSecret")}
          needStepUp
          busy={action.pending === "rotate"}
          error={action.error}
          forceStepUp={action.stepUpRequired}
          onCancel={() => {
            setDialog(null);
            action.reset();
          }}
          onConfirm={() => void rotate()}
        />
      )}

      {dialog === "revokeOld" && (
        <DangerDialog
          title={t("admin.clientDetail.revokeOldTitle")}
          subject={client.name}
          message={t("admin.clientDetail.revokeOldDesc")}
          impact={t("admin.clientDetail.revokeOldImpact")}
          confirmText={t("admin.clientDetail.revokeOldNow")}
          needStepUp
          needReason
          busy={action.pending === "revokeOld"}
          error={action.error}
          forceStepUp={action.stepUpRequired}
          onCancel={() => {
            setDialog(null);
            action.reset();
          }}
          onConfirm={(reason) => void revokeOld(reason)}
        />
      )}
    </div>
  );
}
