import { useEffect, useState } from 'react'

/** Tracks a CSS media query (e.g. '(max-width: 639px)'). Used where a chart
 * library needs a plain number that Tailwind breakpoints can't drive --
 * recharts axis widths, for instance. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
