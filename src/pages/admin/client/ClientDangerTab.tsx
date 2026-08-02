import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import type { AdminClientDetail } from "../../../api/types";
import { AdminButton as Button, Card, SectionLabel } from "../../../components/ui";
import { DangerDialog } from "../shared/DangerDialog";
import { useAdminAction } from "../shared/useAdminAction";
import styles from "../Admin.module.css";

interface ClientDangerTabProps {
  client: AdminClientDetail;
  canManage: boolean;
  disabledHint: string;
  onDone: (message: string) => void;
  onChanged: () => void;
}

export function ClientDangerTab({
  client,
  canManage,
  disabledHint,
  onDone,
  onChanged,
}: ClientDangerTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const action = useAdminAction();
  const [dialog, setDialog] = useState<"toggle" | "delete" | null>(null);

  const active = client.status === "active";

  const toggle = async () => {
    const ok = await action.run("toggle", (idem) =>
      api.patch(
        `/v1/admin/clients/${client.clientId}`,
        { status: active ? "disabled" : "active" },
        { plane: "user", ifMatch: client.updatedAt, idempotent: idem },
      ),
    );
    if (ok !== null) {
      onDone(active ? t("admin.clientDetail.disabled") : t("admin.clientDetail.enabled"));
      setDialog(null);
      action.reset();
      onChanged();
    }
  };

  const remove = async (reason: string) => {
    const ok = await action.run("delete", (idem) =>
      api.del(`/v1/admin/clients/${client.clientId}`, { reason }, { plane: "user", idempotent: idem }),
    );
    if (ok !== null) navigate("/admin/clients", { replace: true });
  };

  return (
    <div className={styles.stack}>
      <Card accent>
        <SectionLabel as="h2">{t("admin.clientDetail.dangerTitle")}</SectionLabel>
        <p className={styles.note}>{t("admin.clientDetail.dangerDesc")}</p>
        {canManage ? (
          <div className={styles.row}>
            <Button variant="danger" size="sm" onClick={() => setDialog("toggle")}>
              {active ? t("admin.clientDetail.disable") : t("admin.clientDetail.enable")}
            </Button>
            <Button variant="danger" size="sm" onClick={() => setDialog("delete")}>
              {t("admin.clientDetail.delete")}
            </Button>
          </div>
        ) : (
          <p className={styles.note}>{disabledHint}</p>
        )}
      </Card>

      {dialog === "toggle" && (
        <DangerDialog
          title={active ? t("admin.clientDetail.disable") : t("admin.clientDetail.enable")}
          subject={client.name}
          message={active ? t("admin.clientDetail.disableDesc") : t("admin.clientDetail.enableDesc")}
          impact={t("admin.clientDetail.toggleImpact", { count: client.grantedUsers })}
          confirmText={active ? t("admin.clientDetail.disable") : t("admin.clientDetail.enable")}
          needStepUp
          busy={action.pending === "toggle"}
          error={action.error}
          forceStepUp={action.stepUpRequired}
          onCancel={() => {
            setDialog(null);
            action.reset();
          }}
          onConfirm={() => void toggle()}
        />
      )}

      {dialog === "delete" && (
        <DangerDialog
          title={t("admin.clientDetail.delete")}
          subject={client.name}
          message={t("admin.clientDetail.deleteDesc")}
          impact={t("admin.clientDetail.deleteImpact", { count: client.grantedUsers })}
          confirmText={t("admin.clientDetail.delete")}
          needStepUp
          needReason
          busy={action.pending === "delete"}
          error={action.error}
          forceStepUp={action.stepUpRequired}
          onCancel={() => {
            setDialog(null);
            action.reset();
          }}
          onConfirm={(reason) => void remove(reason)}
        />
      )}
    </div>
  );
}
