import { useEffect, useState } from 'react'
import { env } from '@/config/env'
import { getActiveCompanyName } from '@/api/settings'
import { cn } from '@/lib/cn'

interface LogoProps {
  className?: string
  withWordmark?: boolean
}

// Deliberately unauthenticated on the backend (see
// app/api/settings.py's get_active_company_logo) -- AuthLayout renders
// this before there's any signed-in user, so it can't go through
// apiClient's Bearer-token flow like GeneralSettingsForm's
// fetchCompanyLogoBlob does. A plain <img src> is enough since no auth
// header is required to view it.
const ACTIVE_LOGO_URL = `${env.apiBaseUrl}/api/settings/logo/active/current`

/** The org's own uploaded logo wherever the app shows its brand mark
 * (top-left nav, login page) -- falls back to a text wordmark when no
 * logo has been uploaded/activated yet (a 404 from ACTIVE_LOGO_URL), so
 * a fresh install never shows a broken image icon. That text reads
 * whatever company name is set under Settings -> Company (also fetched
 * unauthenticated, same reasoning as the logo image -- see
 * api/settings.py's get_active_company_name), falling back to the
 * placeholder "JDK MEA" wordmark only if no company name has been
 * configured either. Nothing here is per-current-UI-language: the app
 * chrome itself has no language toggle, so whichever single logo
 * variant the admin marked "Active logo" under Settings -> General is
 * what shows -- that's still where an English- vs Arabic-market install
 * picks the matching logo, just as a one-time admin choice rather than
 * something that switches live. */
export function Logo({ className, withWordmark = true }: LogoProps) {
  const [logoFailed, setLogoFailed] = useState(false)
  const [companyName, setCompanyName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getActiveCompanyName()
      .then((name) => {
        if (!cancelled && name) setCompanyName(name)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!logoFailed) {
    return (
      <img
        src={ACTIVE_LOGO_URL}
        alt={companyName || 'Company logo'}
        onError={() => setLogoFailed(true)}
        className={cn('h-9 w-auto object-contain', className)}
      />
    )
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="logo-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--color-gold-200)" />
            <stop offset="1" stopColor="var(--color-gold-600)" />
          </linearGradient>
        </defs>
        <path
          d="M32 12 L48 22 V42 L32 52 L16 42 V22 Z"
          fill="none"
          stroke="url(#logo-gradient)"
          strokeWidth="2.5"
        />
        <path d="M32 22 L40 27 V37 L32 42 L24 37 V27 Z" fill="url(#logo-gradient)" opacity="0.9" />
      </svg>
      {withWordmark && (
        <span className="font-display text-lg font-medium tracking-wide text-white">
          {companyName ?? (
            <>
              JDK <span className="text-gradient-gold">MEA</span>
            </>
          )}
        </span>
      )}
    </div>
  )
}
