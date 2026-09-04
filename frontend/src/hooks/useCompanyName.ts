import { useEffect, useState } from 'react'
import { getActiveCompanyName } from '@/api/settings'

/** The admin-configured company name (Settings -> Company), fetched
 * unauthenticated the same way <Logo>'s text fallback does -- pulled out
 * into its own hook so every place in the app chrome that shows the
 * company's name (the header/login wordmark, the dashboard greeting,
 * the browser tab title) reads from one fetch instead of each hardcoding
 * its own copy of "JDK MEA". Returns null until the name loads (or if
 * none has been configured yet); callers are responsible for their own
 * fallback text.
 */
export function useCompanyName(): string | null {
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

  return companyName
}
