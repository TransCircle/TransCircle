import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Passkey } from "../../api/types";
import { useFormatTs } from "../../utils/datetime";
import { usePageTitle } from "../../utils/usePageTitle";
import {
  performRegistration,
  isWebAuthnSupported,
  type RegistrationResponseJSON,
} from "../../utils/webauthn";
import {
  Card,
  PageHeader,
  SectionLabel,
  TextField,
  AdminButton as Button,
  Alert,
  Spinner,
  EmptyState,
  StatusBadge,
  Modal,
  ConfirmDialog,
} from "../../components/ui";
import page from "../Page.module.css";
import s from "./Account.module.css";

const FingerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 13a7 7 0 0 1 14 0c0 1.96-.14 4-1 6" /><path d="M12 11a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" /><path d="M8 21c.5-2 1-4 1-8" />
  </svg>
);

/** Passkey 管理：注册 / 列表 / 重命名 / 删除。 */
const PasskeysPage = () => {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  const supported = isWebAuthnSupported();
  const [items, setItems] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  const [renameTarget, setRenameTarget] = useState<Passkey | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Passkey | null>(null);
  const [busy, setBusy] = useState(false);

  usePageTitle(t("account.nav.passkeys"));

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

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setAdding(true);
    try {
      const start = await api.post<{ registrationId: string; publicKey: Parameters<typeof performRegistration>[0] }>(
        "/v1/me/passkeys/register/start",
        {},
      );
      if (!start.ok) {
        setError(start.error.message);
        return;
      }
      const credential: RegistrationResponseJSON = await performRegistration(start.data.publicKey);
      const finish = await api.post(
        "/v1/me/passkeys/register/finish",
        { registrationId: start.data.registrationId, name, credential },
        { idempotent: true },
      );
      if (!finish.ok) {
        setError(finish.error.message);
        return;
      }
      setNotice(t("account.passkeys.addedOk"));
      setName("");
      await load();
    } catch (err) {
      if ((err as DOMException)?.name !== "NotAllowedError") setError(t("account.passkeys.registerFailed"));
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
      // 失败不关对话框：错误就近显示在对话框内，用户可改名重试。
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
    } else setError(res.error.message);
    setBusy(false);
    setDeleteTarget(null);
  };

  return (
    <div className={`${page.page} ${page.pageNarrow}`}>
      <PageHeader title={t("account.passkeys.title")} description={t("account.passkeys.subtitle")} />
      {!supported && <Alert tone="info">{t("account.passkeys.unsupported")}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <section className={s.sectionFirst}>
        <form className={`${s.form} ${s.formNarrow}`} onSubmit={add}>
          <TextField
            label={t("account.passkeys.addLabel")}
            placeholder={t("account.passkeys.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            required
          />
          <div className={s.actions}>
            <Button type="submit" variant="primary" loading={adding} disabled={!supported} iconLeft={<FingerIcon />}>
              {t("account.passkeys.add")}
            </Button>
          </div>
        </form>
      </section>

      <section className={s.section}>
        <SectionLabel>{t("account.passkeys.listLabel")}</SectionLabel>
        {loading ? (
          <Spinner size="lg" label={t("common.loading")} />
        ) : items.length === 0 ? (
          <EmptyState icon={<FingerIcon />} title={t("account.passkeys.empty")} />
        ) : (
          <Card padding="none">
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
          </Card>
        )}
      </section>

      <Modal
        open={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        title={t("account.passkeys.renameTitle")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenameTarget(null)}>{t("common.cancel")}</Button>
            <Button variant="primary" loading={busy} disabled={!renameValue} onClick={() => void doRename()}>{t("common.save")}</Button>
          </>
        }
      >
        {renameError && <Alert tone="error">{renameError}</Alert>}
        <TextField label={t("account.passkeys.renameLabel")} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={50} />
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t("account.passkeys.deleteTitle")}
        message={t("account.passkeys.deleteMessage")}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        variant="danger"
        confirmLoading={busy}
        onConfirm={() => void doDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default PasskeysPage;
