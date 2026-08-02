import { useRef, useState } from "react";
import { CopyField } from "../admin/shared/CopyField";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { useSession } from "../../context/SessionContext";
import { StepUpDialog } from "../../components/StepUpDialog";
import {
  Card,
  SectionLabel,
  TextField,
  AdminButton as Button,
  Alert,
} from "../../components/ui";
import { Dialog } from "../../components/ui/Dialog";
import s from "./Account.module.css";

/** 后端契约要求的固定确认串(始终原样发送);
    用户在界面上输入的确认短语为本地化文案,仅客户端校验。 */
const CONFIRM_PHRASE = "DELETE-MY-ACCOUNT";

/** 账户注销分区:确认短语 + 密码(若已设)+ step-up。 */
export function DangerSection() {
  const { t } = useTranslation();
  const { user } = useSession();
  const hasPassword = user?.passwordSet ?? false;

  const [requested, setRequested] = useState(false);
  /**
   * 无邮箱账户的一次性撤销链接。
   *
   * 没有邮箱就没有地方发那封撤销邮件；账户又会立刻进入注销冷静期、登录被拒 ——
   * 不当场把链接给他，「30 天内可撤销」对这类账户就是句空话。
   * 这是他唯一一次看到它的机会，所以要摆在最显眼的位置并提示立即保存。
   */
  const [cancelUrl, setCancelUrl] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const phraseRef = useRef<HTMLInputElement>(null);

  /** 界面上要求用户输入的本地化确认短语(仅客户端校验,见 CONFIRM_PHRASE)。 */
  const localizedPhrase = t("account.danger.confirmPhrase");

  const submitDelete = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      const body: Record<string, unknown> = { confirmation: CONFIRM_PHRASE };
      if (hasPassword) body.password = password;
      const res = await api.post<{ cancelUrl?: string }>("/v1/me/delete", body, { idempotent: true });
      if (res.ok) {
        setRequested(true);
        setCancelUrl(res.data?.cancelUrl ?? null);
        setDeleteOpen(false);
        return;
      }
      if (res.status === 403 && res.error.code === "STEP_UP_REQUIRED") {
        setStepUpOpen(true);
        return;
      }
      setDeleteError(res.error.message);
    } finally {
      setDeleting(false);
    }
  };

  const phraseOk = phrase.trim() === localizedPhrase;
  const canSubmit = phraseOk && (!hasPassword || password.length > 0);

  return (
    <section className={s.group}>
      <h2 className={s.groupTitle}>{t("account.nav.danger")}</h2>
      {requested && (
        <div className={s.groupFeedback}>
          <Alert tone="success">
            <strong>{t("account.danger.deleteRequestedTitle")}</strong>
            <div>
              {cancelUrl
                ? t("account.danger.deleteRequestedNoEmail")
                : t("account.danger.deleteRequestedDesc")}
            </div>
          </Alert>
          {cancelUrl && (
            // 一次性链接：离开这一页就再也拿不到了。
            <Alert tone="info">
              <strong>{t("account.danger.cancelLinkTitle")}</strong>
              <div className={s.muted}>{t("account.danger.cancelLinkDesc")}</div>
              <CopyField value={cancelUrl} ariaLabel={t("account.danger.cancelLinkLabel")} />
            </Alert>
          )}
        </div>
      )}

      <Card className={s.dangerCard}>
        <SectionLabel>{t("account.danger.deleteTitle")}</SectionLabel>
        <div className={s.stackSm}>
          <p className={s.muted}>{t("account.danger.deleteDesc")}</p>
          <div className={s.actions}>
            <Button
              variant="danger"
              disabled={requested}
              onClick={() => {
                setPhrase("");
                setPassword("");
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              {t("account.danger.delete")}
            </Button>
          </div>
        </div>
      </Card>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        busy={deleting}
        tone="danger"
        title={t("account.danger.deleteConfirmTitle")}
        description={t("account.danger.deleteConfirmMessage")}
        initialFocusRef={phraseRef}
        footer={
          <>
            <Button variant="secondary" disabled={deleting} onClick={() => setDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" loading={deleting} disabled={!canSubmit} onClick={() => void submitDelete()}>
              {t("account.danger.delete")}
            </Button>
          </>
        }
      >
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) void submitDelete();
          }}
        >
          {deleteError && <Alert tone="error">{deleteError}</Alert>}
          <div className={s.stackSm}>
            <p className={s.muted}>{t("account.danger.confirmInstruction")}</p>
            {/* 短语红色醒目(aria-hidden:朗读交给输入框 aria-label,避免重复播报)。 */}
            <p className={s.dangerPhrase} aria-hidden="true">{localizedPhrase}</p>
            <TextField
              ref={phraseRef}
              aria-label={t("account.danger.confirmTypeLabel", { phrase: localizedPhrase })}
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
              invalid={phrase.length > 0 && !phraseOk}
            />
          </div>
          {hasPassword && (
            <TextField
              label={t("account.danger.passwordLabel")}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </form>
      </Dialog>

      <StepUpDialog
        open={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        onVerified={() => {
          setStepUpOpen(false);
          void submitDelete();
        }}
      />
    </section>
  );
}
