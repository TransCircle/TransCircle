import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Card,
  DescriptionList,
  SectionLabel,
  Spinner,
  StatusBadge,
} from "../../components/ui";
import type { AdminOverview } from "../../api/types";
import { ACCOUNT_STATUS_ORDER, accountStatusTone } from "./shared/constants";
import { useAdminPageHeader } from "./shared/header";
import { useAdminResource } from "./shared/useAdminResource";
import styles from "./Admin.module.css";

function Kpi({ label, value, unit, sub }: { label: string; value: ReactNode; unit?: string; sub?: string }) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>
        {value}
        {unit && <span className={styles.kpiUnit}>{unit}</span>}
      </span>
      {sub && <span className={styles.kpiSub}>{sub}</span>}
    </div>
  );
}

/**
 * 概览：系统当前状态。
 *
 * 刻意不做图表 —— 这个体量的数据画比例条是浮夸。数字块 + 一张状态分布表就够，
 * 而且导航不带角标，所有「有多少」的问题都收敛到这一页回答。
 */
const OverviewPage = () => {
  const { t } = useTranslation();
  useAdminPageHeader({ title: t("admin.head.overview.title"), subtitle: t("admin.head.overview.sub") });

  const { data, loading, error } = useAdminResource<AdminOverview>("/v1/admin/overview");

  if (loading && !data) return <Spinner size="lg" label={t("common.loading")} />;
  if (error && !data) return <Alert tone="error">{error}</Alert>;
  if (!data) return null;

  const mfaPct =
    data.mfa.activeTotal > 0 ? Math.round((data.mfa.covered / data.mfa.activeTotal) * 100) : 0;
  // 状态分布要能对得上总数：后端返回七种状态，只画四种的话
  // 「各状态之和 ≠ 账户总数」，看的人会以为数据错了。
  const byStatus: Record<string, number> = {
    active: data.users.active,
    pending_verification: data.users.pendingVerification,
    suspended: data.users.suspended,
    banned: data.users.banned,
    pending_deletion: data.users.pendingDeletion,
    merged: data.users.merged,
    deleted: data.users.deleted,
  };

  return (
    <div className={styles.stack}>
      {error && <Alert tone="error">{error}</Alert>}

      <div className={styles.kpis}>
        <Kpi
          label={t("admin.overview.kpi.accounts")}
          value={data.users.total}
          sub={t("admin.overview.kpi.accountsSub", { count: data.users.active })}
        />
        <Kpi
          label={t("admin.overview.kpi.sessions")}
          value={data.sessions.active}
          sub={t("admin.overview.kpi.sessionsSub", { count: data.sessions.accounts })}
        />
        <Kpi
          label={t("admin.overview.kpi.mfa")}
          value={mfaPct}
          unit="%"
          sub={t("admin.overview.kpi.mfaSub", {
            covered: data.mfa.covered,
            total: data.mfa.activeTotal,
          })}
        />
        <Kpi
          label={t("admin.overview.kpi.clients")}
          value={data.clients.active}
          sub={
            data.clients.disabled > 0
              ? t("admin.overview.kpi.clientsSub", { count: data.clients.disabled })
              : t("admin.overview.kpi.clientsNoneDisabled")
          }
        />
        <Kpi
          label={t("admin.overview.kpi.grants")}
          value={data.grants.total}
          sub={t("admin.overview.kpi.grantsSub")}
        />
        <Kpi
          label={t("admin.overview.kpi.failures")}
          value={data.auth.recentFailures}
          sub={
            data.auth.lockedAccounts > 0
              ? t("admin.overview.kpi.failuresLocked", {
                  hours: data.auth.windowHours,
                  locked: data.auth.lockedAccounts,
                })
              : t("admin.overview.kpi.failuresSub", { hours: data.auth.windowHours })
          }
        />
      </div>

      <div className={styles.grid2}>
        <Card>
          <SectionLabel as="h2">{t("admin.overview.statusTitle")}</SectionLabel>
          <div className={styles.breakdown}>
            {ACCOUNT_STATUS_ORDER.map((s) => (
              <div key={s} className={styles.breakdownRow}>
                <StatusBadge tone={accountStatusTone(s)} label={t(`status.${s}`)} size="sm" />
                <span className={styles.breakdownNum}>{byStatus[s] ?? 0}</span>
              </div>
            ))}
          </div>
          <p className={styles.note}>
            {t("admin.overview.staffNote", { count: data.staff.total })}
          </p>
        </Card>

        <Card>
          <SectionLabel as="h2">{t("admin.overview.keyTitle")}</SectionLabel>
          {data.signingKey ? (
            <DescriptionList
              columns={1}
              items={[
                {
                  term: t("admin.overview.key.current"),
                  value: <code className={styles.mono}>{data.signingKey.kid}</code>,
                },
                {
                  term: t("admin.overview.key.age"),
                  value: t("admin.overview.key.ageValue", { count: data.signingKey.ageDays }),
                },
                {
                  term: t("admin.overview.key.previous"),
                  value: data.signingKey.previousKid ? (
                    <code className={styles.mono}>{data.signingKey.previousKid}</code>
                  ) : (
                    t("common.none")
                  ),
                },
              ]}
            />
          ) : (
            <p className={styles.note}>{t("admin.overview.key.none")}</p>
          )}
        </Card>
      </div>
    </div>
  );
};

export default OverviewPage;
