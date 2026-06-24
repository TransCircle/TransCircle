import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import zhCN from "./locales/zh-CN/common.json";
import zhTW from "./locales/zh-TW/common.json";

export const defaultNS = "common";

export const resources = {
  "zh-CN": { common: zhCN },
  "zh-TW": { common: zhTW },
} as const;

// 镜像故事站：持久化偏好 > 浏览器检测 > zh-CN 回退
// 复用同一 localStorage key（transcircle-lang），跨子域用户语言体验一致。
const storedLang =
  typeof localStorage !== "undefined"
    ? localStorage.getItem("transcircle-lang")
    : null;
const detectedLang =
  storedLang ||
  (typeof navigator !== "undefined"
    ? navigator.language?.startsWith("zh-TW")
      ? "zh-TW"
      : "zh-CN"
    : "zh-CN");

i18n.use(initReactI18next).init({
  resources,
  defaultNS,
  lng: detectedLang,
  fallbackLng: "zh-CN",
  interpolation: {
    escapeValue: true,
  },
});

export default i18n;
