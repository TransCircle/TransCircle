import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { SessionDevice } from "../../api/types";
import { useFormatTs } from "../../utils/datetime";
import {
  Card,
  AdminButton as Button,
  Alert,
  Spinner,
  EmptyState,
  StatusBadge,
} from "../../components/ui";
import { ConfirmDialog } from "../../components/ui/Dialog";
import page from "../Page.module.css";
import s from "./Account.module.css";

const DeviceIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8" /><path d="M12 16v4" />
  </svg>
);

/** loginMethod 后端未在 types.ts 定义枚举(string | null),
    此表覆盖已知登录途径,未知值回退展示原始字符串。 */
const LOGIN_METHOD_KEYS: Record<string, string> = {
  password: "account.sessions.method.password",
  passkey: "account.sessions.method.passkey",
  oauth: "account.sessions.method.oauth",
  github: "account.sessions.method.github",
  x: "account.sessions.method.x",
  // 后端对「第一因素不可考」的历史会话如实记 'unknown'（见 Pass 迁移 0011），
  // 不给标签的话这里会把裸字符串 unknown 直接显示给用户。
  unknown: "account.sessions.method.unknown",
};

/** 登录设备与会话分区(契约修正:device/ipPrefix/lastUsedAt + 注销确认)。 */
export function SessionsSection() {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  const [sessions, setSessions] = useState<SessionDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeOthersOpen, setRevokeOthersOpen] = useState(false);

  const load = async (nextCursor?: string) => {
    if (nextCursor) setLoadingMore(true);
    else setLoading(true);
    const res = await api.get<SessionDevice[]>(`/v1/me/sessions${nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : ""}`);
    if (res.ok) {
      setSessions((prev) => (nextCursor ? [...prev, ...res.data] : res.data));
      setCursor(res.pagination?.hasMore ? res.pagination.nextCursor : null);
    } else {
      setError(res.error.message);
    }
    setLoading(false);
    setLoadingMore(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const methodLabel = (m: string) => {
    const key = LOGIN_METHOD_KEYS[m];
    return key ? t(key) : m;
  };

  const doRevoke = async (id: string) => {
    setBusy(true);
    setError(null);
    const res = await api.del(`/v1/me/sessions/${encodeURIComponent(id)}`);
    if (res.ok) {
      // 乐观移除该行：不整表回到第一页，保留用户已加载的分页位置。
      setSessions((prev) => prev.filter((sess) => sess.id !== id));
      setNotice(t("account.sessions.revoked"));
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

  return (
    <section className={s.group}>
      <div className={s.sectionHead}>
        <h2 className={`${s.groupTitle} ${s.sectionHeadLabel}`}>{t("account.nav.sessions")}</h2>
        {!loading && sessions.length > 1 && (
          <Button variant="secondary" size="sm" onClick={() => setRevokeOthersOpen(true)}>
            {t("account.sessions.revokeOthers")}
          </Button>
        )}
      </div>

      {(error || notice) && (
        <div className={s.groupFeedback}>
          {error && <Alert tone="error">{error}</Alert>}
          {notice && <Alert tone="success">{notice}</Alert>}
        </div>
      )}

      {loading ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : (
        <div className={s.stackSm}>
          {sessions.length === 0 ? (
            <EmptyState icon={<DeviceIcon />} title={t("account.sessions.empty")} />
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
                          {sess.loginMethod && <span>{methodLabel(sess.loginMethod)}</span>}
                          <span>{`${t("account.sessions.lastSeen")}: ${fmt(sess.lastUsedAt) || "—"}`}</span>
                        </span>
                      </div>
                    </div>
                    {!sess.current && (
                      <div className={s.rowActions}>
                        <Button variant="danger" size="sm" disabled={busy} onClick={() => setRevokeId(sess.id)}>
                          {t("account.sessions.revoke")}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {cursor && (
            <div className={page.loadMoreWrap}>
              <Button variant="secondary" loading={loadingMore} onClick={() => void load(cursor)}>
                {t("common.loadMore")}
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!revokeId}
        title={t("account.sessions.revokeTitle")}
        message={t("account.sessions.revokeMessage")}
        confirmText={t("account.sessions.revoke")}
        cancelText={t("common.cancel")}
        tone="danger"
        loading={busy}
        onConfirm={() => revokeId && void doRevoke(revokeId)}
        onCancel={() => setRevokeId(null)}
      />
      <ConfirmDialog
        open={revokeOthersOpen}
        title={t("account.sessions.revokeOthersTitle")}
        message={t("account.sessions.revokeOthersMessage")}
        confirmText={t("account.sessions.revokeOthers")}
        cancelText={t("common.cancel")}
        tone="danger"
        loading={busy}
        onConfirm={() => void doRevokeOthers()}
        onCancel={() => setRevokeOthersOpen(false)}
      />
    </section>
  );
}
