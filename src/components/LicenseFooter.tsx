import { useTranslation } from "react-i18next";
import styles from "./LicenseFooter.module.css";

/** 紧凑单行页脚，与故事站 LicenseFooter 保持一致。 */
function LicenseFooter() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.bar}>
        <p className={styles.license}>
          <span className={styles.heading}>{t("footer.heading")}</span>
          <span>{t("footer.text1")}</span>
          <span className={styles.sep} aria-hidden="true">
            ·
          </span>
          <span>{t("footer.text2")}</span>
        </p>
        <p className={styles.copyright}>{t("footer.copyright", { year })}</p>
      </div>
    </footer>
  );
}

export default LicenseFooter;
