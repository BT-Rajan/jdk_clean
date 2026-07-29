import type { ReactNode } from 'react'

interface FieldProps {
  label: string
  /** Either pass value directly, or children for anything more than plain
   * text/a number (e.g. a Link, a StatusBadge). Whichever is given wins;
   * a missing/empty value renders as '—'. */
  value?: ReactNode
  children?: ReactNode
}

/** The standard label/value pair used across every detail page (Field
 * label above, value below). One component, reused everywhere, instead of
 * each detail page defining its own copy. */
export function Field({ label, value, children }: FieldProps) {
  const content = children ?? value
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-white/40 uppercase">{label}</dt>
      <dd className="mt-1 text-[15px] text-white">{content ?? '—'}</dd>
    </div>
  )
}
