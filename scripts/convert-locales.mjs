/**
 * i18n 語系轉換腳本
 *
 * 使用 OpenCC（開放中文轉換）將 zh-CN（簡體中文）翻譯檔
 * 自動轉換為 zh-TW（繁體中文），保留 JSON 結構與 i18next 插值變數。
 *
 * 用法：pnpm run locales:convert
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import OpenCC from 'opencc-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const SRC  = resolve(ROOT, 'src/i18n/locales/zh-CN/common.json')
const DEST = resolve(ROOT, 'src/i18n/locales/zh-TW/common.json')

// ── OpenCC 轉換器（簡 → 繁） ─────────────────────────────
const converter = OpenCC.Converter({ from: 'cn', to: 'twp' })

/**
 * 遞迴遍歷物件，將所有字串值經 OpenCC 轉換。
 * 保留 i18next 插值變數（如 {{year}}、{{name}} 等）不被轉換。
 */
function convertStrings(value) {
  if (typeof value === 'string') {
    // 暫時標記插值變數 → 轉換 → 還原
    const placeholders = new Map()
    let idx = 0
    const masked = value.replace(/\{\{\s*[\w-]+\s*\}\}/g, (match) => {
      const key = `__I18N_PH_${idx++}__`
      placeholders.set(key, match)
      return key
    })
    const converted = converter(masked)
    return converted.replace(/__I18N_PH_\d+__/g, (match) => placeholders.get(match) ?? match)
  }
  if (Array.isArray(value)) {
    return value.map(convertStrings)
  }
  if (value !== null && typeof value === 'object') {
    const result = {}
    for (const [k, v] of Object.entries(value)) {
      result[k] = convertStrings(v)
    }
    return result
  }
  return value
}

// ── 執行 ─────────────────────────────────────────────────
const source = JSON.parse(readFileSync(SRC, 'utf-8'))
const converted = convertStrings(source)
writeFileSync(DEST, JSON.stringify(converted, null, 2) + '\n', 'utf-8')

console.log(`完成`)
console.log(`   來源：${SRC}`)
console.log(`   輸出：${DEST}`)
