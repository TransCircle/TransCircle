import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import zhCN from "./locales/zh-CN/common.json";

export const defaultNS = "common";

export const resources = {
  "zh-CN": { common: zhCN },
} as const;

// 清理历史遗留的语言偏好键（旧版曾支持 zh-TW），确保不残留无效值。
try {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("transcircle-lang");
  }
} catch {
  // 隐私模式 / SSR 环境下忽略
}

i18n.use(initReactI18next).init({
  resources,
  defaultNS,
  lng: "zh-CN",
  fallbackLng: "zh-CN",
  interpolation: {
    // React 渲染已对文本转义,i18next 再转义会把 & < > 显示成 HTML 实体。
    escapeValue: false,
  },
});

// 同步 <html lang>：初始化即写入，确保 SEO、屏幕阅读器与断词规则正确识别当前语言。
if (typeof document !== "undefined") {
  document.documentElement.lang = i18n.language;
}

export default i18n;
