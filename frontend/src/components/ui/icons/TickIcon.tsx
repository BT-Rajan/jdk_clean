import type { SVGProps } from 'react'

/** Outline checkmark icon, same stroke weight/rounding as EmailIcon. */
export function TickIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
