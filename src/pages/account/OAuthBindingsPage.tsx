import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { OAuthBinding } from "../../api/types";
import { useFormatTs } from "../../utils/datetime";
import { StepUpDialog } from "../../components/StepUpDialog";
import {
  Card,
  PageHeader,
  AdminButton as Button,
  Alert,
  Spinner,
  StatusBadge,
  ConfirmDialog,
} from "../../components/ui";
import page from "../Page.module.css";
import s from "./Account.module.css";

const GithubIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.23c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.82.57A12 12 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
  </svg>
);
const XIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.24 2.25h3.31l-7.23 8.26L23.04 21.75h-6.66l-4.71-6.23-5.4 6.23H2.96l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12L17.08 19.77Z" />
  </svg>
);

const PROVIDERS = [
  { id: "github", label: "GitHub", icon: <GithubIcon /> },
  { id: "x", label: "X", icon: <XIcon /> },
] as const;

/** 第三方账号绑定（实现占位页）：绑定 / 解绑（解绑需 step-up）。 */
const OAuthBindingsPage = () => {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  const [bindings, setBindings] = useState<OAuthBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unbindTarget, setUnbindTarget] = useState<string | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingUnbind, setPendingUnbind] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await api.get<OAuthBinding[]>("/v1/me/oauth");
    if (res.ok) setBindings(res.data);
    else setError(res.error.message);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const bind = async (provider: string) => {
    setError(null);
    const res = await api.get<{ authorizationUrl: string }>(`/v1/me/oauth/${provider}/bind/start`);
    if (res.ok && res.data.authorizationUrl) window.location.href = res.data.authorizationUrl;
    else setError(res.ok ? t("error.generic") : res.error.message);
  };

  const doUnbind = async (provider: string) => {
    setBusy(true);
    setError(null);
    const res = await api.del(`/v1/me/oauth/${provider}`);
    if (res.ok) {
      setNotice(t("account.oauth.unboundOk"));
      await load();
    } else if (res.error.code === "STEP_UP_REQUIRED" || res.status === 403) {
      // 需要二次验证：弹出 step-up，验证通过后重试
      setPendingUnbind(provider);
      setStepUpOpen(true);
    } else {
      setError(res.error.message);
    }
    setBusy(false);
    setUnbindTarget(null);
  };

  return (
    <div className={`${page.page} ${page.pageNarrow}`}>
      <PageHeader title={t("account.oauth.title")} description={t("account.oauth.subtitle")} />
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {loading ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : (
        <Card padding="none">
          <ul className={s.list}>
            {PROVIDERS.map((p) => {
              const bound = bindings.find((b) => b.provider === p.id);
              return (
                <li key={p.id} className={s.listRow}>
                  <div className={s.rowMain}>
                    <span className={s.providerIcon} aria-hidden="true">{p.icon}</span>
                    <div className={s.rowText}>
                      <span className={s.rowTitle}>
                        {p.label}
                        <StatusBadge size="sm" tone={bound ? "green" : "neutral"} label={bound ? t("account.oauth.bound") : t("account.oauth.notBound")} />
                      </span>
                      {bound && (
                        <span className={s.rowMeta}>
                          {bound.providerUsername && <span>@{bound.providerUsername}</span>}
                          <span>{`${t("account.oauth.boundAt")}: ${fmt(bound.boundAt) || "—"}`}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  {bound ? (
                    <Button variant="danger" size="sm" disabled={busy} onClick={() => setUnbindTarget(p.id)}>
                      {t("account.oauth.unbind")}
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => void bind(p.id)}>
                      {t("account.oauth.bind")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={!!unbindTarget}
        title={t("account.oauth.unbindTitle", { provider: unbindTarget === "x" ? "X" : "GitHub" })}
        message={t("account.oauth.unbindMessage")}
        confirmText={t("account.oauth.unbind")}
        cancelText={t("common.cancel")}
        variant="danger"
        confirmLoading={busy}
        onConfirm={() => unbindTarget && void doUnbind(unbindTarget)}
        onCancel={() => setUnbindTarget(null)}
      />

      <StepUpDialog
        open={stepUpOpen}
        onClose={() => { setStepUpOpen(false); setPendingUnbind(null); }}
        onVerified={() => {
          const provider = pendingUnbind;
          setStepUpOpen(false);
          setPendingUnbind(null);
          if (provider) void doUnbind(provider);
        }}
      />
    </div>
  );
};

export default OAuthBindingsPage;
