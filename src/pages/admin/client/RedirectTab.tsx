import { useTranslation } from "react-i18next";
import { Card, EmptyState, SectionLabel } from "../../../components/ui";
import type { AdminClientDetail } from "../../../api/types";
import { SaveBar } from "../shared/SaveBar";
import { UriEditor } from "../shared/UriEditor";
import type { CardEdit } from "../shared/useCardEdit";
import styles from "../Admin.module.css";

export const REDIRECT_KEYS = ["redirectUris"] as const;
export const POST_LOGOUT_KEYS = ["postLogoutRedirectUris"] as const;

interface RedirectTabProps {
  client: AdminClientDetail;
  canManage: boolean;
  disabledHint: string;
  edit: CardEdit<AdminClientDetail>;
  onSave: (keys: readonly string[]) => void;
}

export function RedirectTab({ client, canManage, disabledHint, edit, onSave }: RedirectTabProps) {
  const { t } = useTranslation();
  const { value, setField, changesFor, resetKeys } = edit;

  if (client.applicationType === "m2m") {
    return (
      <Card>
        <EmptyState
          title={t("admin.clientDetail.m2mNoRedirectTitle")}
          description={t("admin.clientDetail.m2mNoRedirectDesc")}
        />
      </Card>
    );
  }

  return (
    <div className={styles.stack}>
      <Card>
        <SectionLabel as="h2">{t("admin.clientDetail.redirectTitle")}</SectionLabel>
        <UriEditor
          label={t("admin.clientDetail.addRedirect")}
          type={client.applicationType}
          value={value("redirectUris") ?? []}
          disabled={!canManage}
          onChange={(v) => setField("redirectUris", v)}
          placeholder="https://api.example.org/auth/callback"
          hint={t("admin.clientDetail.redirectHint")}
          removeLabel={(uri) => t("admin.clientDetail.removeUri", { uri })}
        />
        <SaveBar
          count={changesFor(REDIRECT_KEYS).length}
          disabled={!canManage}
          hint={canManage ? t("admin.clientDetail.redirectRisky") : disabledHint}
          onReset={() => resetKeys(REDIRECT_KEYS)}
          onSave={() => onSave(REDIRECT_KEYS)}
        />
      </Card>

      <Card>
        <SectionLabel as="h2">{t("admin.clientDetail.postLogoutTitle")}</SectionLabel>
        <p className={styles.note}>{t("admin.clientDetail.postLogoutDesc")}</p>
        <UriEditor
          label={t("admin.clientDetail.addPostLogout")}
          type={client.applicationType}
          value={value("postLogoutRedirectUris") ?? []}
          disabled={!canManage}
          onChange={(v) => setField("postLogoutRedirectUris", v)}
          placeholder="https://example.org/"
          removeLabel={(uri) => t("admin.clientDetail.removeUri", { uri })}
        />
        <SaveBar
          count={changesFor(POST_LOGOUT_KEYS).length}
          disabled={!canManage}
          hint={canManage ? t("admin.clientDetail.postLogoutRisky") : disabledHint}
          onReset={() => resetKeys(POST_LOGOUT_KEYS)}
          onSave={() => onSave(POST_LOGOUT_KEYS)}
        />
      </Card>
    </div>
  );
}
