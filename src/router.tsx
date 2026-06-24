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
import AuthErrorPage from "./pages/AuthErrorPage";
import ConsentPage from "./pages/ConsentPage";
import NotFoundPage from "./pages/NotFoundPage";

import AccountLayout from "./pages/account/AccountLayout";
import ProfilePage from "./pages/account/ProfilePage";
import PasswordPage from "./pages/account/PasswordPage";
import TwoFactorPage from "./pages/account/TwoFactorPage";
import PasskeysPage from "./pages/account/PasskeysPage";
import OAuthBindingsPage from "./pages/account/OAuthBindingsPage";
import SessionsPage from "./pages/account/SessionsPage";
import DangerZonePage from "./pages/account/DangerZonePage";

import AdminLayout from "./pages/admin/AdminLayout";
import AdminAuthCallbackPage from "./pages/admin/AdminAuthCallbackPage";
import AdminAuthErrorPage from "./pages/admin/AdminAuthErrorPage";
import AdminStepUpDonePage from "./pages/admin/AdminStepUpDonePage";
import UsersPage from "./pages/admin/UsersPage";
import UserDetailPage from "./pages/admin/UserDetailPage";
import ClientsPage from "./pages/admin/ClientsPage";
import AuditLogsPage from "./pages/admin/AuditLogsPage";

/**
 * 根域门户路由：全部嵌套于 RootLayout（统一导航 + 页脚）。
 * - /                导航站首页
 * - 认证/状态页       登录/注册/找回/回调/同意/绑定确认/管理员回调/step-up（居中卡片）
 * - /account/*       账户中心（Pass 会话门控 + 设置式侧栏）
 * - /admin/*         管理后台（管理台令牌门控 + 管理侧栏 + 按权限渲染）
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
      { path: "/auth/callback", element: <AuthCallbackPage /> },
      { path: "/auth/oauth/continue", element: <OAuthContinuePage /> },
      { path: "/settings/security/oauth-bind/confirm", element: <OAuthBindConfirmPage /> },
      { path: "/auth/error", element: <AuthErrorPage /> },
      { path: "/oauth/consent", element: <ConsentPage /> },
      { path: "/admin/login", element: <Navigate to="/login" replace /> },
      { path: "/admin/auth/callback", element: <AdminAuthCallbackPage /> },
      { path: "/admin/auth/error", element: <AdminAuthErrorPage /> },
      { path: "/admin/step-up/done", element: <AdminStepUpDonePage /> },

      // 账户中心
      {
        path: "/account",
        element: <AccountLayout />,
        children: [
          { index: true, element: <Navigate to="/account/profile" replace /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "password", element: <PasswordPage /> },
          { path: "two-factor", element: <TwoFactorPage /> },
          { path: "passkeys", element: <PasskeysPage /> },
          { path: "oauth", element: <OAuthBindingsPage /> },
          { path: "sessions", element: <SessionsPage /> },
          { path: "danger", element: <DangerZonePage /> },
        ],
      },

      // 管理后台
      {
        path: "/admin",
        element: <AdminLayout />,
        children: [
          // 入口重定向由 AdminLayout 按权限决定（避免落到无权限分区）。
          { path: "users", element: <UsersPage /> },
          { path: "users/:id", element: <UserDetailPage /> },
          { path: "clients", element: <ClientsPage /> },
          { path: "audit", element: <AuditLogsPage /> },
        ],
      },

      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
