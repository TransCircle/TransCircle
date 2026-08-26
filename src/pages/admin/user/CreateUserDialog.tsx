import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import { AdminButton as Button, Alert, Modal, TextArea, TextField } from "../../../components/ui";
import { generatePassword, PASSWORD_MIN_LENGTH } from "../shared/constants";
import { StepUpPanel } from "../shared/StepUpPanel";
import { useAdminAction } from "../shared/useAdminAction";
import styles from "../Admin.module.css";

interface CreateUserDialogProps {
  onClose: () => void;
  /** 创建成功后跳转到新账户详情页。 */
  onCreated: (userId: string) => void;
}

interface CreateUserResponse {
  user: { id: string };
  temporaryPassword: boolean;
}

/**
 * 管理员手动添加用户。
 *
 * 后端契约（POST /v1/admin/users，pass.user:write + step-up）：建号视为「管理员已背书该身份」，
 * 后端落库为 status=active、emailVerified=true、mustChangePassword=true —— 即账户立即可用，
 * 但首次登录会被要求修改管理员设置的临时密码。
 */
export function CreateUserDialog({ onClose, onCreated }: CreateUserDialogProps) {
  const { t } = useTranslation();
  const action = useAdminAction();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [stepUp, setStepUp] = useState(false);

  // 后端要求二次验证（如 step-up 窗口在填写期间过期）时就地升级，不丢表单。
  useEffect(() => {
    if (action.stepUpRequired) setStepUp(true);
  }, [action.stepUpRequired]);
  // 非 step-up 的失败（如用户名/邮箱占用）应回到表单让人改正，而不是卡在验证面板里。
  useEffect(() => {
    if (action.error && !action.stepUpRequired) setStepUp(false);
  }, [action.error, action.stepUpRequired]);

  const busy = action.pending === "create-user";
  const fieldsLocked = stepUp || busy;
  const valid =
    username.trim().length > 0 &&
    displayName.trim().length > 0 &&
    password.length >= PASSWORD_MIN_LENGTH;

  const create = async () => {
    const data = await action.run<CreateUserResponse>("create-user", (idem) =>
      api.post<CreateUserResponse>(
        "/v1/admin/users",
        {
          username: username.trim(),
          email: email.trim() || null,
          displayName: displayName.trim(),
          password,
          adminNote: adminNote.trim() || null,
        },
        { plane: "user", idempotent: idem },
      ),
    );
    if (data) onCreated(data.user.id);
  };

  return (
    <Modal
      open
      size="md"
      closeOnOverlayClick={!stepUp && !busy}
      onClose={onClose}
      title={t("admin.users.create.title")}
      description={t("admin.users.create.desc")}
      footer={
        stepUp ? null : (
          <>
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={!valid || busy}
              loading={busy}
              onClick={() => setStepUp(true)}
            >
              {t("admin.users.create.submit")}
            </Button>
          </>
        )
      }
    >
      <div className={styles.stackSm}>
        <TextField
          label={t("admin.users.create.username")}
          required
          value={username}
          hint={t("admin.users.create.usernameHint")}
          disabled={fieldsLocked}
          onChange={(e) => setUsername(e.target.value)}
        />
        <TextField
          label={t("admin.users.create.displayName")}
          required
          value={displayName}
          disabled={fieldsLocked}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <TextField
          label={t("admin.users.create.email")}
          value={email}
          hint={t("admin.users.create.emailHint")}
          disabled={fieldsLocked}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label={t("admin.users.create.password")}
          required
          value={password}
          hint={t("admin.users.create.passwordHint")}
          invalid={password.length > 0 && password.length < PASSWORD_MIN_LENGTH}
          disabled={fieldsLocked}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className={styles.row}>
          <Button
            variant="ghost"
            size="sm"
            disabled={fieldsLocked}
            onClick={() => setPassword(generatePassword(16))}
          >
            {t("admin.users.create.generate")}
          </Button>
        </div>
        <TextArea
          label={t("admin.users.create.note")}
          value={adminNote}
          hint={t("admin.users.create.noteHint")}
          disabled={fieldsLocked}
          rows={3}
          maxLength={1000}
          onChange={(e) => setAdminNote(e.target.value)}
        />
        {action.error && <Alert tone="error">{action.error}</Alert>}
        {stepUp && (
          <StepUpPanel
            what={t("admin.users.create.stepUpWhat")}
            onVerified={() => void create()}
            onCancel={() => setStepUp(false)}
          />
        )}
      </div>
    </Modal>
  );
}
