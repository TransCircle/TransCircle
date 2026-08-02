import { createBrowserRouter, Navigate } from "react-router-dom";

import RootLayout from "./layouts/RootLayout";
import App from "./App";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import OAuthContinuePage from "./pages/OAuthContinuePage";
import OAuthBindConfirmPage from "./pages/OAuthBindConfirmPage";
import AuthMfaDonePage from "./pages/AuthMfaDonePage";
import CancelDeletionPage from "./pages/CancelDeletionPage";
import StepUpDonePage from "./pages/admin/StepUpDonePage";
import AuthErrorPage from "./pages/AuthErrorPage";
import ConsentPage from "./pages/ConsentPage";
import NotFoundPage from "./pages/NotFoundPage";

import AccountPage from "./pages/account/AccountPage";

import AdminLayout from "./pages/admin/AdminLayout";
import AdminOverviewPage from "./pages/admin/OverviewPage";
import UsersPage from "./pages/admin/UsersPage";
import UserDetailPage from "./pages/admin/UserDetailPage";
import ClientsPage from "./pages/admin/ClientsPage";
import ClientNewPage from "./pages/admin/ClientNewPage";
import ClientDetailPage from "./pages/admin/ClientDetailPage";
import AuditLogsPage from "./pages/admin/AuditLogsPage";
import StaffPage from "./pages/admin/StaffPage";
import SecurityPage from "./pages/admin/SecurityPage";

/**
 * 根域门户路由：全部嵌套于 RootLayout（统一导航 + 页脚）。
 * - /                导航站首页
 * - 认证/状态页       登录/注册/找回/回调/同意/绑定确认（居中卡片）
 * - /account/*       账户中心（Pass 会话门控 + 设置式侧栏）
 * - /admin/*         管理控制台（复用同一条用户会话 + IAM 权限门控 + 左栏常驻导航）
 *
 * 管理员登录不再有独立入口：/admin/login、/admin/auth/callback 连同其页面一并删除 ——
 * 对应的后端端点已经不存在，留着只会 404。管理员用常规方式登录即可。
 *
 * /admin/step-up/done 保留：它不是登录入口，而是统一身份**二次验证**的落地页。
 * 后端把 IAM 的 redirectUri 指向它，用户在新标签页完成验证后落到这里。
 */
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <App /> },

      // 认证 / 状态页
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "/verify-email", element: <VerifyEmailPage /> },
      { path: "/password/forgot", element: <ForgotPasswordPage /> },
      { path: "/password/reset", element: <ResetPasswordPage /> },
      // 撤销账户注销：从注销确认邮件的链接进入。**必须放在未登录可访问的区段** ——
      // 账户处于 pending_deletion 时登录本身就被拒，放进 /account 下面就永远进不去。
      { path: "/account/cancel-deletion", element: <CancelDeletionPage /> },
      { path: "/auth/callback", element: <AuthCallbackPage /> },
      { path: "/auth/oauth/continue", element: <OAuthContinuePage /> },
      // 登录第二因素交给统一身份接管时，用户在 IAM 完成验证后回跳到这里；
      // 本页只把回跳参数当提示，真正的结论来自后端回查。
      { path: "/auth/mfa/done", element: <AuthMfaDonePage /> },
      // 统一身份 step-up 的落地页。刻意放在控制台外壳之外：
      // 它在新标签页里打开，不需要（也不该依赖）管理端上下文加载完成。
      { path: "/admin/step-up/done", element: <StepUpDonePage /> },
      { path: "/settings/security/oauth-bind/confirm", element: <OAuthBindConfirmPage /> },
      { path: "/auth/error", element: <AuthErrorPage /> },
      { path: "/oauth/consent", element: <ConsentPage /> },
      // 旧书签仍会打到 /admin/login：管理员就是普通用户，统一送去正常登录页。
      { path: "/admin/login", element: <Navigate to="/login?redirect=%2Fadmin" replace /> },

      // 账户中心:单页概览(所有编辑走弹窗)。旧子路由重定向到单页,避免书签/外链 404。
      { path: "/account", element: <AccountPage /> },
      { path: "/account/profile", element: <Navigate to="/account" replace /> },
      { path: "/account/password", element: <Navigate to="/account" replace /> },
      { path: "/account/two-factor", element: <Navigate to="/account" replace /> },
      { path: "/account/passkeys", element: <Navigate to="/account" replace /> },
      { path: "/account/oauth", element: <Navigate to="/account" replace /> },
      { path: "/account/sessions", element: <Navigate to="/account" replace /> },
      { path: "/account/danger", element: <Navigate to="/account" replace /> },

      // 管理控制台
      {
        path: "/admin",
        element: <AdminLayout />,
        children: [
          // /admin 的落点由 AdminLayout 按权限决定（避免撞进一个自己没权限的分区吃 403）。
          { path: "overview", element: <AdminOverviewPage /> },
          { path: "users", element: <UsersPage /> },
          { path: "users/:id", element: <UserDetailPage /> },
          { path: "clients", element: <ClientsPage /> },
          { path: "clients/new", element: <ClientNewPage /> },
          { path: "clients/:id", element: <ClientDetailPage /> },
          { path: "audit", element: <AuditLogsPage /> },
          { path: "staff", element: <StaffPage /> },
          { path: "security", element: <SecurityPage /> },
        ],
      },

      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
