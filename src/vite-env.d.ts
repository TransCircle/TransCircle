/// <reference types="vite/client" />

/** 构建期由 scripts/vite-plugin-github-team.ts 注入的团队成员 GitHub 资料（键为用户名）。 */
declare module "virtual:github-profiles" {
  const profiles: Readonly<Record<string, { readonly name: string; readonly avatar: string | null }>>;
  export default profiles;
}
