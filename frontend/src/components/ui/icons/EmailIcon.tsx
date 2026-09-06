import type { SVGProps } from 'react'

/**
 * Outline envelope icon, styled to match the app's existing icon
 * conventions (e.g. the refresh icon on report pages): 24x24 viewBox,
 * currentColor stroke, rounded caps/joins.
 */
export function EmailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      {...props}
    >
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="m3 6.5 9 6.2 9-6.2" />
    </svg>
  )
}
