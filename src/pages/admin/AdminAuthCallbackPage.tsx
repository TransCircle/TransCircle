import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { adminApi } from "../../api/client";
import { useAdmin } from "../../context/AdminContext";
import { usePageTitle } from "../../utils/usePageTitle";
import { StatusScreen } from "../../components/ui";

/**
 * 管理台 IAM 回调落地（修正缺失页）：
 * 后端 302 → /admin/auth/callback#code=<loginCode>。
 * POST /v1/admin/oauth/exchange { code } → { accessToken } → 存入管理台令牌。
 */
const AdminAuthCallbackPage = () => {
  const { t } = useTranslation();
  usePageTitle(t("admin.login.title"));
  const navigate = useNavigate();
  const { setToken } = useAdmin();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  // loginCode 经 URL 片段（#）传递，不进访问日志/Referer。
  const code = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("code");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!code) {
      setError(t("admin.login.failed"));
      return;
    }
    // 立即从地址栏抹去一次性 loginCode，避免经浏览器历史/Referer 泄露。
    window.history.replaceState(null, "", window.location.pathname);
    void (async () => {
      const res = await adminApi.post<{ accessToken: string }>(
        "/v1/admin/oauth/exchange",
        { code },
        { noAuth: true },
      );
      if (!res.ok || !res.data.accessToken) {
        setError(res.ok ? t("admin.login.failed") : res.error.message);
        return;
      }
      setToken(res.data.accessToken);
      // 落到 /admin，由 AdminLayout 按权限重定向到首个可访问分区。
      navigate("/admin", { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <StatusScreen
        kind="error"
        title={t("admin.login.failed")}
        description={error}
        actions={[{ label: t("nav.login"), to: "/login" }]}
      />
    );
  }
  return <StatusScreen kind="loading" title={t("admin.login.verifying")} />;
};

export default AdminAuthCallbackPage;
