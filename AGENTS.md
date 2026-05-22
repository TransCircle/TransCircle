# TransCircle Project - AGENTS.md

> 本文档面向 AI 编码助手。请严格遵循以下规范为 TransCircle 项目生成代码。

## 1. 项目概述

**TransCircle** 是一个跨性别社群内容平台项目，包含投稿、审核、展示等核心功能。项目强调包容性、无障碍访问和社群自治。

### 技术栈方向

- 前端：Vue / React / Nuxt（具体以仓库为准）
- 后端：Node.js（LTS >= 24）+ TypeScript
- 包管理器：统一使用 `pnpm`

---

## 2. 团队结构与协作流程

> 对于AI，可以忽略这部分（团队结构与协作流程）内容

### 2.1 团队分组

| 分组   | 主要职责                                      |
| ------ | --------------------------------------------- |
| 开发组 | 项目开发、代码审查、测试、产品需求与基础运维  |
| 管理组 | 团队管理、GitHub、Discord、成员邮箱与公共邮箱 |
| 宣传组 | 社交平台运营、项目宣传与舆论处理              |
| 运营组 | 成品站点运营维护、文章审核与争议仲裁          |

### 2.2 关键协作原则

- **质控**负责协调 PR Review 流程和代码质量把关
- 前端/后端各设组长，负责技术方向决策
- **仲裁组**由全体团队成员组成，处理审核争议
- 文章审核员可能从团队外招募
- 遇到敏感舆论或重大对外表态时，应与团队主或相关成员确认后再发布

---

## 3. Git 规范

### 3.1 分支命名规范

**格式：** `<type>/<scope>/<description>` 或 `<type>/<scope>/<ticket-id>-<description>`

**要求：**
- 使用英文、小写字母
- 用 `/` 分隔层级，`-` 连接单词
- 禁止使用中文、空格、下划线、大写字母

**Type 列表：**

| Type       | 含义       |
| ---------- | ---------- |
| `feat`     | 新功能     |
| `fix`      | 修复问题   |
| `docs`     | 文档修改   |
| `style`    | 样式修改   |
| `refactor` | 重构代码   |
| `perf`     | 性能优化   |
| `test`     | 测试相关   |
| `build`    | 构建相关   |
| `ci`       | CI/CD 相关 |
| `chore`    | 杂项维护   |
| `revert`   | 回滚修改   |
| `security` | 安全修复   |
| `a11y`     | 无障碍优化 |
| `i18n`     | 国际化     |
| `release`  | 发布分支   |
| `hotfix`   | 紧急修复   |

**示例：**
- `feat/auth/add-oauth-login`
- `fix/navbar/resolve-mobile-overflow`
- `a11y/navbar/improve-keyboard-navigation`
- `i18n/locale/add-traditional-chinese`

**分支生命周期：**
- 一个分支只对应一个功能/问题/任务
- 合并后应及时删除
- 不在 `main`/`master` 上直接开发
- 不在 `hotfix` 分支混入非紧急修改

### 3.2 Commit Message 规范

**格式：** `:<emoji>: <type>(<scope>): <subject>`

**要求：**
- 必须使用英文和 Git Emoji（`:sparkles:`、`:bug:` 等形式）
- 必须包含 `type`、`scope`、`subject`
- `subject` 首字母小写，不使用句号结尾
- 标题行建议不超过 72 个字符
- Breaking Change 在 scope 后加 `!`

**常用 Emoji：**

| Emoji                    | 含义            | 场景                       |
| ------------------------ | --------------- | -------------------------- |
| `:sparkles:`             | 新功能          | 新增功能、页面、接口、组件 |
| `:bug:`                  | 修复问题        | 修复 Bug、异常行为         |
| `:boom:`                 | Breaking Change | 不兼容变更                 |
| `:memo:`                 | 文档            | 修改 README、注释          |
| `:lipstick:`             | 样式            | CSS、UI 样式、视觉调整     |
| `:recycle:`              | 重构            | 不改变功能的代码结构调整   |
| `:zap:`                  | 性能优化        | 提升性能、减少耗时         |
| `:white_check_mark:`     | 测试            | 添加或修改测试             |
| `:wheelchair:`           | 无障碍          | a11y、键盘导航、ARIA 修复  |
| `:globe_with_meridians:` | 国际化          | i18n、多语言、翻译内容     |
| `:lock:`                 | 安全            | 修复安全问题               |
| `:fire:`                 | 删除代码        | 删除无用代码、文件或逻辑   |
| `:bookmark:`             | 发布版本        | 版本发布、打 tag           |
| `:truck:`                | 移动/重命名     | 文件移动、目录调整         |

**示例：**
```text
:sparkles: feat(auth): add OAuth login support
:bug: fix(navbar): resolve mobile menu overflow
:boom: feat(api)!: change user response format
:wheelchair: a11y(navbar): improve focus management
:globe_with_meridians: i18n(locale): add traditional chinese translations
```

---

## 4. TypeScript 开发规范

### 4.1 工具链要求

**必选：**
- TypeScript（严格模式）
- ESLint
- Prettier
- EditorConfig
- simple-git-hooks + lint-staged

**推荐脚本（package.json）：**
```json
{
  "dev": "本地开发启动",
  "build": "生产构建",
  "typecheck": "tsc --noEmit",
  "lint": "ESLint 检查",
  "lint:fix": "自动修复",
  "format": "Prettier 格式化",
  "test": "单元测试/集成测试"
}
```

**CI 要求：** PR 至少通过 `lint`、`typecheck`、`test`、`build` 才能合并。

### 4.2 tsconfig 基线

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true
  }
}
```

- `@ts-expect-error` 必须附带原因注释

### 4.3 命名规范

| 类型                 | 规范               | 示例                      |
| -------------------- | ------------------ | ------------------------- |
| 变量、函数           | `camelCase`        | `fetchUserProfile`        |
| 类、接口、类型、枚举 | `PascalCase`       | `UserProfile`             |
| 模块级常量           | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT`         |
| 布尔变量             | `is`/`has`/`can`   | `isPublished`             |
| React 组件           | `PascalCase`       | `UserCard`                |
| 文件名               | `kebab-case`       | `user-profile.service.ts` |
| 测试文件             | `*.test.ts`        | `user-profile.test.ts`    |

### 4.4 代码实践

- **禁止裸 `any`**；必要时用 `unknown` 并在边界处收窄类型
- **优先具名导出**（`named export`），减少默认导出
- **异步统一 `async/await`**，避免混用 `then/catch`
- **禁止循环依赖**
- **禁止直接抛出字符串**，使用统一错误模型
- **函数聚焦单一职责**，避免超大函数
- **公共 API 必须显式声明参数和返回值类型**
- **导入顺序**：标准库 -> 第三方 -> 项目内部

### 4.5 注释规范

- 注释解释"为什么"，不是重复"做了什么"
- 公共函数、核心类型、复杂逻辑应补充简洁注释
- 过时注释必须同步清理

### 4.6 渐进落地原则

- 历史代码逐步治理，不要求一次性全量重写
- **新增代码必须符合本规范**
- 修改旧代码时，至少确保改动区域满足规范

---

## 5. API 设计规范  

> AI 请注意：这只是特定仓库的API 规范，如果它和你所工作的仓库无关，请忽略

### 5.1 通用原则

- 接口版本前缀：`/v1`
- Breaking changes 升级为 `/v2`，旧版本保留一段时间
- 认证模式：Bearer Token + JWT
- 统一响应格式：
  ```json
  {
    "data": {},
    "requestId": "req_xxx"
  }
  ```
- 列表响应包含 `pagination`：
  ```json
  {
    "data": [],
    "pagination": {
      "limit": 20,
      "nextCursor": "cursor_xxx",
      "hasMore": true
    },
    "requestId": "req_xxx"
  }
  ```

### 5.2 安全要求

- `client_secret` **绝不暴露给前端**
- Access token 有效期 2 小时，Refresh token 有效期 7 天
- 所有 Markdown 内容展示前必须经过 HTML 清洗（sanitize）
- 禁止 script、iframe、onerror、onclick、javascript: URL
- 所有外链必须加 `rel="nofollow noopener noreferrer"`
- 图片域名可做 allowlist 限制
- 用户数据必须存储在关系型数据库
- IP 和 User-Agent 存储哈希值，不存明文

### 5.3 OAuth 规范

- X (Twitter) OAuth **不提供邮箱**，`email` 字段对 X 账号始终为空
- 同一用户可绑定多个 OAuth 账号
- 合并账号时保留主账号的投稿和权限

### 5.4 权限粒度

```
contribution:read         查看投稿
contribution:review       通过/拒绝待审核投稿
contribution:hide         隐藏已发布内容
contribution:restore      恢复隐藏内容
contribution:delete       删除内容
contribution:audit:read   查看审核历史
contribution:edit-request:vote 对修改申请投票
user:read                 查看用户信息
user:ban                  封禁用户
audit:read                查看审计日志
```

---

## 6. 无障碍规范 (Accessibility)

> **强制要求**：TransCircle 项目默认遵循 WCAG 2.1+ 标准。

### 6.1 核心原则

- **可及性优先**：默认提供高对比度模式
- **键盘可访问**：所有交互支持完整键盘导航
- **屏幕阅读器友好**：语义化标签、ARIA 属性
- **尊重用户偏好**：适配 `prefers-reduced-motion`

### 6.2 必须遵守的规则

- 交互元素必须是真正的 `<button>` 或 `<a>`，**禁止用 `<div>` 模拟按钮**
- 所有自定义交互组件必须提供：
  - `aria-label` 或 `aria-labelledby`
  - 适当的 `role` 属性
  - 完整的键盘支持（Tab、Enter、Escape、Arrow 键）
- 焦点指示器统一使用：
  ```css
  :focus-visible {
    outline: 2px solid var(--primary-pink);
    outline-offset: 2px;
  }
  ```
- 装饰性图标必须加 `aria-hidden="true" focusable="false"`
- 信息性图标必须包含 `<title>` 标签或关联 `aria-label`
- 移动菜单打开时，`main` 元素应设置 `inert`
- 汉堡按钮必须提供 `aria-expanded` + `aria-controls`

### 6.3 减少动画

```css
@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
    animation: none !important;
  }
}
```

---

## 7. 国际化规范 (i18n)

> **项目主要在中文社群运营，国际化指简体中文和繁体中文支持**。

### 7.1 核心原则

- **严禁字符串硬编码**：即使当前只有一种语言，也必须使用 i18n 包装函数（如 `t('key')`）
- 所有用户可见文本必须通过国际化系统管理
- 支持语言：`zh-CN`（简体中文）、`zh-TW`（繁体中文）

### 7.2 实现要求

- 在 UI 代码中，所有文案使用 `t('namespace.key')` 形式
- 语言文件按命名空间组织（如 `common.json`、`auth.json`）
- 日期、时间、数字格式使用本地化工具
- 避免在代码中直接拼接字符串构成句子

---

## 8. 设计系统

> 完整的设计系统定义见 `DESIGN.md`。以下为关键提醒：

### 8.1 主题模式

- 支持三种主题：`light`、`dark`、`contrast`
- 通过 `data-theme` 属性切换
- 自动检测 `prefers-color-scheme`
- 用户偏好存储于 `localStorage`（键名：`transcircle-theme`）

### 8.2 核心 Token

- 颜色使用 CSS 变量（如 `var(--primary-pink)`），严禁硬编码
- 高对比度模式使用橙色（`#ffaa00`）替代粉色，避免红绿色盲识别困难
- `color-mix()` 实现悬停态，同时提供硬编码回退
- 圆角：`sm(6px)`、`md(7-8px)`、`lg(10px)`、`xl(16px)`、`full(50px)`

### 8.3 排版

- 字体栈：`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
- 基础单位：`rem`（基于 16px）
- 响应式断点：`768px`、`1024px`、`1200px`、`1280px`

---

## 9. 内容安全  

> AI 请注意：这只是特定仓库的API 规范，如果它和你所工作的仓库无关，请忽略

### 9.1 Markdown 处理

**存储原则：**
```
contentRaw：保存用户原始 Markdown（原文不做修改）
contentHtml：展示前生成经过白名单清洗的 HTML
rendererVersion：记录渲染器版本
```

**渲染规则：**
1. 入库保存原始 Markdown
2. 展示前转换为 HTML
3. HTML 必须经过白名单清洗（如 DOMPurify）
4. 禁止 script、iframe、onerror、onclick、javascript: URL
5. 所有链接加 `rel="nofollow noopener noreferrer"`
6. 图片域名可做 allowlist 限制

### 9.2 限流规则

- 同一用户投稿：每 10 分钟最多 5 次
- 同一 IP：每 10 分钟最多 20 次
- 新注册用户：每日最多 3 次
- 图片上传：每用户每小时最多 20 张（最大 2MB）

---

## 10. 数据隐私与伦理

- **Privacy by Design**：默认采用最小权限原则
- 严禁在代码中记录或暴露用户敏感信息（IP 明文、真实邮箱等）
- 用户性别信息：**除非医疗等极特殊场景，默认不采集性别信息**
- 若必须存在身份字段，应使用开放式字段或允许为空
- 审计日志记录操作但不存储可识别个人信息

---

## 11. 许可证

- **项目代码**：AGPL（GNU Affero General Public License）
- **项目文案/内容**：CC BY SA 4.0 or later

---

## 12. AI 编码检查清单

生成代码前，请确认：

- [ ] 代码符合 TypeScript 严格模式要求
- [ ] 所有用户可见文本使用 i18n 函数包装
- [ ] 无障碍属性（aria-label、role、键盘支持）已添加
- [ ] 颜色使用 CSS 变量而非硬编码
- [ ] 动画尊重 `prefers-reduced-motion`
- [ ] 焦点样式遵循项目规范
- [ ] 没有裸 `any` 类型
- [ ] 公共函数有明确参数和返回类型声明
- [ ] 敏感信息未硬编码或暴露
- [ ] 分支名和 Commit Message 符合规范
- [ ] 代码风格符合 Prettier + ESLint 配置
