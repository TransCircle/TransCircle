import { useCallback, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { AdminClientDetail, ClientTokenPolicy } from "../../api/types";
import { useAdmin } from "../../context/AdminContext";
import { Alert, Pill, Spinner, StatusBadge, Tabs, type TabItem } from "../../components/ui";
import { PERM } from "./shared/constants";
import { DiffDialog } from "./shared/DiffDialog";
import { useAdminPageHeader } from "./shared/header";
import { useAdminAction } from "./shared/useAdminAction";
import { useAdminResource } from "./shared/useAdminResource";
import { useCardEdit, type EditField } from "./shared/useCardEdit";
import { ClientDangerTab } from "./client/ClientDangerTab";
import { CredentialsTab } from "./client/CredentialsTab";
import { RedirectTab } from "./client/RedirectTab";
import { ScopesTab } from "./client/ScopesTab";
import { SettingsTab } from "./client/SettingsTab";
import { TokensTab } from "./client/TokensTab";
import styles from "./Admin.module.css";

type TabKey = "settings" | "redirect" | "scopes" | "credentials" | "tokens" | "danger";
const TAB_KEYS: readonly TabKey[] = [
  "settings",
  "redirect",
  "scopes",
  "credentials",
  "tokens",
  "danger",
];

/** 客户端详情：6 个分区，每张卡片一个保存按钮。 */
const ClientDetailPage = () => {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const { me, hasPermission } = useAdmin();
  const [searchParams, setSearchParams] = useSearchParams();

  const client = useAdminResource<AdminClientDetail>(id ? `/v1/admin/clients/${id}` : null);
  const save = useAdminAction();
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewKeys, setReviewKeys] = useState<readonly string[] | null>(null);

  const rawTab = searchParams.get("tab") as TabKey | null;
  const tab: TabKey = rawTab && TAB_KEYS.includes(rawTab) ? rawTab : "settings";
  const setTab = useCallback(
    (next: TabKey) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === "settings") params.delete("tab");
          else params.set("tab", next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const entity = client.data;

  useAdminPageHeader({
    title: entity?.name ?? t("admin.head.clientDetail.title"),
    back: { to: "/admin/clients", label: t("admin.nav.clients") },
  });

  const fields = useMemo<ReadonlyArray<EditField<AdminClientDetail>>>(
    () => [
      { key: "name", label: t("admin.clientDetail.field.name") },
      { key: "description", label: t("admin.clientDetail.field.description") },
      { key: "clientUri", label: t("admin.clientDetail.field.clientUri") },
      { key: "logoUri", label: t("admin.clientDetail.field.logoUri") },
      { key: "contacts", label: t("admin.clientDetail.field.contacts") },
      {
        key: "environment",
        label: t("admin.clientDetail.field.environment"),
        risky: true,
        format: (v) => t(`admin.env.${String(v)}`, { defaultValue: String(v) }),
      },
      {
        key: "status",
        label: t("admin.clientDetail.field.status"),
        risky: true,
        format: (v) =>
          v === "active" ? t("admin.clients.statusActive") : t("admin.clients.statusDisabled"),
      },
      {
        key: "applicationType",
        label: t("admin.clientDetail.field.applicationType"),
        risky: true,
        format: (v) => t(`admin.appType.${String(v)}.label`, { defaultValue: String(v) }),
      },
      { key: "redirectUris", label: t("admin.clientDetail.field.redirectUris"), risky: true },
      {
        key: "postLogoutRedirectUris",
        label: t("admin.clientDetail.field.postLogoutRedirectUris"),
        risky: true,
      },
      { key: "allowedScopes", label: t("admin.clientDetail.field.allowedScopes"), risky: true },
      {
        key: "isFirstPartyTrusted",
        label: t("admin.clientDetail.field.isFirstPartyTrusted"),
        risky: true,
        format: (v) => (v ? t("common.yes") : t("common.no")),
      },
      {
        key: "tokenPolicy",
        label: t("admin.clientDetail.field.tokenPolicy"),
        risky: true,
        format: (v) => {
          const p = v as ClientTokenPolicy | null;
          if (!p) return "";
          return t("admin.clientDetail.tokenPolicySummary", {
            access: p.accessTtl,
            refresh: p.refreshTtl,
            rotate: p.rotate ? t("common.yes") : t("common.no"),
          });
        },
      },
    ],
    [t],
  );
  const edit = useCardEdit<AdminClientDetail>(entity, fields);

  const commitSave = async () => {
    if (!entity || !reviewKeys) return;
    const data = await save.run<AdminClientDetail>("save", () =>
      api.patch<AdminClientDetail>(`/v1/admin/clients/${entity.clientId}`, edit.patchFor(reviewKeys), {
        plane: "user",
        ifMatch: entity.updatedAt,
      }),
    );
    if (data) {
      // 新基线取服务端返回的实体：后端会规范化 URI、排序 scope，草稿顶替会漂移。
      client.set(data);
      setNotice(t("admin.save.savedN", { count: reviewKeys.length }));
      setReviewKeys(null);
      save.reset();
    }
  };

  if (client.loading && !entity) return <Spinner size="lg" label={t("common.loading")} />;
  if (!entity) return <Alert tone="error">{client.error ?? t("error.generic")}</Alert>;

  const canManage = hasPermission(PERM.clientManage);
  const disabledHint = t("admin.perm.needed", { perm: PERM.clientManage });
  const viewer = {
    name: me?.displayName || me?.username || t("admin.staff"),
    email: me?.email ?? null,
    avatarUrl: me?.avatarUrl ?? null,
  };

  const tabs: ReadonlyArray<TabItem<TabKey>> = TAB_KEYS.map((k) => ({
    key: k,
    label: t(`admin.clientDetail.tabs.${k}`),
  }));

  const reviewChanges = reviewKeys ? edit.changesFor(reviewKeys) : [];
  const saveError = save.staleValues ? (
    <span className={styles.stackSm}>
      <span>{save.error}</span>
      <pre className={styles.code}>{JSON.stringify(save.staleValues, null, 2)}</pre>
    </span>
  ) : (
    save.error
  );

  const onDone = (message: string) => {
    setNotice(message);
    client.reload();
  };

  return (
    <div className={styles.stack}>
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className={styles.detailHead}>
        <div>
          <div className={styles.row}>
            <h2 className={styles.detailName}>{entity.name}</h2>
            <StatusBadge
              tone={entity.status === "active" ? "green" : "muted"}
              size="sm"
              label={
                entity.status === "active"
                  ? t("admin.clients.statusActive")
                  : t("admin.clients.statusDisabled")
              }
            />
            <Pill tone={entity.environment === "prod" ? "accent" : "neutral"}>
              {t(`admin.env.${entity.environment}`)}
            </Pill>
          </div>
          <p className={styles.detailId}>{t(`admin.appType.${entity.applicationType}.label`)}</p>
        </div>
      </div>

      <Tabs
        items={tabs}
        value={tab}
        onChange={setTab}
        ariaLabel={t("admin.clientDetail.tabsLabel")}
        panelId="admin-client-panel"
      />

      <div id="admin-client-panel">
        {tab === "settings" && (
          <SettingsTab
            client={entity}
            canManage={canManage}
            disabledHint={disabledHint}
            edit={edit}
            onSave={setReviewKeys}
          />
        )}
        {tab === "redirect" && (
          <RedirectTab
            client={entity}
            canManage={canManage}
            disabledHint={disabledHint}
            edit={edit}
            onSave={setReviewKeys}
          />
        )}
        {tab === "scopes" && (
          <ScopesTab
            canManage={canManage}
            disabledHint={disabledHint}
            edit={edit}
            viewer={viewer}
            onSave={setReviewKeys}
          />
        )}
        {tab === "credentials" && (
          <CredentialsTab
            client={entity}
            canManage={canManage}
            disabledHint={disabledHint}
            onDone={setNotice}
            onChanged={client.reload}
          />
        )}
        {tab === "tokens" && (
          <TokensTab
            client={entity}
            canManage={canManage}
            disabledHint={disabledHint}
            edit={edit}
            onSave={setReviewKeys}
          />
        )}
        {tab === "danger" && (
          <ClientDangerTab
            client={entity}
            canManage={canManage}
            disabledHint={disabledHint}
            onDone={onDone}
            onChanged={client.reload}
          />
        )}
      </div>

      {reviewKeys && reviewChanges.length > 0 && (
        <DiffDialog
          subject={entity.name}
          changes={reviewChanges}
          busy={save.pending === "save"}
          error={saveError}
          forceStepUp={save.stepUpRequired}
          onCancel={() => {
            setReviewKeys(null);
            save.reset();
          }}
          onCommit={() => void commitSave()}
        />
      )}
    </div>
  );
};

export default ClientDetailPage;
