import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useSession } from "../context/SessionContext";
import { usePageTitle } from "../utils/usePageTitle";
import type { OidcInteractionInfo } from "../api/types";
import { Avatar } from "../components/Avatar";
import {
  CenteredCard,
  PageHeader,
  AdminButton as Button,
  Alert,
  SectionLabel,
  StatusScreen,
} from "../components/ui";
import styles from "./Consent.module.css";

/**
 * OIDC 同意页（修正契约）：
 * GET /oauth2/interaction/:uid/info → { uid, prompt, params:{ client_id, scope, redirect_uri } }
 * POST .../confirm | .../abort → { redirectTo }。
 * 第三方授权门面：展示应用徽标、当前登录身份、权限清单与授权后去向，
 * 布局对齐主页设计语言（小节标签 + 细分隔线 + 克制层次）。
 */
const ConsentPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useSession();
  const [params] = useSearchParams();
  // 后端交互重定向用 ?oidc=<uid>；兼容历史 ?uid=。
  const uid = params.get("oidc") ?? params.get("uid");

  const [info, setInfo] = useState<OidcInteractionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 同意/拒绝分离 busy：spinner 只出现在被点的那个按钮上，另一个仅禁用。
  const [pending, setPending] = useState<"confirm" | "abort" | null>(null);

  usePageTitle(t("consent.title"));

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
    if (!uid || pending) return;
    setPending(action);
    setError(null);
    const res = await api.post<{ redirectTo?: string }>(
      `/oauth2/interaction/${encodeURIComponent(uid)}/${action}`,
    );
    if (res.ok && res.data?.redirectTo) {
      window.location.href = res.data.redirectTo;
      return;
    }
    setError(res.ok ? t("error.generic") : res.error.message);
    setPending(null);
  };

  const scopeLabel = (scope: string): string => {
    const key = `consent.scope.${scope}`;
    const translated = t(key);
    return translated === key ? scope : translated;
  };

  if (loading) return <StatusScreen kind="loading" title={t("consent.loading")} />;
  if (!info) {
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
  const logoUri = info.client?.logoUri ?? null;
  const scopes = (info.params.scope ?? "").split(/\s+/).filter(Boolean);
  const identityName = user ? user.displayName || user.username : null;
  // 授权后去向：仅取 redirect_uri 域名做信任提示，解析失败则不展示。
  let redirectHost: string | null = null;
  try {
    redirectHost = new URL(info.params.redirect_uri).hostname || null;
  } catch {
    redirectHost = null;
  }

  return (
    <CenteredCard>
      <div className={styles.clientHead}>
        {logoUri && (
          <Avatar src={logoUri} name={clientName} size={56} className={styles.clientLogo} />
        )}
        <PageHeader
          align="center"
          size="card"
          eyebrow={t("consent.title")}
          title={clientName}
          description={t("consent.subtitle", { client: clientName })}
        />
      </div>

      {identityName && (
        <div className={styles.identity}>
          <Avatar src={user?.avatarUrl} name={identityName} size={24} />
          <span className={styles.identityText}>
            {t("consent.asUser", { name: identityName })}
          </span>
        </div>
      )}

      <section className={styles.scopeSection}>
        <SectionLabel as="h2" className={styles.scopeLabel}>
          {t("consent.scopesLabel")}
        </SectionLabel>
        <ul className={styles.scopeList}>
          {scopes.length > 0 ? (
            scopes.map((s) => (
              <li key={s} className={styles.scopeItem}>
                <span className={styles.scopeDot} aria-hidden="true" />
                <span className={styles.scopeText}>
                  <span className={styles.scopeName}>{scopeLabel(s)}</span>
                  <code className={styles.scopeCode}>{s}</code>
                </span>
              </li>
            ))
          ) : (
            /* scope 为空：授权仍会披露基础身份，给出兜底条目而非空清单。 */
            <li className={styles.scopeItem}>
              <span className={styles.scopeDot} aria-hidden="true" />
              <span className={styles.scopeText}>
                <span className={styles.scopeName}>{t("consent.scopeFallback")}</span>
              </span>
            </li>
          )}
        </ul>
      </section>

      <div className={styles.footer}>
        {redirectHost && (
          <p className={styles.redirectNote}>
            {t("consent.redirectNotice", { domain: redirectHost })}
          </p>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <div className={styles.actions}>
          <Button
            variant="primary"
            fullWidth
            loading={pending === "confirm"}
            disabled={pending === "abort"}
            onClick={() => void decide("confirm")}
          >
            {t("consent.allow")}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            loading={pending === "abort"}
            disabled={pending === "confirm"}
            onClick={() => void decide("abort")}
          >
            {t("consent.deny")}
          </Button>
        </div>
      </div>
    </CenteredCard>
  );
};

export default ConsentPage;
