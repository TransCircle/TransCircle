import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { useSession } from "../../context/SessionContext";
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

const CONFIRM_PHRASE = "DELETE-MY-ACCOUNT";

/** 账户安全：账户注销（确认短语 + 密码 + step-up）。 */
const DangerZonePage = () => {
  const { t } = useTranslation();
  const { user } = useSession();
  const hasPassword = user?.passwordSet ?? false;

  const [notice, setNotice] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);

  const submitDelete = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      const body: Record<string, unknown> = { confirmation: CONFIRM_PHRASE };
      if (hasPassword) body.password = password;
      const res = await api.post("/v1/me/delete", body, { idempotent: true });
      if (res.ok) {
        setNotice(t("account.danger.deleteRequested"));
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

  const phraseOk = phrase.trim() === CONFIRM_PHRASE;
  const canSubmit = phraseOk && (!hasPassword || password.length > 0);

  return (
    <div className={`${page.page} ${page.pageNarrow}`}>
      <PageHeader title={t("account.danger.title")} description={t("account.danger.subtitle")} />
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className={s.cardStack}>
        <Card className={s.dangerCard}>
          <SectionLabel>{t("account.danger.deleteTitle")}</SectionLabel>
          <p className={s.muted}>{t("account.danger.deleteDesc")}</p>
          <div className={s.actions}>
            <Button
              variant="danger"
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
        </Card>
      </div>

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
            label={t("account.danger.confirmTypeLabel", { phrase: CONFIRM_PHRASE })}
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
