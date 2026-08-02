import { useTranslation } from "react-i18next";
import { Card, Checkbox, SectionLabel } from "../../../components/ui";
import type { AdminClientDetail } from "../../../api/types";
import { ConsentPreview } from "../shared/ConsentPreview";
import { SaveBar } from "../shared/SaveBar";
import { SCOPES } from "../shared/constants";
import type { CardEdit } from "../shared/useCardEdit";
import styles from "../Admin.module.css";

export const SCOPE_KEYS = ["allowedScopes", "isFirstPartyTrusted"] as const;

interface ScopesTabProps {
  canManage: boolean;
  disabledHint: string;
  edit: CardEdit<AdminClientDetail>;
  viewer: { name: string; email: string | null; avatarUrl: string | null };
  onSave: (keys: readonly string[]) => void;
}

export function ScopesTab({ canManage, disabledHint, edit, viewer, onSave }: ScopesTabProps) {
  const { t } = useTranslation();
  const { value, setField, changesFor, resetKeys } = edit;
  const scopes = value("allowedScopes") ?? [];
  const trusted = !!value("isFirstPartyTrusted");

  return (
    <div className={styles.grid2}>
      <Card>
        <SectionLabel as="h2">{t("admin.clientDetail.scopesTitle")}</SectionLabel>
        <div className={styles.stackSm}>
          {SCOPES.map((s) => (
            <Checkbox
              key={s.key}
              label={s.key}
              hint={t(`admin.scopeDesc.${s.key}`)}
              checked={s.locked ? true : scopes.includes(s.key)}
              disabled={!canManage || !!s.locked || (!!s.firstParty && !trusted)}
              onChange={(e) =>
                setField(
                  "allowedScopes",
                  e.target.checked ? [...scopes, s.key] : scopes.filter((x) => x !== s.key),
                )
              }
            />
          ))}
        </div>
        <div className={styles.dangerZone}>
          <Checkbox
            label={t("admin.clientDetail.trustedLabel")}
            checked={trusted}
            disabled={!canManage}
            hint={t("admin.clientDetail.trustedHint")}
            onChange={(e) => {
              const on = e.target.checked;
              setField("isFirstPartyTrusted", on);
              // 第一方专属 scope 在非第一方客户端上是非法组合（422 INVALID_SCOPE_COMBINATION）。
              // 这里同步移除，而不是只把复选框置灰、留一个存不进去的值一路提交到后端。
              if (!on) {
                setField(
                  "allowedScopes",
                  scopes.filter((x) => !SCOPES.find((y) => y.key === x)?.firstParty),
                );
              }
            }}
          />
        </div>
        <SaveBar
          count={changesFor(SCOPE_KEYS).length}
          disabled={!canManage}
          hint={canManage ? t("admin.clientDetail.scopesRisky") : disabledHint}
          onReset={() => resetKeys(SCOPE_KEYS)}
          onSave={() => onSave(SCOPE_KEYS)}
        />
      </Card>

      <Card>
        <SectionLabel as="h2">{t("admin.clientDetail.previewTitle")}</SectionLabel>
        <p className={styles.note}>{t("admin.clientDetail.previewDesc")}</p>
        <ConsentPreview
          trusted={trusted}
          name={value("name") ?? ""}
          clientUri={value("clientUri") ?? null}
          logoUri={value("logoUri") ?? null}
          scopes={scopes}
          viewer={viewer}
        />
      </Card>
    </div>
  );
}
