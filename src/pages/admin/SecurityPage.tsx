import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { AdminPolicy, AdminSigningKey } from "../../api/types";
import {
  AdminButton as Button,
  Alert,
  Card,
  Checkbox,
  SectionLabel,
  Select,
  Spinner,
  StatusBadge,
} from "../../components/ui";
import { useAdmin } from "../../context/AdminContext";
import { useFormatTs } from "../../utils/datetime";
import { DangerDialog } from "./shared/DangerDialog";
import { DataTable, type Column } from "./shared/DataTable";
import { DiffDialog } from "./shared/DiffDialog";
import { LOCK_AFTER_OPTIONS, PERM } from "./shared/constants";
import { useAdminPageHeader } from "./shared/header";
import { useAdminAction } from "./shared/useAdminAction";
import { useAdminResource, useAdminList } from "./shared/useAdminResource";
import { useCardEdit, type EditField } from "./shared/useCardEdit";
import styles from "./Admin.module.css";

const POLICY_KEYS = [
  "requireStaffMfa",
  "emailVerificationGate",
  "registrationEnabled",
  "lockAfterFailedAttempts",
] as const;

const SecurityPage = () => {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  const { hasPermission } = useAdmin();
  useAdminPageHeader({ title: t("admin.head.security.title"), subtitle: t("admin.head.security.sub") });

  const policy = useAdminResource<AdminPolicy>("/v1/admin/policy");
  const keys = useAdminList<AdminSigningKey>("/v1/admin/keys");
  const save = useAdminAction();
  const rotate = useAdminAction();

  const [notice, setNotice] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [rotating, setRotating] = useState(false);

  const canPolicy = hasPermission(PERM.policyManage);
  const canRotate = hasPermission(PERM.keyRotate);

  const fields = useMemo<ReadonlyArray<EditField<AdminPolicy>>>(
    () => [
      {
        key: "requireStaffMfa",
        label: t("admin.security.policy.mfaStaff"),
        risky: true,
        format: (v) => (v ? t("common.yes") : t("common.no")),
      },
      {
        key: "emailVerificationGate",
        label: t("admin.security.policy.emailGate"),
        risky: true,
        format: (v) => (v ? t("common.yes") : t("common.no")),
      },
      {
        key: "registrationEnabled",
        label: t("admin.security.policy.registrationEnabled"),
        risky: true,
        format: (v) => (v ? t("common.yes") : t("common.no")),
      },
      {
        key: "lockAfterFailedAttempts",
        label: t("admin.security.policy.lockAfter"),
        risky: true,
        format: (v) => t("admin.security.policy.attempts", { count: Number(v) }),
      },
    ],
    [t],
  );
  const edit = useCardEdit<AdminPolicy>(policy.data, fields);

  const commitPolicy = async () => {
    if (!policy.data) return;
    const data = await save.run<AdminPolicy>("policy", () =>
      api.patch<AdminPolicy>("/v1/admin/policy", edit.patchFor(POLICY_KEYS), {
        plane: "user",
        ifMatch: policy.data!.updatedAt,
      }),
    );
    if (data) {
      policy.set(data);
      setNotice(t("admin.security.policy.saved"));
      setReviewing(false);
      save.reset();
    }
  };

  const rotateKey = async (reason: string) => {
    const ok = await rotate.run("rotate", (idem) =>
      api.post("/v1/admin/keys/rotate", { reason }, { plane: "user", idempotent: idem }),
    );
    if (ok !== null) {
      setNotice(t("admin.security.keys.rotated"));
      setRotating(false);
      rotate.reset();
      keys.reload();
    }
  };

  const keyColumns: ReadonlyArray<Column<AdminSigningKey>> = [
    {
      key: "kid",
      label: t("admin.security.keys.kid"),
      primary: true,
      render: (k) => <code className={styles.mono}>{k.kid}</code>,
    },
    {
      key: "status",
      label: t("admin.security.keys.status"),
      render: (k) => (
        <StatusBadge
          size="sm"
          tone={k.status === "current" ? "green" : k.status === "previous" ? "amber" : "muted"}
          label={t(`admin.security.keys.state.${k.status}`, { defaultValue: k.status })}
        />
      ),
    },
    {
      key: "alg",
      label: t("admin.security.keys.alg"),
      hideAt: 2,
      render: (k) => <span className={styles.num}>{k.alg}</span>,
    },
    {
      key: "created",
      label: t("admin.security.keys.createdAt"),
      render: (k) => <span className={styles.num}>{fmt(k.createdAt) || "—"}</span>,
    },
    {
      key: "rotated",
      label: t("admin.security.keys.rotatedAt"),
      hideAt: 1,
      render: (k) => <span className={styles.num}>{fmt(k.rotatedAt) || "—"}</span>,
    },
  ];

  const currentKid = keys.data?.find((k) => k.status === "current")?.kid ?? "—";
  const policyChanges = edit.changesFor(POLICY_KEYS);
  const saveError = save.staleValues ? (
    <span className={styles.stackSm}>
      <span>{save.error}</span>
      <pre className={styles.code}>{JSON.stringify(save.staleValues, null, 2)}</pre>
    </span>
  ) : (
    save.error
  );

  return (
    <div className={styles.stack}>
      {notice && <Alert tone="success">{notice}</Alert>}
      {policy.error && <Alert tone="error">{policy.error}</Alert>}

      <Card>
        <SectionLabel as="h2">{t("admin.security.policy.title")}</SectionLabel>
        {policy.loading && !policy.data ? (
          <Spinner label={t("common.loading")} />
        ) : (
          <>
            <div className={styles.stackSm}>
              <Checkbox
                label={t("admin.security.policy.mfaStaffLabel")}
                checked={!!edit.value("requireStaffMfa")}
                disabled={!canPolicy}
                hint={t("admin.security.policy.mfaStaffHint")}
                onChange={(e) => edit.setField("requireStaffMfa", e.target.checked)}
              />
              <Checkbox
                label={t("admin.security.policy.emailGateLabel")}
                checked={!!edit.value("emailVerificationGate")}
                disabled={!canPolicy}
                hint={t("admin.security.policy.emailGateHint")}
                onChange={(e) => edit.setField("emailVerificationGate", e.target.checked)}
              />
              <Checkbox
                label={t("admin.security.policy.registrationEnabledLabel")}
                checked={!!edit.value("registrationEnabled")}
                disabled={!canPolicy}
                hint={t("admin.security.policy.registrationEnabledHint")}
                onChange={(e) => edit.setField("registrationEnabled", e.target.checked)}
              />
              <Select
                label={t("admin.security.policy.lockAfterLabel")}
                value={String(edit.value("lockAfterFailedAttempts") ?? 5)}
                disabled={!canPolicy}
                hint={t("admin.security.policy.lockAfterHint")}
                onChange={(v) => edit.setField("lockAfterFailedAttempts", Number(v))}
                options={LOCK_AFTER_OPTIONS.map((v) => ({
                  value: v,
                  label: t("admin.security.policy.attempts", { count: Number(v) }),
                }))}
              />
            </div>
            <div className={styles.savebar}>
              <span className={styles.savebarHint}>
                {policyChanges.length > 0 && canPolicy
                  ? t("admin.save.pending", { count: policyChanges.length })
                  : canPolicy
                    ? t("admin.security.policy.riskyHint")
                    : t("admin.perm.needed", { perm: PERM.policyManage })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canPolicy || policyChanges.length === 0}
                onClick={() => edit.resetKeys(POLICY_KEYS)}
              >
                {t("admin.save.discard")}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!canPolicy || policyChanges.length === 0}
                onClick={() => setReviewing(true)}
              >
                {t("common.save")}
              </Button>
            </div>
          </>
        )}
      </Card>

      <Card accent>
        <SectionLabel as="h2">{t("admin.security.keys.title")}</SectionLabel>
        <p className={styles.note}>{t("admin.security.keys.desc")}</p>
        {keys.error && <Alert tone="error">{keys.error}</Alert>}
        {keys.loading && !keys.data ? (
          <Spinner label={t("common.loading")} />
        ) : (
          <DataTable
            columns={keyColumns}
            rows={keys.data ?? []}
            rowKey={(k) => k.kid}
            ariaLabel={t("admin.security.keys.title")}
            emptyTitle={t("admin.security.keys.emptyTitle")}
            sortAscLabel={t("admin.table.sortedAsc")}
            sortDescLabel={t("admin.table.sortedDesc")}
          />
        )}
        <div className={styles.row}>
          {canRotate ? (
            <Button variant="danger" size="sm" onClick={() => setRotating(true)}>
              {t("admin.security.keys.rotate")}
            </Button>
          ) : (
            <span className={styles.note}>{t("admin.perm.needed", { perm: PERM.keyRotate })}</span>
          )}
        </div>
      </Card>

      {reviewing && policyChanges.length > 0 && (
        <DiffDialog
          subject={t("admin.security.policy.title")}
          changes={policyChanges}
          busy={save.pending === "policy"}
          error={saveError}
          forceStepUp={save.stepUpRequired}
          onCancel={() => {
            setReviewing(false);
            save.reset();
          }}
          onCommit={() => void commitPolicy()}
        />
      )}

      {rotating && (
        <DangerDialog
          title={t("admin.security.keys.rotate")}
          subject={t("admin.security.keys.rotateSubject", { kid: currentKid })}
          message={t("admin.security.keys.rotateDesc")}
          impact={t("admin.security.keys.rotateImpact")}
          confirmText={t("admin.security.keys.rotate")}
          needStepUp
          needReason
          busy={rotate.pending === "rotate"}
          error={rotate.error}
          forceStepUp={rotate.stepUpRequired}
          onCancel={() => {
            setRotating(false);
            rotate.reset();
          }}
          onConfirm={(reason) => void rotateKey(reason)}
        />
      )}
    </div>
  );
};

export default SecurityPage;
