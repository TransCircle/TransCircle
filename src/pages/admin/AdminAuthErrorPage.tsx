import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { StatusScreen } from "../../components/ui";

/** 管理台 IAM 登录错误落地页。后端 302 → /admin/auth/error?code=... */
const AdminAuthErrorPage = () => {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const code = params.get("code") ?? "OAUTH_ERROR";

  const key = `authError.${code}`;
  const msg = t(key);
  const description = msg === key ? t("authError.OAUTH_ERROR") : msg;

  return (
    <StatusScreen
      kind="error"
      title={t("admin.login.failed")}
      description={description}
      detail={code}
      actions={[{ label: t("nav.login"), to: "/login" }]}
    />
  );
};

export default AdminAuthErrorPage;
