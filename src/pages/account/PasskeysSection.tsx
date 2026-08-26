import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Passkey } from "../../api/types";
import { useSession } from "../../context/SessionContext";
import { useFormatTs } from "../../utils/datetime";
import {
  performRegistration,
  isWebAuthnSupported,
  type RegistrationResponseJSON,
} from "../../utils/webauthn";
import {
  Card,
  TextField,
  AdminButton as Button,
  Alert,
  Spinner,
  EmptyState,
  StatusBadge,
} from "../../components/ui";
import { Dialog, ConfirmDialog } from "../../components/ui/Dialog";
import { RecoveryCodesDialog } from "./RecoveryCodesDialog";
import { useIamMfa } from "./IamMfaContext";
import s from "./Account.module.css";

const FingerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 13a7 7 0 0 1 14 0c0 1.96-.14 4-1 6" /><path d="M12 11a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" /><path d="M8 21c.5-2 1-4 1-8" />
  </svg>
);

/** Passkey 分区:注册(弹窗)/ 列表 / 重命名(弹窗)/ 删除(危险确认框)。 */
export function PasskeysSection() {
  const { t } = useTranslation();
  const { refresh } = useSession();
  // 接管开启时通行密钥在登录路径上不生效（含免密直登）——写明白，别让用户以为设备坏了。
  const { state: iamMfa } = useIamMfa();
  const delegatedToIam = iamMfa?.delegated === true;
  const fmt = useFormatTs();
  const supported = isWebAuthnSupported();
  const [items, setItems] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 首次注册 Passkey（此前无 2FA）时服务端一次性下发的共享恢复码。
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const [renameTarget, setRenameTarget] = useState<Passkey | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<Passkey | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await api.get<Passkey[]>("/v1/me/passkeys");
    if (res.ok) setItems(res.data);
    else setError(res.error.message);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const openAdd = () => {
    setName("");
    setAddError(null);
    setNotice(null);
    setAddOpen(true);
  };

  const add = async () => {
    if (adding) return; // 防 Enter 连击重复注册
    setAddError(null);
    setNotice(null);
    setAdding(true);
    try {
      const start = await api.post<{ registrationId: string; publicKey: Parameters<typeof performRegistration>[0] }>(
        "/v1/me/passkeys/register/start",
        {},
      );
      if (!start.ok) {
        setAddError(start.error.message);
        return;
      }
      const credential: RegistrationResponseJSON = await performRegistration(start.data.publicKey);
      const finish = await api.post<{ recoveryCodes?: string[] | null }>(
        "/v1/me/passkeys/register/finish",
        { registrationId: start.data.registrationId, name, credential },
        { idempotent: true },
      );
      if (!finish.ok) {
        setAddError(finish.error.message);
        return;
      }
      setNotice(t("account.passkeys.addedOk"));
      setName("");
      setAddOpen(false);
      // 首次启用 2FA 时服务端会一并下发共享恢复码，需一次性展示给用户保存。
      const newCodes = finish.data?.recoveryCodes?.length ? finish.data.recoveryCodes : null;
      setRecoveryCodes(newCodes);
      await load();
      // 有一次性恢复码时把会话刷新推迟到弹窗关闭后（见下方 onDismiss）：
      // 刷新可能把页面导向别处（档案回来发现会话已失效 → 跳登录），弹窗随之卸载，
      // 而这批码只出现这一次。无码时立即同步 passkeyCount 让「恢复码」分区随之显隐。
      if (!newCodes) await refresh();
    } catch (err) {
      if ((err as DOMException)?.name !== "NotAllowedError") setAddError(t("account.passkeys.registerFailed"));
    } finally {
      setAdding(false);
    }
  };

  const doRename = async () => {
    if (!renameTarget) return;
    setBusy(true);
    setRenameError(null);
    const res = await api.patch(`/v1/me/passkeys/${encodeURIComponent(renameTarget.id)}`, { name: renameValue });
    setBusy(false);
    if (res.ok) {
      setNotice(t("account.passkeys.renamedOk"));
      setRenameTarget(null);
      await load();
    } else {
      // 失败不关对话框:错误就近显示在对话框内,用户可改名重试。
      setRenameError(res.error.message);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setError(null);
    const res = await api.del(`/v1/me/passkeys/${encodeURIComponent(deleteTarget.id)}`);
    if (res.ok) {
      setNotice(t("account.passkeys.deletedOk"));
      await load();
      // 同步会话资料（security.passkeyCount）→ 移除最后一个 2FA 时「恢复码」分区随之隐藏。
      await refresh();
    } else setError(res.error.message);
    setBusy(false);
    setDeleteTarget(null);
  };

  return (
    <section className={s.group}>
      <h2 className={s.groupTitle}>{t("account.nav.passkeys")}</h2>

      {(!supported || error || notice || delegatedToIam) && (
        <div className={s.groupFeedback}>
          {!supported && <Alert tone="info">{t("account.passkeys.unsupported")}</Alert>}
          {error && <Alert tone="error">{error}</Alert>}
          {notice && <Alert tone="success">{notice}</Alert>}
          {delegatedToIam && <Alert tone="info">{t("mfa.iam.localInactivePasskey")}</Alert>}
        </div>
      )}

      <Card padding="none" className={s.passkeyCard}>
        {/* 顶部添加行:固定在卡片顶部;Passkey 多时也不会被列表挤走。 */}
        <div className={s.passkeyHead}>
          <span className={s.passkeyHeadLabel}>{t("account.passkeys.listLabel")}</span>
          <Button
            variant="primary"
            size="sm"
            disabled={!supported}
            iconLeft={<FingerIcon />}
            onClick={openAdd}
          >
            {t("account.passkeys.add")}
          </Button>
        </div>
        {/* 列表区:Passkey 多时不无限撑高,卡内滚动。 */}
        <div className={s.passkeyBody}>
          {loading ? (
            <div className={s.passkeyPlaceholder}>
              <Spinner size="md" label={t("common.loading")} />
            </div>
          ) : items.length === 0 ? (
            <div className={s.passkeyPlaceholder}>
              <EmptyState icon={<FingerIcon />} title={t("account.passkeys.empty")} />
            </div>
          ) : (
            <ul className={s.list}>
              {items.map((pk) => (
              <li key={pk.id} className={s.listRow}>
                <div className={s.rowMain}>
                  <span className={s.providerIcon} aria-hidden="true"><FingerIcon /></span>
                  <div className={s.rowText}>
                    <span className={s.rowTitle}>
                      {pk.name || t("account.passkeys.title")}
                      <StatusBadge
                        size="sm"
                        tone={pk.status === "active" ? "green" : "amber"}
                        label={pk.status === "active" ? t("account.passkeys.active") : t("account.passkeys.frozen")}
                      />
                    </span>
                    <span className={s.rowMeta}>
                      <span>{`${t("account.passkeys.createdAt")}: ${fmt(pk.createdAt) || "—"}`}</span>
                      <span>{`${t("account.passkeys.lastUsed")}: ${fmt(pk.lastUsedAt) || t("common.never")}`}</span>
                    </span>
                  </div>
                </div>
                <div className={s.rowActions}>
                  <Button variant="ghost" size="sm" onClick={() => { setRenameTarget(pk); setRenameValue(pk.name ?? ""); setRenameError(null); }}>
                    {t("common.rename")}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setDeleteTarget(pk)}>
                    {t("common.delete")}
                  </Button>
                </div>
              </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        busy={adding}
        title={t("account.passkeys.add")}
        initialFocusRef={nameRef}
        footer={
          <>
            <Button variant="secondary" disabled={adding} onClick={() => setAddOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" loading={adding} disabled={!name} onClick={() => void add()}>
              {t("account.passkeys.add")}
            </Button>
          </>
        }
      >
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          {addError && <Alert tone="error">{addError}</Alert>}
          <TextField
            ref={nameRef}
            label={t("account.passkeys.addLabel")}
            placeholder={t("account.passkeys.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            required
          />
        </form>
      </Dialog>

      <Dialog
        open={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        busy={busy}
        title={t("account.passkeys.renameTitle")}
        initialFocusRef={renameRef}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setRenameTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" loading={busy} disabled={!renameValue} onClick={() => void doRename()}>
              {t("common.save")}
            </Button>
          </>
        }
      >
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            void doRename();
          }}
        >
          {renameError && <Alert tone="error">{renameError}</Alert>}
          <TextField
            ref={renameRef}
            label={t("account.passkeys.renameLabel")}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            maxLength={50}
          />
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t("account.passkeys.deleteTitle")}
        message={t("account.passkeys.deleteMessage")}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        tone="danger"
        loading={busy}
        onConfirm={() => void doDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* 首次注册 Passkey 时一并下发的共享恢复码（与「恢复码」分区共用展示组件）。
          关闭（用户已保存）后**必须刷新会话** —— 上面那次注册刻意跳过了 refresh，
          档案里的 passkeyCount 还是旧值 0，「恢复码」分区据此判断显隐，
          不刷新它就一直藏着，用户以为自己没有恢复码。 */}
      <RecoveryCodesDialog
        codes={recoveryCodes}
        onDismiss={() => {
          setRecoveryCodes(null);
          void refresh();
        }}
      />
    </section>
  );
}
