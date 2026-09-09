import type { SVGProps } from 'react'

/** Outline "page torn in two" icon, same stroke weight/rounding as EmailIcon. */
export function TornPaperIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M10 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h5l-1.8-3.6 1.8-3.6-1.8-3.6L10 9.6Z" />
      <path d="M14 3h5a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-5l1.8-3.6-1.8-3.6 1.8-3.6L14 9.6Z" />
    </svg>
  )
}
