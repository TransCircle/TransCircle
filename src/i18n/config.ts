import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import zhCN from "./locales/zh-CN/common.json";
import zhTW from "./locales/zh-TW/common.json";

export const defaultNS = "common";

export const resources = {
  "zh-CN": { common: zhCN },
  "zh-TW": { common: zhTW },
} as const;

// 繁体使用地区/文种标签统一映射到 zh-TW 资源:
// zh-TW / zh-HK / zh-MO / zh-Hant(-*) 都应命中繁体,而非仅精确的 zh-TW。
const isTraditionalChinese = (lang: string): boolean =>
  /^zh-(?:Hant|TW|HK|MO)\b/i.test(lang);

// 镜像故事站：持久化偏好 > 浏览器检测 > zh-CN 回退
// 复用同一 localStorage key（transcircle-lang），跨子域用户语言体验一致。
const storedLang =
  typeof localStorage !== "undefined"
    ? localStorage.getItem("transcircle-lang")
    : null;
const detectedLang =
  storedLang ||
  (typeof navigator !== "undefined" &&
  navigator.language &&
  isTraditionalChinese(navigator.language)
    ? "zh-TW"
    : "zh-CN");

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
