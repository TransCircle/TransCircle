/**
 * Shared UI kit for the whole app (customer + admin surfaces).
 *
 * Re-exports the existing design-system primitives from `components/admin` so
 * customer/shared code imports everything from one neutral path (`@/components/ui`),
 * and adds the new custom controls that replace browser-native widgets.
 */

// ── Existing admin design-system kit (unchanged) ──────────────
export * from '../admin'
// Neutral alias for customer-facing call sites.
export { AdminButton as Button } from '../admin'

// ── New shared primitives ─────────────────────────────────────
export { Select } from './Select'
export type { SelectProps, SelectOption } from './Select'

export { Checkbox } from './Checkbox'
export type { CheckboxProps } from './Checkbox'

export { RadioGroup } from './RadioGroup'
export type { RadioGroupProps, RadioOption } from './RadioGroup'

export { TagInput } from './TagInput'
export type { TagInputProps } from './TagInput'

export { LanguageToggle } from './LanguageToggle'
export type { LanguageToggleProps } from './LanguageToggle'

export { PageHeader } from './PageHeader'
export type { PageHeaderProps } from './PageHeader'

export { CenteredCard } from './CenteredCard'
export type { CenteredCardProps } from './CenteredCard'

export { StatusScreen } from './StatusScreen'
export type { StatusScreenProps, StatusKind, StatusAction } from './StatusScreen'
