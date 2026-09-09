import type { SVGProps } from 'react'

/** KD (Kuwaiti Dinar) monogram badge, same stroke weight/rounding as
 * the app's other outline icons, with the letters filled in currentColor
 * since "KD" has no universal currency glyph. */
export function KdIcon(props: SVGProps<SVGSVGElement>) {
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
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <text
        x="12"
        y="15.5"
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
        fontFamily="inherit"
      >
        KD
      </text>
    </svg>
  )
}
