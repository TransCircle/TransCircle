import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "../../api/client";
import type { OAuthClient } from "../../api/types";
import {
  PageHeader,
  Card,
  SectionLabel,
  StatusBadge,
  Pill,
  Alert,
  Spinner,
  EmptyState,
  AdminButton as Button,
} from "../../components/ui";
import styles from "../Page.module.css";
import admin from "./Admin.module.css";

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const ClientCard = ({ c }: { c: OAuthClient }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(c.clientId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <Card>
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
          <Button variant="ghost" size="sm" iconLeft={<CopyIcon />} onClick={() => void copy()}>
            {copied ? t("common.copied") : t("common.copy")}
          </Button>
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
    </Card>
  );
};

const ClientsPage = () => {
  const { t } = useTranslation();
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      // 该端点返回 { data: { data: OAuthClient[] } }（额外包了一层 data，非分页）。
      const res = await adminApi.get<{ data: OAuthClient[] }>("/v1/admin/clients");
      setLoading(false);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setClients(res.data?.data ?? []);
    })();
  }, []);

  return (
    <div className={styles.page}>
      <PageHeader title={t("admin.clients.title")} description={t("admin.clients.subtitle")} />
      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : clients.length === 0 ? (
        <EmptyState title={t("admin.clients.empty")} />
      ) : (
        <div className={styles.stack}>
          <SectionLabel>{String(clients.length)}</SectionLabel>
          {clients.map((c) => (
            <ClientCard key={c.clientId} c={c} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ClientsPage;
