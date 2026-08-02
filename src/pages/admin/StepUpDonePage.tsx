import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/ui";
import { usePageTitle } from "../../utils/usePageTitle";
import styles from "./Admin.module.css";

/**
 * 统一身份二次验证的落地页（`/admin/step-up/done`）。
 *
 * 后端把 IAM 的 redirectUri 指到这里；用户在**新标签页**完成验证后落到本页。
 * 真正的判定不在这里做 —— 原标签页的 StepUpPanel 正在向后端回查权威结果，
 * 这一页只要告诉用户「可以关掉这个标签页了」。
 *
 * 之前这条路由压根不存在：IAM 验证完把人送到一个 404，用户以为验证失败，
 * 而原标签页其实已经放行了。
 */
export default function StepUpDonePage() {
  const { t } = useTranslation();
  usePageTitle(t("admin.stepup.donePageTitle"));

  useEffect(() => {
    // 由脚本打开的标签页才允许 close()；用户手动打开的会被浏览器拒绝，
    // 拒绝也没关系，下面的文案已经说明要手动关闭。
    const timer = window.setTimeout(() => window.close(), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className={styles.centeredPage}>
      <Alert tone="success">
        <strong>{t("admin.stepup.doneTitle")}</strong>
        <div>{t("admin.stepup.doneDesc")}</div>
      </Alert>
    </div>
  );
}
