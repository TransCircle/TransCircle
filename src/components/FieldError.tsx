import { createContext, useContext, type ReactNode } from 'react'

/* eslint-disable react-refresh/only-export-components */

/** Context for exposing the errorId to deeply nested form controls */
const FieldErrorContext = createContext<string | null>(null)

/** Hook for consuming field error context inside FormField children */
export function useFieldError(): string | null {
  return useContext(FieldErrorContext)
}

/**
 * Render-prop wrapper for consuming field error context.
 * Use inside FormField children when the actual form control is
 * nested deeper than the direct child (e.g. inside a wrapper div).
 */
export function FieldErrorConsumer({ children }: { children: (errorId: string | null) => ReactNode }): ReactNode {
  const errorId = useContext(FieldErrorContext)
  return <>{children(errorId)}</>
}

export { FieldErrorContext }
