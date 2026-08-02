import { useTranslation } from "react-i18next";
import { ConsentCard } from "../../../components/ConsentCard";
import { Card, EmptyState } from "../../../components/ui";
import { hostOf } from "../../../utils/oidcConsent";
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
 * 卡片内容直接复用 ConsentCard——和用户在 /oauth/consent 实际看到的是同一份组件、
 * 同一份文案，管理员在这里看到的就是用户会看到的，不会再出现"预览改了、真实页面
 * 没跟上"的漂移。这里只负责外层的假浏览器地址栏 + 禁用按钮，那是预览语境特有的。
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

  const appName = name.trim() || t("consent.unnamed");

  return (
    <div className={styles.preview}>
      <p className={styles.previewChrome}>{t("admin.consentPreview.chrome")}</p>
      <div className={styles.previewFrame}>
        <Card>
          <ConsentCard
            appName={appName}
            logoUri={logoUri}
            viewer={viewer}
            scopes={scopes}
            redirectHost={hostOf(clientUri) || null}
            disabled
          />
        </Card>
      </div>
    </div>
  );
}
