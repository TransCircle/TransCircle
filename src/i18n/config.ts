import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import zhCN from "./locales/zh-CN/common.json";

export const defaultNS = "common";

export const resources = {
  "zh-CN": { common: zhCN },
} as const;

const detectedLang = "zh-CN";

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
