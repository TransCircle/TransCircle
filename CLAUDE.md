# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

TransCircleProject is a landing page and short-link redirect service hosted on Cloudflare Pages. The site is a React + TypeScript single-page app built with Vite.

## Deploy & preview

- **Install**: `pnpm install`
- **Dev server**: `pnpm dev` (Vite dev server with HMR)
- **Build**: `pnpm build` (type-check + Vite build → `dist/`)
- **Preview locally**: `npx wrangler dev` (serves built assets from `dist/`)
- **Deploy**: `pnpm deploy` (runs `wrangler deploy`)

## Architecture

- `index.html` — Vite entry HTML. Minimal shell with `<div id="root">` and a module script pointing to `/src/main.tsx`.
- `src/main.tsx` — React entry point, renders `<App />` into the root div.
- `src/App.tsx` — Root component composing Header, Quote, LinkCard, LicenseFooter inside a styled container.
- `src/components/` — UI components with co-located CSS Modules:
  - `Header` — Title "TransCircleProject" and intro paragraph.
  - `Quote` — Reusable blockquote with pink accent styling.
  - `LinkCard` — Section with a heading and link. Supports `variant="button"` (pink pill button) and `variant="text"` (default underlined link).
  - `LicenseFooter` — LICENSE info and decorative footer.
- `src/index.css` — Global CSS variables (pink theme) and body reset.
- `public/_redirects` — Cloudflare Pages redirect rules. Short links under `/s/` (e.g., `/s/x-chat`, `/s/repo`, `/s/join`) map to external URLs with 302 status codes. Copied verbatim to `dist/` on build.
- `public/ref/lists/` — Reference data: X/Twitter user lists in JSON, CSV, and TXT formats. Served as static files.
- `wrangler.jsonc` — Wrangler config with `assets.directory` set to `./dist`.

## Redirects

Short links are defined in `public/_redirects` using Cloudflare Pages format: `/s/<slug> <target-url> 302`. To add a new short link, append a line to `public/_redirects`.
