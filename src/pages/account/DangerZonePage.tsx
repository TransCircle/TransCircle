import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { useSession } from "../../context/SessionContext";
import { usePageTitle } from "../../utils/usePageTitle";
import { StepUpDialog } from "../../components/StepUpDialog";
import {
  Card,
  PageHeader,
  SectionLabel,
  TextField,
  AdminButton as Button,
  Alert,
  Modal,
} from "../../components/ui";
import page from "../Page.module.css";
import s from "./Account.module.css";

/** 后端契约要求的固定确认串(始终原样发送);
    用户在界面上输入的确认短语为本地化文案,仅客户端校验。 */
const CONFIRM_PHRASE = "DELETE-MY-ACCOUNT";

/** 账户安全：账户注销（确认短语 + 密码 + step-up）。 */
const DangerZonePage = () => {
  const { t } = useTranslation();
  const { user } = useSession();
  const hasPassword = user?.passwordSet ?? false;

  const [requested, setRequested] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);

  usePageTitle(t("account.nav.danger"));

  /** 界面上要求用户输入的本地化确认短语(仅客户端校验,见 CONFIRM_PHRASE)。 */
  const localizedPhrase = t("account.danger.confirmPhrase");

  const submitDelete = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      const body: Record<string, unknown> = { confirmation: CONFIRM_PHRASE };
      if (hasPassword) body.password = password;
      const res = await api.post("/v1/me/delete", body, { idempotent: true });
      if (res.ok) {
        setRequested(true);
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
    <div className={`${page.page} ${page.pageNarrow}`}>
      <PageHeader title={t("account.danger.title")} description={t("account.danger.subtitle")} />
      {requested && (
        <Alert tone="success">
          <strong>{t("account.danger.deleteRequestedTitle")}</strong>
          <div>{t("account.danger.deleteRequestedDesc")}</div>
        </Alert>
      )}

      <section className={s.sectionFirst}>
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
      </section>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t("account.danger.deleteConfirmTitle")}
        description={t("account.danger.deleteConfirmMessage")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" loading={deleting} disabled={!canSubmit} onClick={() => void submitDelete()}>
              {t("account.danger.delete")}
            </Button>
          </>
        }
      >
        <div className={s.form}>
          {deleteError && <Alert tone="error">{deleteError}</Alert>}
          <TextField
            label={t("account.danger.confirmTypeLabel", { phrase: localizedPhrase })}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="off"
            invalid={phrase.length > 0 && !phraseOk}
          />
          {hasPassword && (
            <TextField
              label={t("account.danger.passwordLabel")}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </div>
      </Modal>

      <StepUpDialog
        open={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        onVerified={() => {
          setStepUpOpen(false);
          void submitDelete();
        }}
      />
    </div>
  );
};

export default DangerZonePage;
