import type { ReactNode } from 'react'

/** Groups a long master-data form (Raw Material, Product) into labeled
 * sections (Identity, Stock control, Quality control, ...) without the
 * weight of a wizard or collapsible panels -- one shared heading style
 * so every master's create/edit form reads as the same system. */
export function FormSectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-1 border-t border-white/10 pt-6 font-display text-sm font-medium text-white/70 first:mt-0 first:border-0 first:pt-0">
      {children}
    </h2>
  )
}
