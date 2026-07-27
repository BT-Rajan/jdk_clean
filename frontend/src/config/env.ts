/**
 * Central place to read build-time env vars. Vite only exposes vars
 * prefixed with VITE_ to client code, and inlines them at build time --
 * never put secrets here, only public config like the API base URL.
 */

function required(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name]
  if (!value) {
    // Fail loudly at startup rather than making silently-broken requests
    // to `undefined/api/...` later.
    throw new Error(
      `Missing required environment variable "${name}". Copy .env.example to .env and set it.`,
    )
  }
  return value
}

export const env = {
  apiBaseUrl: required('VITE_API_BASE_URL').replace(/\/+$/, ''),
} as const
