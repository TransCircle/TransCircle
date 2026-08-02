import { useTranslation } from "react-i18next";
import {
  AdminButton as Button,
  Card,
  Checkbox,
  DescriptionList,
  SectionLabel,
  StatusBadge,
  TextArea,
  TextField,
} from "../../../components/ui";
import type { AdminIamStatus, AdminUserDetail } from "../../../api/types";
import { useFormatTs } from "../../../utils/datetime";
import { SaveBar } from "../shared/SaveBar";
import type { CardEdit } from "../shared/useCardEdit";
import styles from "../Admin.module.css";

export const PROFILE_KEYS = ["displayName", "username", "email", "emailVerified"] as const;
export const NOTE_KEYS = ["adminNote"] as const;

interface ProfileTabProps {
  user: AdminUserDetail;
  iam: AdminIamStatus | null;
  canEdit: boolean;
  /** 不能编辑的原因（无权限 / 目标是工作人员），写在保存条上而不是让按钮默默变灰。 */
  disabledHint: string;
  edit: CardEdit<AdminUserDetail>;
  onSave: (keys: readonly string[]) => void;
  /** 解除登录失败锁定。锁定是自动加上的，必须有对应的人工解除手段。 */
  onUnlock: () => void;
  unlocking: boolean;
}

export function ProfileTab({ user, iam, canEdit, disabledHint, edit, onSave, onUnlock, unlocking }: ProfileTabProps) {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  const { value, setField, changesFor, resetKeys } = edit;

  const iamValue = () => {
    // 判定还没回来时不要显示「未绑定」—— 那是一个确定的结论，此刻我们并不知道。
    if (!iam) return t("common.loading");
    if (iam.verdict === "not_staff") return t("admin.userDetail.iam.unbound");
    if (iam.verdict === "staff") {
      return (
        <span className={styles.row}>
          <StatusBadge
            tone="blue"
            size="sm"
            label={t("admin.userDetail.iam.staffBadge", {
              role: iam.roles[0] ?? t("admin.access.directGrant"),
            })}
          />
          <span className={styles.note}>
            {t("admin.userDetail.iam.checkedAt", { at: fmt(iam.checkedAt) || "—" })}
          </span>
        </span>
      );
    }
    if (iam.verdict === "staff_assumed") {
      return (
        <span className={styles.row}>
          <StatusBadge tone="amber" size="sm" label={t("admin.userDetail.iam.assumedBadge")} />
          <span className={styles.note}>{t("admin.userDetail.iam.unreachable")}</span>
        </span>
      );
    }
    return <StatusBadge tone="muted" size="sm" label={t("admin.userDetail.iam.exStaffBadge")} />;
  };

  return (
    <div className={styles.stack}>
      <div className={styles.grid2}>
        <Card>
          <SectionLabel as="h2">{t("admin.userDetail.profile.title")}</SectionLabel>
          <div className={styles.stackSm}>
            <TextField
              label={t("admin.userDetail.field.displayName")}
              value={value("displayName") ?? ""}
              disabled={!canEdit}
              onChange={(e) => setField("displayName", e.target.value)}
            />
            <TextField
              label={t("admin.userDetail.field.username")}
              value={value("username") ?? ""}
              disabled={!canEdit}
              hint={t("admin.userDetail.profile.usernameHint")}
              onChange={(e) => setField("username", e.target.value)}
            />
            <TextField
              label={t("admin.userDetail.field.email")}
              type="email"
              value={value("email") ?? ""}
              disabled={!canEdit}
              onChange={(e) => setField("email", e.target.value)}
            />
            <Checkbox
              label={t("admin.userDetail.profile.markVerified")}
              checked={!!value("emailVerified")}
              disabled={!canEdit}
              hint={t("admin.userDetail.profile.markVerifiedHint")}
              onChange={(e) => setField("emailVerified", e.target.checked)}
            />
          </div>
          <SaveBar
            count={changesFor(PROFILE_KEYS).length}
            disabled={!canEdit}
            hint={canEdit ? t("admin.userDetail.profile.riskyHint") : disabledHint}
            onReset={() => resetKeys(PROFILE_KEYS)}
            onSave={() => onSave(PROFILE_KEYS)}
          />
        </Card>

        <Card>
          <SectionLabel as="h2">{t("admin.userDetail.account.title")}</SectionLabel>
          <DescriptionList
            columns={1}
            items={[
              { term: t("admin.userDetail.account.created"), value: fmt(user.createdAt) || "—" },
              {
                term: t("admin.userDetail.account.lastActive"),
                value: fmt(user.lastActiveAt ?? user.lastLoginAt) || "—",
              },
              {
                term: t("admin.userDetail.account.lockedUntil"),
                value: user.lockedUntil ? (
                  <span className={styles.row}>
                    {t("admin.userDetail.account.lockedValue", { at: fmt(user.lockedUntil) })}
                    {canEdit && (
                      <Button size="sm" variant="ghost" loading={unlocking} onClick={onUnlock}>
                        {t("admin.userDetail.account.unlock")}
                      </Button>
                    )}
                  </span>
                ) : (
                  t("common.none")
                ),
              },
              {
                term: t("admin.userDetail.account.sessions"),
                value: t("admin.userDetail.account.countUnit", { count: user.security.activeSessions }),
              },
              {
                term: t("admin.userDetail.account.grants"),
                value: t("admin.userDetail.account.countUnit", { count: user.grantCount }),
              },
              { term: t("admin.userDetail.account.iam"), value: iamValue() },
            ]}
          />
        </Card>
      </div>

      <Card>
        <SectionLabel as="h2">{t("admin.userDetail.note.title")}</SectionLabel>
        <p className={styles.note}>{t("admin.userDetail.note.desc")}</p>
        <TextArea
          label={t("admin.userDetail.field.adminNote")}
          rows={3}
          value={value("adminNote") ?? ""}
          disabled={!canEdit}
          onChange={(e) => setField("adminNote", e.target.value)}
        />
        <SaveBar
          count={changesFor(NOTE_KEYS).length}
          disabled={!canEdit}
          hint={canEdit ? t("admin.userDetail.note.hint") : disabledHint}
          onReset={() => resetKeys(NOTE_KEYS)}
          onSave={() => onSave(NOTE_KEYS)}
        />
      </Card>
    </div>
  );
}
