import { Link, useLocation } from 'react-router-dom'
import { buildBreadcrumbs } from '@/lib/breadcrumbs'

/** Rendered once, inside AppLayout, above every page's own content -- so
 * every route gets a breadcrumb trail for free instead of each page
 * wiring up its own. See lib/breadcrumbs.ts for how the trail is built. */
export function Breadcrumbs() {
  const { pathname } = useLocation()
  const crumbs = buildBreadcrumbs(pathname)
  if (crumbs.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-white/40">
        {crumbs.map((crumb, index) => (
          <li key={index} className="flex items-center gap-1.5">
            {index > 0 && <span aria-hidden="true">/</span>}
            {crumb.to ? (
              <Link to={crumb.to} className="transition-colors hover:text-white/70">
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-white/70">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
