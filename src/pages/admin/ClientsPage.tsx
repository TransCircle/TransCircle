import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "../../api/client";
import type { ApiResult } from "../../api/client";
import type { OAuthClient } from "../../api/types";
import { useAdmin } from "../../context/AdminContext";
import AdminStepUpDialog from "../../components/AdminStepUpDialog";
import {
  PageHeader,
  Card,
  SectionLabel,
  StatusBadge,
  Pill,
  Alert,
  Spinner,
  EmptyState,
  Modal,
  ConfirmDialog,
  TextField,
  TagInput,
  Checkbox,
  AdminButton as Button,
} from "../../components/ui";
import styles from "../Page.module.css";
import admin from "./Admin.module.css";

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

/** 复制到剪贴板的小按钮（带短暂「已复制」反馈）。 */
const CopyButton = ({ text }: { text: string }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <Button variant="ghost" size="sm" iconLeft={<CopyIcon />} onClick={() => void copy()}>
      {copied ? t("common.copied") : t("common.copy")}
    </Button>
  );
};

// ── 表单状态 ──────────────────────────────────────────────────────
interface FormState {
  name: string;
  redirectUris: string[];
  allowedScopes: string[];
  logoUri: string;
  clientUri: string;
  publicClient: boolean; // → tokenEndpointAuthMethod（仅新建可选）
  refreshToken: boolean; // → grantTypes（仅新建可选）
  trusted: boolean; // isFirstPartyTrusted（仅超管可设）
  status: "active" | "disabled"; // 仅编辑可改
}

const blankForm = (): FormState => ({
  name: "",
  redirectUris: [],
  allowedScopes: ["openid", "profile", "email"],
  logoUri: "",
  clientUri: "",
  publicClient: false,
  refreshToken: true,
  trusted: false,
  status: "active",
});

const formFromClient = (c: OAuthClient): FormState => ({
  name: c.name,
  redirectUris: [...c.redirectUris],
  allowedScopes: [...c.allowedScopes],
  logoUri: c.logoUri ?? "",
  clientUri: c.clientUri ?? "",
  publicClient: c.tokenEndpointAuthMethod === "none",
  refreshToken: c.grantTypes.includes("refresh_token"),
  trusted: c.isFirstPartyTrusted,
  status: c.status === "active" ? "active" : "disabled",
});

// ── step-up 重放：把待执行的写请求描述化，验证通过后原样重发 ──────
type PendingKind = "create" | "update" | "rotate" | "toggle";
interface Pending {
  kind: PendingKind;
  method: "POST" | "PATCH";
  path: string;
  body?: Record<string, unknown>;
}

interface CreateResp {
  clientId: string;
  name: string;
  clientSecret: string | null;
  isFirstPartyTrusted: boolean;
}
interface RotateResp {
  clientId: string;
  clientSecret: string;
}

const ClientsPage = () => {
  const { t } = useTranslation();
  const { hasPermission } = useAdmin();
  const canManage = hasPermission("pass.client:manage");
  const isSuper = hasPermission("*");

  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 表单（新建 / 编辑）
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<OAuthClient | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 轮换密钥确认 / 一次性密钥展示
  const [rotateTarget, setRotateTarget] = useState<OAuthClient | null>(null);
  const [secret, setSecret] = useState<{ clientId: string; secret: string } | null>(null);

  // step-up
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const pendingRef = useRef<Pending | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // 该端点返回 { data: { data: OAuthClient[] } }（额外包了一层 data，非分页）。
    const res = await adminApi.get<{ data: OAuthClient[] }>("/v1/admin/clients");
    setLoading(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setClients(res.data?.data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 统一执行写请求；遇 STEP_UP_REQUIRED 暂存并打开代理 2FA，验证后原样重放。
  const execute = useCallback(
    async (p: Pending) => {
      setSubmitting(true);
      setNotice(null);
      const toForm = p.kind === "create" || p.kind === "update";
      if (toForm) setFormError(null);
      else setError(null);

      const res: ApiResult<unknown> =
        p.method === "POST" ? await adminApi.post(p.path, p.body) : await adminApi.patch(p.path, p.body);
      setSubmitting(false);

      if (!res.ok && res.status === 403 && res.error.code === "STEP_UP_REQUIRED") {
        pendingRef.current = p;
        setStepUpOpen(true);
        return;
      }
      if (!res.ok) {
        if (toForm) {
          setFormError(res.error.message);
        } else {
          // 关闭触发该操作的确认框，否则页面级错误会被覆盖全屏的 Modal 遮挡，造成无反馈的重试循环。
          if (p.kind === "rotate") setRotateTarget(null);
          setError(res.error.message);
        }
        return;
      }

      switch (p.kind) {
        case "create": {
          const d = res.data as CreateResp;
          setCreating(false);
          if (d.clientSecret) setSecret({ clientId: d.clientId, secret: d.clientSecret });
          setNotice(t("admin.clients.createdOk"));
          break;
        }
        case "update":
          setEditing(null);
          setNotice(t("admin.clients.updatedOk"));
          break;
        case "toggle":
          setNotice(t("admin.clients.updatedOk"));
          break;
        case "rotate": {
          const d = res.data as RotateResp;
          setRotateTarget(null);
          setSecret({ clientId: d.clientId, secret: d.clientSecret });
          setNotice(t("admin.clients.rotatedOk"));
          break;
        }
      }
      await load();
    },
    [t, load],
  );

  const onStepUpVerified = () => {
    const p = pendingRef.current;
    pendingRef.current = null;
    if (p) void execute(p);
  };

  // 取消 step-up：丢弃待重放的写请求（表单/确认框会因 creating/editing/rotateTarget 仍在而恢复）。
  const closeStepUp = () => {
    pendingRef.current = null;
    setStepUpOpen(false);
  };

  // ── 打开表单 ──
  const openCreate = () => {
    setForm(blankForm());
    setFormError(null);
    setEditing(null);
    setCreating(true);
  };
  const openEdit = (c: OAuthClient) => {
    setForm(formFromClient(c));
    setFormError(null);
    setCreating(false);
    setEditing(c);
  };
  const closeForm = () => {
    setCreating(false);
    setEditing(null);
  };

  // ── 提交 ──
  const submitForm = () => {
    const name = form.name.trim();
    if (name.length < 1 || name.length > 100) {
      setFormError(t("admin.clients.nameRequired"));
      return;
    }
    if (form.redirectUris.length === 0) {
      setFormError(t("admin.clients.redirectRequired"));
      return;
    }
    const trusted = isSuper ? { isFirstPartyTrusted: form.trusted } : {};
    if (creating) {
      void execute({
        kind: "create",
        method: "POST",
        path: "/v1/admin/clients",
        body: {
          name,
          redirectUris: form.redirectUris,
          allowedScopes: form.allowedScopes,
          grantTypes: form.refreshToken
            ? ["authorization_code", "refresh_token"]
            : ["authorization_code"],
          tokenEndpointAuthMethod: form.publicClient ? "none" : "client_secret_basic",
          logoUri: form.logoUri.trim() || null,
          clientUri: form.clientUri.trim() || null,
          ...trusted,
        },
      });
    } else if (editing) {
      void execute({
        kind: "update",
        method: "PATCH",
        path: `/v1/admin/clients/${editing.clientId}`,
        body: {
          name,
          redirectUris: form.redirectUris,
          allowedScopes: form.allowedScopes,
          logoUri: form.logoUri.trim() || null,
          clientUri: form.clientUri.trim() || null,
          status: form.status,
          ...trusted,
        },
      });
    }
  };

  const toggleStatus = (c: OAuthClient) => {
    const next = c.status === "active" ? "disabled" : "active";
    void execute({
      kind: "toggle",
      method: "PATCH",
      path: `/v1/admin/clients/${c.clientId}`,
      body: { status: next },
    });
  };

  const confirmRotate = () => {
    if (!rotateTarget) return;
    void execute({
      kind: "rotate",
      method: "POST",
      path: `/v1/admin/clients/${rotateTarget.clientId}/rotate-secret`,
    });
  };

  const formOpen = creating || editing !== null;

  return (
    <div className={styles.page}>
      <PageHeader
        title={t("admin.clients.title")}
        description={t("admin.clients.subtitle")}
        actions={
          canManage ? (
            <Button variant="primary" size="sm" onClick={openCreate}>
              {t("admin.clients.newClient")}
            </Button>
          ) : undefined
        }
      />
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {loading ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : clients.length === 0 ? (
        <EmptyState title={t("admin.clients.empty")} />
      ) : (
        <div className={styles.stack}>
          <SectionLabel>{String(clients.length)}</SectionLabel>
          {clients.map((c) => (
            <Card key={c.clientId}>
              <div className={admin.cardHead}>
                <span className={admin.cardName}>{c.name}</span>
                <div className={admin.cardTags}>
                  <StatusBadge size="sm" tone={c.status === "active" ? "green" : "muted"} label={t(`status.${c.status}`)} />
                  {c.isFirstPartyTrusted && <Pill tone="accent">{t("admin.clients.trusted")}</Pill>}
                  {c.hasSecret && <Pill>{t("admin.clients.hasSecret")}</Pill>}
                </div>
              </div>

              <div className={admin.kv}>
                <span className={admin.kvLabel}>{t("admin.clients.clientId")}</span>
                <span className={admin.kvValue}>
                  <code className={styles.code}>{c.clientId}</code>
                  <CopyButton text={c.clientId} />
                </span>
              </div>

              <div className={admin.kv}>
                <span className={admin.kvLabel}>{t("admin.clients.redirectUris")}</span>
                <span className={admin.chips}>
                  {c.redirectUris.map((u) => (
                    <Pill key={u}>{u}</Pill>
                  ))}
                </span>
              </div>

              <div className={admin.kv}>
                <span className={admin.kvLabel}>{t("admin.clients.scopes")}</span>
                <span className={admin.chips}>
                  {c.allowedScopes.map((s) => (
                    <Pill key={s}>{s}</Pill>
                  ))}
                </span>
              </div>

              <div className={admin.kv}>
                <span className={admin.kvLabel}>{t("admin.clients.grantTypes")}</span>
                <span className={admin.kvValue}>{c.grantTypes.join(", ")}</span>
              </div>

              {canManage && (
                <div className={admin.cardActions}>
                  <Button variant="secondary" size="sm" onClick={() => openEdit(c)}>
                    {t("admin.clients.edit")}
                  </Button>
                  {c.tokenEndpointAuthMethod !== "none" && (
                    <Button variant="secondary" size="sm" onClick={() => setRotateTarget(c)}>
                      {t("admin.clients.rotateSecret")}
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => toggleStatus(c)}>
                    {c.status === "active" ? t("admin.clients.disable") : t("admin.clients.enable")}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* 新建 / 编辑表单。step-up 弹出期间隐藏（避免双 Modal 焦点陷阱冲突），
          取消 step-up 后会因 creating/editing 仍在而自动恢复，输入不丢失。 */}
      <Modal
        open={formOpen && !stepUpOpen}
        onClose={closeForm}
        size="md"
        title={creating ? t("admin.clients.newClient") : t("admin.clients.editClient")}
        description={editing ? editing.clientId : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" loading={submitting} onClick={submitForm}>
              {creating ? t("admin.clients.create") : t("common.save")}
            </Button>
          </>
        }
      >
        <div className={styles.stackSm}>
          <TextField
            label={t("admin.clients.nameLabel")}
            required
            value={form.name}
            maxLength={100}
            placeholder={t("admin.clients.namePlaceholder")}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <TagInput
            label={t("admin.clients.redirectUrisLabel")}
            hint={t("admin.clients.redirectUrisHint")}
            value={form.redirectUris}
            onChange={(v) => setForm((f) => ({ ...f, redirectUris: v }))}
            maxTags={10}
            maxTagLength={512}
            placeholder={t("admin.clients.redirectUrisPlaceholder")}
            removeTagLabel={(tag) => t("admin.clients.removeTag", { tag })}
          />
          <TagInput
            label={t("admin.clients.scopesLabel")}
            hint={t("admin.clients.scopesHint")}
            value={form.allowedScopes}
            onChange={(v) => setForm((f) => ({ ...f, allowedScopes: v }))}
            maxTags={20}
            maxTagLength={64}
            placeholder={t("admin.clients.scopesPlaceholder")}
            removeTagLabel={(tag) => t("admin.clients.removeTag", { tag })}
          />
          <TextField
            label={t("admin.clients.logoUriLabel")}
            value={form.logoUri}
            maxLength={512}
            placeholder="https://…"
            onChange={(e) => setForm((f) => ({ ...f, logoUri: e.target.value }))}
          />
          <TextField
            label={t("admin.clients.clientUriLabel")}
            value={form.clientUri}
            maxLength={512}
            placeholder="https://…"
            onChange={(e) => setForm((f) => ({ ...f, clientUri: e.target.value }))}
          />

          {creating && (
            <>
              <Checkbox
                label={t("admin.clients.publicClient")}
                hint={t("admin.clients.publicClientHint")}
                checked={form.publicClient}
                onChange={(e) => setForm((f) => ({ ...f, publicClient: e.target.checked }))}
              />
              <Checkbox
                label={t("admin.clients.refreshToken")}
                checked={form.refreshToken}
                onChange={(e) => setForm((f) => ({ ...f, refreshToken: e.target.checked }))}
              />
            </>
          )}

          {!creating && (
            <Checkbox
              label={t("admin.clients.statusActive")}
              hint={t("admin.clients.statusHint")}
              checked={form.status === "active"}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.checked ? "active" : "disabled" }))}
            />
          )}

          {isSuper && (
            <Checkbox
              label={t("admin.clients.trustedLabel")}
              hint={t("admin.clients.trustedHint")}
              checked={form.trusted}
              onChange={(e) => setForm((f) => ({ ...f, trusted: e.target.checked }))}
            />
          )}

          {formError && <Alert tone="error">{formError}</Alert>}
        </div>
      </Modal>

      {/* 轮换密钥确认（step-up 期间隐藏，取消后自动恢复） */}
      <ConfirmDialog
        open={rotateTarget !== null && !stepUpOpen}
        variant="danger"
        title={t("admin.clients.rotateSecretTitle")}
        message={t("admin.clients.rotateSecretMessage")}
        confirmText={t("common.confirm")}
        cancelText={t("common.cancel")}
        confirmLoading={submitting}
        onCancel={() => setRotateTarget(null)}
        onConfirm={confirmRotate}
      />

      {/* 一次性密钥展示（新建机密客户端 / 轮换后） */}
      <Modal
        open={secret !== null}
        onClose={() => setSecret(null)}
        size="md"
        title={t("admin.clients.secretTitle")}
        footer={
          <Button variant="primary" onClick={() => setSecret(null)}>
            {t("common.close")}
          </Button>
        }
      >
        <Alert tone="info">{t("admin.clients.secretWarning")}</Alert>
        {secret && (
          <>
            <div className={admin.kv}>
              <span className={admin.kvLabel}>{t("admin.clients.clientId")}</span>
              <span className={admin.kvValue}>
                <code className={styles.code}>{secret.clientId}</code>
                <CopyButton text={secret.clientId} />
              </span>
            </div>
            <div className={admin.kv}>
              <span className={admin.kvLabel}>{t("admin.clients.secretValue")}</span>
              <span className={admin.kvValue}>
                <code className={styles.code}>{secret.secret}</code>
                <CopyButton text={secret.secret} />
              </span>
            </div>
          </>
        )}
      </Modal>

      <AdminStepUpDialog open={stepUpOpen} onClose={closeStepUp} onVerified={onStepUpVerified} />
    </div>
  );
};

export default ClientsPage;
