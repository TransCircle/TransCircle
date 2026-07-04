import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cx } from '../admin/cx'
import styles from './LanguageToggle.module.css'

const LANGS = [
  { id: 'zh-CN', label: '简体', fullLabel: '简体中文', i18nKey: 'language.zhCN' },
] as const

export interface LanguageToggleProps {
  /** 'plain' drops the card backdrop/border so it sits flush in any surface. */
  variant?: 'card' | 'plain' | 'dropdown'
  className?: string
}

/**
 * Accessible language switcher.
 * Persists the choice to localStorage and applies it via i18next.
 */
export const LanguageToggle = ({ variant = 'card', className = '' }: LanguageToggleProps) => {
  const { t, i18n } = useTranslation()
  const refs = useRef<HTMLButtonElement[]>([])
  const current = 'zh-CN'

  const select = useCallback(
    (id: string) => {
      localStorage.setItem('transcircle-lang', id)
      void i18n.changeLanguage(id)
    },
    [i18n],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      let next: number
      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          next = index > 0 ? index - 1 : LANGS.length - 1
          break
        case 'ArrowRight':
        case 'ArrowDown':
          next = index < LANGS.length - 1 ? index + 1 : 0
          break
        case 'Home':
          next = 0
          break
        case 'End':
          next = LANGS.length - 1
          break
        default:
          return
      }
      event.preventDefault()
      const target = LANGS[next]
      if (!target) return
      select(target.id)
      refs.current[next]?.focus()
    },
    [select],
  )

  return (
    <div
      className={cx(
        variant === 'dropdown' ? styles.dropdownGroup : styles.group,
        variant === 'plain' && styles.plain,
        className,
      )}
      role="radiogroup"
      aria-label={t('language.selectLabel')}
    >
      {LANGS.map((lang, index) => {
        const isActive = current === lang.id
        return (
          <button
            key={lang.id}
            ref={(el) => {
              if (el) refs.current[index] = el
            }}
            type="button"
            role="radio"
            className={cx(
              variant === 'dropdown' ? styles.dropdownBtn : styles.btn,
              isActive && styles.active,
            )}
            aria-checked={isActive}
            aria-label={t(lang.i18nKey)}
            tabIndex={isActive ? 0 : -1}
            onClick={() => select(lang.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {variant === 'dropdown' ? lang.fullLabel : lang.label}
          </button>
        )
      })}
    </div>
  )
}
