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
/**
 * `GET /v1/me` 与 `POST /v1/auth/refresh` 共同下发的用户档案。
 *
 * **形状以后端 `TransCircle-Pass/src/utils/profile.ts` 的 `MeProfile` 为准**，
 * 两处必须逐字段对齐。曾经这里把 `email` 写成必填、`displayName` 写成可空，
 * 恰好和后端反了 —— 第三方登录未回传邮箱的用户会带着 `email: null` 回来，
 * 而 TypeScript 一路放行到 `user.email.trim()` 才在运行时炸。
 */
export interface MeProfile {
  id: string;
  username: string;
  /** 后端可空：第三方登录未回传邮箱时为 null。 */
  email: string | null;
  /** 后端非空（库上 NOT NULL）；可能是空串，展示时按 `displayName || username` 回落。 */
  displayName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  status: AccountStatus;
  passwordSet: boolean;
  /** 两步验证是否已交给统一身份接管。 */
  iamMfaDelegated: boolean;
  security: {
    hasPassword: boolean;
    totpEnabled: boolean;
    passkeyCount: number;
    oauthProviders: string[];
  };
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number | null;
  /** 管理员置过新密码，下次登录必须修改；改完后端自动清零。 */
  mustChangePassword: boolean;
}

/** WebAuthn 断言请求参数（登录 MFA / step-up 共用形状） */
export interface WebAuthnRequestOptions {
  challenge: string;
  rpId: string;
  timeout?: number;
  userVerification: string;
  allowCredentials: Array<{ type: string; id: string; transports: string[] | null }>;
}

/**
 * 登录响应里的用户摘要。
 *
 * **不是 `MeProfile`**：登录只返回够渲染右上角头像的几个字段，
 * `email` / `status` / `security` 这些都没有，要拿完整档案得另请求 `GET /v1/me`。
 * 之前把它声明成 `MeProfile` 属于类型上的一厢情愿 —— 编译器不报错，
 * 运行时读到的却是 undefined。
 */
export interface LoginUserSummary {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
}

/**
 * GET /v1/auth/oauth/providers —— 本站可用的第三方登录方式。
 *
 * 由后端按「是否已配置」过滤后给出，前端据此渲染登录按钮 ——
 * 写死 provider 列表会让新增的提供商（如统一身份）没有入口，
 * 也会把未配置、点了必然报错的按钮画出来。
 */
export interface OAuthProviderInfo {
  provider: string;
  /** 可读名称（GitHub / X / 统一身份）。 */
  label: string;
  /** 绑定后不可自行解除。首次经它登录 = 建号并永久绑定，跳转前必须让用户确认。 */
  permanent: boolean;
}

/** POST /v1/auth/login —— 登录结果（普通或需 MFA） */
export interface LoginResult {
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  expiresIn?: number;
  user?: LoginUserSummary;
  /** 管理员重置密码后强制改密；前端据此引导跳转，后端不拦其余接口。 */
  mustChangePassword?: boolean;
  mfaRequired?: boolean;
  mfaChallengeToken?: string;
  /** 二次验证可用方式（任一 2FA 方式即触发挑战；恢复码为共享备份） */
  /** `iam` = 该账户的登录第二因素已交给统一身份接管，本地 passkey/TOTP 不再参与登录。 */
  availableMethods?: Array<"totp" | "passkey" | "recovery_code" | "iam">;
  /** 有 Passkey 时随挑战下发的 WebAuthn assertion 参数 */
  passkey?: { publicKey: WebAuthnRequestOptions };
}

/** POST /v1/auth/oauth/exchange —— 兑换结果 */
export interface OAuthExchangeResult {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  /** 管理员重置密码后强制改密。 */
  mustChangePassword?: boolean;
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

/** GET /v1/me/mfa/recovery-codes —— 恢复码状态（TOTP / Passkey 共享的账户级备份） */
export interface RecoveryCodesStatus {
  /** 是否已启用任一 2FA 方式——决定是否展示恢复码框 */
  mfaEnabled: boolean;
  totpEnabled: boolean;
  passkeyCount: number;
  remaining: number;
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
  /** 可读名称（GitHub / X / 统一身份）；界面不该自己拿 provider key 硬编码文案。 */
  label: string;
  providerUsername: string | null;
  providerDisplayName: string | null;
  providerAvatarUrl: string | null;
  boundAt: number;
  /**
   * 用户本人能否自行解绑。**统一身份绑定为 false** —— 它一旦建立就不可解除，
   * 后端对 `DELETE /v1/me/oauth/iam` 恒返 409（design/api-delta.md §5b.2）。
   */
  unbindable: boolean;
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

// ─── 管理控制台类型（api-delta.md 为权威契约）────────────────────

/**
 * GET /v1/admin/me —— 控制台身份与权限。
 *
 * 管理员就是普通 Pass 用户：这里返回的是「该用户在 IAM tc_main 下有什么」，
 * 不是第二套账号。无绑定 / 无权限时后端返回 403 NO_ADMIN_ACCESS。
 */
export interface AdminMe {
  /** 当前管理员的 Pass 用户 ID（管理员就是普通用户，没有第二套账号 ID）。 */
  userId: string;
  username: string | null;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  /** 该账户绑定的统一身份 subject。 */
  iamSub: string;
  /** 权限来源的身份组/角色名（只读展示用）。 */
  roles: string[];
  /** IAM tc_main 下的权限 key；`*` 表示超级管理员。 */
  permissions: string[];
  isSuperAdmin: boolean;
  /** 二次验证升级窗口状态；危险操作前据此决定是否要先 step-up。 */
  stepUp: { lastAt: number | null; valid: boolean; expiresAt: number | null };
}

/** GET /v1/admin/overview —— 概览指标，服务端算好（api-delta §三）。 */
export interface AdminOverview {
  users: {
    total: number;
    active: number;
    suspended: number;
    banned: number;
    pendingDeletion: number;
    pendingVerification: number;
    merged: number;
    /** 已彻底删除。`total` 含它，所以分布里也必须有，否则各项之和对不上总数。 */
    deleted: number;
  };
  sessions: { active: number; accounts: number };
  /** `covered` 含把两步验证交给统一身份接管的账户（与后端认可的第二因素一致）。 */
  mfa: { covered: number; activeTotal: number };
  clients: { active: number; disabled: number };
  grants: { total: number };
  auth: {
    /** 窗口内**出现过失败的账户/挑战数**，不是失败次数总和。 */
    recentFailures: number;
    windowHours: number;
    /** 当前处于登录锁定中的账户数。 */
    lockedAccounts: number;
  };
  staff: { total: number };
  signingKey: { kid: string; ageDays: number; previousKid: string | null } | null;
}

/**
 * 目标账户的工作人员判定（GET /v1/admin/users/:id/iam-status）。
 *
 * 四个值必须区分展示，**不要从权限数组的形状自行推断** ——
 * 「数组缺失 / 为空 / 查询失败」是三件不同的事，混为一谈会在 IAM 抖动时放开员工账户。
 */
export type IamVerdict = "not_staff" | "staff" | "ex_staff" | "staff_assumed";

export interface AdminIamStatus {
  verdict: IamVerdict;
  /** 是否存在 iam 绑定。注意「有绑定」≠「是工作人员」。 */
  hasBinding: boolean;
  /** tc_main 下的权限条数；查询失败时为 null（**不是** 0）。 */
  permissionCount: number | null;
  /** 权限来源的身份组/角色名；未绑定或查询失败时为空数组。 */
  roles: string[];
  /** 本次实时判定的时刻；查询失败（staff_assumed）时为 null。 */
  checkedAt: number | null;
  /** 本账户此刻是否允许被其他工作人员写入。界面的禁用态一律以它为准。 */
  writable: boolean;
  /** 不可写时，告诉操作者该怎么解锁。 */
  unlockPath: string;
}

/** GET /v1/admin/users —— 列表项（offset 分页，见 client.ts 的 OffsetPage）。 */
export interface AdminUserListItem {
  id: string;
  username: string | null;
  displayName: string | null;
  /** 纯 Passkey 账户可以没有邮箱，库里就是可空的。 */
  email: string | null;
  /** 头像 URL；后端若返回则列表加载真实头像,缺省时 Avatar 回退首字母。 */
  avatarUrl?: string | null;
  emailVerified: boolean;
  status: AccountStatus;
  /**
   * 是否绑定了统一身份。**仅作提示，且不等于「是工作人员」** ——
   * 被撤权的前工作人员同样留着绑定。能不能操作该账户，一律以详情页
   * /iam-status 的实时四值判定（`writable`）为准。
   */
  hasIamBinding: boolean;
  totpEnabled: boolean;
  passkeyCount: number;
  /** 已绑定的第三方 provider key（含 `iam`）。 */
  oauthProviders: string[];
  activeSessions: number;
  createdAt: number;
  lastLoginAt: number | null;
  lastActiveAt: number | null;
}

/** GET /v1/admin/users/:id —— 详情 */
export interface AdminUserDetail {
  id: string;
  username: string | null;
  displayName: string | null;
  /** 纯 Passkey 账户可以没有邮箱，库里就是可空的。 */
  email: string | null;
  emailVerified: boolean;
  avatarUrl: string | null;
  status: AccountStatus;
  /** 管理备注：仅管理员可见，随账户保留，写入审计。 */
  adminNote: string | null;
  /** 下次登录必须改密。 */
  mustChangePassword: boolean;
  /** 该用户已把登录第二因素交给统一身份接管。 */
  iamMfaDelegated: boolean;
  /** 账户被合并到哪个用户；未合并为 null。 */
  mergedIntoUserId: string | null;
  /** 登录失败锁定到期时刻；未锁定（或锁已过期）为 null。 */
  lockedUntil: number | null;
  /** 当前失败窗口内的连续失败次数。 */
  failedLoginAttempts: number;
  hasIamBinding: boolean;
  bindings: Array<{
    provider: string;
    label: string;
    providerUsername: string | null;
    providerEmail: string | null;
    boundAt: number;
  }>;
  security: {
    hasPassword: boolean;
    passwordUpdatedAt: number | null;
    totpEnabled: boolean;
    passkeyCount: number;
    activeSessions: number;
    recoveryCodes: { total: number; used: number; remaining: number };
  };
  /** 授权过的业务站数量。 */
  grantCount: number;
  createdAt: number;
  lastLoginAt: number | null;
  /** 最近一次会话活动；无会话时回落 lastLoginAt。 */
  lastActiveAt: number | null;
  deletedAt: number | null;
  /** 乐观并发控制基线：PATCH 时作为 If-Match 发回。 */
  updatedAt: number;
}

/** GET /v1/admin/users/:id/mfa —— TOTP 与恢复码状态（不返回码本身）。 */
export interface AdminUserMfa {
  totp: { status: "active" | "pending" | "disabled" | string; enabledAt: number | null; lastUsedAt: number | null };
  passkeyCount: number;
  recoveryCodes: { total: number; used: number; remaining: number };
  /** 已交给统一身份接管时，本地 TOTP / Passkey 在登录路径上不生效。 */
  iamMfaDelegated: boolean;
}

/** GET /v1/admin/users/:id/passkeys */
export interface AdminUserPasskey {
  id: string;
  name: string | null;
  status: string;
  /** 被冻结的原因（如 signCount 回退疑似克隆）；未冻结为 null。 */
  frozenReason: string | null;
  transports: string[] | null;
  createdAt: number;
  lastUsedAt: number | null;
}

/**
 * GET /v1/admin/users/:id/sessions —— 只存 IP 段与 UA 哈希，不存完整 IP。
 * deviceSummary 是 Pass 端 Session.deviceSummary（JSON 对象 {browser, os, type}），
 * 并非字符串摘要；渲染时取 .browser/.os，勿直接输出对象（会触发 React error #31）。
 */
export interface AdminUserSession {
  id: string;
  deviceSummary: { browser: string | null; os: string | null; type: string } | null;
  ipPrefix: string | null;
  /** UA 哈希前缀，仅供辨识同一设备；不还原完整 UA。 */
  userAgentHash: string;
  loginMethod: string | null;
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number;
  lastStepUpAt: number | null;
}

/** GET /v1/admin/users/:id/bindings —— 只读，不提供解绑。 */
export interface AdminUserBinding {
  provider: string;
  /** 可读名称（GitHub / X / 统一身份）。 */
  label: string;
  providerUsername: string | null;
  providerDisplayName: string | null;
  providerEmail: string | null;
  boundAt: number;
  /** 用户本人能否自行解绑。统一身份绑定是永久的，此处为 false。 */
  selfUnbindable: boolean;
}

/** GET /v1/admin/users/:id/grants —— 授权过哪些业务站。 */
export interface AdminUserGrant {
  grantId: string;
  clientId: string;
  /** 可读名称（api-delta §4.6）：内部 ID 不进用户可见界面。 */
  clientName: string | null;
  clientLogoUri: string | null;
  scopes: string[];
  createdAt: number;
  expiresAt: number | null;
}

/** POST /v1/admin/users/:id/merge/preview —— 只算不改。 */
interface AdminMergeParty {
  id: string;
  username: string | null;
  displayName: string | null;
  /** 纯 Passkey 账户可以没有邮箱，库里就是可空的。 */
  email: string | null;
  status: AccountStatus;
}

export interface AdminMergePreview {
  source: AdminMergeParty;
  target: AdminMergeParty;
  /** 会迁移到目标账户的东西。 */
  migrate: { bindings: string[]; passkeys: number };
  /** 目标账户已占用、因而无法迁移的绑定。 */
  conflicts: { bindings: string[] };
  /** 合并会一并吊销的东西。 */
  revoke: { sessions: number; grants: number };
  previewToken: string;
  previewExpiresAt: number;
}

/** 客户端应用类型（api-delta §4.1 的校验矩阵按此分支）。 */
export type ClientApplicationType = "web_backend" | "spa" | "native" | "m2m";
export type ClientEnvironment = "prod" | "dev";

export interface ClientTokenPolicy {
  accessTtl: number;
  refreshTtl: number;
  rotate: boolean;
  absoluteTtl: number;
}

/** GET /v1/admin/clients —— 列表项。 */
export interface AdminClientListItem {
  clientId: string;
  name: string;
  description: string | null;
  applicationType: ClientApplicationType;
  environment: ClientEnvironment;
  status: string;
  isFirstPartyTrusted: boolean;
  hasSecret: boolean;
  /** 距上次轮换的天数；公开客户端无密钥时为 null。 */
  secretAgeDays: number | null;
  /** 授权过该站点的用户数。 */
  grantedUsers: number;
  createdAt: number;
}

/** GET /v1/admin/clients/:id —— 详情（含全部可编辑字段）。 */
export interface AdminClientDetail {
  clientId: string;
  name: string;
  description: string | null;
  logoUri: string | null;
  clientUri: string | null;
  contacts: string[];
  applicationType: ClientApplicationType;
  /** 迁移时应用类型是猜出来的；false 表示还允许改正一次（api-delta §4.2）。 */
  applicationTypeConfirmed: boolean;
  environment: ClientEnvironment;
  status: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  allowedScopes: string[];
  isFirstPartyTrusted: boolean;
  tokenEndpointAuthMethod: string;
  tokenPolicy: ClientTokenPolicy;
  hasSecret: boolean;
  secretRotatedAt: number | null;
  secretAgeDays: number | null;
  /** 重叠期内的旧密钥到期时刻；无重叠期为 null。 */
  previousSecretExpiresAt: number | null;
  /** 重叠期内待作废的旧密钥 ID（供立即吊销）。 */
  previousSecretId: string | null;
  /** 密钥台账（只给元数据，永不给密文）。 */
  secrets?: Array<{
    id: string;
    status: "active" | "retiring" | "revoked" | string;
    createdAt: number;
    expiresAt: number | null;
  }>;
  /** 按应用类型推导，不可直接编辑（改 applicationType 时随之变化）。 */
  grantTypes: string[];
  responseTypes: string[];
  /** 授权过该站点的账户数；停用/删除的影响面按它显示。 */
  grantedUsers: number;
  createdAt: number;
  updatedAt: number;
}

/** POST /v1/admin/clients —— 创建结果；密钥只在此刻可见一次。 */
export interface AdminClientCreated extends AdminClientDetail {
  /** 明文密钥**仅此一次**返回，之后任何接口都不会再给。公开客户端为 null。 */
  clientSecret: string | null;
  /** 非致命提醒（如回调路径填成了 `/`），不阻塞创建。 */
  warnings: string[];
}

/** POST /v1/admin/clients/:id/rotate-secret —— 新旧并存 24h。 */
export interface AdminSecretRotated {
  clientId: string;
  /** 新密钥的台账 ID。 */
  secretId: string;
  /** 明文，仅此一次。 */
  clientSecret: string;
  /** 上一把密钥的台账 ID；用于「接入方已换完，立即吊销旧密钥」。无旧密钥时为 null。 */
  previousSecretId: string | null;
  previousSecretExpiresAt: number | null;
}

/** 审计操作者类型（api-delta §4.5：升为真实列 + 复合索引）。 */
export type AuditActorType = "user" | "staff" | "system";

/** GET /v1/admin/audit-logs —— 审计日志项。 */
export interface AuditLog {
  id: string;
  actorUserId: string | null;
  /** 可读操作者名称（api-delta §4.6）。 */
  actorName: string | null;
  actorType: AuditActorType;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  /** 可读目标名称；已删除的目标由后端给出占位。 */
  resourceName: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  requestId: string | null;
}

/** GET /v1/admin/staff —— IAM tc_main 的只读投影。 */
export interface AdminStaffMember {
  userId: string;
  username: string | null;
  displayName: string | null;
  email: string | null;
  accountStatus: AccountStatus | null;
  /** IAM 侧的用户名。 */
  iamUsername: string | null;
  boundAt: number;
  activeSessions: number;
  lastActiveAt: number | null;
  /**
   * 本次是否成功查到了 IAM。false 时下面三个数组一律为空 ——
   * **不能据此判断此人已被撤权**，那是 `verdict: "unknown"` 的含义。
   */
  available: boolean;
  roles: string[];
  groups: string[];
  permissions: string[];
  verdict: "staff" | "ex_staff" | "unknown";
}

/** GET /v1/admin/keys —— 签名密钥。 */
export interface AdminSigningKey {
  kid: string;
  alg: string;
  status: "current" | "previous" | "retired" | string;
  createdAt: number;
  rotatedAt: number | null;
  ageDays: number;
}

/** GET /v1/admin/policy —— 账户策略（这是新增接口，旧后端没有）。 */
export interface AdminPolicy {
  /** 持有管理权限的账户必须启用二次验证。 */
  requireStaffMfa: boolean;
  /** 邮箱未验证则禁止登录。 */
  emailVerificationGate: boolean;
  /** 连续密码错误多少次后锁定；0 = 不锁，其余取 3–20。 */
  lockAfterFailedAttempts: number;
  updatedAt: number;
  updatedBy: string | null;
}

/** 管理端 step-up（IAM 代理 2FA）：5 分钟窗口记在当前 Pass 会话上。 */
export interface AdminStepUpStart {
  verificationId: string;
  verifyUrl: string;
  status: string;
  expiresAt: number | null;
}
