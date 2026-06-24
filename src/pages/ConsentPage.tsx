import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { OidcInteractionInfo } from "../api/types";
import {
  CenteredCard,
  PageHeader,
  AdminButton as Button,
  Alert,
  StatusScreen,
} from "../components/ui";
import styles from "./Consent.module.css";

/**
 * OIDC 同意页（修正契约）：
 * GET /oauth2/interaction/:uid/info → { uid, prompt, params:{ client_id, scope, redirect_uri } }
 * POST .../confirm | .../abort → { redirectTo }。
 */
const ConsentPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // 后端交互重定向用 ?oidc=<uid>；兼容历史 ?uid=。
  const uid = params.get("oidc") ?? params.get("uid");

  const [info, setInfo] = useState<OidcInteractionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!uid) {
      setError(t("consent.loadFailed"));
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await api.get<OidcInteractionInfo>(
        `/oauth2/interaction/${encodeURIComponent(uid)}/info`,
      );
      if (cancelled) return;
      if (!res.ok) {
        // 需要先登录时后端以 prompt=login 表达；统一跳登录并带回 uid。
        if (res.status === 401 || res.error.code === "login_required") {
          navigate(`/login?oidc=${encodeURIComponent(uid)}`, { replace: true });
          return;
        }
        setError(res.error.message);
        setLoading(false);
        return;
      }
      if (res.data.prompt === "login") {
        navigate(`/login?oidc=${encodeURIComponent(uid)}`, { replace: true });
        return;
      }
      setInfo(res.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, navigate, t]);

  const decide = async (action: "confirm" | "abort") => {
    if (!uid) return;
    setBusy(true);
    setError(null);
    const res = await api.post<{ redirectTo?: string }>(
      `/oauth2/interaction/${encodeURIComponent(uid)}/${action}`,
    );
    if (res.ok && res.data?.redirectTo) {
      window.location.href = res.data.redirectTo;
      return;
    }
    setError(res.ok ? t("error.generic") : res.error.message);
    setBusy(false);
  };

  const scopeLabel = (scope: string): string => {
    const key = `consent.scope.${scope}`;
    const translated = t(key);
    return translated === key ? scope : translated;
  };

  if (loading) return <StatusScreen kind="loading" title={t("consent.loading")} />;
  if (error || !info) {
    return (
      <StatusScreen
        kind="error"
        title={t("consent.loadFailed")}
        description={error ?? undefined}
        actions={[{ label: t("error.backHome"), to: "/" }]}
      />
    );
  }

  const clientName = info.client?.clientName ?? info.params.client_id;
  const scopes = (info.params.scope ?? "").split(/\s+/).filter(Boolean);

  return (
    <CenteredCard>
      <PageHeader align="center" eyebrow={t("consent.title")} title={clientName} description={t("consent.subtitle", { client: clientName })} />
      {error && <Alert tone="error">{error}</Alert>}

      <ul className={styles.scopeList}>
        {scopes.map((s) => (
          <li key={s} className={styles.scopeItem}>
            <span className={styles.scopeDot} aria-hidden="true" />
            <span className={styles.scopeText}>
              <span className={styles.scopeName}>{scopeLabel(s)}</span>
              <code className={styles.scopeCode}>{s}</code>
            </span>
          </li>
        ))}
      </ul>

      <div className={styles.actions}>
        <Button variant="primary" fullWidth loading={busy} onClick={() => void decide("confirm")}>
          {t("consent.allow")}
        </Button>
        <Button variant="secondary" fullWidth disabled={busy} onClick={() => void decide("abort")}>
          {t("consent.deny")}
        </Button>
      </div>
    </CenteredCard>
  );
};

export default ConsentPage;
