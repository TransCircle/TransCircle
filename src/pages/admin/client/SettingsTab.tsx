import { useTranslation } from "react-i18next";
import {
  Card,
  Checkbox,
  DescriptionList,
  RadioGroup,
  SectionLabel,
  TagInput,
  TextField,
} from "../../../components/ui";
import type { AdminClientDetail, ClientApplicationType, ClientEnvironment } from "../../../api/types";
import { useFormatTs } from "../../../utils/datetime";
import { SaveBar } from "../shared/SaveBar";
import { APPLICATION_TYPES } from "../shared/constants";
import type { CardEdit } from "../shared/useCardEdit";
import styles from "../Admin.module.css";

export const BASIC_KEYS = ["name", "description", "clientUri", "logoUri", "contacts"] as const;
export const RUNTIME_KEYS = ["environment", "status", "applicationType"] as const;

interface SettingsTabProps {
  client: AdminClientDetail;
  canManage: boolean;
  disabledHint: string;
  edit: CardEdit<AdminClientDetail>;
  onSave: (keys: readonly string[]) => void;
}

export function SettingsTab({ client, canManage, disabledHint, edit, onSave }: SettingsTabProps) {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  const { value, setField, changesFor, resetKeys } = edit;

  // 应用类型在迁移时是从认证方式猜出来的（none→spa、有密钥→web_backend），
  // 分不清 spa/native、也认不出既有 M2M。因此允许改正一次，确认后锁定。
  const typeEditable = canManage && !client.applicationTypeConfirmed;

  return (
    <div className={styles.stack}>
      <div className={styles.grid2}>
        <Card>
          <SectionLabel as="h2">{t("admin.clientDetail.basicTitle")}</SectionLabel>
          <div className={styles.stackSm}>
            <TextField
              label={t("admin.clientDetail.field.name")}
              required
              value={value("name") ?? ""}
              disabled={!canManage}
              hint={t("admin.clientDetail.nameHint")}
              onChange={(e) => setField("name", e.target.value)}
            />
            <TextField
              label={t("admin.clientDetail.field.description")}
              value={value("description") ?? ""}
              disabled={!canManage}
              onChange={(e) => setField("description", e.target.value)}
            />
            <TextField
              label={t("admin.clientDetail.field.clientUri")}
              value={value("clientUri") ?? ""}
              disabled={!canManage}
              placeholder="https://…"
              onChange={(e) => setField("clientUri", e.target.value)}
            />
            <TextField
              label={t("admin.clientDetail.field.logoUri")}
              value={value("logoUri") ?? ""}
              disabled={!canManage}
              placeholder="https://…"
              onChange={(e) => setField("logoUri", e.target.value)}
            />
            <TagInput
              label={t("admin.clientDetail.field.contacts")}
              value={value("contacts") ?? []}
              maxTagLength={64}
              hint={t("admin.clientDetail.contactsHint")}
              removeTagLabel={(tag) => t("admin.clientDetail.removeContact", { tag })}
              onChange={(v) => canManage && setField("contacts", v)}
            />
          </div>
          <SaveBar
            count={changesFor(BASIC_KEYS).length}
            disabled={!canManage}
            hint={canManage ? t("admin.clientDetail.basicHint") : disabledHint}
            onReset={() => resetKeys(BASIC_KEYS)}
            onSave={() => onSave(BASIC_KEYS)}
          />
        </Card>

        <Card>
          <SectionLabel as="h2">{t("admin.clientDetail.immutableTitle")}</SectionLabel>
          <DescriptionList
            columns={1}
            items={[
              {
                term: t("admin.clientDetail.field.clientId"),
                value: <code className={styles.mono}>{client.clientId}</code>,
              },
              {
                term: t("admin.clientDetail.field.authMethod"),
                value: <code className={styles.mono}>{client.tokenEndpointAuthMethod}</code>,
              },
              { term: t("admin.clientDetail.field.createdAt"), value: fmt(client.createdAt) || "—" },
            ]}
          />
          <p className={styles.note}>{t("admin.clientDetail.immutableNote")}</p>
        </Card>
      </div>

      <Card>
        <SectionLabel as="h2">{t("admin.clientDetail.runtimeTitle")}</SectionLabel>
        <div className={styles.stackSm}>
          <RadioGroup
            label={t("admin.clientDetail.field.environment")}
            orientation="horizontal"
            value={value("environment") ?? "prod"}
            onChange={(v) => setField("environment", v as ClientEnvironment)}
            /* RadioGroup 只认逐选项 disabled，组级属性会被静默忽略。 */
            options={[
              { value: "prod", label: t("admin.env.prod"), disabled: !canManage },
              { value: "dev", label: t("admin.env.dev"), disabled: !canManage },
            ]}
          />
          <Checkbox
            label={
              value("status") === "active"
                ? t("admin.clients.statusActive")
                : t("admin.clients.statusDisabled")
            }
            checked={value("status") === "active"}
            disabled={!canManage}
            hint={t("admin.clientDetail.statusHint")}
            onChange={(e) => setField("status", e.target.checked ? "active" : "disabled")}
          />
          {typeEditable ? (
            <RadioGroup
              label={t("admin.clientDetail.field.applicationType")}
              value={value("applicationType") ?? client.applicationType}
              onChange={(v) => setField("applicationType", v as ClientApplicationType)}
              options={APPLICATION_TYPES.map((k) => ({
                value: k,
                label: t(`admin.appType.${k}.label`),
                hint: t(`admin.appType.${k}.hint`),
              }))}
            />
          ) : (
            <DescriptionList
              columns={1}
              items={[
                {
                  term: t("admin.clientDetail.field.applicationType"),
                  value: t(`admin.appType.${client.applicationType}.label`),
                },
              ]}
            />
          )}
          <p className={styles.note}>
            {typeEditable
              ? t("admin.clientDetail.typeUnconfirmedNote")
              : t("admin.clientDetail.typeConfirmedNote")}
          </p>
        </div>
        <SaveBar
          count={changesFor(RUNTIME_KEYS).length}
          disabled={!canManage}
          hint={canManage ? t("admin.clientDetail.runtimeHint") : disabledHint}
          onReset={() => resetKeys(RUNTIME_KEYS)}
          onSave={() => onSave(RUNTIME_KEYS)}
        />
      </Card>
    </div>
  );
}
