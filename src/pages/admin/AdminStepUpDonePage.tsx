import { useTranslation } from "react-i18next";
import { StatusScreen } from "../../components/ui";

/**
 * 管理台 step-up（IAM 代理 2FA）完成落地页。
 * IAM 验证完成后回跳至此；原管理页的轮询会感知到验证通过并继续敏感操作。
 */
const AdminStepUpDonePage = () => {
  const { t } = useTranslation();
  return (
    <StatusScreen
      kind="success"
      title={t("stepUp.doneTitle")}
      description={t("stepUp.doneDesc")}
      actions={[{ label: t("stepUp.backToConsole"), to: "/admin" }]}
    />
  );
};

export default AdminStepUpDonePage;
