import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.prerender/**",
      "**/.wrangler/**",
      "worker-configuration.d.ts",
      "assets/**",
      "public/**",
      "design/**",
      "**/*.css",
      "**/*.json",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: "detect" },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      // React Hooks 只启用长期稳定、无争议的两条核心规则。
      // eslint-plugin-react-hooks v7 的 recommended 额外启用了
      // set-state-in-effect / immutability / purity 等面向 React Compiler 的新规则，
      // 对现有代码是大量侵入式重构，不在本次 lint 落地范围内。
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // TypeScript 已在类型层承担组件 props 约束，prop-types 对 TSX 无效。
      "react/prop-types": "off",
      // 项目使用 React 17+ 的 automatic JSX runtime（tsconfig `jsx: "react-jsx"`），
      // 无需在作用域内显式引入 React。
      "react/react-in-jsx-scope": "off",
      // 登录/注册/找回等单一用途页面刻意把焦点放进第一个输入框，
      // 对键盘与读屏用户是「直接开始输入」而非「焦点被抢走」；全局关闭。
      "jsx-a11y/no-autofocus": "off",
    },
  },
  prettier,
);
