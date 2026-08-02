import { useTranslation } from "react-i18next";
import { Avatar } from "../../../components/Avatar";
import { AdminButton as Button, Card, EmptyState } from "../../../components/ui";
import { HUMAN_SCOPES } from "./constants";
import { hostOf } from "./redirect";
import { IconArrowRight, IconCheck } from "./icons";
import styles from "../Admin.module.css";

interface ConsentPreviewProps {
  trusted: boolean;
  name: string;
  clientUri: string | null;
  logoUri: string | null;
  scopes: readonly string[];
  /** 用当前管理员自己的身份预览，比编个假名字更能让人看清真实效果。 */
  viewer: { name: string; email: string | null; avatarUrl: string | null };
}

/**
 * 同意屏预览：随左侧编辑实时变化。
 *
 * 面向普通用户，所以这里**不出现任何内部 ID，也不出现 scope 原始 key** ——
 * 每一条都是一句人话。管理员在这里看到的就是用户会看到的。
 */
export function ConsentPreview({
  trusted,
  name,
  clientUri,
  logoUri,
  scopes,
  viewer,
}: ConsentPreviewProps) {
  const { t } = useTranslation();

  if (trusted) {
    return (
      <div className={styles.preview}>
        <div className={styles.previewFrame}>
          <EmptyState
            title={t("admin.consentPreview.skippedTitle")}
            description={t("admin.consentPreview.skippedDesc")}
          />
        </div>
      </div>
    );
  }

  const appName = name.trim() || t("admin.consentPreview.unnamed");
  const lines = HUMAN_SCOPES.filter((s) => scopes.includes(s));
  const host = hostOf(clientUri);

  return (
    <div className={styles.preview}>
      <p className={styles.previewChrome}>{t("admin.consentPreview.chrome")}</p>
      <div className={styles.previewFrame}>
        <Card>
          <div className={styles.consentHeads}>
            <Avatar name={appName} src={logoUri} size={44} label={appName} />
            <span className={styles.consentArrow} aria-hidden="true">
              <IconArrowRight />
            </span>
            <Avatar name={viewer.name} src={viewer.avatarUrl} size={44} label={viewer.name} />
          </div>
          <h4 className={styles.consentTitle}>
            {t("admin.consentPreview.title", { app: appName })}
          </h4>
          <p className={styles.consentAs}>
            <span>{t("admin.consentPreview.as", { name: viewer.name })}</span>
            {viewer.email && <span className={styles.note}>{viewer.email}</span>}
          </p>
          {lines.length > 0 && (
            <div className={styles.consentScopes}>
              <span className={styles.consentScopesHead}>{t("admin.consentPreview.willAllow")}</span>
              <ul className={styles.consentList}>
                {lines.map((s) => (
                  <li key={s}>
                    <span className={styles.consentTick} aria-hidden="true">
                      <IconCheck />
                    </span>
                    <span>{t(`admin.scopeHuman.${s}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className={styles.consentActions}>
            {/* 预览件：按钮只为呈现版式，禁用避免被误当成真的授权入口。 */}
            <Button variant="secondary" fullWidth disabled>
              {t("consent.deny")}
            </Button>
            <Button variant="primary" fullWidth disabled>
              {t("consent.allow")}
            </Button>
          </div>
          <p className={styles.note}>
            {host && <span>{t("admin.consentPreview.redirect", { host })}</span>}{" "}
            <span>{t("admin.consentPreview.revocable")}</span>
          </p>
        </Card>
      </div>
    </div>
  );
}
