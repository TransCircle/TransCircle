import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { adminApi } from "../../api/client";
import type { AdminUserDetail, AccountStatus } from "../../api/types";
import { Avatar } from "../../components/Avatar";
import { useFormatTs } from "../../utils/datetime";
import { usePageTitle } from "../../utils/usePageTitle";
import AdminStepUpDialog from "../../components/AdminStepUpDialog";
import admin from "./Admin.module.css";
import {
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
import page from "../Page.module.css";

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

/** 需要填写原因的操作（其余走纯确认框）。 */
const REASON_ACTIONS: ReadonlyArray<ActionKey> = ["suspend", "ban", "unban", "delete"];

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
  // 操作后的重拉用独立的 refreshing：保留现有内容，不整页 Spinner 重挂载（焦点/滚动不丢）。
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<ActionKey | null>(null);

  // 对话框状态
  const [confirmKey, setConfirmKey] = useState<ActionKey | null>(null);
  // 确认框内的接口错误：就近显示在弹窗里、保持弹窗开启可重试，而非关框后在页面顶部展示。
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [reasonKey, setReasonKey] = useState<ActionKey | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);
  // 原因弹窗内的接口错误：就近显示在弹窗里，而非被遮罩挡住的页面顶部。
  const [reasonApiError, setReasonApiError] = useState<string | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const pendingRef = useRef<PendingAction | null>(null);

  usePageTitle(user ? user.displayName || user.username || user.email : t("admin.users.detailTitle"));

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!id) return;
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      setError(null);
      const res = await adminApi.get<AdminUserDetail>(`/v1/admin/users/${id}`);
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setUser(res.data);
    },
    [id],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  const runAction = useCallback(
    async (p: PendingAction) => {
      if (!id) return;
      setBusyKey(p.key);
      setError(null);
      setNotice(null);
      setReasonApiError(null);
      setConfirmError(null);
      const res = await adminApi.post(p.path, p.body);
      if (!res.ok) {
        if (res.status === 403 && res.error.code === "STEP_UP_REQUIRED") {
          pendingRef.current = p;
          setBusyKey(null);
          // 确认/原因弹窗保持挂载，仅在 step-up 期间隐藏（对齐 ClientsPage）：
          // 取消 step-up 后自动恢复（原因文本不丢），验证后重放若失败也能在弹窗内就近报错。
          setStepUpOpen(true);
          return;
        }
        setBusyKey(null);
        if (REASON_ACTIONS.includes(p.key)) {
          // 原因弹窗仍开着：错误显示在弹窗内，用户可直接修改后重试。
          setReasonApiError(res.error.message);
        } else {
          // 确认框保持开启：错误就近显示在框内，可直接重试。
          setConfirmError(res.error.message);
        }
        return;
      }
      setBusyKey(null);
      setConfirmKey(null);
      setReasonKey(null);
      setReasonText("");
      if (p.key === "delete") {
        // 用户已删除：重拉详情只会 404，回到列表页；replace 防止「后退」又落回已删页面。
        navigate("/admin/users", { replace: true });
        return;
      }
      setNotice(t("admin.users.actionOk"));
      await load("refresh");
    },
    [id, load, t, navigate],
  );

  const onStepUpVerified = () => {
    const p = pendingRef.current;
    pendingRef.current = null;
    if (p) void runAction(p);
  };

  // 取消 step-up：同时丢弃待重放的操作（对齐 ClientsPage.closeStepUp），
  // 否则下次验证通过会重放早已被用户放弃的旧操作。
  const closeStepUp = () => {
    pendingRef.current = null;
    setStepUpOpen(false);
  };

  const openConfirm = (key: ActionKey) => {
    setConfirmError(null);
    setConfirmKey(key);
  };
  const closeConfirm = () => {
    setConfirmKey(null);
    setConfirmError(null);
  };

  const openReason = (key: ActionKey) => {
    setReasonText("");
    setReasonError(undefined);
    setReasonApiError(null);
    setReasonKey(key);
  };
  const closeReason = () => setReasonKey(null);

  const path = (a: string) => `/v1/admin/users/${id}/${a}`;

  const submitReason = () => {
    const trimmed = reasonText.trim();
    if (trimmed.length < 1) {
      // 聚焦回输入框由 ReasonPromptDialog 在 fieldError 出现时统一处理。
      setReasonError(t("admin.users.reasonRequired"));
      return;
    }
    if (reasonKey) void runAction({ key: reasonKey, path: path(reasonKey), body: { reason: trimmed } });
  };

  if (loading) return <div className={admin.page}><Spinner size="lg" label={t("common.loading")} /></div>;
  if (!user) {
    return (
      <div className={admin.detail}>
        <div className={admin.detailHead}>
          <div className={admin.detailIdentityWrap}>
            <button type="button" className={admin.backText} onClick={() => navigate("/admin/users")}>
              ← {t("admin.users.back")}
            </button>
            <div className={admin.detailIdentity}>
              <h1 className={admin.identityName}>{t("admin.users.detailTitle")}</h1>
            </div>
          </div>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    );
  }

  const reasonTitleKey: Record<string, string> = {
    suspend: "admin.users.suspendTitle",
    ban: "admin.users.banTitle",
    unban: "admin.users.unbanTitle",
    delete: "admin.users.deleteTitle",
  };

  const isActive = user.status === "active";
  const isSuspended = user.status === "suspended";
  const isBanned = user.status === "banned";
  const reasonDanger = reasonKey === "ban" || reasonKey === "delete";
  const name = user.displayName || user.username || user.email;

  return (
    <div className={admin.detail}>
      <div className={admin.detailHead}>
        <div className={admin.detailIdentityWrap}>
          <button type="button" className={admin.backText} onClick={() => navigate("/admin/users")}>
            ← {t("admin.users.back")}
          </button>
          <div className={admin.detailIdentity}>
            <Avatar name={name} src={user.avatarUrl} size={56} label={name} />
            <div className={admin.identityText}>
              <span className={admin.identityEyebrow}>{t("admin.users.detailTitle")}</span>
              <h1 className={admin.identityName}>{name}</h1>
              <span className={admin.identitySub}>{user.email}</span>
            </div>
          </div>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <section className={admin.group}>
        <DescriptionList
          items={[
            { term: t("admin.users.username"), value: user.username ?? "—" },
            { term: t("admin.users.email"), value: <span><code className={page.code}>{user.email}</code>{" "}<StatusBadge size="sm" tone={user.emailVerified ? "green" : "amber"} label={user.emailVerified ? t("account.profile.emailVerified") : t("account.profile.emailUnverified")} /></span> },
            { term: t("admin.users.status"), value: <StatusBadge size="sm" tone={statusTone(user.status)} label={t(`status.${user.status}`)} /> },
            { term: t("admin.users.createdAt"), value: fmt(user.createdAt) || "—" },
            { term: t("admin.users.lastLoginAt"), value: fmt(user.lastLoginAt) || t("common.never") },
          ]}
        />
      </section>

      <section className={admin.group}>
        <h2 className={admin.groupTitle}>{t("admin.users.security")}</h2>
        <DescriptionList
          items={[
            { term: t("admin.users.hasPassword"), value: user.security.hasPassword ? t("common.yes") : t("common.no") },
            { term: t("admin.users.totp"), value: user.security.totpEnabled ? t("common.enabled") : t("common.disabled") },
            { term: t("admin.users.passkeys"), value: String(user.security.passkeyCount) },
            { term: t("admin.users.activeSessions"), value: String(user.security.activeSessions) },
          ]}
        />
      </section>

      <section className={admin.group}>
        <h2 className={admin.groupTitle}>{t("admin.users.oauthProviders")}</h2>
        {user.oauthProviders.length === 0 ? (
          <p className={page.subtleNote}>{t("common.none")}</p>
        ) : (
          <div className={admin.chips}>
            {user.oauthProviders.map((o) => (
              <Pill key={o.provider}>{o.provider}{o.providerUsername ? ` · ${o.providerUsername}` : ""}</Pill>
            ))}
          </div>
        )}
      </section>

      <section className={admin.group}>
        <h2 className={admin.groupTitle}>{t("admin.users.actions")}</h2>
        {/* refreshing 期间禁用操作入口：详情还是旧数据，防止对过期状态叠加操作。 */}
        <div className={admin.actionsRow}>
          <Button variant="secondary" disabled={refreshing} loading={busyKey === "force-logout"} onClick={() => openConfirm("force-logout")}>
            {t("admin.users.forceLogout")}
          </Button>
          {isSuspended ? (
            <Button variant="secondary" disabled={refreshing} loading={busyKey === "unsuspend"} onClick={() => openConfirm("unsuspend")}>
              {t("admin.users.unsuspend")}
            </Button>
          ) : isActive ? (
            <Button variant="secondary" disabled={refreshing} loading={busyKey === "suspend"} onClick={() => openReason("suspend")}>
              {t("admin.users.suspend")}
            </Button>
          ) : null}
        </div>
        <div className={admin.dangerRow}>
          <Button variant="danger" disabled={refreshing} loading={busyKey === "reset-2fa"} onClick={() => openConfirm("reset-2fa")}>
            {t("admin.users.reset2fa")}
          </Button>
          {isBanned ? (
            <Button variant="danger" disabled={refreshing} loading={busyKey === "unban"} onClick={() => openReason("unban")}>
              {t("admin.users.unban")}
            </Button>
          ) : (
            <Button variant="danger" disabled={refreshing} loading={busyKey === "ban"} onClick={() => openReason("ban")}>
              {t("admin.users.ban")}
            </Button>
          )}
          <Button variant="danger" disabled={refreshing} loading={busyKey === "delete"} onClick={() => openReason("delete")}>
            {t("admin.users.deleteUser")}
          </Button>
        </div>
      </section>

      {/* 确认类操作（无需原因）。step-up 期间隐藏，取消后自动恢复；
          失败时错误经 error 插槽就近显示在框内，保持开启可重试。 */}
      <ConfirmDialog
        open={confirmKey === "force-logout" && !stepUpOpen}
        title={t("admin.users.forceLogoutTitle")}
        message={t("admin.users.forceLogoutMessage")}
        confirmText={t("common.confirm")}
        cancelText={t("common.cancel")}
        confirmLoading={busyKey === "force-logout"}
        error={confirmError}
        onCancel={closeConfirm}
        onConfirm={() => void runAction({ key: "force-logout", path: path("force-logout") })}
      />
      <ConfirmDialog
        open={confirmKey === "unsuspend" && !stepUpOpen}
        title={t("admin.users.unsuspendTitle")}
        message={t("admin.users.unsuspendMessage")}
        confirmText={t("common.confirm")}
        cancelText={t("common.cancel")}
        confirmLoading={busyKey === "unsuspend"}
        error={confirmError}
        onCancel={closeConfirm}
        onConfirm={() => void runAction({ key: "unsuspend", path: path("unsuspend") })}
      />
      <ConfirmDialog
        open={confirmKey === "reset-2fa" && !stepUpOpen}
        variant="danger"
        title={t("admin.users.reset2faTitle")}
        message={t("admin.users.reset2faMessage")}
        confirmText={t("common.confirm")}
        cancelText={t("common.cancel")}
        confirmLoading={busyKey === "reset-2fa"}
        error={confirmError}
        onCancel={closeConfirm}
        onConfirm={() => void runAction({ key: "reset-2fa", path: path("reset-2fa") })}
      />

      {/* 需要原因的操作：多行 500 字计数、独立校验文案与弹窗内接口错误均由
          共享 ReasonPromptDialog 承载。step-up 期间隐藏，取消后自动恢复（原因文本不丢）。 */}
      <ReasonPromptDialog
        open={reasonKey !== null && !stepUpOpen}
        multiline
        variant={reasonDanger ? "danger" : "default"}
        title={reasonKey ? t(reasonTitleKey[reasonKey] ?? "admin.users.actions") : ""}
        label={t("admin.users.reasonLabel")}
        required
        placeholder={t("admin.users.reasonPlaceholder")}
        value={reasonText}
        maxLength={500}
        fieldError={reasonError}
        error={reasonApiError}
        submitting={reasonKey !== null && busyKey === reasonKey}
        submitText={t("common.confirm")}
        cancelText={t("common.cancel")}
        onChange={(v) => {
          setReasonText(v);
          if (reasonError) setReasonError(undefined);
        }}
        onSubmit={submitReason}
        onCancel={closeReason}
      />

      <AdminStepUpDialog open={stepUpOpen} onClose={closeStepUp} onVerified={onStepUpVerified} />
    </div>
  );
};

export default UserDetailPage;
