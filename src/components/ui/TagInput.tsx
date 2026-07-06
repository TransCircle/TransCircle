import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cx } from '../admin/cx'
import { limitByUnicode } from '../../utils/string'
import styles from './TagInput.module.css'

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
)

export interface TagInputProps {
  label?: string
  hint?: string
  invalid?: boolean
  value: string[]
  onChange: (tags: string[]) => void
  maxTags?: number
  maxTagLength?: number
  placeholder?: string
  /** placeholder shown once `maxTags` is reached (input stays enabled; adds are blocked). */
  maxReachedPlaceholder?: string
  /** accessible label for each chip's remove button, e.g. t('submit.removeTag', { tag }). */
  removeTagLabel: (tag: string) => string
  /** optional SR announcements for add/remove (fills a polite live region). */
  announce?: { added: (tag: string) => string; removed: (tag: string) => string }
  id?: string
  fieldClassName?: string
}

/**
 * Controlled tag/chip editor matching the Pill visual language. Enter or comma adds
 * a tag; Backspace on an empty input removes the last; chips have a ≥40px accessible
 * remove control. Dedupes, trims, and caps by tag count + Unicode-aware length;
 * rejected adds (duplicate / max reached) are announced via the polite live region.
 */
export function TagInput({
  label,
  hint,
  invalid,
  value,
  onChange,
  maxTags = 8,
  maxTagLength = 32,
  placeholder,
  maxReachedPlaceholder,
  removeTagLabel,
  announce,
  id,
  fieldClassName,
}: TagInputProps) {
  const { t } = useTranslation()
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = hint ? `${inputId}-hint` : undefined

  const [buffer, setBuffer] = useState('')
  const [live, setLive] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const full = value.length >= maxTags

  const commit = (raw: string) => {
    const tag = limitByUnicode(raw.trim(), maxTagLength)
    if (!tag) {
      setBuffer('')
      return
    }
    // 被拒时保留输入内容并通过 live region 播报原因,
    // 而不是静默清空(用户会以为添加成功)。
    if (full) {
      setLive(t('tagInput.maxReached', { max: maxTags }))
      return
    }
    if (value.includes(tag)) {
      setLive(t('tagInput.duplicate', { tag }))
      return
    }
    onChange([...value, tag])
    setBuffer('')
    if (announce) setLive(announce.added(tag))
  }

  const remove = (tag: string) => {
    onChange(value.filter((t) => t !== tag))
    if (announce) setLive(announce.removed(tag))
    inputRef.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 输入法组合期间的 Enter 是候选“上屏”而非提交,必须放行,
    // 否则中文拼音确认会被误捕获成添加标签(zh 站点必现)。
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
      e.preventDefault()
      commit(buffer)
    } else if (e.key === 'Backspace' && !buffer && value.length) {
      e.preventDefault()
      remove(value[value.length - 1]!)
    }
  }

  return (
    <div className={cx(styles.field, fieldClassName)}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      <div className={cx(styles.box, invalid && styles.invalid)}>
        {value.map((tag) => (
          <span key={tag} className={styles.chip}>
            <span className={styles.chipLabel}>{tag}</span>
            <button
              type="button"
              className={styles.remove}
              aria-label={removeTagLabel(tag)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => remove(tag)}
            >
              <CloseIcon />
            </button>
          </span>
        ))}
        {/* 满额时不 disable(disable 会让焦点丢失),仅在 commit 时阻止并播报。 */}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          className={styles.input}
          value={buffer}
          placeholder={full ? maxReachedPlaceholder ?? placeholder : placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={hintId}
          onChange={(e) => setBuffer(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => buffer.trim() && commit(buffer)}
        />
      </div>
      {hint && (
        <span id={hintId} className={cx(styles.hint, invalid && styles.hintError)}>
          {hint}
        </span>
      )}
      <span className={styles.srOnly} role="status" aria-live="polite">
        {live}
      </span>
    </div>
  )
}
