import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "../utils/usePageTitle";
import { StatusScreen } from "../components/ui";

/**
 * OAuth/认证错误落地页。后端 302 → /auth/error?status=...&code=...
 * 按错误码展示本地化提示，并提供返回登录的动作。
 */
const AuthErrorPage = () => {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const code = params.get("code") ?? "OAUTH_ERROR";

  usePageTitle(t("authError.title"));

  const key = `authError.${code}`;
  const msg = t(key);
  const description = msg === key ? t("authError.OAUTH_ERROR") : msg;

  return (
    <StatusScreen
      kind="error"
      title={t("authError.title")}
      description={description}
      detail={code}
      actions={[{ label: t("nav.login"), to: "/login" }]}
    />
  );
};

export default AuthErrorPage;
