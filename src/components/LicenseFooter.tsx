import { useTranslation } from "react-i18next";
import FlagStripe from "./FlagStripe";
import styles from "./LicenseFooter.module.css";

/** 紧凑单行页脚，与故事站 LicenseFooter 保持一致。 */
function LicenseFooter() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      {/* 页脚顶部通栏旗帜条纹（DESIGN.md §3.1）：全站默认的签名元素。
          若当前页自带 page 作用域条纹（如登录页品牌面板），本条自动让位（§1.5）。 */}
      <FlagStripe scope="footer" />
      <div className={styles.bar}>
        <p className={styles.license}>
          <span className={styles.heading}>{t("footer.heading")}</span>
          <span>{t("footer.text1")}</span>
          <span className={styles.sep} aria-hidden="true">
            ·
          </span>
          {/* 这句是「将来会有单独版权页」的预告，不是授权条款本身：
              窄屏下它要独占两三行，页脚会胖到与其分量不相称，因此只在宽屏显示。 */}
          <span className={styles.note}>{t("footer.text2")}</span>
        </p>
        <p className={styles.copyright}>{t("footer.copyright", { year })}</p>
      </div>
    </footer>
  );
}

export default LicenseFooter;
