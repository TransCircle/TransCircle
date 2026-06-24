import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { SessionDevice } from "../../api/types";
import { useFormatTs } from "../../utils/datetime";
import {
  Card,
  PageHeader,
  Toolbar,
  AdminButton as Button,
  Alert,
  Spinner,
  EmptyState,
  StatusBadge,
  ConfirmDialog,
} from "../../components/ui";
import page from "../Page.module.css";
import s from "./Account.module.css";

const DeviceIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8" /><path d="M12 16v4" />
  </svg>
);

/** 登录设备与会话（契约修正：device/ipPrefix/lastUsedAt + 注销确认）。 */
const SessionsPage = () => {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  const [sessions, setSessions] = useState<SessionDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeOthersOpen, setRevokeOthersOpen] = useState(false);

  const load = async (nextCursor?: string) => {
    if (!nextCursor) setLoading(true);
    const res = await api.get<SessionDevice[]>(`/v1/me/sessions${nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : ""}`);
    if (res.ok) {
      setSessions((prev) => (nextCursor ? [...prev, ...res.data] : res.data));
      setCursor(res.pagination?.hasMore ? res.pagination.nextCursor : null);
    } else {
      setError(res.error.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const doRevoke = async (id: string) => {
    setBusy(true);
    setError(null);
    const res = await api.del(`/v1/me/sessions/${encodeURIComponent(id)}`);
    if (res.ok) {
      setNotice(t("account.sessions.revoked"));
      await load();
    } else setError(res.error.message);
    setBusy(false);
    setRevokeId(null);
  };

  const doRevokeOthers = async () => {
    setBusy(true);
    setError(null);
    const res = await api.post("/v1/me/sessions/revoke-others");
    if (res.ok) {
      setNotice(t("account.sessions.revoked"));
      await load();
    } else setError(res.error.message);
    setBusy(false);
    setRevokeOthersOpen(false);
  };

  if (loading) {
    return (
      <div className={`${page.page} ${page.pageNarrow}`}>
        <PageHeader title={t("account.sessions.title")} description={t("account.sessions.subtitle")} />
        <Spinner size="lg" label={t("common.loading")} />
      </div>
    );
  }

  return (
    <div className={`${page.page} ${page.pageNarrow}`}>
      <PageHeader
        title={t("account.sessions.title")}
        description={t("account.sessions.subtitle")}
        actions={
          sessions.length > 1 ? (
            <Button variant="secondary" size="sm" onClick={() => setRevokeOthersOpen(true)}>
              {t("account.sessions.revokeOthers")}
            </Button>
          ) : undefined
        }
      />
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {sessions.length === 0 ? (
        <Card><EmptyState icon={<DeviceIcon />} title={t("account.sessions.empty")} /></Card>
      ) : (
        <Card padding="none">
          <ul className={s.list}>
            {sessions.map((sess) => (
              <li key={sess.id} className={s.listRow}>
                <div className={s.rowMain}>
                  <span className={s.providerIcon} aria-hidden="true"><DeviceIcon /></span>
                  <div className={s.rowText}>
                    <span className={s.rowTitle}>
                      {`${sess.device.browser ?? "—"} · ${sess.device.os ?? "—"}`}
                      {sess.current && <StatusBadge size="sm" tone="green" label={t("account.sessions.current")} />}
                    </span>
                    <span className={s.rowMeta}>
                      {sess.ipPrefix && <span>{sess.ipPrefix}</span>}
                      {sess.loginMethod && <span>{sess.loginMethod}</span>}
                      <span>{`${t("account.sessions.lastSeen")}: ${fmt(sess.lastUsedAt) || "—"}`}</span>
                    </span>
                  </div>
                </div>
                {!sess.current && (
                  <Toolbar justify="end">
                    <Button variant="danger" size="sm" disabled={busy} onClick={() => setRevokeId(sess.id)}>
                      {t("account.sessions.revoke")}
                    </Button>
                  </Toolbar>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {cursor && (
        <div className={page.loadMoreWrap}>
          <Button variant="secondary" onClick={() => void load(cursor)}>{t("common.loadMore")}</Button>
        </div>
      )}

      <ConfirmDialog
        open={!!revokeId}
        title={t("account.sessions.revokeTitle")}
        message={t("account.sessions.revokeMessage")}
        confirmText={t("account.sessions.revoke")}
        cancelText={t("common.cancel")}
        variant="danger"
        confirmLoading={busy}
        onConfirm={() => revokeId && void doRevoke(revokeId)}
        onCancel={() => setRevokeId(null)}
      />
      <ConfirmDialog
        open={revokeOthersOpen}
        title={t("account.sessions.revokeOthersTitle")}
        message={t("account.sessions.revokeOthersMessage")}
        confirmText={t("account.sessions.revokeOthers")}
        cancelText={t("common.cancel")}
        variant="danger"
        confirmLoading={busy}
        onConfirm={() => void doRevokeOthers()}
        onCancel={() => setRevokeOthersOpen(false)}
      />
    </div>
  );
};

export default SessionsPage;
