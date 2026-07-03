// ============================================================================
// Pass 后端领域类型 —— 字段名与后端响应严格对齐（经契约审查校正）。
// 统一封装：成功 { data, requestId }（列表附 pagination）；失败 { error:{code,message}, requestId }。
// ============================================================================

export type AccountStatus =
  | "active"
  | "pending_verification"
  | "suspended"
  | "banned"
  | "pending_deletion"
  | "deleted"
  | "merged"
  | string;

/** GET /v1/me —— C 端当前用户资料 */
export interface MeProfile {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  status: AccountStatus;
  passwordSet: boolean;
  security: {
    hasPassword: boolean;
    totpEnabled: boolean;
    passkeyCount: number;
    oauthProviders: string[];
  };
  createdAt?: number;
  updatedAt?: number;
  lastLoginAt?: number | null;
}

/** WebAuthn 断言请求参数（登录 MFA / step-up 共用形状） */
export interface WebAuthnRequestOptions {
  challenge: string;
  rpId: string;
  timeout?: number;
  userVerification: string;
  allowCredentials: Array<{ type: string; id: string; transports: string[] | null }>;
}

/** POST /v1/auth/login —— 登录结果（普通或需 MFA） */
export interface LoginResult {
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  expiresIn?: number;
  user?: MeProfile;
  mfaRequired?: boolean;
  mfaChallengeToken?: string;
  /** 二次验证可用方式（任一 2FA 方式即触发挑战；恢复码为共享备份） */
  availableMethods?: Array<"totp" | "passkey" | "recovery_code">;
  /** 有 Passkey 时随挑战下发的 WebAuthn assertion 参数 */
  passkey?: { publicKey: WebAuthnRequestOptions };
}

/** POST /v1/auth/oauth/exchange —— 兑换结果 */
export interface OAuthExchangeResult {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    emailVerified: boolean;
  };
}

/** GET /v1/me/sessions —— 登录设备/会话项 */
export interface SessionDevice {
  id: string;
  current: boolean;
  device: { browser: string | null; os: string | null; type: string };
  ipPrefix: string | null;
  loginMethod: string | null;
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number;
}

/** GET /v1/me/mfa/totp —— TOTP 状态 */
export interface TotpStatus {
  totpEnabled: boolean;
  enabledAt: number | null;
  lastUsedAt: number | null;
  remainingRecoveryCodes: number;
}

/** POST /v1/me/mfa/totp/setup —— 启用前的配置载荷 */
export interface TotpSetup {
  setupId: string;
  secret: string;
  otpauthUrl: string;
  qrCodeImage: string;
  expiresIn: number;
}

/** GET /v1/me/passkeys —— Passkey 项 */
export interface Passkey {
  id: string;
  name: string | null;
  credentialId: string;
  transports: string[] | null;
  status: "active" | "frozen" | "revoked" | string;
  frozenReason: string | null;
  signCountSupported: boolean;
  createdAt: number;
  lastUsedAt: number | null;
}

/** GET /v1/me/oauth —— 已绑定第三方账号 */
export interface OAuthBinding {
  provider: string;
  providerUsername: string | null;
  providerDisplayName: string | null;
  providerAvatarUrl: string | null;
  boundAt: number;
}

/** POST /v1/auth/step-up/start —— C 端 step-up 挑战 */
export interface StepUpStart {
  challengeId: string;
  expiresIn: number;
  availableMethods: Array<"password" | "totp" | "recovery_code" | "passkey">;
  passkey?: {
    publicKey: {
      challenge: string;
      rpId: string;
      userVerification: string;
      allowCredentials: Array<{ type: string; id: string; transports: string[] | null }>;
    };
  };
}

/** GET /oauth2/interaction/:uid/info —— OIDC 交互信息（prompt 为字符串，如 "login" / "consent"） */
export interface OidcInteractionInfo {
  uid: string;
  prompt?: string;
  params: {
    client_id: string;
    scope: string;
    redirect_uri: string;
    [k: string]: unknown;
  };
  client?: { clientId: string; clientName?: string; logoUri?: string | null };
}

// ─── 管理后台类型 ────────────────────────────────────────────────

/** GET /v1/admin/users —— 列表项 */
export interface AdminUserListItem {
  id: string;
  username: string | null;
  displayName: string | null;
  email: string;
  emailVerified: boolean;
  status: AccountStatus;
  createdAt: number;
  lastLoginAt: number | null;
}

/** GET /v1/admin/users/:id —— 详情 */
export interface AdminUserDetail {
  id: string;
  username: string | null;
  displayName: string | null;
  email: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  status: AccountStatus;
  oauthProviders: Array<{ provider: string; providerUsername: string | null; boundAt: number }>;
  security: {
    hasPassword: boolean;
    totpEnabled: boolean;
    passkeyCount: number;
    activeSessions: number;
  };
  createdAt: number;
  lastLoginAt: number | null;
}

/** GET /v1/admin/clients —— OAuth 客户端 */
export interface OAuthClient {
  clientId: string;
  name: string;
  redirectUris: string[];
  allowedScopes: string[];
  grantTypes: string[];
  responseTypes: string[];
  tokenEndpointAuthMethod: string;
  isFirstPartyTrusted: boolean;
  logoUri: string | null;
  clientUri: string | null;
  contacts: string[] | null;
  status: string;
  hasSecret: boolean;
  createdAt: number;
  updatedAt: number;
}

/** GET /v1/admin/audit-logs —— 审计日志项 */
export interface AuditLog {
  id: string;
  actorUserId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  requestId: string | null;
}

/** 管理台 step-up（IAM 代理 2FA） */
export interface AdminStepUpStart {
  verificationId: string;
  verifyUrl: string;
  status: string;
  expiresAt: number | null;
}
