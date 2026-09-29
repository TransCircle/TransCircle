/**
 * 团队成员名单：首页「团队成员」、JSON-LD（Organization.founder / member）与构建产物里的
 * humans.txt、llms-full.txt 团队段（scripts/prerender.ts 填充）共用同一份数据。
 *
 * 要增删成员或调整职位，只改 team.json：
 * - github：GitHub 用户名（昵称与头像在构建时从 GitHub 拉取，头像同源托管，见 scripts/vite-plugin-github-team.ts）
 * - role：职位；数组顺序即页面展示顺序
 * - name（可选）：想覆盖 GitHub 昵称时才填
 *
 * 纯数据模块：不得引入 React / DOM / i18n 运行时（预渲染与 JSON-LD 也会用它）。
 */
import profiles from "virtual:github-profiles";

import team from "./team.json";

interface TeamEntry {
  readonly github: string;
  readonly role: string;
  readonly name?: string;
}

export interface TeamMember {
  readonly github: string;
  readonly role: string;
  /** 展示名：team.json 覆盖 > GitHub 昵称 > GitHub 用户名。 */
  readonly name: string;
  /**
   * 同源头像路径（/team-avatars/…，构建时从 GitHub 下载）；拿不到时为 null，界面显示首字。
   * 刻意不回退到 GitHub 外链：访客浏览器不直连第三方（隐私，见插件注释）。
   */
  readonly avatar: string | null;
}

const ENTRIES: readonly TeamEntry[] = team.members;

export const TEAM_MEMBERS: readonly TeamMember[] = ENTRIES.map(({ github, role, name }) => {
  const profile = profiles[github];
  return { github, role, name: name ?? profile?.name ?? github, avatar: profile?.avatar ?? null };
});

/** GitHub 个人主页。 */
export function githubProfileUrl(login: string): string {
  return `https://github.com/${login}`;
}
