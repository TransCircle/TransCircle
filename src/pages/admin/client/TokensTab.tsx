import { useTranslation } from "react-i18next";
import { Card, Checkbox, SectionLabel, Select } from "../../../components/ui";
import type { AdminClientDetail, ClientTokenPolicy } from "../../../api/types";
import { SaveBar } from "../shared/SaveBar";
import {
  ABSOLUTE_TTL_OPTIONS,
  ACCESS_TTL_OPTIONS,
  REFRESH_TTL_OPTIONS,
} from "../shared/constants";
import type { CardEdit } from "../shared/useCardEdit";
import styles from "../Admin.module.css";

export const TOKEN_KEYS = ["tokenPolicy"] as const;

const DEFAULT_POLICY: ClientTokenPolicy = {
  accessTtl: 900,
  refreshTtl: 2592000,
  rotate: true,
  absoluteTtl: 7776000,
};

interface TokensTabProps {
  client: AdminClientDetail;
  canManage: boolean;
  disabledHint: string;
  edit: CardEdit<AdminClientDetail>;
  onSave: (keys: readonly string[]) => void;
}

/** 令牌策略按客户端单独设置：收紧访问令牌能缩短「封禁后仍能用」的窗口，代价是刷新更频繁。 */
export function TokensTab({ client, canManage, disabledHint, edit, onSave }: TokensTabProps) {
  const { t } = useTranslation();
  const { value, setField, changesFor, resetKeys } = edit;
  const policy = value("tokenPolicy") ?? DEFAULT_POLICY;
  // 服务间调用没有用户在场，也就没有刷新令牌与会话上限可言。
  const isM2m = client.applicationType === "m2m";

  const patch = (next: Partial<ClientTokenPolicy>) => setField("tokenPolicy", { ...policy, ...next });

  /**
   * 当前值不在可选档位里时（m2m 恒为 0；或历史/手工数据留下的旧值），
   * 补一条只读性质的条目进去 —— 否则下拉框会显示成空白，
   * 看的人无从知道这个客户端现在到底是什么设置。
   */
  const absoluteOptions = (() => {
    const base = ABSOLUTE_TTL_OPTIONS.map((v) => ({ value: v, label: t(`admin.ttl.absolute.${v}`) }));
    const current = String(policy.absoluteTtl);
    if (base.some((o) => o.value === current)) return base;
    return [
      {
        value: current,
        label: isM2m
          ? t("admin.clientDetail.m2mAbsoluteNone")
          : t("admin.clientDetail.absoluteTtlLegacy", { seconds: current }),
      },
      ...base,
    ];
  })();

  return (
    <Card>
      <SectionLabel as="h2">{t("admin.clientDetail.tokensTitle")}</SectionLabel>
      <p className={styles.note}>{t("admin.clientDetail.tokensDesc")}</p>
      <div className={styles.grid2}>
        <Select
          label={t("admin.clientDetail.accessTtl")}
          value={String(policy.accessTtl)}
          disabled={!canManage}
          hint={t("admin.clientDetail.accessTtlHint")}
          onChange={(v) => patch({ accessTtl: Number(v) })}
          options={ACCESS_TTL_OPTIONS.map((v) => ({ value: v, label: t(`admin.ttl.access.${v}`) }))}
        />
        <Select
          label={t("admin.clientDetail.refreshTtl")}
          value={String(policy.refreshTtl)}
          disabled={!canManage || isM2m}
          hint={isM2m ? t("admin.clientDetail.m2mNoRefresh") : t("admin.clientDetail.refreshTtlHint")}
          onChange={(v) => patch({ refreshTtl: Number(v) })}
          options={REFRESH_TTL_OPTIONS.map((v) => ({ value: v, label: t(`admin.ttl.refresh.${v}`) }))}
        />
        <Select
          label={t("admin.clientDetail.absoluteTtl")}
          value={String(policy.absoluteTtl)}
          disabled={!canManage || isM2m}
          hint={isM2m ? t("admin.clientDetail.m2mNoAbsolute") : t("admin.clientDetail.absoluteTtlHint")}
          onChange={(v) => patch({ absoluteTtl: Number(v) })}
          options={absoluteOptions}
        />
      </div>
      <div className={styles.noteSpaced}>
        <Checkbox
          label={t("admin.clientDetail.rotateLabel")}
          checked={policy.rotate}
          disabled={!canManage || isM2m}
          hint={t("admin.clientDetail.rotateHint")}
          onChange={(e) => patch({ rotate: e.target.checked })}
        />
      </div>
      <SaveBar
        count={changesFor(TOKEN_KEYS).length}
        disabled={!canManage}
        hint={canManage ? t("admin.clientDetail.tokensRisky") : disabledHint}
        onReset={() => resetKeys(TOKEN_KEYS)}
        onSave={() => onSave(TOKEN_KEYS)}
      />
    </Card>
  );
}
