/**
 * Generates a unique string suitable for a React list `key` -- nothing
 * more. These are never sent to the backend (see BomEditor,
 * PackagingEditor, SuppliedMaterialsEditor: `key` is always stripped
 * out of the payload before it reaches an api/* call), so there's no
 * need for cryptographic randomness or a real UUID -- just "unique
 * enough to not collide with another key generated in this session".
 *
 * Deliberately NOT `crypto.randomUUID()`: that method only exists in a
 * "secure context" (HTTPS or localhost) per the Web Crypto API spec.
 * On a plain-HTTP origin (e.g. an IP-address production deployment
 * without TLS), `crypto.randomUUID` is undefined and calling it throws
 * a TypeError -- which, called from a useState initializer that runs
 * on first render, takes down the whole component tree with no error
 * boundary to catch it (this is what caused product detail pages to
 * render blank over HTTP). `crypto.getRandomValues` has no such
 * restriction, so it's used here when available, with a Math.random
 * fallback for the (very unlikely) environment that lacks even that.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
}
