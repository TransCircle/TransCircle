# 管理平面 · 接口与数据模型增量

新控制台要落地，后端必须补什么。这份文档是前后端一致性的合同。

清单核对自 `TransCircle-Pass/src/routes/admin.ts` 实际注册的路由（不是 `docs/iam-main-api.md` 的声称值 —— 两者有出入，见 §一注）。

---

## 一、改造前的现存端点（实际 21 个）—— 历史快照

> **这一节描述的是动工前的状态，不是当前状态。** 保留它是为了说明「为什么要改」。
> 其中前三条（`/v1/admin/oauth/iam/start|callback`、`/v1/admin/oauth/exchange`）
> 属于已被废弃的「独立管理员登录平面」，**现已删除** —— 新模型下管理员就是普通用户，
> 统一身份是绑到账户上的，见 §五之二与 `docs/iam-main-api.md §3.2`。
> 当前实际端点以 §三、§四为准。

```
GET    /v1/admin/oauth/iam/start          GET    /v1/admin/users
GET    /v1/admin/oauth/iam/callback       GET    /v1/admin/users/:id
POST   /v1/admin/oauth/exchange           POST   /v1/admin/users/:id/force-logout
POST   /v1/admin/step-up/iam/start        POST   /v1/admin/users/:id/reset-2fa
POST   /v1/admin/step-up/iam/poll         POST   /v1/admin/users/:id/suspend
GET    /v1/admin/me                       POST   /v1/admin/users/:id/unsuspend
GET    /v1/admin/clients                  POST   /v1/admin/users/:id/ban
POST   /v1/admin/clients                  POST   /v1/admin/users/:id/unban
PATCH  /v1/admin/clients/:id              POST   /v1/admin/users/:id/delete
POST   /v1/admin/clients/:id/rotate-secret
POST   /v1/admin/keys/rotate
GET    /v1/admin/audit-logs
```

> **注**：`docs/iam-main-api.md §8` 列了 `PATCH /v1/admin/policy`，但 `admin.ts` 里**没有这条路由**（全文件搜 `policy` 零命中）。也就是说安全策略至今没有任何后端接口，控制台的策略页是全新的读写两端。该文档需同步订正。

**这 21 个端点里，没有一个能读出会话、绑定、通行密钥、恢复码、授权、密钥列表、员工名册、安全策略。** 后台只能做「看列表 + 一刀切」，这就是它像半成品的机械原因。

（以上问题已在本次改造中解决；下面各节描述的是**改造后**的契约。）

---

## 二、列表分页：从游标改为 offset/limit（对外契约变更）

控制台要支持**点页码直达**（第 3 页），游标分页做不到 —— 它只知道「下一段从哪开始」。仓库里现有的 `Pagination` 组件注释写得很直白：「后端为游标分页、无总数，故不做页码直达」。

因此 `/v1/admin/*` 的**列表端点全部改为 offset 分页**：

```
GET /v1/admin/users?page=3&pageSize=10&q=&status=&sort=last:desc
→ { "items": [...], "page": 3, "pageSize": 10, "total": 26 }
```

适用范围是**明确的三个列表**：`GET /v1/admin/users`、`GET /v1/admin/clients`、`GET /v1/admin/audit-logs`，以及 `GET /v1/admin/users/:id/audit-logs`。其余管理端集合（会话、绑定、通行密钥、授权）体量天然有限，一次返回全部，不分页。

**参数与边界，逐条定死**（不定死就会前后端各写一套）：

| 参数 | 默认 | 合法值 | 非法时 |
|---|---|---|---|
| `page` | `1` | 正整数 | 缺失取默认；非整数 / ≤0 → `400 INVALID_PAGE` |
| `pageSize` | `10` | `10` / `20` / `50` | 其余值 → `400 INVALID_PAGE_SIZE` |
| `sort` | 各列表指定 | `<字段>:asc\|desc`，字段取白名单 | 未在白名单 → `400 INVALID_SORT` |
| `q` | 空 | ≤128 字符 | 超长截断，不报错 |
| `status` / `actorType` | 空=不筛 | 各自枚举 | 非枚举值 → `400` |

- **`total` 必须返回**，否则前端算不出页数。
- **越界统一返回空页**（`items: []`，照常返回真实 `total`），不报错也不自动夹到末页。理由：夹到末页会让「粘贴一个页码链接」的结果和粘贴者看到的不一样；报错则让并发删除变成一次可见故障。空页 + 正确 `total` 让前端能自行决定是否回跳。
- **`total = 0` 时 `page=1` 合法**，返回空列表。
- **排序白名单，且每个字段都必须附加稳定唯一次键**（`id`），不只是默认排序：
  - users：`last`（最后活动）/ `name` / `status` / `sessions`，默认 `last:desc`
  - clients：`name` / `createdAt` / `secretAge`，默认 `createdAt:desc`
  - audit-logs：`at`，默认 `at:desc`

  没有次键，同值行会在翻页之间抖动 —— 第 1 页看到的人第 2 页又出现一次。

**代价要认**：offset 分页在数据频繁变动时会出现跨页重复/漏行。管理后台是低频只读为主的场景，可接受。

**这条只改管理平面。** C 端 `/v1/me/sessions` 等仍用游标，不动。

---

## 三、新增端点（26 个）

「二次验证」= 需要 step-up；「原因」= 必须提交写进审计的 `reason`（≥4 字）。

### 用户 · 资料与备注

| 方法 | 路径 | 权限 | 二次验证 | 原因 | 说明 |
|---|---|---|:---:|:---:|---|
| `PATCH` | `/v1/admin/users/:id` | `pass.user:write`（新） | 按字段 | — | 见 §五 风险字段表 |

### 用户 · 安全

| 方法 | 路径 | 权限 | 二次验证 | 原因 | 说明 |
|---|---|---|:---:|:---:|---|
| `GET` | `/v1/admin/users/:id/mfa` | `pass.user:read` | — | — | TOTP 状态、恢复码总数/已用数（**不返回码本身**） |
| `POST` | `/v1/admin/users/:id/totp/disable` | `pass.user:reset-2fa` | ✅ | ✅ | 单独关闭动态口令，不动通行密钥 |
| `POST` | `/v1/admin/users/:id/recovery-codes/revoke` | `pass.user:reset-2fa` | ✅ | ✅ | 作废全部恢复码 |
| `POST` | `/v1/admin/users/:id/password` | `pass.user:reset-2fa` | ✅ | — | 设新密码；`forceChangeOnNextLogin` 默认 `true`；**连带吊销该用户全部会话** |
| `GET` | `/v1/admin/users/:id/passkeys` | `pass.user:read` | — | — | 逐把：名称、创建、最后使用 |
| `DELETE` | `/v1/admin/users/:id/passkeys/:pkid` | `pass.user:reset-2fa` | ✅ | ✅ | 吊销单把 |

`POST /v1/admin/users/:id/unlock` —— 解除登录失败锁定（权限 `pass.user:write`，
不需 step-up，原因选填）。锁定由连续失败自动加上且已持久化（§4.8），必须有对应的人工解除手段。

### 用户 · 会话 / 绑定 / 授权 / 生命周期

| 方法 | 路径 | 权限 | 二次验证 | 原因 | 说明 |
|---|---|---|:---:|:---:|---|
| `GET` | `/v1/admin/users/:id/sessions` | `pass.user:read` | — | — | 设备、IP 段、UA 哈希、时间 |
| `DELETE` | `/v1/admin/users/:id/sessions/:sid` | `pass.user:force-logout` | — | — | 吊销单个会话 |
| `GET` | `/v1/admin/users/:id/bindings` | `pass.user:read` | — | — | **只读**，不提供解绑 |
| `GET` | `/v1/admin/users/:id/grants` | `pass.user:read` | — | — | 授权过哪些客户端 |
| `DELETE` | `/v1/admin/users/:id/grants/:clientId` | `pass.user:force-logout` | — | — | 撤销单站 SSO 并吊销令牌族 |
| `GET` | `/v1/admin/users/:id/audit-logs` | `pass.audit:read` | — | — | 该用户的操作链（分页同 §二） |
| `GET` | `/v1/admin/users/:id/iam-status` | `pass.user:read` | — | — | 工作人员判定，见 §六 |
| `POST` | `/v1/admin/users/:id/export` | `pass.user:read` | — | — | GDPR 可携权导出 |
| `POST` | `/v1/admin/users/:id/merge/preview` | `pass.user:delete` | — | — | **只算不改**：返回将迁移的绑定/授权/会话/通行密钥数量 |
| `POST` | `/v1/admin/users/:id/merge` | `pass.user:delete` | ✅ | ✅ | 执行合并，需带 preview 返回的 `previewToken` |

> 合并做成两阶段是刻意的：合并不可逆，让人在看不见「到底会搬走什么」时点确定不负责任。`previewToken` 短 TTL（5 分钟）且绑定 `(actor, source, target)`，防止预览 A 却提交 B。

### 客户端

| 方法 | 路径 | 权限 | 二次验证 | 原因 | 说明 |
|---|---|---|:---:|:---:|---|
| `GET` | `/v1/admin/clients/:id` | `pass.client:read` | — | — | 单个详情 |
| `DELETE` | `/v1/admin/clients/:id` | `pass.client:manage` | ✅ | ✅ | 删除 |
| `POST` | `/v1/admin/clients/:id/secrets/:sid/revoke` | `pass.client:manage` | ✅ | ✅ | 重叠期内立即作废旧密钥 |

> **不拆 `pass.client:delete`。** 曾考虑把删除从 `pass.client:manage` 拆出，但 `pass.client:manage` 本来就只给 `pass-admin`，拆分只增加 IAM 配置负担、不减少实际风险；删除已由 step-up + 原因把关。这里明确不拆，避免文档与实现各说各话。

### 全局

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| `GET` | `/v1/admin/overview` | `pass.user:read` | 概览指标，服务端算 |
| `GET` | `/v1/admin/sessions` | `pass.user:read` | 会话总数（概览用），不做独立页面 |
| `GET` | `/v1/admin/keys` | `pass.key:rotate` 或 `pass.policy:manage` | 签名密钥列表 |
| `GET` | `/v1/admin/policy` | `pass.policy:manage` | 读当前策略 |
| `PATCH` | `/v1/admin/policy` | `pass.policy:manage` | 改策略（✅ 二次验证）—— **注意这是新增，不是现存** |
| `GET` | `/v1/admin/staff` | `pass.audit:read` | 员工名册 |

> **没有 `POST /v1/admin/logout`，也不需要。** 管理端**复用用户自己的 Pass 会话** —— 管理员就是普通用户，「进入控制台」只是访问了一个需要权限的页面，不额外建立第二条会话。退出走既有的 C 端登出接口。
>
> 这条决定同时让旧模型里的 `admin_sessions` 彻底退出目标结构：它连同 `admin_staff` / `admin_iam_permission_snapshots` 一起列为待处置存量（见 §十）。step-up 的 5 分钟窗口记在**当前 Pass 会话**上。

`GET /v1/admin/overview` 响应形状：

```jsonc
{
  // 全部状态都给，界面据此画分布 —— 少给一档就会出现「各状态之和 ≠ 总数」。
  // total 是全表计数，含 deleted，所以 deleted 也必须在分布里。
  "users":    { "total": 26, "active": 20, "pendingVerification": 0, "suspended": 3,
                "banned": 2, "pendingDeletion": 1, "merged": 0, "deleted": 0 },
  "sessions": { "active": 24, "accounts": 14 },
  // covered 含「把两步验证交给统一身份接管」的账户，与后端认可的第二因素一致
  "mfa":      { "covered": 12, "activeTotal": 20 },
  "clients":  { "active": 4, "disabled": 1 },
  "grants":   { "total": 15 },
  // recentFailures 的单位是「窗口内出现过失败的账户/挑战数」，**不是失败次数总和**；
  // 只统计 type='mfa_challenge' 的令牌（邮箱验证、找回密码的失败与登录失败不是一回事）
  "auth":     { "recentFailures": 4, "windowHours": 24, "lockedAccounts": 1 },
  "staff":    { "total": 2 },
  "signingKey": { "kid": "kid_2026_07", "ageDays": 31, "previousKid": "kid_2026_01" }
}
```

---

### 认证侧（非管理端，但属本次契约变更）

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/v1/auth/mfa/challenge` | 用 `mfaChallengeToken` 换回 `availableMethods`（必要时含 `passkey`）。跳转流登录（第三方 OAuth）回到前端后补齐方式列表用；只读、不消耗挑战 |
| `POST` | `/v1/auth/mfa/iam/start` \| `/verify` | 统一身份代理 2FA（§5b.3） |
| `GET` | `/v1/me/oauth` | 每项增加 `label` 与 `unbindable` |
| `POST` | `/v1/auth/oauth/complete-binding` | 需 `acknowledgedPermanent: true`，否则 `400 ACK_REQUIRED` |
| `DELETE` | `/v1/me/oauth/iam` | 恒 `409 IAM_BINDING_PERMANENT` |

---

## 四、现有端点的变更

### 4.1 `POST /v1/admin/clients` — 按应用类型的校验矩阵

现有实现**无条件要求至少一个 `redirectUri`**，而新向导允许 M2M 客户端不填回调 —— 直接提交会 422。创建端点必须接受 `applicationType` 并按类型分支校验：

| applicationType | redirect_uris | tokenEndpointAuthMethod | grantTypes | 签发密钥 |
|---|---|---|---|---|
| `web_backend` | ≥1，必须 https（localhost 例外） | `client_secret_basic` | `authorization_code` + `refresh_token` | 是 |
| `spa` | ≥1，必须 https（localhost 例外） | `none`（强制 PKCE S256） | `authorization_code` + `refresh_token` | 否 |
| `native` | ≥1，允许自定义 scheme | `none`（强制 PKCE S256） | `authorization_code` + `refresh_token` | 否 |
| `m2m` | **必须为空** | `client_secret_basic` | `client_credentials` | 是 |

回调地址通用规则（前端已实现同一套，后端必须独立再校一遍）：绝对地址、无 `#` 片段、无通配符、非本地必须 https、路径不得为 `/`（警告级）。

### 4.2 `PATCH /v1/admin/clients/:id` — 可编辑字段扩展

新增接受：`description`、`environment`、`postLogoutRedirectUris`、`contacts`、`tokenPolicy{accessTtl,refreshTtl,rotate,absoluteTtl}`。

**始终拒绝**：`clientId`、`tokenEndpointAuthMethod` → `422 IMMUTABLE_FIELD`。

**`applicationType` 有条件可改**：迁移时它是**从认证方式猜出来的**（`none`→spa、有密钥→web_backend），无法区分 spa/native、也无法识别既有 M2M。因此新增 `applicationTypeConfirmed` 标记：

- `confirmed = false`（迁移遗留）：允许管理员改正一次，改后置 `true`。
- `confirmed = true`：不可改，返回 `422 IMMUTABLE_FIELD`。

没有这个标记，错误的猜测就永远没有纠正路径 —— 这是迁移与「不可修改」两条规则的直接冲突，必须显式化解。

### 4.3 `POST /v1/admin/clients/:id/rotate-secret` — 引入重叠期

今天是**替换**：新密钥一生成旧密钥立刻失效，接入方必然掉线。改为新旧并存：旧密钥标 `retiring`、`expiresAt = now + 24h`，到期由清理任务作废。响应新增 `previousSecretExpiresAt`。

### 4.4 管理权限 — 会话内 60 秒缓存 + 危险操作强制实时复查

改造前：登录时拉一次写进 `admin_iam_permission_snapshots` 表，此后**跨会话**一直吃这份快照，
在 IAM 撤权后可能长期不收敛。

现在：**不落库**。权限只在本次 Pass 会话内缓存 60 秒，过期即经 M2M 重新拉取 ——
在 IAM 改了权限最多一分钟生效，**不需要重新登录**。
所有写入口在执行前另有一次绕过缓存的实时复查（`requireFreshPermission`，强制、无开关），
解决「人已登录着但权限刚被撤销」；IAM 不可达时 fail-closed。

### 4.5 `GET /v1/admin/audit-logs` — actor 类型要能筛

`actorType` 从 JSON 约定升为真实列（`user`/`staff`/`system`）+ 复合索引，支持 `?actorType=`。

历史行刻意不回填（见 §八），所以**按类型筛选时必须同时匹配 `metadata.actorType`**，
只查真实列会把迁移前的行整段漏掉 —— 审计查询漏数据比慢更糟。
筛 `user` 时还要把「列为空且 metadata 也没标注」的行算进来，那是历史行的隐含默认。

### 4.6 响应里带可读名称

审计的 `resourceId`、授权的 `clientId` 等，一并返回 `resourceName` / `clientName`；
审计的操作者返回 `actorName`。**内部 ID 不进用户可见界面**；只在接入配置与排障复制按钮保留。

同一条约束反过来也成立：**要求管理员输入内部 ID 同样不可接受**。
因此 `merge/preview` 与 `merge` 的 `targetUserId` 接受用户 ID、用户名或邮箱三者之一。

### 4.7 安全策略必须真的生效

`GET|PATCH /v1/admin/policy` 的三个开关原先只被写进存储再读回来显示，认证链路根本不看它们：
登录失败锁定写死 5 次、邮箱门禁写死"必须验证"、工作人员强制 MFA 完全没落地。
**"保存后无效果"的开关比没有还糟。**

现在 `src/utils/policy.ts` 是唯一读取入口，认证链路与管理端共用。
读不到策略时回落**更严**的默认值，不是放行。

三个开关各自的落点：

| 开关 | 生效位置 |
|---|---|
| `requireStaffMfa` | `loadAdminContext`：有管理权限但没有 TOTP / 通行密钥 / 统一身份接管 → `403 STAFF_MFA_REQUIRED`。前端为它单列了一个可执行的空态（「去启用二次验证」），不与「没有权限」共用死胡同 |
| `emailVerificationGate` | **六条登录完成路径全部受它约束**：密码登录与 OAuth 登录直接读策略，TOTP MFA / Passkey MFA / IAM MFA / Passkey 免密登录经 `emailGateBlocks()`。原先后四处各自硬编码，关掉开关后"没有 MFA 的能进、有 MFA 的反而进不去"，开关只生效一半且方向是反的 |
| `lockAfterFailedAttempts` | 密码登录的失败计数与锁定判定（见 §4.8） |

缓存 30 秒。**失效时机必须在事务提交之后** —— 在 `savePolicy()` 里失效的话，
此刻事务还没提交，别的请求这时来读会读到旧值再缓存 30 秒，比不失效更糟。

字段名以后端为准：`requireStaffMfa`（不是 `mfaRequiredForStaff`）、
`emailVerificationGate`、`lockAfterFailedAttempts`（0 = 不锁，其余取 3–20）。

### 4.8 登录失败锁定改为持久化

原实现把失败计数放在进程内的 Map 里。**多实例部署下锁定形同虚设** ——
请求被负载均衡分到 N 个实例，各自计数，实际可尝试次数是配置值的 N 倍。
现在落到 `users.failedLoginAttempts` / `failedLoginWindowStart` / `lockedUntil`（迁移 0006），
阈值才是真的全局阈值，管理后台也才能如实显示锁定状态。

配套新增 `POST /v1/admin/users/:id/unlock`：锁定是自动加上的，
只能等 15 分钟自然到期的话，「用户打电话说进不去」时管理员什么也做不了。

---

## 五、风险字段与字段名映射

前端字段名是原型内的简写，**契约以 API 字段名为准**：

| API 字段 | 原型内 | 属风险项 | 说明 |
|---|---|:---:|---|
| `displayName` | `name` | — | 昵称 |
| `username` | `username` | ✅ | 同时是登录标识 |
| `email` | `email` | ✅ | |
| `emailVerified` | `verified` | ✅ | 人工置信 |
| `adminNote` | `note` | — | 管理备注 |
| `name`（客户端） | `name` | — | 同意屏展示名 |
| `description` | `desc` | — | |
| `clientUri` / `logoUri` / `contacts` | 同名 | — | |
| `environment` | `env` | ✅ | 影响回调校验强度 |
| `status` | `status` | ✅ | 停用即断登录 |
| `redirectUris` | `redirects` | ✅ | |
| `postLogoutRedirectUris` | `postLogout` | ✅ | |
| `allowedScopes` | `scopes` | ✅ | |
| `isFirstPartyTrusted` | `trusted` | ✅ | 仅超管可设 |
| `tokenPolicy.*` | `tokenPolicy` | ✅ | `accessTtl` ∈ [300, 3600]；`refreshTtl` ∈ {0, 604800, 1209600, 2592000}；`absoluteTtl` ∈ {2592000, 7776000, 15552000}（m2m 恒为 0，且不可编辑）；`m2m` 类型只接受 `accessTtl`，其余必须为 0/false |
| `applicationType` | `type` | ✅ | 仅未确认时可改 |
| 安全策略全部字段 | `mfaStaff`/`emailGate`/`lockAfter` | ✅ | |

**风险判定在后端做**，前端的分级只是提前告知。含风险字段的 `PATCH` 缺少有效 step-up 时返回 `403 STEP_UP_REQUIRED`。

**scope 组合约束**：`pass.profile.full` 仅第一方可用。取消 `isFirstPartyTrusted` 时必须同时移除该 scope，否则组合非法 —— 前端已做同步移除，后端需独立校验并在冲突时返回 `422 INVALID_SCOPE_COMBINATION`。

---

## 五之二、统一身份绑定与两步验证接管（用户自助）

IAM **挂进既有的第三方绑定机制**，与 GitHub / X 同一套流程 —— 不另起一套。

### 5b.1 绑定

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/v1/me/oauth/iam/bind/start` | 复用既有 `/v1/me/oauth/:provider/bind/start`，`provider` 增加 `iam` |
| `POST` | `/v1/auth/oauth/complete-binding` | 复用既有端点 |
| `GET` | `/v1/me/oauth` | 列表里多一条 `provider: "iam"` |

绑定成功后**权限自动生效**：下次进入控制台时按该 IAM 身份在 `tc_main` 下的权限渲染，无需任何人工授予。

### 5b.2 不可解绑 —— 这是刻意的，且必须提前讲清楚

`DELETE /v1/me/oauth/iam` **一律拒绝**，返回 `409 IAM_BINDING_PERMANENT`。

理由：这条绑定同时是「这个账户是工作人员」的判定依据。若允许自助解绑，任何被封禁风险中的工作人员都可以先解绑、把自己变回普通账户来绕过 §六 的保护；管理权限的收回也会从「IAM 撤权」这一个可审计的入口，变成用户自己就能触发。

**因此绑定前必须有一次明确的不可逆确认**，前端在发起绑定时展示：

> 绑定统一身份后**无法自行解除**。绑定即表示此账户被视为工作人员账户，其他工作人员将无法修改它。
> 如需解除，只能由 IAM 管理员在 `tc_main` 中撤销你的权限后，由后端处理。

后端在 `complete-binding` 时要求请求体带 `acknowledgedPermanent: true`，缺失则 `400 ACK_REQUIRED` —— 前端漏了这个确认，后端不放行。

### 5b.3 两步验证由 IAM 接管（用户可开关）

绑定 IAM 后，用户可开启「登录两步验证交给统一身份」：

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/v1/me/mfa/iam` | 读当前状态：`{ available, delegated }`；`available` = 是否已绑定 IAM |
| `POST` | `/v1/me/mfa/iam/enable` | 开启接管。需当前会话已完成 step-up |
| `POST` | `/v1/me/mfa/iam/disable` | 关闭接管，恢复本地 passkey / TOTP。需当前会话已完成 step-up |

**开启后的登录行为**：密码/第三方登录通过后，第二因素**只走 IAM 代理 2FA**（`POST /v1/auth/mfa/iam/start` → 用户到 IAM 完成 → `POST /v1/auth/mfa/iam/verify` 后端回查）。本地 passkey 与 TOTP 在登录路径上**一律不接受**，即使凭据仍然存在。

- `POST /v1/auth/mfa/totp/verify` → `409 MFA_DELEGATED_TO_IAM`
- `POST /v1/auth/mfa/passkey/verify` → `409 MFA_DELEGATED_TO_IAM`
- Passkey 直登（`/v1/auth/passkey/login/*`）同样拒绝 —— 否则它会成为绕过接管的后门
- **第三方 OAuth 登录（GitHub / X）也必须转入第二因素**，见下

#### 所有第一因素路径共用同一个挑战入口

`issueMfaChallenge(user, ip, tx?)` 是**唯一**的第二因素判定与签发点。
任何直接调用 `createSessionAndTokens` / `issueTokens` 的登录路径都是绕过。

第三方 OAuth 回调原先就是这么绕过去的：绑了 GitHub 的账户即便开了 TOTP 或统一身份接管，
走一次第三方登录就能直接拿到会话 —— 第二因素形同虚设，对已把 2FA 交给 IAM 的
工作人员账户尤其致命。**这是一个先于本次改造就存在的缺口，本次一并堵上。**

第三方登录是跳转流，挑战令牌只能放在 URL 片段里带回前端
（`/auth/callback?status=mfa_required#mfaChallengeToken=…`，片段不进服务端访问日志、
也不出现在 Referer）。方式列表塞不进 URL（Passkey 的 assertion 参数尤其大），
所以新增 `POST /v1/auth/mfa/challenge`：用挑战令牌换回 `availableMethods`
（必要时含 `passkey` 参数）。只读、不消耗挑战、不增加失败计数。

**前端接法**：`AuthCallbackPage` 认出 `status=mfa_required` 后，先
`history.replaceState` 把片段从地址栏抹掉（失败路径也抹，一次性凭据不能留在历史里），
再经 `sessionStorage` 把挑战令牌交接给 `/login`（`pages/mfaHandoff.ts`，读取即删除）。
登录页拿到交接后调 `/v1/auth/mfa/challenge` 补齐方式列表，然后**复用与密码登录完全相同的
那套二次验证界面**（验证器 / 通行密钥 / 恢复码 / 统一身份），不另做一套。
跳转目的地也随交接一起带过去 —— 地址栏上的 `?redirect=` 这时已经不在了。

**响应在事务提交之后才发**。OAuth 回调原先在事务回调里直接 `res.redirect()`／`res.cookie()`：
响应先于提交发出，提交若失败，浏览器已经拿着「登录成功」跳走而库里什么都没落下；
反过来浏览器也可能在提交可见之前就发起下一个请求。现在事务内只决出「要发什么」，
出了事务再统一发。

**恢复码仍然有效，这是唯一的破窗通道。** 用户说的是「passkey 和 TOTP 不再生效」，恢复码不在其列；而且必须留一条 —— IAM 不可达时，若连恢复码也失效，用户会被永久锁在门外，而关闭接管的开关又只能在登录后才能点到。这是死锁，必须由恢复码打破。前端在开启接管时同时提示「请确保已保存恢复码」。

**IAM 不可达时**：登录第二因素无法完成，明确返回 `503 IAM_UNAVAILABLE` 并提示可用恢复码登录，**不静默回退到本地因素** —— 回退等于接管形同虚设。

### 5b.4 新增字段

`users.iamMfaDelegated BOOLEAN NOT NULL DEFAULT FALSE`（迁移 `0003`）。

---

## 六、工作人员账户互不可动

**绑定了 IAM 且在 `tc_main` 下仍持有任何权限的账户 = 工作人员，其账户拒绝一切来自其他工作人员的写操作。**

统一的目标守卫，加在所有 `/v1/admin/users/:id/*` 写路径上（含 `PATCH /users/:id`）：

```
resolveTargetIamStatus(targetUserId):
    binding = oauth_accounts WHERE userId = target AND provider = 'iam'
    if !binding                       → not_staff       （放行）
    perms = IAM.GET /api/v1/permissions?user=<binding.sub>&app=tc_main   ← 实时，禁止读快照
    if IAM 不可达 / 超时 / 非 2xx      → staff_assumed   （拒绝，fail-closed）
    if perms.length > 0               → staff           （拒绝）
    else                              → ex_staff        （放行）
```

拒绝返回 `403 STAFF_TARGET_PROTECTED`，`detail` 写明解锁路径。

- **必须实时查，不能读 `admin_iam_permission_snapshots`** —— 那是**操作者**登录时的缓存，与**目标**无关。
- **fail-closed**：证明不了不是员工，就不能动。前端也必须消费后端给的 `verdict` 四值，**不要从权限数组的形状自行推断**（数组缺失 / 为空 / 查询失败是三件不同的事）。
- **守卫在后端独立做**，前端灰按钮挡不住 curl。
- 覆盖全部写操作，**包括 `force-logout`**。代价：工作人员账户被盗时应急路径变成「先去 IAM 撤权 → 再回 Pass 处置」。刻意取舍。

列表端点返回 `isStaff` 用于标记，为避免逐行调 IAM 走批量查询；**列表标记只是提示，拦截以写操作时的实时查询为准。**

---

## 七、原子性与鲁棒性

### 7.1 保存 = 确认 → 按风险决定二次验证 → 原子提交

前端是「一张卡片一个保存按钮」：改动攒在该卡缓冲区，点保存先列逐字段 diff，含风险字段才升级 step-up。后端对应要求：

- **单事务提交**，要么全成要么全不成。
- **乐观并发控制**：请求带 `If-Match: <updatedAt>`，不一致返回 `409 STALE_WRITE` 并附当前值。没有这条，两个管理员同时编辑会静默覆盖 —— 这是现在就存在的问题。
- **响应回传完整实体**。前端据此把新值升为新基线；不能用本地草稿当基线，否则与服务端的规范化结果漂移。

### 7.2 幂等键 —— 已接入

`middleware/idempotency.ts` 已改造并挂载到全部管理端写入口（`globalWriteChain` /
`userWriteChain` 链尾）。两处关键改动见 §8.1「幂等中间件」：

1. 主体键：管理员就是普通 Pass 用户，两端统一从 `req.currentUser.userId` 取
   （前提是中间件挂在 `requireAuth` 之后，链的顺序保证了这一点）；
2. 先用主键**原子插入** `in_flight` 占位再执行，取代原来的「先查后执行」。

对「轮换密钥」尤其要紧：网络抖动重试会连轮两次，把接入方刚拿到的新密钥又换掉。

**已在真库验证**：8 个并发同键预占，恰好 1 个成功（`src/scripts/verifyConcurrency.ts`）。

### 7.3 危险操作的判定顺序

```
requireAuth → loadAdminContext → requirePermission → requireStepUp(5 分钟窗口)
  → requireNotSelf
  → requireTargetNotStaff(实时查 IAM, fail-closed)
  → requireFreshPermission(M2M 实时复查, fail-closed)
  → idempotencyMiddleware(原子预占)
  → 开事务 → SELECT ... FOR UPDATE 重查目标状态
     → assertFresh(在**已加锁的行**上做唯一一次 If-Match 比较)
     → 写 → 写审计 → 提交
```

`If-Match` 的比较必须在事务内、对已加锁的那一行做。放在事务外先比一次再进事务写的话，
两个并发请求可以双双通过那次比较，然后一前一后写入，后者把前者悄悄吃掉 ——
乐观锁只有在「比较所依据的那一行此刻被锁住」时才成立。
缺 `If-Match` 一律 `428 PRECONDITION_REQUIRED`，不再放行。

外部 HTTP 一律在事务外、写之前（现有代码这点做对了，保留）。事务内必须锁行重查，否则「A 封禁、B 同时删号」会写出互相矛盾的结果。

### 7.4 自指防护落在后端

管理员就是 Pass 普通用户，「封禁自己 / 删自己 / 关自己的 TOTP / 作废自己的恢复码 / 吊销自己的通行密钥」都是可达路径。**覆盖全部二次验证因子操作，不只是 `reset-2fa` 总开关。** 返回 `403 SELF_TARGET_FORBIDDEN`。

### 7.5 审计与业务同事务，哈希链单写者

审计写入与业务写入共用同一个事务（`audit({ ..., tx })`），要么一起成立要么一起回滚。

哈希链的 `prevHash` 必须在互斥下读取，否则两个并发写入会读到同一条链尾、各自生成后继，
链**静默分叉** —— 一旦分叉，不可否认性就是假的，事后还无法分辨哪一支是真的。

互斥用的是 `audit_chain_mutex` 上的一行 `SELECT ... FOR UPDATE`（迁移 0004），
**不是 `GET_LOCK`**。这里的判断走过一次弯路，记下来：

命名锁的生命周期挂在**连接**上，不挂在事务上。无论在 `finally` 里主动 `RELEASE_LOCK`，
还是等连接归还连接池，锁都会在外层业务事务**提交之前**释放；后一个写者于是能在
前一条 INSERT 尚未对它可见时拿到锁、读到同一个链尾，分叉照旧发生。
行锁则随事务提交/回滚一起释放，释放时刻恰好就是「本条插入对其他事务可见」的时刻。

**光有互斥还不够 —— 还得认对链尾。** 最初仍用 `ORDER BY createdAt DESC, id DESC`
读最后一条来取 `prevHash`，这在同一毫秒内写入多条时并不可靠：`createdAt` 只有毫秒精度，
主键是「时间戳 + 随机段」的 ID、同毫秒内并非单调。排序可能把先写入的那条排在后面，
下一个写者据此取到倒数第二条，生成的后继与前一条共用 `prevHash` —— 加了锁，链照样分叉。
互斥保证「一次只有一个写者」，保证不了「这个写者认对了前驱」。

所以链尾**显式存在互斥行上**（`lastHash` + 单调 `seq`，迁移 0007）：同一个事务里
读 `lastHash` → 插入记录 → 更新 `lastHash`，三件事一起成立或一起回滚，不需要任何排序推断。

不再设置会话级 `innodb_lock_wait_timeout` —— 那是连接级设置，会污染连接池里这条连接
后续所有无关事务的等锁行为。用默认值即可。

**锁顺序**：审计写入必须是事务内**最后**一个数据库动作。拿到互斥行之后再回头动业务表，
会与「先锁业务表、再写审计」的路径构成相反的加锁顺序，并发时死锁。
（已按此顺序修正 `me.ts` 的 Passkey 注册与 `admin.ts` 的客户端删除两处。）

**历史接续同样不靠排序**：迁移 0007 从哈希关系里找**叶节点**
（没有任何记录把它当作 `prevHash` 的那条 `entryHash`）。链完好时它唯一；
不唯一说明历史数据里已经存在分叉，这时不猜、直接报错让人先查。
按 `createdAt DESC, id DESC` 取最后一条恰恰是这条迁移要修掉的错误做法。

`seq` 是**链长计数**：记录本身不带序号，所以它能发现「记录数与链长不一致」，
但指不出缺口在哪。

**已在真库验证**（`src/scripts/verifyConcurrency.ts`）：24 个并发写入，0 分叉；
**从互斥行记录的链尾沿 `prevHash` 回溯能走到全部记录**，且 `seq` 与实际条数一致 ——
这个校验不依赖任何排序假设，而按时间排序去验证恰恰是循环论证。
0007 的历史接续也已在有 171 条真实记录的库上回滚重跑验证过。

签名密钥轮换（`rotateSigningKey`）同样接受外部事务，与它的审计记录同生共死：
否则审计写失败而密钥已换，接口报错、管理员重试，一次点击换掉两把密钥而审计里一条记录都没有。

---

## 八、数据模型增量 —— 已实现为迁移

`TransCircle-Pass/src/migrations/` 已落地，启动时自动执行：

| 文件 | 作用 |
|---|---|
| `migrator.ts` | 执行器。钉住单条连接 + MySQL 命名锁（锁与写同生共死，见下）、`schema_migrations` 账本、幂等 helper（查 `information_schema`，且校验已存在列的类型）、`replaceCheck`、支持 `DELIMITER` 的 SQL 切分 |
| `0001-baseline.ts` | 基线。检查**一组**关键表而非单张 `users`；完整则仅登记，全空则导入 `schema.sql`，残缺则拒绝并报错 |
| `0002-admin-console.ts` | 管理控制台结构变更（见下） |
| `0003-iam-mfa-delegation.ts` | `users.iamMfaDelegated` —— 两步验证交给统一身份接管 |
| `0004-audit-chain-mutex.ts` | `audit_chain_mutex` 单行互斥表，取代连接级 `GET_LOCK`（见 §7.5） |
| `0005-idempotency-in-flight.ts` | 幂等键的 `in_flight` 占位状态；`responseStatus`/`responseBody` 改可空 |
| `0006-login-lockout.ts` | `users.failedLoginAttempts` / `failedLoginWindowStart` / `lockedUntil` —— 登录锁定持久化 |
| `0007-audit-chain-tail.ts` | 互斥行上显式保存 `lastHash` / `seq` —— 只加锁不足以定位链尾（见 §7.5） |
| `0008-app-locks.ts` | 通用单例互斥行（签名密钥首次初始化用） |
| `src/scripts/migrate.ts` | `pnpm migrate` / `pnpm migrate:status` |
| `src/scripts/verifyConcurrency.ts` | 并发正确性人工验证（需真库）：审计链不分叉且可从链尾回溯全部记录、`seq` 与链长一致、幂等首次预占与租约接管各只放行一个。**不覆盖**密钥重叠期认证与 OIDC 端到端 |

`0002` 做的事：

```
oauth_accounts  provider CHECK 放开 'iam'   ← 没有这条，「工作人员」在库里根本存不下
users           + mustChangePassword, adminNote
oauth_clients   + description, applicationType, applicationTypeConfirmed, environment,
                  postLogoutRedirectUris, accessTokenTtl, refreshTokenTtl,
                  refreshRotate, absoluteTokenTtl
                  并按认证方式粗填 applicationType，全部标记为待确认
oauth_client_secrets  新表（轮换重叠期需新旧并存），现有密钥搬入
                      ID = CONCAT('cs_', LEFT(SHA2(clientId,256),32)) —— 定长，不会超 VARCHAR(64)
audit_logs      + actorType（**刻意不回填历史行**，见下）+ idx_audit_actor_typed
```

### 为什么不回填 `audit_logs.actorType` 的历史行

起初写了一条从 `metadata.actorType` 回填的 UPDATE。**真跑 MySQL 8.4 才发现两个问题**：

1. `audit_logs` 上有 append-only 触发器（`trg_audit_no_update`），UPDATE 被直接拒绝；
2. 绕过它就得先 `DROP TRIGGER` 再重建 —— 而重建在开启 binlog 时需要 **SUPER 权限**，在真实环境里**失败了**，审计表就那样留在了无保护状态。

结论：为了让历史行好看一点而摘掉一个专门用来保证审计不可篡改的控制，本末倒置。**append-only 就该是 append-only，迁移也不例外。**

代价与补偿：历史行的真实操作者类型完整保存在 `metadata.actorType` 里，没有丢。**管理端审计查询在按 actor 类型筛选时，必须对历史区间回落读 `metadata.actorType`** —— 这条要写进实现里，不能只依赖新列。新写入的行由 `utils/audit.ts` 直接写真实列，索引对新数据完全有效。

> 这也是一条通用教训：**只有对着真库跑过，才知道迁移能不能落地。** 八轮静态审查都没看出这个问题。

**锁怎么做的**：整个迁移过程钉在**同一条数据库连接**上，在这条连接上取 MySQL 命名锁并执行全部语句。锁与写同生共死 —— 连接断了锁自动释放，我们的写也随之停止。

这里踩过两个坑，记下来免得后人重犯：

1. **直接用 `GET_LOCK` 但走连接池**：锁在连接 A 上拿到、`RELEASE_LOCK` 却跑在连接 B 上，返回 0、锁未释放；而持锁连接活在池里不会断开，锁泄漏到进程退出，下一个实例启动直接卡死。
2. **改用「锁表 + 进程内失效标志」**：进程内的布尔值挡不住一条**已经发往 MySQL、正在执行**的 DDL —— 检查通过之后、语句返回之前，租约仍可能失效并被别人接管。这是 TOCTOU，加再多检查点也消不掉。

**注意：幂等挡不住并发。** 两个实例可能同时查到列不存在、然后同时 `ALTER TABLE ADD`。幂等保证的是**串行重跑**安全，锁在这里是必需品，不是优化。

**启动时序**：`app.listen` 已移入 `bootstrap()` 末尾。之前它写在 `.then()` 链外面同步执行，等于端口在迁移完成前就开始接客。

### 8.1 施工同批交付项 —— 已完成

迁移加列之后运行代码要跟上，否则会出现「数据库里有字段、代码里读不到」的静默故障。
下表是当初列的清单与最终落点，**全部已实现**：

| 位置 | 结果 |
|---|---|
| `src/db.ts` · `User` | 已补 `adminNote` / `mustChangePassword` / `iamMfaDelegated` / 三个登录锁定字段 |
| `src/db.ts` · `OauthClient` | 已补 9 个字段 |
| `src/db.ts` · `AuditLog` | 已补 `actorType` 真实列 |
| `src/db.ts` · `OauthClientSecret` | 新模型 + 关联已建 |
| `src/db.ts` · 废弃模型 | `AdminStaff` / `AdminSession` / `AdminIamPermissionSnapshot` **已整体删除**（新身份模型下没有第二套账号） |
| `src/utils/audit.ts` | 写真实 `actorType` 列（保留 `metadata.actorType` 兼容读）；单写者改为行锁（§7.5） |
| `src/utils/policy.ts` | **新增**。安全策略的唯一读取入口，认证链路与管理端共用（§4.7） |
| `src/middleware/retiringClientSecret.ts` | **新增**。让密钥重叠期在认证链路真正生效（见下） |
| `src/routes/admin.ts` | 创建/编辑客户端接受新字段并按 §4.1 矩阵校验 |
| 登录路径 | `mustChangePassword` 随所有登录响应下发；改密后清零 |
| `src/scripts/seedClient.ts` | 已纳入双写 |
| 列表响应 | `hasSecret`、`secretRotatedAt`、`secretAgeDays`、`previousSecretId`、`previousSecretExpiresAt`、`grantedUsers` 均已提供 |
| 创建/轮换 | 创建写首条 `active`；轮换写新 `active` + 旧置 `retiring`，响应带 `previousSecretId` 与 `previousSecretExpiresAt` |
| 清理任务 | `Index.ts` 每 10 分钟把过期 `retiring` 置 `revoked`；三个清理任务的异常都记日志，不再静默 |
| 请求/响应映射 | `tokenPolicy.{accessTtl,refreshTtl,rotate,absoluteTtl}` ↔ ORM 字段，入参与出参双向都已实现 |

#### 认证侧 fail-open 与 fail-closed

`fetchPermissions` 对 IAM 响应做**严格**校验：`permissions` 缺失、类型不对、
含非字符串元素，一律抛 `IAM_PERMISSIONS_MALFORMED`。

不能把结构异常归一成空数组 —— 「权限为空」在本系统里有确切含义：
该账户已被撤销工作人员身份，其他工作人员可以改它。若把「字段缺失 / 响应被网关改写」
也算成空，IAM 侧任何一次协议异常都会静默解除工作人员保护，这是 fail-open，方向正好反了。
只有**明确出现且确为数组**的 `permissions` 才允许判空。

对应地，`resolveTargetIamStatus` 在查询失败时返回 `permissionCount: null`（**不是 0**）
与 `verdict: 'staff_assumed'`，前端一律按不可写渲染。

`GET /admin/me` 遇到 IAM 拒绝我们的机器凭据（403）时返回 `IAM_REJECTED` 而非 `FORBIDDEN`：
那是运维配置问题，不是「这个用户没权限」。混成一个会让一次机器令牌过期被全公司
理解成自己被撤权了。

#### 客户端密钥重叠期：为什么需要一层中间件

`oidc-provider` 的客户端元数据里只有**一个** `client_secret`，没有多密钥概念。
所以哪怕 `oauth_client_secrets` 里把旧密钥标成 `retiring` 并给了 24h `expiresAt`，
只要 provider 拿到的还是当前那一把，旧密钥在轮换的**那一刻**就已经失效 ——
「重叠期」只是数据库里的一个状态字段，接入方按文档在 24 小时内换密钥会直接 401。

因此在 provider 之前加了一层**凭据归一**（`/oauth2/token`、`/oauth2/introspect`、`/oauth2/revoke`——
路径必须与 `oidcProvider.ts` 的 `routes` 逐字一致，写成协议规范里的 `/introspection`、`/revocation`
会让重叠期只在 token 端点生效，而且不会报任何错）：
出示的密钥若不是当前密钥、但确实是该客户端一条未过期的 `retiring` 密钥，
就把凭据改写成当前密钥再交给 provider。认证判定仍在我们自己的密钥表里做，
不匹配一律原样透传由 provider 拒绝。密钥比较用常量时间。

**只处理 `client_secret_basic`**（只改请求头，不碰请求体流）。管理后台与 `seedClient`
分配的认证方式只有 `client_secret_basic`（web_backend / m2m）与 `none`（spa / native），
见 `APP_TYPE_RULES`。

但**库上的 CHECK 仍允许 `client_secret_post`**（协议本身合法，0002 也会原样保留历史值），
手工改库同样能造出来。这类客户端的密钥轮换**没有 24 小时重叠期** —— 旧密钥在轮换那一刻
立即失效，接入方直接掉线。这件事不能悄悄发生，所以启动时会扫描并告警列出 clientId。

支持 `client_secret_post` 需要缓冲整个请求体
再回填请求流（协议端点的 body 刻意不经 express 解析，留给 oidc-provider 自己读），
既脆弱（用 Readable 伪装 IncomingMessage，`complete` / `destroyed` / 异步迭代器都换不掉），
又在这三个**无需认证即可到达**的端点上开出一条内存放大面。
为一条本系统永远走不到的分支承担这些风险不划算。

#### 每客户端令牌策略：`absoluteTtl` 落在 Grant 上

`accessTtl` / `refreshTtl` / `rotate` 经 `extraClientMetadata` 进入客户端元数据，
由 provider 的 TTL 回调与 `rotateRefreshToken(ctx)` 按客户端取值。

`absoluteTtl` 的语义是「这次授权最长活多久，轮换也不能续」，因此落在 **`ttl.Grant`** 上：
**用户侧客户端不再有「不设上限」这一档**（可选值只剩 30 / 90 / 180 天）。

这个选项做不到它承诺的事：Grant 在 oidc-provider 里必须有到期时间，`0` 最终仍会
落成某个具体值；而 Grant **不随轮换续期**，刷新令牌每次轮换却都拿到完整 `refreshTtl`。
无论把 `0` 映射成 14 天还是 `refreshTtl + 1 天`，它实际都是一个上限 —— 只是没写在标签上。
与其留一个说谎的选项，不如要求每个客户端明确选一档。

`0` 仍然合法，但**只对 m2m**：那类客户端走 client_credentials，不产生用户授权，
这个字段对它没有意义。

刷新令牌轮换时 Grant 不变，Grant 一过期，整个令牌族（含刚轮出来的新 refresh_token）立刻失效。
放在 `ttl.RefreshToken` 上做不到 —— 轮换出的是**新令牌**，每次都从新令牌的签发时刻
重新计时，绝对上限永远不会到达。

`extraClientMetadata.validator` 对这五个属性做类型与范围校验并**归一为安全默认值**
（不是拒绝写入 —— provider 侧拒绝会让整个客户端不可用）。
管理 API 已经把过关，但它不是唯一入口：迁移搬来的历史数据、手工改库都会绕过它，
而 provider 拿到 `accessTokenTtl: "900"`（字符串）时 TTL 回调会静默回落默认值 ——
配置显示一套、实际生效另一套。

#### 幂等中间件：从「先查后执行」改为原子预占

原实现两个请求带同一个 key 并发进来时都查不到记录、双双往下执行 —— 幂等键
恰好在最需要它的场景失效。现在改为先用 `(userId, idempotencyKey)` 主键**原子插入**
一条 `in_flight` 占位，插入成功的请求才有执行权；重复者按状态返回
`IDEMPOTENCY_IN_PROGRESS`（进行中）、重放已缓存响应（已完成）或
`IDEMPOTENCY_KEY_MISMATCH`（同 key 不同请求体）。失败响应会删除占位，允许重试。

顺带修掉一个隐蔽 bug：原实现用 `writeHead` 记录状态码，而 express 的
`res.status().json()` 是先设 `res.statusCode`、再由 `end()` 隐式触发 `writeHead` ——
覆写的 `end` 跑在隐式 `writeHead` **之前**，此刻状态码还停在初始的 200，
于是失败响应会被当成成功缓存，后续同 key 请求重放一个假的 2xx。现在直接读 `res.statusCode`。

**占位租约**：已完成的记录保留 24 小时用于重放，但**卡在 `in_flight` 的占位只给 2 分钟**。
进程若在业务提交之后、`in_flight → done` 更新之前崩掉，这条占位就成了孤儿；
只按 24 小时硬过期的话，用户拿同一个 key 重试会被挡整整一天，而这次操作其实已经做成了。
租约到期后允许下一个请求接管重试 —— 代价是极端情况下重复执行一次，
相对「被锁一天」这是更可接受的一侧。

**租约接管必须是条件更新（CAS）**：租约过期后往往是多个重试同时打进来，
无条件 UPDATE 的话它们会全部"接管成功"、全部往下执行，幂等键在它最该起作用的时刻
再次失效。带上读到的 `createdAt` / `status` 作为条件，只有影响行数为 1 的那个拿到执行权。
（已在真库验证：8 个并发接管，恰好 1 个成功。）

挂载范围：`globalWriteChain` 与 `userWriteChain` 链尾统一挂载；
`PATCH /clients/:id` 因为 step-up 由字段风险动态决定而没走这两条链，单独挂载。
未挂的只有 `step-up/iam/start|poll`（挑战流程本身就该可重复发起 / 是读）
与 `users/:id/export`（只读导出）。

### 8.2b 账户生命周期：状态矩阵与到期执行

**注销必须真的会删。** 改造前「注销账户」只把状态改成 `pending_deletion` 就结束了 ——
没有任何任务把到期账户推进到 `deleted`，界面承诺的「30 天后彻底删除」永远不会发生，
`deleted` 这个状态正常流程根本到不了。这涉及 GDPR 承诺，不是状态标记的事。

现在：

- 自助与管理端注销都写 `deletedAt = now`（此前只有管理端写，自助的账户清理任务根本找不到）；
- 撤销注销清空 `deletedAt`，并按 `emailVerified` 还原到 `active` / `pending_verification`；
- `utils/accountPurge.ts` 每小时（启动时先跑一次）扫描 `deletedAt + 30 天` 已过的账户，
  **匿名化**而非删行：清空可识别信息、销毁全部凭据与会话，`username` 用 `del_` + id 的哈希前缀
  占位（有唯一约束；直接截断 id 会切掉 ULID 的随机段，同毫秒生成的两个 id 可能撞车，
  那会让该账户的注销永远执行不成功），状态置 `deleted`。
  不删行是因为 `audit_logs.actorUserId` 指着它 —— 审计链 append-only，不能为删一个账户去动它。
- **头像一并删除**：`/v1/images/:id` 是无需认证的公开直链，只按 id 取图。
  只把 `users.avatarUrl` 置空的话，图片本身还留在库里且 `status='active'` ——
  任何持有旧 URL 的页面、缓存或业务站在账户注销后仍能拿到本人照片。
- 执行前**锁行重查**状态与期限：选出待处理列表与真正执行之间，用户可能刚好撤销了注销。
- **撤销注销有真正的入口**：注销确认邮件给的是 `/account/cancel-deletion?token=` 链接
  （此前只给一段裸令牌，而产品里根本没有能粘贴它的表单，「30 天内可撤销」是做不到的）。
  该页放在**未登录可访问**的区段 —— 账户处于 `pending_deletion` 时登录本身就被拒，
  放进 `/account` 下面就永远进不去。
- 解封按 `emailVerified` 还原（未验证的回到 `pending_verification`，不替他把邮箱验证了），
  且**封禁与解封都必须写原因**：解封同样改变账户可访问性，审计里必须留下是谁放的人。

**状态 → 允许的生命周期操作**（前端 `DangerTab` 按这张表生成入口，
不再用零散布尔量拼条件；对不齐就会摆出一排点了必然 409 的按钮）：

| 状态 | 允许的操作 |
|---|---|
| `active` / `pending_verification` | 暂停、封禁、注销、合并 |
| `suspended` | 恢复、封禁、注销、合并 |
| `banned` | 解封、注销、合并 |
| `pending_deletion` | 无（撤销注销由**用户本人**凭邮件链接完成，管理端没有入口） |
| `merged` | 注销 |
| `deleted` | 无 |

非生命周期操作（强制下线 / 重置 2FA / 导出）不受此表约束，但受自指与工作人员保护约束。

**导出返回的是文档本身**，前端必须把它存成文件 —— 只弹一句「完成」等于这个功能拿不到东西。

**自指边界**：`/users/:id/*` 的写路径一律经 `requireNotSelf`，因此前端对自己的账户
必须同样禁用（资料保存、解除登录锁、逐会话吊销、逐站授权撤销）——
放开只会摆出必然 403 的按钮。
**唯一例外是数据导出**：导出自己的数据是本人的合法权利，后端显式放行自指，
但对**别人**仍受工作人员保护约束。

### 8.3 签名密钥：JWKS 从库出，初始化用行锁

**`/.well-known/jwks.json` 直接查数据库**，不经 Provider 的构建时快照。

Provider 的 JWKS 是构建时加载的，跨实例失效靠 30 秒轮询收敛 —— 那 30 秒是个真实的故障窗口：
实例 A 轮换后立刻用新 kid 签发，验签方遇到未知 kid 会回来刷 JWKS，
这次请求若命中尚未收敛的实例 B，拿到的仍是旧公钥集，验签直接失败。
`previous` 只能保证「旧令牌能被新 JWKS 验」，救不了「新令牌撞上旧 JWKS」。
数据库是所有实例共享的唯一真相，从它出就没有这个窗口（读库失败时回落 Provider 快照）。

**首次初始化用 `app_locks` 的行锁，不用 `GET_LOCK`**（迁移 0008）。
命名锁挂在连接上：`RELEASE_LOCK` 写在事务回调里会在 COMMIT **之前**释放，
第二个实例拿到锁时查不到未提交的记录，于是又建一把 `current` ——
破坏「只有一把 current」的不变量，之后任何一次轮换都可能把其中一把直接退休，
仍在用它签发的实例签出的令牌立刻验不过。
行锁随提交释放，正好没有这个缝。**已验证**：8 个并发冷启动只生成 1 把 current。

轮换后本实例立即 `invalidateProvider()`（用新私钥签发），其余实例通过
30 秒指纹轮询收敛 —— 但因为 JWKS 已经从库出，这个延迟不再影响验签。

### 8.2 环境要求

MySQL **8.0.16+**。schema 用了 `CHECK` 约束与 JSON 表达式默认值；8.0.16 以下会**解析并忽略** `CHECK`，看起来正常但约束全部失效。建议在启动预检里校验版本并拒绝启动。

**全新部署的基线导入需要建触发器的权限。** `schema.sql` 里有审计表的 append-only
触发器与 TOTP 唯一活跃约束触发器；开启 binlog 的 MySQL 建触发器需要 SUPER 或 SET_USER_ID，
而应用账号通常没有。0001 已经把这种失败翻译成可执行的提示（两条出路：让有权限的账号
先导入 `schema.sql`，之后启动会自动识别为「已有库」；或给应用账号授予 SET_USER_ID）。
这些触发器是审计不可篡改的一部分，不能跳过。

已验证的路径：
- 有存量数据的库（171 条审计记录）：0004→0007 逐条应用，0007 的叶节点接续正确；
- 全新空库：DBA 导入 `schema.sql` 后，0001 登记基线、0002–0007 依次应用、服务正常起来；
- 幂等重跑：全部已应用时输出「数据库已是最新」。

---

## 九、新增权限 key

| key | 含义 | 归属角色 |
|---|---|---|
| `pass.user:write` | 编辑用户资料与管理备注 | `pass-ops`、`pass-admin` |

只加这一个。其余沿用 `docs/iam-main-api.md §4.1` 既有的 11 个。需在 IAM 的 `tc_main` 应用里补建并加进角色 —— 纯配置动作，不改 IAM 代码。

---

## 十、需要同步改写的文档

| 文档 | 改什么 |
|---|---|
| `docs/iam-main-api.md` | ✅ 已完成。标题/开篇/§1.1/§1.2/§3.2/§3.3/§3.4/§4.2/§4.3/§5/§7/§8/§9/§10/附录 A 全部按「统一身份 = 账户绑定，无独立管理员登录」改写；权限生效模型改为「会话内 60 秒缓存 + 写操作强制实时复查」；删除已不存在的 `IAM_REALTIME_RECHECK`；修正 redirect_uri；`PATCH /v1/admin/policy` 标注为已实现 |
| `docs/pass-guide.md` | ✅ 已完成。客户端字段表补齐；`tokenEndpointAuthMethod` 改为「由应用类型决定、不可手改」；access token TTL 说明改为「默认 15 分钟，以该客户端 `tokenPolicy.accessTtl` 为准」；`absoluteTtl` 语义与档位更新 |
| `TransCircle-Pass/README.md` | ✅ 已完成。身份模型、令牌表述、迁移机制、MySQL 8.0.16+ 要求、目录结构均已同步 |
| `TransCircle/design/IA.md` | ✅ 已完成。能力诊断表明确标注为「改造前」，避免被当成当前状态 |
| `TransCircle-Pass/schema.sql` | 保留为基线，不再手改；后续结构变更一律新增迁移文件 |

### 存量数据处置：已定 —— 直接废弃

`admin_staff` / `admin_sessions` / `admin_iam_permission_snapshots` 三表的**存量数据不迁移、不保留**。新模型下管理员是 `users` + IAM 绑定，员工重新走一次「登录 → 绑定统一身份」即可恢复权限，成本极低。

三张表对应的 ORM 模型与关联**已从 `src/db.ts` 整体删除**，代码中不再有任何引用；
表本身留在库里不影响运行，可择期由 DBA 手动 DROP。

因此**不写数据迁移**。三张表保留在库里但停止读写（不 `DROP`，避免不可逆操作；确认无引用后再单独清理）。所有新代码不得引用它们。
