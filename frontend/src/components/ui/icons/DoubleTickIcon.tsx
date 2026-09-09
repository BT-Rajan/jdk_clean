import type { SVGProps } from 'react'

/** Outline double-checkmark icon (like a "re-verified" receipt tick),
 * same stroke weight/rounding as EmailIcon. */
export function DoubleTickIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M2 12.5 6 16.5 14 8.5" />
      <path d="M8 12.5 12 16.5 22 6.5" />
    </svg>
  )
}
