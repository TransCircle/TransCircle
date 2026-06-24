import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { adminApi } from "../../api/client";
import type { AdminUserDetail, AccountStatus } from "../../api/types";
import { useFormatTs } from "../../utils/datetime";
import AdminStepUpDialog from "../../components/AdminStepUpDialog";
import admin from "./Admin.module.css";
import {
  PageHeader,
  Card,
  SectionLabel,
  DescriptionList,
  StatusBadge,
  Pill,
  Alert,
  Spinner,
  AdminButton as Button,
  ConfirmDialog,
  ReasonPromptDialog,
  type BadgeTone,
} from "../../components/ui";
import styles from "../Page.module.css";

const statusTone = (s: AccountStatus): BadgeTone => {
  switch (s) {
    case "active":
      return "green";
    case "banned":
      return "red";
    case "suspended":
    case "pending_verification":
    case "pending_deletion":
      return "amber";
    default:
      return "muted";
  }
};

type ActionKey = "force-logout" | "reset-2fa" | "suspend" | "unsuspend" | "ban" | "unban" | "delete";

interface PendingAction {
  key: ActionKey;
  path: string;
  body?: Record<string, unknown>;
}

const UserDetailPage = () => {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<ActionKey | null>(null);

  // 对话框状态
  const [confirmKey, setConfirmKey] = useState<ActionKey | null>(null);
  const [reasonKey, setReasonKey] = useState<ActionKey | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const pendingRef = useRef<PendingAction | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const res = await adminApi.get<AdminUserDetail>(`/v1/admin/users/${id}`);
    setLoading(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setUser(res.data);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (p: PendingAction) => {
      if (!id) return;
      setBusyKey(p.key);
      setError(null);
      setNotice(null);
      const res = await adminApi.post(p.path, p.body);
      if (!res.ok) {
        if (res.status === 403 && res.error.code === "STEP_UP_REQUIRED") {
          pendingRef.current = p;
          setBusyKey(null);
          setConfirmKey(null);
          setReasonKey(null);
          setStepUpOpen(true);
          return;
        }
        setBusyKey(null);
        setError(res.error.message);
        return;
      }
      setBusyKey(null);
      setConfirmKey(null);
      setReasonKey(null);
      setReasonText("");
      setNotice(t("admin.users.actionOk"));
      await load();
    },
    [id, load, t],
  );

  const onStepUpVerified = () => {
    const p = pendingRef.current;
    pendingRef.current = null;
    if (p) void runAction(p);
  };

  if (loading) return <div className={styles.page}><Spinner size="lg" label={t("common.loading")} /></div>;
  if (!user) {
    return (
      <div className={styles.page}>
        <PageHeader title={t("admin.users.detailTitle")} actions={<Button variant="secondary" onClick={() => navigate("/admin/users")}>{t("admin.users.back")}</Button>} />
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    );
  }

  const path = (a: string) => `/v1/admin/users/${id}/${a}`;
  const reasonTitleKey: Record<string, string> = {
    suspend: "admin.users.suspendTitle",
    ban: "admin.users.banTitle",
    unban: "admin.users.unbanTitle",
    delete: "admin.users.deleteTitle",
  };

  const isActive = user.status === "active";
  const isSuspended = user.status === "suspended";
  const isBanned = user.status === "banned";

  return (
    <div className={styles.page}>
      <PageHeader
        title={user.displayName || user.username || user.email}
        description={user.email}
        actions={
          <Button variant="secondary" size="sm" onClick={() => navigate("/admin/users")}>
            {t("admin.users.back")}
          </Button>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Card>
        <DescriptionList
          items={[
            { term: t("admin.users.username"), value: user.username ?? "—" },
            { term: t("admin.users.email"), value: <span><code className={styles.code}>{user.email}</code>{" "}<StatusBadge size="sm" tone={user.emailVerified ? "green" : "amber"} label={user.emailVerified ? t("account.profile.emailVerified") : t("account.profile.emailUnverified")} /></span> },
            { term: t("admin.users.status"), value: <StatusBadge size="sm" tone={statusTone(user.status)} label={t(`status.${user.status}`)} /> },
            { term: t("admin.users.createdAt"), value: fmt(user.createdAt) || "—" },
            { term: t("admin.users.lastLoginAt"), value: fmt(user.lastLoginAt) || t("common.never") },
          ]}
        />
      </Card>

      <Card>
        <SectionLabel>{t("admin.users.security")}</SectionLabel>
        <DescriptionList
          items={[
            { term: t("admin.users.hasPassword"), value: user.security.hasPassword ? t("common.yes") : t("common.no") },
            { term: t("admin.users.totp"), value: user.security.totpEnabled ? t("common.enabled") : t("common.disabled") },
            { term: t("admin.users.passkeys"), value: String(user.security.passkeyCount) },
            { term: t("admin.users.activeSessions"), value: String(user.security.activeSessions) },
          ]}
        />
      </Card>

      <Card>
        <SectionLabel>{t("admin.users.oauthProviders")}</SectionLabel>
        {user.oauthProviders.length === 0 ? (
          <p className={styles.subtleNote}>{t("common.none")}</p>
        ) : (
          <div className={styles.actions}>
            {user.oauthProviders.map((o) => (
              <Pill key={o.provider}>{o.provider}{o.providerUsername ? ` · ${o.providerUsername}` : ""}</Pill>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionLabel>{t("admin.users.actions")}</SectionLabel>
        <div className={admin.actionsRow}>
          <Button variant="secondary" loading={busyKey === "force-logout"} onClick={() => setConfirmKey("force-logout")}>
            {t("admin.users.forceLogout")}
          </Button>
          {isSuspended ? (
            <Button variant="secondary" loading={busyKey === "unsuspend"} onClick={() => setConfirmKey("unsuspend")}>
              {t("admin.users.unsuspend")}
            </Button>
          ) : isActive ? (
            <Button variant="secondary" loading={busyKey === "suspend"} onClick={() => { setReasonText(""); setReasonError(undefined); setReasonKey("suspend"); }}>
              {t("admin.users.suspend")}
            </Button>
          ) : null}
        </div>
        <div className={admin.dangerRow}>
          <Button variant="danger" loading={busyKey === "reset-2fa"} onClick={() => setConfirmKey("reset-2fa")}>
            {t("admin.users.reset2fa")}
          </Button>
          {isBanned ? (
            <Button variant="danger" loading={busyKey === "unban"} onClick={() => { setReasonText(""); setReasonError(undefined); setReasonKey("unban"); }}>
              {t("admin.users.unban")}
            </Button>
          ) : (
            <Button variant="danger" loading={busyKey === "ban"} onClick={() => { setReasonText(""); setReasonError(undefined); setReasonKey("ban"); }}>
              {t("admin.users.ban")}
            </Button>
          )}
          <Button variant="danger" loading={busyKey === "delete"} onClick={() => { setReasonText(""); setReasonError(undefined); setReasonKey("delete"); }}>
            {t("admin.users.deleteUser")}
          </Button>
        </div>
      </Card>

      {/* 确认类操作（无需原因） */}
      <ConfirmDialog
        open={confirmKey === "force-logout"}
        title={t("admin.users.forceLogoutTitle")}
        message={t("admin.users.forceLogoutMessage")}
        confirmText={t("common.confirm")}
        cancelText={t("common.cancel")}
        confirmLoading={busyKey === "force-logout"}
        onCancel={() => setConfirmKey(null)}
        onConfirm={() => void runAction({ key: "force-logout", path: path("force-logout") })}
      />
      <ConfirmDialog
        open={confirmKey === "unsuspend"}
        title={t("admin.users.unsuspendTitle")}
        message={t("common.confirm")}
        confirmText={t("common.confirm")}
        cancelText={t("common.cancel")}
        confirmLoading={busyKey === "unsuspend"}
        onCancel={() => setConfirmKey(null)}
        onConfirm={() => void runAction({ key: "unsuspend", path: path("unsuspend") })}
      />
      <ConfirmDialog
        open={confirmKey === "reset-2fa"}
        variant="danger"
        title={t("admin.users.reset2faTitle")}
        message={t("admin.users.reset2faMessage")}
        confirmText={t("common.confirm")}
        cancelText={t("common.cancel")}
        confirmLoading={busyKey === "reset-2fa"}
        onCancel={() => setConfirmKey(null)}
        onConfirm={() => void runAction({ key: "reset-2fa", path: path("reset-2fa") })}
      />

      {/* 需要原因的操作 */}
      <ReasonPromptDialog
        open={reasonKey !== null}
        variant={reasonKey === "ban" || reasonKey === "delete" ? "danger" : "default"}
        title={reasonKey ? t(reasonTitleKey[reasonKey] ?? "admin.users.actions") : ""}
        prompt={t("admin.users.reasonLabel")}
        placeholder={t("admin.users.reasonPlaceholder")}
        value={reasonText}
        onChange={setReasonText}
        maxLength={500}
        counterText={`${reasonText.length} / 500`}
        error={reasonError}
        submitText={t("common.confirm")}
        cancelText={t("common.cancel")}
        submitting={busyKey === reasonKey}
        onCancel={() => setReasonKey(null)}
        onSubmit={() => {
          if (reasonText.trim().length < 1) {
            setReasonError(t("admin.users.reasonPlaceholder"));
            return;
          }
          if (reasonKey) void runAction({ key: reasonKey, path: path(reasonKey), body: { reason: reasonText.trim() } });
        }}
      />

      <AdminStepUpDialog open={stepUpOpen} onClose={() => setStepUpOpen(false)} onVerified={onStepUpVerified} />
    </div>
  );
};

export default UserDetailPage;
