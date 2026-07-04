import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import zhCN from "./locales/zh-CN/common.json";

export const defaultNS = "common";

export const resources = {
  "zh-CN": { common: zhCN },
} as const;

// 复用同一 localStorage key（transcircle-lang），跨子域用户语言体验一致。
const storedLang =
  typeof localStorage !== "undefined"
    ? localStorage.getItem("transcircle-lang")
    : null;
const detectedLang = storedLang || "zh-CN";

i18n.use(initReactI18next).init({
  resources,
  defaultNS,
  lng: detectedLang,
  fallbackLng: "zh-CN",
  interpolation: {
    // React 渲染已对文本转义,i18next 再转义会把 & < > 显示成 HTML 实体。
    escapeValue: false,
  },
});

export default i18n;
