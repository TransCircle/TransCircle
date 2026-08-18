import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { API_BASE, api } from "../../api/client";
import type {
  AdminClientCreated,
  ClientApplicationType,
  ClientEnvironment,
} from "../../api/types";
import {
  AdminButton as Button,
  Alert,
  Card,
  Checkbox,
  RadioGroup,
  SectionLabel,
  TextField,
} from "../../components/ui";
import { useAdmin } from "../../context/AdminContext";
import { cx } from "../../components/admin/cx";
import { APPLICATION_TYPES, DERIVED_ROW_KEYS, SCOPES } from "./shared/constants";
import { ConsentPreview } from "./shared/ConsentPreview";
import { CopyField } from "./shared/CopyField";
import { StepUpPanel } from "./shared/StepUpPanel";
import { UriEditor } from "./shared/UriEditor";
import { useAdminPageHeader } from "./shared/header";
import { useAdminAction } from "./shared/useAdminAction";
import { IconCheck } from "./shared/icons";
import styles from "./Admin.module.css";

/** Pass 的 issuer：同源部署时 API_BASE 为空，回落当前站点源。 */
function passIssuer(): string {
  if (API_BASE) {
    try {
      return new URL(API_BASE, window.location.origin).toString().replace(/\/$/, "");
    } catch {
      /* 配置写错时不至于让整页崩掉，回落同源。 */
    }
  }
  return window.location.origin;
}

const ClientNewPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { me } = useAdmin();
  useAdminPageHeader({
    title: t("admin.head.clientNew.title"),
    back: { to: "/admin/clients", label: t("admin.nav.clients") },
  });

  const [step, setStep] = useState(1);
  const [type, setType] = useState<ClientApplicationType>("web_backend");
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<ClientEnvironment>("prod");
  const [clientUri, setClientUri] = useState("");
  const [redirectUris, setRedirectUris] = useState<string[]>([]);
  const [scopes, setScopes] = useState<string[]>(["openid", "profile", "email"]);
  const [trusted, setTrusted] = useState(false);
  const [stepUp, setStepUp] = useState(false);
  const [result, setResult] = useState<AdminClientCreated | null>(null);
  const action = useAdminAction();

  const needsRedirect = type !== "m2m";
  const canNext =
    step === 1 ? true : step === 2 ? name.trim().length > 0 && (!needsRedirect || redirectUris.length > 0) : true;

  const create = async () => {
    const data = await action.run<AdminClientCreated>("create", (idem) =>
      api.post<AdminClientCreated>(
        "/v1/admin/clients",
        {
          name: name.trim(),
          clientUri: clientUri.trim() || null,
          environment,
          applicationType: type,
          redirectUris: needsRedirect ? redirectUris : [],
          allowedScopes: scopes,
          isFirstPartyTrusted: trusted,
        },
        { plane: "user", idempotent: idem },
      ),
    );
    if (data) {
      setResult(data);
      setStepUp(false);
    }
  };

  if (result) {
    const lines = [
      t("admin.wizard.config.header"),
      t("admin.wizard.config.subject", { name, env: t(`admin.env.${environment}`) }),
      "",
      `PASS_ISSUER="${passIssuer()}"`,
      `PASS_CLIENT_ID="${result.clientId}"`,
    ];
    if (result.clientSecret) {
      lines.push(`PASS_CLIENT_SECRET="${result.clientSecret}"   ${t("admin.wizard.config.onceOnly")}`);
    }
    if (needsRedirect) lines.push(`PASS_REDIRECT_URI="${redirectUris[0] ?? ""}"`);
    lines.push(`PASS_SCOPE="${scopes.join(" ")}"`, "", t("admin.wizard.config.discovery"), `#   GET ${passIssuer()}/.well-known/openid-configuration`);
    const config = lines.join("\n");

    return (
      <div className={styles.stack}>
        <Alert tone="success">
          <strong>{t("admin.wizard.createdTitle")}</strong>
          {result.clientSecret && <div>{t("admin.wizard.secretOnce")}</div>}
        </Alert>
        <Card>
          <SectionLabel as="h2">{t("admin.wizard.pasteTitle")}</SectionLabel>
          <p className={styles.note}>{t("admin.wizard.pasteDesc")}</p>
          <pre className={styles.code}>{config}</pre>
          <div className={styles.row}>
            <CopyField value={config} ariaLabel={t("admin.wizard.copyConfig")} />
          </div>
        </Card>
        <Card accent={!!result.clientSecret}>
          <SectionLabel as="h2">
            {result.clientSecret ? t("admin.wizard.confirmSavedTitle") : t("admin.wizard.doneTitle")}
          </SectionLabel>
          {result.clientSecret && <p className={styles.note}>{t("admin.wizard.confirmSavedDesc")}</p>}
          <div className={styles.row}>
            <Button variant="primary" onClick={() => navigate(`/admin/clients/${result.clientId}`)}>
              {result.clientSecret ? t("admin.wizard.savedDone") : t("admin.wizard.done")}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const viewer = {
    name: me?.displayName || me?.username || t("admin.staff"),
    email: me?.email ?? null,
    avatarUrl: me?.avatarUrl ?? null,
  };

  return (
    <div>
      <ol className={styles.steps}>
        {[1, 2, 3].map((n, i) => {
          const state = step > n ? "done" : step === n ? "current" : "todo";
          return (
            <li
              key={n}
              className={cx(
                styles.step,
                state === "current" && styles.stepCurrent,
                state === "done" && styles.stepDone,
              )}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className={styles.stepDot} aria-hidden="true">
                {state === "done" ? <IconCheck /> : n}
              </span>
              <span>{t(`admin.wizard.step${n}`)}</span>
              {i < 2 && <span className={styles.stepLine} aria-hidden="true" />}
            </li>
          );
        })}
      </ol>

      <div className={styles.wizard}>
        <div className={styles.stack}>
          {step === 1 && (
            <>
              <RadioGroup
                label={t("admin.wizard.typeQuestion")}
                value={type}
                onChange={(v) => setType(v as ClientApplicationType)}
                options={APPLICATION_TYPES.map((k) => ({
                  value: k,
                  label: t(`admin.appType.${k}.label`),
                  hint: t(`admin.appType.${k}.hint`),
                }))}
              />
              <Card tone="subtle" padding="sm">
                <p className={styles.bodyText}>{t(`admin.appType.${type}.why`)}</p>
              </Card>
            </>
          )}

          {step === 2 && (
            <>
              <TextField
                label={t("admin.wizard.nameLabel")}
                required
                maxLength={100}
                value={name}
                hint={t("admin.wizard.nameHint")}
                onChange={(e) => setName(e.target.value)}
              />
              <TextField
                label={t("admin.wizard.clientUriLabel")}
                value={clientUri}
                placeholder="https://example.transcircle.org"
                hint={t("admin.wizard.clientUriHint")}
                onChange={(e) => setClientUri(e.target.value)}
              />
              <RadioGroup
                label={t("admin.wizard.envLabel")}
                orientation="horizontal"
                value={environment}
                onChange={(v) => setEnvironment(v as ClientEnvironment)}
                options={[
                  { value: "prod", label: t("admin.env.prod") },
                  { value: "dev", label: t("admin.env.dev") },
                ]}
              />
              {needsRedirect ? (
                <UriEditor
                  label={t("admin.wizard.redirectLabel")}
                  type={type}
                  value={redirectUris}
                  onChange={setRedirectUris}
                  placeholder="https://api.example.org/auth/callback"
                  hint={t("admin.wizard.redirectHint")}
                  removeLabel={(uri) => t("admin.clientDetail.removeUri", { uri })}
                />
              ) : (
                <Card tone="subtle" padding="sm">
                  <p className={styles.bodyText}>{t("admin.wizard.m2mNoRedirect")}</p>
                </Card>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <SectionLabel as="h2">{t("admin.wizard.scopesTitle")}</SectionLabel>
              <div className={styles.stackSm}>
                {SCOPES.map((s) => (
                  <Checkbox
                    key={s.key}
                    label={s.key}
                    hint={t(`admin.scopeDesc.${s.key}`)}
                    checked={s.locked ? true : scopes.includes(s.key)}
                    disabled={!!s.locked || (!!s.firstParty && !trusted)}
                    onChange={(e) =>
                      setScopes(
                        e.target.checked
                          ? [...scopes, s.key]
                          : scopes.filter((x) => x !== s.key),
                      )
                    }
                  />
                ))}
              </div>
              <div className={styles.dangerZone}>
                <Checkbox
                  label={t("admin.wizard.trustedLabel")}
                  checked={trusted}
                  hint={t("admin.wizard.trustedHint")}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setTrusted(on);
                    // 第一方专属 scope 在非第一方客户端上是非法组合，后端会拒。
                    // 这里同步移除，而不是只把复选框置灰、把存不进去的值留在提交体里。
                    if (!on) {
                      setScopes((prev) =>
                        prev.filter((x) => !SCOPES.find((y) => y.key === x)?.firstParty),
                      );
                    }
                  }}
                />
              </div>
              <SectionLabel as="h2">{t("admin.wizard.previewTitle")}</SectionLabel>
              <ConsentPreview
                trusted={trusted}
                name={name}
                clientUri={clientUri || null}
                logoUri={null}
                scopes={scopes}
                viewer={viewer}
              />
              {action.error && <Alert tone="error">{action.error}</Alert>}
              {stepUp && (
                <StepUpPanel
                  what={t("admin.wizard.stepUpWhat", { name: name || t("admin.wizard.newClient") })}
                  onVerified={() => void create()}
                  onCancel={() => setStepUp(false)}
                />
              )}
            </>
          )}

          <div className={styles.row}>
            {step > 1 && (
              <Button variant="secondary" onClick={() => setStep(step - 1)}>
                {t("admin.wizard.prev")}
              </Button>
            )}
            {step < 3 ? (
              <Button variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
                {t("admin.wizard.next")}
              </Button>
            ) : (
              !stepUp && (
                <Button
                  variant="primary"
                  loading={action.pending === "create"}
                  onClick={() => setStepUp(true)}
                >
                  {t("admin.wizard.create")}
                </Button>
              )
            )}
            <Button variant="ghost" to="/admin/clients">
              {t("common.cancel")}
            </Button>
          </div>
        </div>

        <div className={styles.derived}>
          <Card>
            <SectionLabel as="h2">{t("admin.wizard.derivedTitle")}</SectionLabel>
            <p className={styles.note}>{t("admin.wizard.derivedDesc")}</p>
            {DERIVED_ROW_KEYS[type].map((k) => (
              <div key={k} className={styles.derivedRow}>
                <span className={styles.derivedKey}>{t(`admin.wizard.derived.${k}`)}</span>
                <span className={styles.derivedVal}>{t(`admin.appType.${type}.derived.${k}`)}</span>
              </div>
            ))}
            {step >= 3 && (
              <div className={styles.derivedRow}>
                <span className={styles.derivedKey}>{t("admin.wizard.derived.scopes")}</span>
                <span className={styles.derivedVal}>{scopes.join(" ")}</span>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ClientNewPage;
