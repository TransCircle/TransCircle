/**
 * OIDC 同意屏共用的展示逻辑。
 * 单一来源，供 `ConsentPage`（用户真正看到的授权页）与 admin 的 `ConsentPreview`
 * （客户端配置页里「用户会看到什么」的实时预览）共用——两边各自维护过一份，
 * 预览改了样式/文案、真实页面没跟着改，用户看到的和管理员以为的对不上。
 */

/** 授权页能说人话的 scope；openid 不单独成句（任何登录都隐含"确认身份"，不值得单列）。 */
export const HUMAN_SCOPES: readonly string[] = [
  "profile",
  "email",
  "offline_access",
  "pass.profile.full",
];

/** 取主机名用于「将跳转到 …」提示；非法地址返回空串而不是抛。 */
export function hostOf(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    return new URL(raw).host;
  } catch {
    return "";
  }
}
