# TODO

> 旧版「Serverless 投稿表单 + 静态展示站」计划已由 Backend + Pass + TransCircle-Frontend
> 投稿/审核体系与 story 静态站实现取代，2026-09 整理为本仓库真实待办。
> 产品级任务看板以 [docs-main/TODO.md](../docs-main/TODO.md)（GitHub: TransCircle-org/docs-main）为准。

## 主站（transcircle-main）

- [ ] assets 分支增加 CSP：为 `index.html` 内联脚本计算 hash 并放行 Turnstile 域名
      （需 `wrangler dev` 实测后上线，配置错误会直接白屏）
- [ ] 补充 ESLint 配置与 `lint` 脚本（当前仅有 `tsc` 质量门，AGENTS.md §4.1 要求补齐）
