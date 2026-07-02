import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "../utils/usePageTitle";
import { AdminButton } from "../components/ui";
import styles from "./NotFound.module.css";

/**
 * 404 页 — 主页文档风的大号排版(eyebrow + 标题 + muted 说明),
 * 替代此前「系统弹窗感」的通用 info 图标屏。
 */
const NotFoundPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  usePageTitle(t("error.notFound"));

  return (
    <div className={styles.wrap}>
      <p className={styles.eyebrow}>{t("error.notFoundEyebrow")}</p>
      <h1 className={styles.title}>{t("error.notFound")}</h1>
      <p className={styles.desc}>{t("error.notFoundDetail")}</p>
      <div className={styles.actions}>
        <AdminButton variant="primary" to="/">
          {t("error.backHome")}
        </AdminButton>
        <AdminButton variant="ghost" onClick={() => navigate(-1)}>
          {t("error.backPrev")}
        </AdminButton>
      </div>
    </div>
  );
};

export default NotFoundPage;
